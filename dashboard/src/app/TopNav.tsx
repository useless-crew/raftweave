// TopNav.tsx — Top navigation bar
import type { CSSProperties } from 'react';
import { useRaft, type FailoverPhase, type Screen } from './state';
import { useAuth } from './auth/AuthContext';

export default function TopNav() {
  const { state, dispatch } = useRaft();
  const { logout } = useAuth();
  const { screen, isAuthenticated, failoverPhase, raft, clouds } = state;

  if (!isAuthenticated || screen === 'auth' || screen === 'onboarding') return null;

  const tabs: { id: Screen; label: string }[] = [
    { id: 'topology',    label: 'Topology' },
    { id: 'raft',        label: 'Consensus' },
    { id: 'replication', label: 'Replication' },
    { id: 'build',       label: 'Build' },
    { id: 'timeline',    label: 'Timeline' },
  ];

  const leaderCloud = raft.leader ? clouds[raft.leader] : null;
  const overallHealthy = Object.values(clouds).every(c => c.status !== 'unreachable');

  return (
    <nav style={navStyles.nav}>
      {/* Logo */}
      <button onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'topology' })} style={navStyles.logo}>
        <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
          <path d="M6 5 Q7.5 6.5 6.5 9 Q5.5 12 6 16 Q6.5 20 5.5 23" stroke="#F5F1EA" strokeWidth="2" strokeLinecap="round"/>
          <path d="M14 4 Q15.5 5.5 14.5 8.5 Q13.5 12 14 15.5 Q14.5 19 13.5 23.5" stroke="#F5F1EA" strokeWidth="2" strokeLinecap="round"/>
          <path d="M22 6 Q23 8 22 11 Q21 14.5 21.5 18 Q22 21 21 24" stroke="#F5F1EA" strokeWidth="2" strokeLinecap="round"/>
          <path d="M4.5 12.5 Q9 10.5 14 11.5 Q19 12.5 24 11" stroke="#F5F1EA" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <span style={navStyles.logoText}>raftweave</span>
      </button>

      {/* Divider */}
      <div style={navStyles.divider} />

      {/* Tabs */}
      <div style={navStyles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => dispatch({ type: 'SET_SCREEN', screen: tab.id })}
            style={{
              ...navStyles.tab,
              ...(screen === tab.id ? navStyles.tabActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Right side — cluster health + meta */}
      <div style={navStyles.right}>
        {/* Failover phase indicator */}
        {failoverPhase !== 'idle' && failoverPhase !== 'complete' && (
          <div style={navStyles.phaseChip}>
            <span style={navStyles.phaseDot} />
            <span style={navStyles.phaseText}>{phaseLabel(failoverPhase)}</span>
          </div>
        )}
        {failoverPhase === 'complete' && (
          <div style={{ ...navStyles.phaseChip, background: 'rgba(245,241,234,0.06)', border: '1px solid rgba(245,241,234,0.15)' }}>
            <span style={{ ...navStyles.phaseDot, background: 'rgba(245,241,234,0.8)', animation: 'none' }} />
            <span style={navStyles.phaseText}>Failover Complete</span>
          </div>
        )}

        {/* Term + leader */}
        <div style={navStyles.metaGroup}>
          <span style={navStyles.metaLabel}>Term</span>
          <span style={navStyles.metaValue}>{raft.term}</span>
        </div>
        <div style={navStyles.metaDivider} />
        <div style={navStyles.metaGroup}>
          <span style={navStyles.metaLabel}>Leader</span>
          <span style={navStyles.metaValue}>{leaderCloud ? leaderCloud.short : '—'}</span>
        </div>
        <div style={navStyles.metaDivider} />

        {/* Health dot */}
        <div style={healthDot(overallHealthy && failoverPhase === 'idle')} />
        <span style={navStyles.workloadName}>myapp-production</span>

        <div style={navStyles.metaDivider} />
        <button onClick={() => { logout().catch(() => {}); }} style={navStyles.logoutBtn}>
          Log out
        </button>
      </div>
    </nav>
  );
}

function phaseLabel(phase: FailoverPhase) {
  const map: Record<string, string> = {
    detecting:  'Detecting failure…',
    electing:   'Raft election…',
    fencing:    'Fencing primary…',
    rerouting:  'Rerouting traffic…',
  };
  return map[phase] || phase;
}

function healthDot(ok: boolean): CSSProperties {
  return {
    width: 7, height: 7, borderRadius: '50%',
    background: ok ? 'rgba(245,241,234,0.6)' : 'rgba(180,100,100,0.8)',
    boxShadow: ok ? '0 0 6px rgba(245,241,234,0.2)' : '0 0 6px rgba(180,100,100,0.4)',
    transition: 'all 0.5s ease',
    flexShrink: 0,
  };
}

const navStyles: Record<string, CSSProperties> = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
    height: 56,
    background: '#0A0907',
    borderBottom: '1px solid rgba(245,241,234,0.07)',
    display: 'flex', alignItems: 'center',
    padding: '0 32px',
    gap: 0,
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '0 4px', flexShrink: 0,
  },
  logoText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 16, fontWeight: 500, color: '#F5F1EA',
    letterSpacing: '0.04em',
  },
  divider: {
    width: 1, height: 20,
    background: 'rgba(245,241,234,0.1)',
    margin: '0 24px',
    flexShrink: 0,
  },
  tabs: {
    display: 'flex', alignItems: 'center', gap: 2, flex: 1,
  },
  tab: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 13, letterSpacing: '0.14em',
    color: 'rgba(245,241,234,0.38)',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '6px 16px', borderRadius: 2,
    transition: 'color 0.15s',
  },
  tabActive: {
    color: '#F5F1EA',
    background: 'rgba(245,241,234,0.07)',
  },
  right: {
    marginLeft: 'auto',
    display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
  },
  phaseChip: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '4px 12px',
    background: 'rgba(160,88,88,0.12)',
    border: '1px solid rgba(160,88,88,0.25)',
    borderRadius: 2,
  },
  phaseDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'rgba(200,130,130,0.9)',
    display: 'inline-block',
    animation: 'pulse 1s ease-in-out infinite',
  },
  phaseText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 12, letterSpacing: '0.08em',
    color: 'rgba(200,160,160,0.9)',
  },
  metaGroup: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  metaLabel: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase',
    color: 'rgba(245,241,234,0.2)',
  },
  metaValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 15, letterSpacing: '0.06em',
    color: 'rgba(245,241,234,0.7)',
  },
  metaDivider: {
    width: 1, height: 24,
    background: 'rgba(245,241,234,0.07)',
  },
  workloadName: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 13, letterSpacing: '0.06em',
    color: 'rgba(245,241,234,0.4)',
  },
  logoutBtn: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 13, letterSpacing: '0.06em', fontStyle: 'italic',
    color: 'rgba(245,241,234,0.4)',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '4px 0',
    transition: 'color 0.15s',
  },
};
