// ReplicationScreen.tsx — Replication Lag Graph
import { useMemo, type CSSProperties } from 'react';
import { useRaft, type FailoverPhase, type LagPoint, type DbRole } from '../state';

export default function ReplicationScreen() {
  const { state } = useRaft();
  const { lagHistory, clouds } = state;

  const azurePrimary = clouds.azure.database.role === 'primary';
  const azureLag = clouds.azure.database.lag;
  const gcpLag = clouds.gcp.database.lag;

  return (
    <div style={repSt.root}>
      <div style={repSt.header}>
        <div>
          <div style={repSt.eyebrow}><div style={repSt.dash}/><span style={repSt.eyebrowText}>pglogrepl WAL Streaming · PostgreSQL Logical Replication</span></div>
          <h2 style={repSt.heading}>Replication Lag</h2>
        </div>
        <div style={repSt.rpoBlock}>
          <span style={repSt.rpoLabel}>RPO Target</span>
          <span style={repSt.rpoVal}>&lt; 5.0s</span>
        </div>
      </div>

      <div style={repSt.cards}>
        <LagCard
          label="Azure eastus"
          role={clouds.azure.database.role}
          lag={azureLag}
        />
        <LagCard
          label="GCP us-central1"
          role={clouds.gcp.database.role}
          lag={gcpLag}
        />
        <div style={repSt.rpoStatusCard}>
          <span style={repSt.rpoStatusLabel}>RPO Enforcer</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'rgba(245,241,234,0.6)',
              animation: 'pulse 2s ease-in-out infinite',
            }}/>
            <span style={repSt.rpoStatusVal}>Monitoring · No write pause</span>
          </div>
          <div style={repSt.rpoStatusDetail}>Threshold: 5.0s · Check interval: 1s</div>
        </div>
      </div>

      <div style={repSt.chartWrap}>
        <div style={repSt.chartHeader}>
          <span style={repSt.chartTitle}>Replication Lag — Last 3 Minutes</span>
          <div style={repSt.chartLegend}>
            <LegendItem color="rgba(245,241,234,0.7)" label="Azure eastus" />
            <LegendItem color="rgba(245,241,234,0.3)" label="GCP us-central1" />
          </div>
        </div>
        <LagChart lagHistory={lagHistory} azurePrimary={azurePrimary} />
        <div style={repSt.chartAnnotations}>
          <div style={repSt.annotRow}>
            <div style={{ width: 24, height: 1, background: 'rgba(245,241,234,0.22)', borderTop: '1px dashed rgba(245,241,234,0.22)' }}/>
            <span style={repSt.annotText}>3.0s — Warning threshold</span>
          </div>
          <div style={repSt.annotRow}>
            <div style={{ width: 24, height: 1, borderTop: '1px dashed rgba(180,100,100,0.35)' }}/>
            <span style={{ ...repSt.annotText, color: 'rgba(180,120,120,0.5)' }}>5.0s — RPO write-pause threshold</span>
          </div>
        </div>
      </div>

      <div style={repSt.slotRow}>
        <div style={repSt.slotItem}>
          <span style={repSt.slotLabel}>Replication Slot</span>
          <span style={repSt.slotVal}>raftweave_myapp-production</span>
        </div>
        <div style={repSt.slotDivider}/>
        <div style={repSt.slotItem}>
          <span style={repSt.slotLabel}>Publication</span>
          <span style={repSt.slotVal}>raftweave_pub</span>
        </div>
        <div style={repSt.slotDivider}/>
        <div style={repSt.slotItem}>
          <span style={repSt.slotLabel}>Heartbeat</span>
          <span style={repSt.slotVal}>Every 10s</span>
        </div>
        <div style={repSt.slotDivider}/>
        <div style={repSt.slotItem}>
          <span style={repSt.slotLabel}>Protocol</span>
          <span style={repSt.slotVal}>pglogrepl v2 · LSN streaming</span>
        </div>
      </div>
    </div>
  );
}

function LagChart({ lagHistory, azurePrimary }: { lagHistory: LagPoint[]; azurePrimary: boolean; failoverPhase?: FailoverPhase }) {
  const W = 900; const H = 200;
  const pad = { t: 16, r: 24, b: 36, l: 44 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const maxY = 6;

  const xs = (i: number) => pad.l + (i / (lagHistory.length - 1)) * pw;
  const ys = (v: number) => pad.t + ph - Math.min(v / maxY, 1) * ph;

  const azurePath = useMemo(() =>
    lagHistory.map((d, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(d.azure).toFixed(1)}`).join(' '),
    [lagHistory]
  );
  const gcpPath = useMemo(() =>
    lagHistory.map((d, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(d.gcp).toFixed(1)}`).join(' '),
    [lagHistory]
  );

  const yTicks = [1, 2, 3, 4, 5];
  const xLabels = ['-3m', '-2.5m', '-2m', '-1.5m', '-1m', '-0.5m', 'Now'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {yTicks.map(v => (
        <g key={v}>
          <line x1={pad.l} y1={ys(v)} x2={W - pad.r} y2={ys(v)}
            stroke={v === 3 ? 'rgba(245,241,234,0.1)' : v === 5 ? 'rgba(180,100,100,0.15)' : 'rgba(245,241,234,0.05)'}
            strokeWidth={1}
            strokeDasharray={v === 3 || v === 5 ? '6,4' : '2,6'}
          />
          <text x={pad.l - 8} y={ys(v)} textAnchor="end" dominantBaseline="middle"
            fontFamily="'Cormorant Garamond', serif" fontSize={10} letterSpacing="0.1em"
            fill={v === 5 ? 'rgba(180,120,120,0.5)' : 'rgba(245,241,234,0.2)'}>
            {v}s
          </text>
        </g>
      ))}

      {xLabels.map((lbl, i) => (
        <text key={lbl} x={xs(Math.round((lagHistory.length - 1) * i / (xLabels.length - 1)))} y={H - 8}
          textAnchor="middle"
          fontFamily="'Cormorant Garamond', serif" fontSize={9} letterSpacing="0.1em"
          fill="rgba(245,241,234,0.18)">
          {lbl}
        </text>
      ))}

      {!azurePrimary && (
        <path
          d={`${azurePath} L${xs(lagHistory.length - 1)},${ys(0)} L${xs(0)},${ys(0)} Z`}
          fill="rgba(245,241,234,0.03)"
        />
      )}

      <path
        d={`${gcpPath} L${xs(lagHistory.length - 1)},${ys(0)} L${xs(0)},${ys(0)} Z`}
        fill="rgba(245,241,234,0.015)"
      />

      <path d={gcpPath} fill="none" stroke="rgba(245,241,234,0.28)" strokeWidth={1.5} />

      {!azurePrimary
        ? <path d={azurePath} fill="none" stroke="rgba(245,241,234,0.65)" strokeWidth={1.8} />
        : <line x1={pad.l} y1={ys(0)} x2={W - pad.r} y2={ys(0)} stroke="rgba(245,241,234,0.2)" strokeWidth={1} strokeDasharray="4,4" />
      }

      {!azurePrimary && (
        <circle
          cx={xs(lagHistory.length - 1)}
          cy={ys(lagHistory[lagHistory.length - 1].azure)}
          r={3.5} fill="rgba(245,241,234,0.8)"
        />
      )}
      <circle
        cx={xs(lagHistory.length - 1)}
        cy={ys(lagHistory[lagHistory.length - 1].gcp)}
        r={3} fill="rgba(245,241,234,0.45)"
      />
    </svg>
  );
}

function LagCard({ label, role, lag }: { label: string; role: DbRole; lag: number | null }) {
  const isPrimary = role === 'primary';
  const isFenced = role === 'fenced';
  const lagNum = lag !== null ? lag : 0;
  const warn = lagNum > 3;
  const crit = lagNum > 5;

  return (
    <div style={repSt.lagCard}>
      <span style={repSt.lagCardLabel}>{label}</span>
      <div style={repSt.lagCardRole}>{role?.toUpperCase() ?? '—'}</div>
      {isPrimary ? (
        <div style={repSt.lagCardPrimary}>Primary — no lag</div>
      ) : isFenced ? (
        <div style={{ ...repSt.lagNum, color: 'rgba(180,100,100,0.5)' }}>FENCED</div>
      ) : (
        <>
          <div style={{ ...repSt.lagNum, color: crit ? 'rgba(180,110,110,0.8)' : warn ? 'rgba(200,170,120,0.8)' : '#F5F1EA' }}>
            {lagNum.toFixed(2)}<span style={repSt.lagUnit}>s</span>
          </div>
          <LagBar value={lagNum} />
        </>
      )}
    </div>
  );
}

function LagBar({ value }: { value: number }) {
  const pct = Math.min(value / 6, 1) * 100;
  const color = value > 5 ? 'rgba(180,100,100,0.6)' : value > 3 ? 'rgba(200,170,120,0.5)' : 'rgba(245,241,234,0.4)';
  return (
    <div style={{ height: 2, background: 'rgba(245,241,234,0.06)', borderRadius: 1, marginTop: 8, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.8s ease, background 0.5s' }} />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ width: 20, height: 1.5, background: color, borderRadius: 1 }} />
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.12em', color: 'rgba(245,241,234,0.3)' }}>{label}</span>
    </div>
  );
}

const repSt: Record<string, CSSProperties> = {
  root: { padding: '88px 48px 48px', minHeight: '100vh', background: '#080706' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40 },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  dash: { width: 20, height: 1, background: 'rgba(245,241,234,0.2)' },
  eyebrowText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.25)' },
  heading: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: '0.03em', color: '#F5F1EA', lineHeight: 1 },
  rpoBlock: { textAlign: 'right' },
  rpoLabel: { display: 'block', fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.2)', marginBottom: 4 },
  rpoVal: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#F5F1EA', letterSpacing: '0.04em', lineHeight: 1 },
  cards: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 36 },
  lagCard: { padding: '20px 24px', border: '1px solid rgba(245,241,234,0.08)', background: 'rgba(245,241,234,0.02)' },
  lagCardLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.3)', display: 'block', marginBottom: 6 },
  lagCardRole: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 10, letterSpacing: '0.22em', color: 'rgba(245,241,234,0.2)', marginBottom: 12 },
  lagNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, color: '#F5F1EA', letterSpacing: '0.03em', lineHeight: 1 },
  lagUnit: { fontSize: 20, opacity: 0.5 },
  lagCardPrimary: { fontFamily: "'Cormorant Garamond', serif", fontSize: 14, fontStyle: 'italic', color: 'rgba(245,241,234,0.4)' },
  rpoStatusCard: { padding: '20px 24px', border: '1px solid rgba(245,241,234,0.06)', background: 'rgba(245,241,234,0.015)' },
  rpoStatusLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.3)' },
  rpoStatusVal: { fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: 'rgba(245,241,234,0.55)', letterSpacing: '0.04em' },
  rpoStatusDetail: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, color: 'rgba(245,241,234,0.2)', marginTop: 8, letterSpacing: '0.06em' },
  chartWrap: { border: '1px solid rgba(245,241,234,0.07)', padding: '24px 24px 16px', marginBottom: 28 },
  chartHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  chartTitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.3)' },
  chartLegend: { display: 'flex', alignItems: 'center', gap: 20 },
  chartAnnotations: { display: 'flex', gap: 32, marginTop: 12 },
  annotRow: { display: 'flex', alignItems: 'center', gap: 10 },
  annotText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, fontStyle: 'italic', color: 'rgba(245,241,234,0.3)', letterSpacing: '0.04em' },
  slotRow: { display: 'flex', alignItems: 'center', gap: 32, borderTop: '1px solid rgba(245,241,234,0.06)', paddingTop: 24, flexWrap: 'wrap' },
  slotItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  slotLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.2)' },
  slotVal: { fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: 'rgba(245,241,234,0.45)', letterSpacing: '0.04em' },
  slotDivider: { width: 1, height: 28, background: 'rgba(245,241,234,0.06)', flexShrink: 0 },
};
