// AuthScreen.tsx — Sign In / Register screen
import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRaft } from '../state';
import { useAuth, ApiError, type OAuthProvider } from '../auth/AuthContext';

type Mode = 'login' | 'register';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  return { score, label: labels[score] };
}

export default function AuthScreen() {
  const { dispatch } = useRaft();
  const { login, register, initiateOAuthFlow, oauthInProgress } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [hovering, setHovering] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean; fullName?: boolean }>({});

  const emailError = touched.email && !EMAIL_RE.test(email) ? 'Enter a valid email address.' : null;
  const passwordError =
    touched.password && password.length < 8 ? 'Password must be at least 8 characters.' : null;
  const fullNameError =
    mode === 'register' && touched.fullName && fullName.trim().length < 2
      ? 'Enter your full name.'
      : null;

  const strength = passwordStrength(password);

  function switchMode(next: Mode) {
    setMode(next);
    setApiError(null);
    setTouched({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true, fullName: true });
    setApiError(null);

    if (!EMAIL_RE.test(email) || password.length < 8 || (mode === 'register' && fullName.trim().length < 2)) {
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, fullName.trim());
      }
      dispatch({ type: 'AUTH' });
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Unable to reach the server. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function signInWithProvider(provider: OAuthProvider) {
    setApiError(null);
    try {
      await initiateOAuthFlow(provider);
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Unable to reach the server. Please try again.');
      }
    }
  }

  return (
    <div style={authSt.root}>
      {/* Large watermark kanji */}
      <div style={authSt.kanji} aria-hidden="true">入</div>

      <div style={authSt.card}>
        {/* Logo */}
        <div style={authSt.logoRow}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 5 Q7.5 6.5 6.5 9 Q5.5 12 6 16 Q6.5 20 5.5 23" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M14 4 Q15.5 5.5 14.5 8.5 Q13.5 12 14 15.5 Q14.5 19 13.5 23.5" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M22 6 Q23 8 22 11 Q21 14.5 21.5 18 Q22 21 21 24" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M4.5 12.5 Q9 10.5 14 11.5 Q19 12.5 24 11" stroke="#F5F1EA" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span style={authSt.logoText}>raftweave</span>
        </div>

        <div style={authSt.eyebrow}>
          <div style={authSt.eyebrowLine} />
          <span style={authSt.eyebrowText}>Control Plane Access</span>
          <div style={authSt.eyebrowLine} />
        </div>

        <h1 style={authSt.title}>{mode === 'login' ? 'Sign In' : 'Register'}</h1>
        <p style={authSt.subtitle}>
          {mode === 'login'
            ? 'Authenticate with your account to access the RaftWeave control plane.'
            : 'Create an account to provision and operate the RaftWeave control plane.'}
        </p>

        <form style={authSt.form} onSubmit={handleSubmit} noValidate>
          {mode === 'register' && (
            <div style={authSt.field}>
              <label style={authSt.label} htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                style={authSt.input}
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, fullName: true }))}
              />
              {fullNameError && <span style={authSt.fieldError}>{fullNameError}</span>}
            </div>
          )}

          <div style={authSt.field}>
            <label style={authSt.label} htmlFor="email">Email</label>
            <input
              id="email"
              style={authSt.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, email: true }))}
            />
            {emailError && <span style={authSt.fieldError}>{emailError}</span>}
          </div>

          <div style={authSt.field}>
            <label style={authSt.label} htmlFor="password">Password</label>
            <input
              id="password"
              style={authSt.input}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, password: true }))}
            />
            {passwordError && <span style={authSt.fieldError}>{passwordError}</span>}
            {mode === 'register' && password.length > 0 && (
              <div style={authSt.strengthRow}>
                <div style={authSt.strengthTrack}>
                  <div style={{ ...authSt.strengthFill, width: `${(strength.score / 5) * 100}%` }} />
                </div>
                <span style={authSt.strengthLabel}>{strength.label}</span>
              </div>
            )}
          </div>

          {apiError && <div style={authSt.apiError}>{apiError}</div>}

          <button
            type="submit"
            disabled={submitting}
            onMouseEnter={() => setHovering('submit')}
            onMouseLeave={() => setHovering(null)}
            style={{
              ...authSt.submitBtn,
              ...(hovering === 'submit' && !submitting ? authSt.submitBtnHover : {}),
              ...(submitting ? authSt.submitBtnDisabled : {}),
            }}
          >
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create account'}
          </button>
        </form>

        <div style={authSt.oauthRow}>
          <button
            type="button"
            aria-label="Continue with GitHub"
            disabled={oauthInProgress !== null || submitting}
            onClick={() => signInWithProvider('github')}
            onMouseEnter={() => setHovering('oauth-github')}
            onMouseLeave={() => setHovering(null)}
            style={{
              ...authSt.oauthBtn,
              ...(hovering === 'oauth-github' && oauthInProgress === null && !submitting ? authSt.oauthBtnHover : {}),
              ...(oauthInProgress !== null || submitting ? authSt.submitBtnDisabled : {}),
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            <span>Continue with GitHub</span>
          </button>

          <button
            type="button"
            aria-label="Continue with Google"
            disabled={oauthInProgress !== null || submitting}
            onClick={() => signInWithProvider('google')}
            onMouseEnter={() => setHovering('oauth-google')}
            onMouseLeave={() => setHovering(null)}
            style={{
              ...authSt.oauthBtn,
              ...(hovering === 'oauth-google' && oauthInProgress === null && !submitting ? authSt.oauthBtnHover : {}),
              ...(oauthInProgress !== null || submitting ? authSt.submitBtnDisabled : {}),
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.36 0-4.36-1.6-5.07-3.74H.9v2.33A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.93 10.68A5.41 5.41 0 0 1 3.64 9c0-.58.1-1.16.29-1.68V4.99H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.01l3.03-2.33z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.59 8.59 0 0 0 9 0 9 9 0 0 0 .9 4.99l3.03 2.33C4.64 5.18 6.64 3.58 9 3.58z"/>
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>

        <div style={authSt.dividerRow}>
          <div style={authSt.dividerLine} />
          <span style={authSt.dividerText}>or</span>
          <div style={authSt.dividerLine} />
        </div>

        <button
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          onMouseEnter={() => setHovering('switch')}
          onMouseLeave={() => setHovering(null)}
          style={{ ...authSt.demoBtn, ...(hovering === 'switch' ? authSt.demoBtnHover : {}) }}
        >
          {mode === 'login' ? 'Create a new account' : 'I already have an account'}
        </button>

        <p style={authSt.legal}>
          By continuing you agree to our Terms of Service and Privacy Policy. Access is subject to RBAC role assignment by your organisation admin.
        </p>
      </div>

      {/* Seal stamp */}
      <svg style={authSt.seal} viewBox="0 0 36 36" fill="none">
        <rect x="1" y="1" width="34" height="34" stroke="#7A2020" strokeWidth="1.2" opacity="0.5"/>
        <rect x="4" y="4" width="28" height="28" stroke="#7A2020" strokeWidth="0.6" opacity="0.3"/>
        <text x="18" y="24" textAnchor="middle" fontFamily="serif" fontSize="16" fill="#7A2020" opacity="0.6">統</text>
      </svg>
    </div>
  );
}

const authSt: Record<string, CSSProperties> = {
  root: { minHeight: '100vh', background: '#080706', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: 24 },
  kanji: { position: 'absolute', fontSize: 480, color: 'rgba(245,241,234,0.022)', fontFamily: 'serif', lineHeight: 1, pointerEvents: 'none', right: -40, top: '50%', transform: 'translateY(-50%)' },
  card: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 40px' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 },
  logoText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: '#F5F1EA', letterSpacing: '0.04em' },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, width: '100%' },
  eyebrowLine: { flex: 1, height: 1, background: 'rgba(245,241,234,0.1)' },
  eyebrowText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.25)', whiteSpace: 'nowrap' },
  title: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, letterSpacing: '0.04em', color: '#F5F1EA', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: 15, fontWeight: 300, fontStyle: 'italic', color: 'rgba(245,241,234,0.38)', textAlign: 'center', lineHeight: 1.65, marginBottom: 32 },
  form: { width: '100%', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 8 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.4)' },
  input: { width: '100%', padding: '11px 14px', background: 'rgba(245,241,234,0.05)', border: '1px solid rgba(245,241,234,0.12)', borderRadius: 2, color: '#F5F1EA', fontFamily: "'Cormorant Garamond', serif", fontSize: 15, outline: 'none', boxSizing: 'border-box' },
  fieldError: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, fontStyle: 'italic', color: 'rgba(200,130,130,0.9)' },
  apiError: { fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontStyle: 'italic', color: 'rgba(200,130,130,0.9)', padding: '10px 12px', background: 'rgba(160,88,88,0.08)', border: '1px solid rgba(160,88,88,0.2)', borderRadius: 2, textAlign: 'center' },
  strengthRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 },
  strengthTrack: { flex: 1, height: 3, background: 'rgba(245,241,234,0.08)', borderRadius: 2, overflow: 'hidden' },
  strengthFill: { height: '100%', background: 'rgba(245,241,234,0.45)', transition: 'width 0.15s ease' },
  strengthLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, fontStyle: 'italic', color: 'rgba(245,241,234,0.3)', whiteSpace: 'nowrap' },
  submitBtn: { width: '100%', padding: '13px 20px', background: 'rgba(245,241,234,0.08)', border: '1px solid rgba(245,241,234,0.15)', cursor: 'pointer', fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: '#F5F1EA', letterSpacing: '0.04em', transition: 'all 0.15s', borderRadius: 2, marginTop: 4 },
  submitBtnHover: { background: 'rgba(245,241,234,0.13)', borderColor: 'rgba(245,241,234,0.25)' },
  submitBtnDisabled: { opacity: 0.6, cursor: 'wait' },
  oauthRow: { width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 },
  oauthBtn: { width: '100%', padding: '11px 20px', background: 'rgba(245,241,234,0.04)', border: '1px solid rgba(245,241,234,0.1)', cursor: 'pointer', fontFamily: "'Cormorant Garamond', serif", fontSize: 14, color: 'rgba(245,241,234,0.75)', letterSpacing: '0.04em', transition: 'all 0.15s', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 },
  oauthBtnHover: { background: 'rgba(245,241,234,0.08)', borderColor: 'rgba(245,241,234,0.2)' },
  dividerRow: { display: 'flex', alignItems: 'center', gap: 16, width: '100%', marginBottom: 20, marginTop: 12 },
  dividerLine: { flex: 1, height: 1, background: 'rgba(245,241,234,0.07)' },
  dividerText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, color: 'rgba(245,241,234,0.2)', letterSpacing: '0.1em' },
  demoBtn: { width: '100%', padding: '11px 20px', background: 'transparent', border: '1px solid rgba(245,241,234,0.07)', cursor: 'pointer', fontFamily: "'Cormorant Garamond', serif", fontSize: 14, fontStyle: 'italic', color: 'rgba(245,241,234,0.35)', letterSpacing: '0.04em', transition: 'all 0.15s', marginBottom: 32, borderRadius: 2 },
  demoBtnHover: { borderColor: 'rgba(245,241,234,0.18)', color: 'rgba(245,241,234,0.6)' },
  legal: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, color: 'rgba(245,241,234,0.15)', textAlign: 'center', lineHeight: 1.65, letterSpacing: '0.02em' },
  seal: { position: 'absolute', bottom: 32, right: 40, width: 32, height: 32, opacity: 0.5 },
};
