package auth

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"

	"golang.org/x/oauth2"
)

// OAuthHandler implements the OAuth 2.0 Authorization Code + PKCE flow for
// the configured providers (github, google).
type OAuthHandler struct {
	service   *Service
	providers map[string]*OAuthProvider
	states    *OAuthStateStore
}

func NewOAuthHandler(service *Service, providers map[string]*OAuthProvider, states *OAuthStateStore) *OAuthHandler {
	return &OAuthHandler{service: service, providers: providers, states: states}
}

// RegisterRoutes wires the OAuth authorize/callback endpoints onto the given
// mux, each behind its own rate limiter.
func (h *OAuthHandler) RegisterRoutes(mux *http.ServeMux, authorizeRL, callbackRL *RateLimiter) {
	mux.HandleFunc("GET /auth/{provider}/authorize", authorizeRL.Middleware(h.Authorize))
	mux.HandleFunc("GET /auth/{provider}/callback", callbackRL.Middleware(h.Callback))
}

// Authorize starts the OAuth flow: it generates a CSRF state token and a PKCE
// code_verifier/challenge pair, stores them server-side in Redis, and returns
// the provider's authorization URL as JSON. The frontend performs the actual
// redirect — this keeps the backend stateless and testable.
func (h *OAuthHandler) Authorize(w http.ResponseWriter, r *http.Request) {
	providerName := r.PathValue("provider")
	provider, ok := h.providers[providerName]
	if !ok {
		writeError(w, errValidation("Unknown OAuth provider"))
		return
	}

	ctx := r.Context()
	ip, ua := clientIP(r), r.UserAgent()

	state, err := GenerateOAuthState()
	if err != nil {
		log.Printf("oauth authorize: generate state: %v", err)
		writeError(w, errInternal)
		return
	}

	verifier, _, err := GeneratePKCE()
	if err != nil {
		log.Printf("oauth authorize: generate pkce: %v", err)
		writeError(w, errInternal)
		return
	}

	if err := h.states.SaveOAuthFlow(ctx, state, providerName, verifier); err != nil {
		log.Printf("oauth authorize: save state: %v", err)
		writeError(w, errInternal)
		return
	}

	authURL := provider.Config.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier))

	if err := h.service.repo.WriteAuditLog(ctx, nil, AuditOAuthFlowInitiated, ip, ua, map[string]interface{}{"provider": providerName}); err != nil {
		log.Printf("oauth authorize: audit log failed: %v", err)
	}

	writeJSONStatus(w, http.StatusOK, map[string]string{"authorization_url": authURL})
}

// Callback completes the OAuth flow: validates the CSRF state, exchanges the
// authorization code (with the PKCE verifier) for a token, fetches the
// provider profile, resolves/creates the RaftWeave account, and redirects to
// the frontend with the issued token pair in the URL fragment.
func (h *OAuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	providerName := r.PathValue("provider")
	provider, ok := h.providers[providerName]
	if !ok {
		writeError(w, errValidation("Unknown OAuth provider"))
		return
	}

	ctx := r.Context()
	ip, ua := clientIP(r), r.UserAgent()
	q := r.URL.Query()

	if errParam := q.Get("error"); errParam != "" {
		if err := h.service.repo.WriteAuditLog(ctx, nil, AuditOAuthCallbackError, ip, ua, map[string]interface{}{
			"provider": providerName, "error": errParam, "error_description": q.Get("error_description"),
		}); err != nil {
			log.Printf("oauth callback: audit log failed: %v", err)
		}
		writeError(w, errOAuthCallback)
		return
	}

	state, code := q.Get("state"), q.Get("code")
	if state == "" || code == "" {
		writeError(w, errOAuthState)
		return
	}

	flowProvider, verifier, err := h.states.ConsumeOAuthFlow(ctx, state)
	if err != nil {
		if !errors.Is(err, ErrOAuthStateNotFound) {
			log.Printf("oauth callback: consume state: %v", err)
		}
		if auditErr := h.service.repo.WriteAuditLog(ctx, nil, AuditOAuthStateExpiredOrInvalid, ip, ua, map[string]interface{}{"provider": providerName}); auditErr != nil {
			log.Printf("oauth callback: audit log failed: %v", auditErr)
		}
		writeError(w, errOAuthState)
		return
	}

	if flowProvider != providerName {
		if err := h.service.repo.WriteAuditLog(ctx, nil, AuditOAuthCSRFDetected, ip, ua, map[string]interface{}{
			"provider": providerName, "flow_provider": flowProvider,
		}); err != nil {
			log.Printf("oauth callback: audit log failed: %v", err)
		}
		writeError(w, errOAuthState)
		return
	}

	token, err := provider.Config.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		log.Printf("oauth callback: code exchange failed (%s): %v", providerName, err)
		writeError(w, errOAuthExchange)
		return
	}

	profile, err := provider.FetchProfile(ctx, token)
	if err != nil {
		if errors.Is(err, ErrEmailNotVerified) {
			if auditErr := h.service.repo.WriteAuditLog(ctx, nil, AuditOAuthEmailUnverified, ip, ua, map[string]interface{}{"provider": providerName}); auditErr != nil {
				log.Printf("oauth callback: audit log failed: %v", auditErr)
			}
			writeError(w, newAPIError(403, "OAUTH_EMAIL_UNVERIFIED", "Your account email must be verified with the provider to sign in"))
			return
		}

		log.Printf("oauth callback: fetch profile failed (%s): %v", providerName, err)
		if auditErr := h.service.repo.WriteAuditLog(ctx, nil, AuditOAuthProviderFetchFailed, ip, ua, map[string]interface{}{"provider": providerName}); auditErr != nil {
			log.Printf("oauth callback: audit log failed: %v", auditErr)
		}
		writeError(w, errInternal)
		return
	}

	resp, apiErr := h.service.OAuthLogin(ctx, profile, providerName, token, ip, ua)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	redirectURL := fmt.Sprintf("%s/auth/callback#access_token=%s&refresh_token=%s&token_type=%s&expires_in=%d",
		h.service.cfg.FrontendURL,
		url.QueryEscape(resp.AccessToken),
		url.QueryEscape(resp.RefreshToken),
		url.QueryEscape(resp.TokenType),
		resp.ExpiresIn,
	)

	http.Redirect(w, r, redirectURL, http.StatusFound)
}
