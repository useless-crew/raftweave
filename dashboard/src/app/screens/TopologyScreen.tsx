// TopologyScreen.tsx — Cluster Topology View
import { useEffect, useState, type CSSProperties } from 'react';
import { useRaft, type CloudId, type CloudState, type CloudRole, type CloudStatus, type FailoverPhase, type RaftState } from '../state';

const CLOUD_POSITIONS: Record<CloudId, { x: number; y: number }> = {
  aws:   { x: 140, y: 80  },
  azure: { x: 560, y: 80  },
  gcp:   { x: 350, y: 290 },
};

export default function TopologyScreen() {
  const { state, simulateFailover, resetFailover } = useRaft();
  const { clouds, raft, failoverPhase } = state;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 50);
    return () => clearInterval(t);
  }, []);

  const isActive = failoverPhase !== 'idle';
  const isDone = failoverPhase === 'complete';

  return (
    <div style={topoSt.root}>
      <div style={topoSt.header}>
        <div>
          <div style={topoSt.eyebrow}>
            <div style={topoSt.eyebrowDash} />
            <span style={topoSt.eyebrowText}>myapp-production · raftweave.yaml</span>
          </div>
          <h2 style={topoSt.heading}>Cluster Topology</h2>
        </div>
        <div style={topoSt.headerRight}>
          {isDone && (
            <button onClick={resetFailover} style={topoSt.resetBtn}>Reset Simulation</button>
          )}
          {!isActive && (
            <button onClick={simulateFailover} style={topoSt.failoverBtn}>
              ⚡ Simulate Failover
            </button>
          )}
          {isActive && !isDone && (
            <div style={topoSt.phaseIndicator}>
              <span style={topoSt.phasePulse} />
              <span style={topoSt.phaseLabel}>{phaseText(failoverPhase)}</span>
            </div>
          )}
        </div>
      </div>

      <div style={topoSt.canvas}>
        <svg style={topoSt.svg} viewBox="0 0 700 420" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="arrowW" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(245,241,234,0.25)" />
            </marker>
            <marker id="arrowR" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(200,120,120,0.4)" />
            </marker>
          </defs>
          <ConnectionLines clouds={clouds} failoverPhase={failoverPhase} tick={tick} />
        </svg>

        {Object.values(clouds).map(cloud => (
          <CloudCard
            key={cloud.id}
            cloud={cloud}
            raft={raft}
            pos={CLOUD_POSITIONS[cloud.id]}
          />
        ))}
      </div>

      <div style={topoSt.lbStrip}>
        <span style={topoSt.lbLabel}>Global Load Balancer</span>
        <div style={topoSt.lbDivider} />
        {Object.values(clouds).map(c => (
          <div key={c.id} style={topoSt.lbItem}>
            <div style={{
              ...topoSt.lbDot,
              background: c.lb.active ? 'rgba(245,241,234,0.7)' : 'rgba(245,241,234,0.15)',
              boxShadow: c.lb.active ? '0 0 6px rgba(245,241,234,0.3)' : 'none',
            }} />
            <span style={topoSt.lbName}>{c.short} — {c.lb.type}</span>
            <span style={{ ...topoSt.lbBadge, opacity: c.lb.active ? 1 : 0.3 }}>
              {c.lb.active ? 'Active' : 'Standby'}
            </span>
          </div>
        ))}
        <div style={topoSt.lbDivider} />
        {isDone && (
          <div style={topoSt.rtoTag}>RTO 24.7s · RPO 1.8s</div>
        )}
      </div>
    </div>
  );
}

function ConnectionLines({ clouds, failoverPhase, tick }: { clouds: Record<CloudId, CloudState>; failoverPhase: FailoverPhase; tick: number }) {
  const pairs: { from: CloudId; to: CloudId }[] = [
    { from: 'aws', to: 'azure' },
    { from: 'aws', to: 'gcp' },
    { from: 'azure', to: 'gcp' },
  ];

  return (
    <>
      {pairs.map(({ from, to }) => {
        const a = CLOUD_POSITIONS[from];
        const b = CLOUD_POSITIONS[to];

        const fromFailed = clouds[from].status === 'unreachable';
        const toFailed = clouds[to].status === 'unreachable';
        const anyFailed = fromFailed || toFailed;

        const isNewPrimary = (from === 'azure' || to === 'azure') && failoverPhase === 'complete';

        const dashOffset = -(tick * 0.6) % 24;

        const strokeColor = anyFailed
          ? 'rgba(180,100,100,0.2)'
          : isNewPrimary
            ? 'rgba(245,241,234,0.45)'
            : 'rgba(245,241,234,0.12)';

        return (
          <g key={`${from}-${to}`}>
            <line
              x1={a.x + 95} y1={a.y + 60} x2={b.x + 95} y2={b.y + 60}
              stroke={strokeColor}
              strokeWidth={anyFailed ? 0.8 : 1.2}
              strokeDasharray={anyFailed ? '4,8' : '6,6'}
              strokeDashoffset={anyFailed ? 0 : dashOffset}
            />
            {!anyFailed && failoverPhase !== 'detecting' && (
              <DataFlowDot
                x1={a.x + 95} y1={a.y + 60}
                x2={b.x + 95} y2={b.y + 60}
                tick={tick}
                offset={from === 'aws' ? 0 : from === 'azure' ? 80 : 160}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

function DataFlowDot({ x1, y1, x2, y2, tick, offset }: { x1: number; y1: number; x2: number; y2: number; tick: number; offset: number }) {
  const t = ((tick * 0.5 + offset) % 200) / 200;
  const cx = x1 + (x2 - x1) * t;
  const cy = y1 + (y2 - y1) * t;
  return <circle cx={cx} cy={cy} r={2.5} fill="rgba(245,241,234,0.4)" />;
}

function CloudCard({ cloud, raft, pos }: { cloud: CloudState; raft: RaftState; pos: { x: number; y: number } }) {
  const isLeader = raft.leader === cloud.id;
  const isCandidate = cloud.role === 'candidate';
  const isOffline = cloud.status === 'unreachable';
  const isDegraded = cloud.status === 'degraded';
  const isFenced = cloud.database.role === 'fenced';

  let borderColor = 'rgba(245,241,234,0.1)';
  let glowStyle: CSSProperties = {};
  if (isLeader && !isOffline) { borderColor = 'rgba(245,241,234,0.45)'; glowStyle = { boxShadow: '0 0 24px rgba(245,241,234,0.07)' }; }
  if (isDegraded) { borderColor = 'rgba(200,160,100,0.4)'; }
  if (isOffline) { borderColor = 'rgba(180,80,80,0.3)'; }
  if (isCandidate) { borderColor = 'rgba(245,241,234,0.3)'; glowStyle = { boxShadow: '0 0 18px rgba(245,241,234,0.05)', animation: 'cardPulse 0.8s ease-in-out infinite' }; }

  return (
    <div style={{
      ...topoSt.card,
      left: pos.x, top: pos.y,
      borderColor,
      opacity: isOffline ? 0.55 : 1,
      transition: 'all 0.6s ease',
      ...glowStyle,
    }}>
      <div style={topoSt.cardHead}>
        <div style={topoSt.cloudBadge}>{cloud.short}</div>
        <div style={topoSt.cardHeadRight}>
          <span style={topoSt.regionText}>{cloud.region}</span>
          <RoleBadge role={cloud.role} />
        </div>
      </div>

      <div style={topoSt.cardDivider} />

      <div style={topoSt.row}>
        <span style={topoSt.rowLabel}>Compute</span>
        <div style={topoSt.rowRight}>
          <span style={{ ...topoSt.rowVal, color: isOffline ? 'rgba(180,100,100,0.7)' : '#F5F1EA' }}>
            {cloud.compute.running}/{cloud.compute.desired}
          </span>
          <span style={topoSt.rowMeta}>{cloud.compute.type}</span>
        </div>
      </div>

      <div style={topoSt.row}>
        <span style={topoSt.rowLabel}>Database</span>
        <div style={topoSt.rowRight}>
          <span style={{ ...topoSt.rowVal, textTransform: 'capitalize', color: isFenced ? 'rgba(180,100,100,0.7)' : '#F5F1EA' }}>
            {cloud.database.role}
          </span>
          {cloud.database.lag !== null && (
            <span style={topoSt.rowMeta}>{cloud.database.lag.toFixed(1)}s lag</span>
          )}
        </div>
      </div>

      <div style={topoSt.row}>
        <span style={topoSt.rowLabel}>Health</span>
        <div style={topoSt.rowRight}>
          <StatusDot status={cloud.status} />
          <span style={topoSt.rowMeta}>{statusText(cloud.status)}</span>
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: CloudRole }) {
  const map: Record<CloudRole, { label: string; color: string; bg: string; animation?: string }> = {
    leader:    { label: 'LEADER',    color: 'rgba(245,241,234,0.9)', bg: 'rgba(245,241,234,0.1)' },
    follower:  { label: 'FOLLOWER',  color: 'rgba(245,241,234,0.35)', bg: 'transparent' },
    candidate: { label: 'CANDIDATE', color: 'rgba(200,190,140,0.9)', bg: 'rgba(200,190,140,0.08)', animation: 'pulse 0.8s ease-in-out infinite' },
    offline:   { label: 'OFFLINE',   color: 'rgba(180,100,100,0.7)', bg: 'rgba(180,100,100,0.08)' },
  };
  const s = map[role] || map.follower;
  return (
    <span style={{
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 10, letterSpacing: '0.18em',
      color: s.color, background: s.bg,
      padding: '2px 7px', borderRadius: 1,
      animation: s.animation,
    }}>
      {s.label}
    </span>
  );
}

function StatusDot({ status }: { status: CloudStatus }) {
  let bg = 'rgba(245,241,234,0.55)';
  let anim = 'none';
  if (status === 'degraded') { bg = 'rgba(200,160,100,0.8)'; anim = 'pulse 1s ease-in-out infinite'; }
  if (status === 'unreachable') { bg = 'rgba(180,80,80,0.7)'; }
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: bg, animation: anim, flexShrink: 0 }} />;
}

function statusText(status: CloudStatus) {
  if (status === 'degraded') return 'Degraded';
  if (status === 'unreachable') return 'Unreachable';
  return 'Healthy';
}

function phaseText(phase: FailoverPhase) {
  return ({ detecting: 'Detecting failure…', electing: 'Raft election in progress…', fencing: 'Fencing old primary…', rerouting: 'Rerouting traffic…' } as Record<string, string>)[phase] || '';
}

const topoSt: Record<string, CSSProperties> = {
  root: { padding: '88px 48px 40px', minHeight: '100vh', background: '#080706', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 48 },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  eyebrowDash: { width: 20, height: 1, background: 'rgba(245,241,234,0.2)' },
  eyebrowText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.25)' },
  heading: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: '0.03em', color: '#F5F1EA', lineHeight: 1 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  failoverBtn: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: '0.18em', padding: '10px 28px', background: 'rgba(245,241,234,0.08)', border: '1px solid rgba(245,241,234,0.2)', color: '#F5F1EA', cursor: 'pointer', transition: 'all 0.15s' },
  resetBtn: { fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontStyle: 'italic', padding: '9px 22px', background: 'transparent', border: '1px solid rgba(245,241,234,0.12)', color: 'rgba(245,241,234,0.4)', cursor: 'pointer' },
  phaseIndicator: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', background: 'rgba(180,100,100,0.08)', border: '1px solid rgba(180,100,100,0.2)' },
  phasePulse: { width: 6, height: 6, borderRadius: '50%', background: 'rgba(200,130,130,0.9)', display: 'inline-block', animation: 'pulse 0.8s ease-in-out infinite' },
  phaseLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontStyle: 'italic', color: 'rgba(200,150,150,0.9)' },
  canvas: { position: 'relative', flex: 1, minHeight: 420, maxHeight: 480 },
  svg: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' },
  card: {
    position: 'absolute', width: 190,
    background: 'rgba(245,241,234,0.03)',
    border: '1px solid',
    padding: '16px 18px',
    display: 'flex', flexDirection: 'column', gap: 0,
    transition: 'all 0.6s ease',
  },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cloudBadge: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: '0.12em', color: 'rgba(245,241,234,0.5)', background: 'rgba(245,241,234,0.06)', padding: '3px 8px' },
  cardHeadRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  regionText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.15em', color: 'rgba(245,241,234,0.25)', textTransform: 'uppercase' },
  cardDivider: { height: 1, background: 'rgba(245,241,234,0.06)', marginBottom: 12 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' },
  rowLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.22)' },
  rowRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  rowVal: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: '0.06em', color: '#F5F1EA' },
  rowMeta: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, color: 'rgba(245,241,234,0.22)', letterSpacing: '0.08em' },
  lbStrip: { marginTop: 32, borderTop: '1px solid rgba(245,241,234,0.06)', paddingTop: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' },
  lbLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.2)', flexShrink: 0 },
  lbDivider: { width: 1, height: 20, background: 'rgba(245,241,234,0.07)', flexShrink: 0 },
  lbItem: { display: 'flex', alignItems: 'center', gap: 10 },
  lbDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0, transition: 'all 0.5s ease' },
  lbName: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, color: 'rgba(245,241,234,0.35)', letterSpacing: '0.05em' },
  lbBadge: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 10, letterSpacing: '0.15em', color: 'rgba(245,241,234,0.4)', transition: 'opacity 0.5s' },
  rtoTag: { marginLeft: 'auto', fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: '0.15em', color: 'rgba(245,241,234,0.5)', padding: '4px 12px', border: '1px solid rgba(245,241,234,0.12)' },
};
