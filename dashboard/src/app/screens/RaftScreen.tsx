// RaftScreen.tsx — Raft Consensus Visualizer
import { useEffect, useState, type CSSProperties } from 'react';
import { useRaft, type CloudId } from '../state';

const NODE_POS: Record<CloudId, { x: number; y: number }> = {
  aws:   { x: 200, y: 80  },
  azure: { x: 440, y: 80  },
  gcp:   { x: 320, y: 260 },
};

export default function RaftScreen() {
  const { state } = useRaft();
  const { clouds, raft } = state;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={raftSt.root}>
      <div style={raftSt.header}>
        <div>
          <div style={raftSt.eyebrow}><div style={raftSt.dash} /><span style={raftSt.eyebrowText}>Consensus Engine · From-Scratch Raft Implementation</span></div>
          <h2 style={raftSt.heading}>Raft State Machine</h2>
        </div>
        <div style={raftSt.termDisplay}>
          <div style={raftSt.termLabel}>Current Term</div>
          <div style={raftSt.termVal}>{raft.term}</div>
        </div>
      </div>

      <div style={raftSt.body}>
        <div style={raftSt.cluster}>
          <svg viewBox="0 0 640 380" style={{ width: '100%', height: '100%' }}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {([['aws','azure'],['aws','gcp'],['azure','gcp']] as [CloudId, CloudId][]).map(([a,b]) => {
              const pa = NODE_POS[a]; const pb = NODE_POS[b];
              const aOffline = clouds[a].role === 'offline';
              const bOffline = clouds[b].role === 'offline';
              const anyOff = aOffline || bOffline;

              const hbT = (tick * 0.8) % 100 / 100;
              const hx = (pa.x + 64) + ((pb.x + 64) - (pa.x + 64)) * hbT;
              const hy = (pa.y + 40) + ((pb.y + 40) - (pa.y + 40)) * hbT;

              return (
                <g key={`${a}-${b}`}>
                  <line
                    x1={pa.x + 64} y1={pa.y + 40}
                    x2={pb.x + 64} y2={pb.y + 40}
                    stroke={anyOff ? 'rgba(180,80,80,0.15)' : 'rgba(245,241,234,0.08)'}
                    strokeWidth={1}
                    strokeDasharray={anyOff ? '3,6' : 'none'}
                  />
                  {!anyOff && raft.heartbeatOk && (
                    <circle cx={hx} cy={hy} r={2.5} fill="rgba(245,241,234,0.3)" />
                  )}
                </g>
              );
            })}

            {Object.values(clouds).map(cloud => {
              const p = NODE_POS[cloud.id];
              const isLeader = raft.leader === cloud.id;
              const isCandidate = cloud.role === 'candidate';
              const isOffline = cloud.role === 'offline';
              const isElecting = raft.electionInProgress && cloud.id === 'azure';

              let stroke = 'rgba(245,241,234,0.12)';
              let fill = 'rgba(245,241,234,0.03)';
              let textColor = 'rgba(245,241,234,0.45)';

              if (isLeader && !isOffline) { stroke = 'rgba(245,241,234,0.55)'; fill = 'rgba(245,241,234,0.07)'; textColor = '#F5F1EA'; }
              if (isCandidate) { stroke = 'rgba(200,190,140,0.6)'; fill = 'rgba(200,190,140,0.06)'; textColor = 'rgba(200,190,140,0.9)'; }
              if (isOffline) { stroke = 'rgba(180,80,80,0.25)'; fill = 'rgba(180,80,80,0.04)'; textColor = 'rgba(180,100,100,0.4)'; }

              return (
                <g key={cloud.id}>
                  {isLeader && !isOffline && (
                    <rect x={p.x - 8} y={p.y - 8} width={144} height={96}
                      fill="none" stroke="rgba(245,241,234,0.08)" strokeWidth={1}
                      style={{ filter: 'url(#glow)' }}
                    />
                  )}
                  <rect x={p.x} y={p.y} width={128} height={80}
                    fill={fill} stroke={stroke} strokeWidth={1}
                  />
                  <text x={p.x + 64} y={p.y + 22} textAnchor="middle"
                    fontFamily="'Bebas Neue', sans-serif" fontSize={14} letterSpacing="0.1em" fill={textColor}>
                    {cloud.nodeId}
                  </text>
                  <text x={p.x + 64} y={p.y + 42} textAnchor="middle"
                    fontFamily="'Cormorant Garamond', serif" fontSize={11} letterSpacing="0.3em" fill={textColor} style={{ textTransform: 'uppercase' }}>
                    {cloud.role.toUpperCase()}
                  </text>
                  <text x={p.x + 64} y={p.y + 60} textAnchor="middle"
                    fontFamily="'Cormorant Garamond', serif" fontSize={9.5} letterSpacing="0.18em" fill="rgba(245,241,234,0.2)">
                    {cloud.short} · {cloud.region}
                  </text>

                  {isElecting && cloud.id !== 'azure' && (
                    <VoteArrow from={NODE_POS[cloud.id]} to={NODE_POS['azure']} tick={tick} />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div style={raftSt.panel}>
          <StatBlock label="Leader" value={raft.leader ? clouds[raft.leader]?.nodeId : '— ELECTION —'} sub={raft.leader ? `${clouds[raft.leader]?.short} · ${clouds[raft.leader]?.region}` : `Term ${raft.term}`} highlight={!raft.leader} />
          <div style={raftSt.panelDivider} />
          <StatBlock label="Log Index" value={raft.logIndex.toLocaleString()} sub="last appended entry" />
          <div style={raftSt.panelDivider} />
          <StatBlock label="Commit Index" value={raft.commitIndex.toLocaleString()} sub="quorum-committed" />
          <div style={raftSt.panelDivider} />
          <StatBlock label="Applied Index" value={raft.appliedIndex.toLocaleString()} sub="state machine position" />
          <div style={raftSt.panelDivider} />
          <div style={raftSt.heartbeatRow}>
            <span style={raftSt.hbLabel}>Heartbeat</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: raft.heartbeatOk ? 'rgba(245,241,234,0.6)' : 'rgba(180,100,100,0.6)',
                animation: raft.heartbeatOk ? 'pulse 1.2s ease-in-out infinite' : 'none',
                transition: 'background 0.4s',
              }} />
              <span style={raftSt.hbVal}>{raft.heartbeatOk ? '50 ms interval · OK' : 'NO HEARTBEAT'}</span>
            </div>
          </div>
          <div style={raftSt.panelDivider} />

          <div style={raftSt.nodeRows}>
            {Object.values(clouds).map(c => (
              <div key={c.id} style={raftSt.nodeRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: c.role === 'leader' ? 'rgba(245,241,234,0.7)' :
                                c.role === 'offline' ? 'rgba(180,100,100,0.5)' :
                                'rgba(245,241,234,0.2)',
                    flexShrink: 0,
                  }} />
                  <span style={raftSt.nodeRowId}>{c.nodeId}</span>
                </div>
                <span style={{ ...raftSt.nodeRowRole, color:
                  c.role === 'leader' ? 'rgba(245,241,234,0.8)' :
                  c.role === 'offline' ? 'rgba(180,100,100,0.5)' :
                  c.role === 'candidate' ? 'rgba(200,190,140,0.7)' :
                  'rgba(245,241,234,0.3)'
                }}>
                  {c.role.toUpperCase()}
                </span>
                <span style={raftSt.nodeRowTerm}>Term {raft.term}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function VoteArrow({ from, to, tick }: { from: { x: number; y: number }; to: { x: number; y: number }; tick: number }) {
  const t = ((tick * 0.7) % 100) / 100;
  const x1 = from.x + 64; const y1 = from.y + 40;
  const x2 = to.x + 64;   const y2 = to.y + 40;
  const cx = x1 + (x2 - x1) * t;
  const cy = y1 + (y2 - y1) * t;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(200,190,140,0.2)" strokeWidth={0.8} strokeDasharray="4,4" />
      <circle cx={cx} cy={cy} r={3} fill="rgba(200,190,140,0.7)" />
    </g>
  );
}

function StatBlock({ label, value, sub, highlight }: { label: string; value: string | undefined; sub: string | undefined; highlight?: boolean }) {
  return (
    <div style={raftSt.statBlock}>
      <span style={raftSt.statLabel}>{label}</span>
      <span style={{ ...raftSt.statVal, color: highlight ? 'rgba(200,190,140,0.8)' : '#F5F1EA' }}>{value}</span>
      <span style={raftSt.statSub}>{sub}</span>
    </div>
  );
}

const raftSt: Record<string, CSSProperties> = {
  root: { padding: '88px 48px 40px', minHeight: '100vh', background: '#080706' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 48 },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  dash: { width: 20, height: 1, background: 'rgba(245,241,234,0.2)' },
  eyebrowText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.25)' },
  heading: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: '0.03em', color: '#F5F1EA', lineHeight: 1 },
  termDisplay: { textAlign: 'right' },
  termLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.2)', marginBottom: 4 },
  termVal: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 64, color: '#F5F1EA', lineHeight: 1, letterSpacing: '0.04em' },
  body: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: 48, alignItems: 'start' },
  cluster: { height: 380, position: 'relative' },
  panel: { borderLeft: '1px solid rgba(245,241,234,0.07)', paddingLeft: 40 },
  panelDivider: { height: 1, background: 'rgba(245,241,234,0.05)', margin: '14px 0' },
  statBlock: { display: 'flex', flexDirection: 'column', gap: 3 },
  statLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.22)' },
  statVal: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: '0.04em', color: '#F5F1EA', lineHeight: 1 },
  statSub: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, fontStyle: 'italic', color: 'rgba(245,241,234,0.2)' },
  heartbeatRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  hbLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.22)' },
  hbVal: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, color: 'rgba(245,241,234,0.45)', letterSpacing: '0.06em' },
  nodeRows: { display: 'flex', flexDirection: 'column', gap: 10 },
  nodeRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  nodeRowId: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, color: 'rgba(245,241,234,0.45)', letterSpacing: '0.04em' },
  nodeRowRole: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 10, letterSpacing: '0.14em' },
  nodeRowTerm: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, color: 'rgba(245,241,234,0.18)', letterSpacing: '0.1em' },
};
