// OAuthCallbackScreen.tsx — landing page for the OAuth provider redirect
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const RETURN_URL_KEY = 'rw_return_url';

export default function OAuthCallbackScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleOAuthCallback } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const providerError = searchParams.get('error');
    if (providerError) {
      setError(searchParams.get('error_description') || 'Sign-in with the provider was cancelled or failed.');
      return;
    }

    handleOAuthCallback()
      .then(success => {
        if (!success) {
          setError('Sign-in could not be completed. Please try again.');
          return;
        }
        const returnUrl = sessionStorage.getItem(RETURN_URL_KEY) || '/app';
        sessionStorage.removeItem(RETURN_URL_KEY);
        navigate(returnUrl, { replace: true });
      })
      .catch(() => {
        setError('Sign-in could not be completed. Please try again.');
      });
  }, [searchParams, handleOAuthCallback, navigate]);

  return (
    <div style={st.root}>
      <div style={st.kanji} aria-hidden="true">入</div>
      <div style={st.card}>
        <div style={st.logoRow}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 5 Q7.5 6.5 6.5 9 Q5.5 12 6 16 Q6.5 20 5.5 23" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M14 4 Q15.5 5.5 14.5 8.5 Q13.5 12 14 15.5 Q14.5 19 13.5 23.5" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M22 6 Q23 8 22 11 Q21 14.5 21.5 18 Q22 21 21 24" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M4.5 12.5 Q9 10.5 14 11.5 Q19 12.5 24 11" stroke="#F5F1EA" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span style={st.logoText}>raftweave</span>
        </div>

        {error ? (
          <>
            <h1 style={st.title}>Sign-in failed</h1>
            <p style={st.subtitle}>{error}</p>
            <a href="/" style={st.link}>Return to sign in</a>
          </>
        ) : (
          <>
            <h1 style={st.title}>Signing in</h1>
            <p style={st.subtitle}>Completing your sign-in, please wait…</p>
          </>
        )}
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  root: { minHeight: '100vh', background: '#080706', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: 24 },
  kanji: { position: 'absolute', fontSize: 480, color: 'rgba(245,241,234,0.022)', fontFamily: 'serif', lineHeight: 1, pointerEvents: 'none', right: -40, top: '50%', transform: 'translateY(-50%)' },
  card: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 40px', textAlign: 'center' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 },
  logoText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: '#F5F1EA', letterSpacing: '0.04em' },
  title: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: '0.04em', color: '#F5F1EA', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: 15, fontWeight: 300, fontStyle: 'italic', color: 'rgba(245,241,234,0.38)', textAlign: 'center', lineHeight: 1.65, marginBottom: 24 },
  link: { fontFamily: "'Cormorant Garamond', serif", fontSize: 14, color: 'rgba(245,241,234,0.6)', letterSpacing: '0.04em', textDecoration: 'underline' },
};
