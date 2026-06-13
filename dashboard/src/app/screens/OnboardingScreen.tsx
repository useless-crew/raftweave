// OnboardingScreen.tsx — Onboarding Wizard
import type { CSSProperties } from 'react';
import { useRaft } from '../state';

const ONBOARDING_STEPS = [
  { id: 0, title: 'Connect Repository', sub: 'Link your GitHub or GitLab repository. RaftWeave will install the webhook automatically.' },
  { id: 1, title: 'Cloud Credentials', sub: 'Provide IAM roles or Service Principals. All credentials are stored directly in HashiCorp Vault.' },
  { id: 2, title: 'Workload Configuration', sub: 'Define compute requirements, health check paths, and replica counts for your workload.' },
  { id: 3, title: 'Region Selection', sub: 'Choose your primary cloud and standby regions. RaftWeave will manage consensus across them.' },
  { id: 4, title: 'Review & Deploy', sub: 'Confirm your raftweave.yaml configuration. RaftWeave will commit it and trigger the first build.' },
];

export default function OnboardingScreen() {
  const { state, dispatch } = useRaft();
  const { onboardingStep } = state;
  const step = ONBOARDING_STEPS[onboardingStep];

  return (
    <div style={onbSt.root}>
      <div style={onbSt.kanji} aria-hidden="true">始</div>

      <div style={onbSt.wrap}>
        {/* Step rail */}
        <div style={onbSt.rail}>
          {ONBOARDING_STEPS.map((s, i) => (
            <div key={s.id} style={onbSt.railStep}>
              <div style={{
                ...onbSt.railDot,
                ...(i < onboardingStep ? onbSt.railDotDone : {}),
                ...(i === onboardingStep ? onbSt.railDotActive : {}),
              }}>
                {i < onboardingStep ? '✓' : i + 1}
              </div>
              {i < ONBOARDING_STEPS.length - 1 && (
                <div style={{ ...onbSt.railLine, ...(i < onboardingStep ? onbSt.railLineDone : {}) }} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={onbSt.content}>
          <div style={onbSt.stepNum}>Step {onboardingStep + 1} of {ONBOARDING_STEPS.length}</div>
          <h2 style={onbSt.title}>{step.title}</h2>
          <p style={onbSt.sub}>{step.sub}</p>

          <div style={onbSt.formArea}>
            <OnboardingStepContent step={onboardingStep} />
          </div>

          <div style={onbSt.actions}>
            <button onClick={() => dispatch({ type: 'ONBOARDING_BACK' })} style={onbSt.backBtn}>
              ← {onboardingStep === 0 ? 'Sign Out' : 'Back'}
            </button>
            <button onClick={() => dispatch({ type: 'ONBOARDING_NEXT' })} style={onbSt.nextBtn}>
              {onboardingStep === 4 ? 'Deploy Workload' : 'Continue'} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OnboardingStepContent({ step }: { step: number }) {
  const inputStyle: CSSProperties = {
    width: '100%', background: 'rgba(245,241,234,0.04)',
    border: '1px solid rgba(245,241,234,0.1)', borderRadius: 2,
    padding: '10px 14px', color: '#F5F1EA',
    fontFamily: "'Cormorant Garamond', serif", fontSize: 15,
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: CSSProperties = {
    fontFamily: "'Cormorant Garamond', serif", fontSize: 11,
    letterSpacing: '0.32em', textTransform: 'uppercase',
    color: 'rgba(245,241,234,0.3)', marginBottom: 8, display: 'block',
  };

  if (step === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div><label style={labelStyle}>Repository URL</label><input style={inputStyle} defaultValue="https://github.com/org/myapp" /></div>
      <div><label style={labelStyle}>Branch</label><input style={inputStyle} defaultValue="main" /></div>
      <div style={{ padding: '10px 14px', background: 'rgba(245,241,234,0.03)', border: '1px solid rgba(245,241,234,0.08)', borderRadius: 2 }}>
        <span style={{ ...labelStyle, marginBottom: 0 }}>Webhook will be installed automatically via OAuth token</span>
      </div>
    </div>
  );

  if (step === 1) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[['AWS IAM Role ARN', 'arn:aws:iam::123456789:role/RaftWeaveRole'], ['Azure Service Principal', 'Client ID / Client Secret / Tenant ID'], ['GCP Service Account', 'JSON key file path']].map(([lbl, ph]) => (
        <div key={lbl}><label style={labelStyle}>{lbl}</label><input style={inputStyle} placeholder={ph} /></div>
      ))}
      <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontStyle: 'italic', color: 'rgba(245,241,234,0.25)', margin: 0 }}>
        Credentials are stored directly in HashiCorp Vault (KV v2). RaftWeave never persists plaintext credentials.
      </p>
    </div>
  );

  if (step === 2) return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {[['Workload Name', 'myapp-production'], ['Compute Type', 'ECS / ACI / Cloud Run'], ['CPU (millicores)', '500'], ['Memory (MB)', '512'], ['Health Check Path', '/healthz'], ['Port', '8080']].map(([lbl, ph]) => (
        <div key={lbl}><label style={labelStyle}>{lbl}</label><input style={inputStyle} placeholder={ph} /></div>
      ))}
    </div>
  );

  if (step === 3) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[
        { cloud: 'AWS', region: 'us-east-1', role: 'Primary', active: true },
        { cloud: 'Azure', region: 'eastus', role: 'Standby', active: true },
        { cloud: 'GCP', region: 'us-central1', role: 'Standby', active: true },
      ].map(r => (
        <div key={r.cloud} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid rgba(245,241,234,0.1)', borderRadius: 2, background: r.active ? 'rgba(245,241,234,0.04)' : 'transparent' }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: '0.1em', color: '#F5F1EA' }}>{r.cloud} — {r.region}</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 12, color: 'rgba(245,241,234,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 2 }}>{r.role}</div>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.active ? 'rgba(245,241,234,0.6)' : 'rgba(245,241,234,0.15)' }} />
        </div>
      ))}
    </div>
  );

  if (step === 4) return (
    <div style={{ background: 'rgba(245,241,234,0.03)', border: '1px solid rgba(245,241,234,0.08)', borderRadius: 2, padding: 20 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(245,241,234,0.5)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
        {`workload_name: myapp-production\nprimary_cloud: aws\nprimary_region: us-east-1\nstandby_clouds:\n  - cloud: azure\n    region: eastus\n  - cloud: gcp\n    region: us-central1\ncompute_type: ECS\ncpu_millicores: 500\nmemory_mb: 512\nhealth_path: /healthz\nport: 8080\ndatabase:\n  type: postgresql\n  rpo_seconds: 5`}
      </div>
    </div>
  );

  return null;
}

const onbSt: Record<string, CSSProperties> = {
  root: { minHeight: '100vh', background: '#080706', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: 24 },
  kanji: { position: 'absolute', fontSize: 400, color: 'rgba(245,241,234,0.02)', fontFamily: 'serif', lineHeight: 1, pointerEvents: 'none', left: -60, bottom: -60 },
  wrap: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 720, display: 'flex', gap: 64 },
  rail: { display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, flexShrink: 0 },
  railStep: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  railDot: { width: 28, height: 28, borderRadius: 2, border: '1px solid rgba(245,241,234,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, color: 'rgba(245,241,234,0.25)', background: '#080706', zIndex: 1, transition: 'all 0.3s' },
  railDotDone: { background: 'rgba(245,241,234,0.12)', color: 'rgba(245,241,234,0.7)', borderColor: 'rgba(245,241,234,0.3)' },
  railDotActive: { background: 'rgba(245,241,234,0.08)', color: '#F5F1EA', borderColor: 'rgba(245,241,234,0.5)' },
  railLine: { width: 1, height: 40, background: 'rgba(245,241,234,0.07)', transition: 'background 0.3s' },
  railLineDone: { background: 'rgba(245,241,234,0.25)' },
  content: { flex: 1, display: 'flex', flexDirection: 'column' },
  stepNum: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.25)', marginBottom: 12 },
  title: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: '0.03em', color: '#F5F1EA', marginBottom: 10, lineHeight: 1 },
  sub: { fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 300, fontStyle: 'italic', color: 'rgba(245,241,234,0.4)', lineHeight: 1.6, marginBottom: 32 },
  formArea: { flex: 1, marginBottom: 40 },
  actions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { fontFamily: "'Cormorant Garamond', serif", fontSize: 14, fontStyle: 'italic', color: 'rgba(245,241,234,0.35)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em', transition: 'color 0.15s' },
  nextBtn: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: '0.18em', padding: '11px 32px', background: '#F5F1EA', color: '#0A0907', border: 'none', cursor: 'pointer', transition: 'opacity 0.15s' },
};
