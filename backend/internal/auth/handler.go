package auth

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes wires all auth + health endpoints onto the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux, rl *RateLimiter) {
	mux.HandleFunc("POST /auth/register", rl.Middleware(h.Register))
	mux.HandleFunc("POST /auth/login", rl.Middleware(h.Login))
	mux.HandleFunc("POST /auth/refresh", rl.Middleware(h.Refresh))
	mux.HandleFunc("POST /auth/logout", h.service.RequireAuth(h.Logout))
	mux.HandleFunc("GET /auth/me", h.service.RequireAuth(h.Me))
	mux.HandleFunc("GET /health", h.Health)
}

func writeJSON(w http.ResponseWriter, v interface{}) error {
	return json.NewEncoder(w).Encode(v)
}

func writeJSONStatus(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = writeJSON(w, v)
}

func decodeJSON(r *http.Request, v interface{}) bool {
	dec := json.NewDecoder(r.Body)
	return dec.Decode(v) == nil
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSONStatus(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if !decodeJSON(r, &req) {
		writeError(w, errValidation("Invalid request body"))
		return
	}

	ip, ua := clientIP(r), r.UserAgent()
	resp, apiErr := h.service.Register(r.Context(), req, ip, ua)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	writeJSONStatus(w, http.StatusCreated, resp)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if !decodeJSON(r, &req) {
		writeError(w, errValidation("Invalid request body"))
		return
	}

	ip, ua := clientIP(r), r.UserAgent()
	resp, apiErr := h.service.Login(r.Context(), req, ip, ua)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	writeJSONStatus(w, http.StatusOK, resp)
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if !decodeJSON(r, &req) {
		writeError(w, errValidation("Invalid request body"))
		return
	}

	ip, ua := clientIP(r), r.UserAgent()
	resp, apiErr := h.service.Refresh(r.Context(), req, ip, ua)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	writeJSONStatus(w, http.StatusOK, resp)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	var req LogoutRequest
	if !decodeJSON(r, &req) {
		writeError(w, errValidation("Invalid request body"))
		return
	}

	idStr, _ := UserIDFromContext(r.Context())
	userID, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, errUnauthorized)
		return
	}

	ip, ua := clientIP(r), r.UserAgent()
	if apiErr := h.service.Logout(r.Context(), userID, req, ip, ua); apiErr != nil {
		writeError(w, apiErr)
		return
	}

	writeJSONStatus(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	idStr, _ := UserIDFromContext(r.Context())
	userID, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, errUnauthorized)
		return
	}

	user, apiErr := h.service.GetUser(r.Context(), userID)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	writeJSONStatus(w, http.StatusOK, ToUserResponse(user))
}
