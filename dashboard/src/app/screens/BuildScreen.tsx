// BuildScreen.tsx — Build Pipeline View
import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { useRaft, type BuildHistoryItem, type BuildLogLine } from '../state';

export default function BuildScreen() {
  const { state } = useRaft();
  const { buildHistory, buildLog } = state;
  const [selectedId, setSelectedId] = useState(47);
  const logRef = useRef<HTMLDivElement>(null);
  const current = buildHistory.find(b => b.id === selectedId) || buildHistory[0];

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [selectedId]);

  const steps = [
    { name: 'Detect Language', status: 'done', dur: '0.3s' },
    { name: 'Gen Dockerfile', status: 'done', dur: '0.1s' },
    { name: 'Build (Kaniko)', status: 'done', dur: '94s' },
    { name: 'Push to Registry', status: 'done', dur: '12s' },
    { name: 'Deploy to Clouds', status: 'done', dur: '28s' },
  ];

  const logLines: BuildLogLine[] = current.id === 47 ? buildLog : [
    { t: '00:00', txt: 'Detecting language from repository…', lvl: 'info' },
    { t: '00:00', txt: `→ Detected: Go 1.24`, lvl: 'ok' },
    { t: '00:01', txt: 'Building image with Kaniko…', lvl: 'info' },
    current.status === 'failed'
      ? { t: '12:04', txt: '✕ Error: push to registry timed out after 900s', lvl: 'err' }
      : { t: '02:04', txt: '✓ Build complete — all clouds deployed', lvl: 'ok' },
  ];

  return (
    <div style={bldSt.root}>
      <div style={bldSt.header}>
        <div>
          <div style={bldSt.eyebrow}><div style={bldSt.dash}/><span style={bldSt.eyebrowText}>Nixpacks · Kaniko · OCI Registry · Connect-RPC Streaming</span></div>
          <h2 style={bldSt.heading}>Build Pipeline</h2>
        </div>
      </div>

      <div style={bldSt.body}>
        <div style={bldSt.sidebar}>
          <div style={bldSt.sidebarHead}>Build History</div>
          {buildHistory.map(b => (
            <div
              key={b.id}
              onClick={() => setSelectedId(b.id)}
              style={{
                ...bldSt.buildItem,
                ...(selectedId === b.id ? bldSt.buildItemActive : {}),
              }}
            >
              <div style={bldSt.buildItemTop}>
                <span style={bldSt.buildNum}>#{b.id}</span>
                <StatusPill status={b.status} />
              </div>
              <div style={bldSt.buildCommit}>{b.branch} · {b.commit}</div>
              <div style={bldSt.buildMsg}>{b.msg}</div>
              <div style={bldSt.buildAgo}>{b.ago}</div>
            </div>
          ))}
        </div>

        <div style={bldSt.detail}>
          <div style={bldSt.pipeline}>
            {steps.map((step, i) => (
              <div key={step.name} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  ...bldSt.pipeStep,
                  ...(current.status === 'failed' && i === 2 ? bldSt.pipeStepFailed : {}),
                  ...(current.status !== 'failed' ? bldSt.pipeStepDone : (i < 2 ? bldSt.pipeStepDone : {})),
                }}>
                  <div style={bldSt.pipeIcon}>
                    {current.status === 'failed' && i === 2 ? '✕' : '✓'}
                  </div>
                  <div>
                    <div style={bldSt.pipeName}>{step.name}</div>
                    <div style={bldSt.pipeDur}>{step.dur}</div>
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div style={{
                    ...bldSt.pipeArrow,
                    background: current.status !== 'failed' || i < 2 ? 'rgba(245,241,234,0.25)' : 'rgba(245,241,234,0.08)',
                  }}/>
                )}
              </div>
            ))}
          </div>

          <div style={bldSt.meta}>
            <MetaItem label="Branch" val={current.branch} />
            <MetaItem label="Commit" val={current.commit} />
            <MetaItem label="Author" val={current.id === 47 ? 'ananya.dev' : 'dev'} />
            <MetaItem label="Status" val={current.status} />
            <MetaItem label="Image" val={current.status === 'deployed' ? 'sha256:a7f3c8d9…' : '—'} />
          </div>

          <div style={bldSt.terminal}>
            <div style={bldSt.terminalHead}>
              <div style={bldSt.terminalDots}>
                <div style={{ ...bldSt.termDot, background: 'rgba(245,241,234,0.12)' }}/>
                <div style={{ ...bldSt.termDot, background: 'rgba(245,241,234,0.08)' }}/>
                <div style={{ ...bldSt.termDot, background: 'rgba(245,241,234,0.05)' }}/>
              </div>
              <span style={bldSt.terminalTitle}>build #{current.id} · stdout</span>
              <span style={bldSt.terminalClose}>Build Log</span>
            </div>
            <div ref={logRef} style={bldSt.terminalBody}>
              {logLines.map((line, i) => (
                <div key={i} style={bldSt.logLine}>
                  <span style={bldSt.logTime}>{line.t}</span>
                  <span style={{
                    ...bldSt.logText,
                    color: line.lvl === 'ok' ? 'rgba(245,241,234,0.75)' :
                           line.lvl === 'err' ? 'rgba(200,120,120,0.8)' :
                           line.lvl === 'muted' ? 'rgba(245,241,234,0.22)' :
                                                   'rgba(245,241,234,0.45)',
                  }}>
                    {line.txt}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: BuildHistoryItem['status'] }) {
  const map: Record<BuildHistoryItem['status'], { label: string; color: string; bg: string }> = {
    deployed: { label: 'Deployed', color: 'rgba(245,241,234,0.7)', bg: 'rgba(245,241,234,0.08)' },
    failed: { label: 'Failed', color: 'rgba(200,120,120,0.7)', bg: 'rgba(200,120,120,0.06)' },
    building: { label: 'Building', color: 'rgba(200,190,140,0.7)', bg: 'rgba(200,190,140,0.06)' },
  };
  const s = map[status] || map.deployed;
  return (
    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 10, letterSpacing: '0.18em', padding: '2px 8px', background: s.bg, color: s.color, borderRadius: 1 }}>
      {s.label}
    </span>
  );
}

function MetaItem({ label, val }: { label: string; val: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.2)' }}>{label}</span>
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: 'rgba(245,241,234,0.55)', letterSpacing: '0.04em' }}>{val}</span>
    </div>
  );
}

const bldSt: Record<string, CSSProperties> = {
  root: { padding: '88px 48px 48px', minHeight: '100vh', background: '#080706' },
  header: { marginBottom: 36 },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  dash: { width: 20, height: 1, background: 'rgba(245,241,234,0.2)' },
  eyebrowText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.25)' },
  heading: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: '0.03em', color: '#F5F1EA', lineHeight: 1 },
  body: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: 32, alignItems: 'start' },
  sidebar: { borderRight: '1px solid rgba(245,241,234,0.06)', paddingRight: 24 },
  sidebarHead: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.22)', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(245,241,234,0.06)' },
  buildItem: { padding: '14px 12px', marginBottom: 2, cursor: 'pointer', borderLeft: '2px solid transparent', transition: 'all 0.15s' },
  buildItemActive: { borderLeftColor: 'rgba(245,241,234,0.4)', background: 'rgba(245,241,234,0.03)' },
  buildItemTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  buildNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: 'rgba(245,241,234,0.65)', letterSpacing: '0.06em' },
  buildCommit: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, color: 'rgba(245,241,234,0.25)', letterSpacing: '0.08em', marginBottom: 4, fontStyle: 'italic' },
  buildMsg: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, color: 'rgba(245,241,234,0.45)', lineHeight: 1.45, marginBottom: 4 },
  buildAgo: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, color: 'rgba(245,241,234,0.2)', letterSpacing: '0.1em' },
  detail: { display: 'flex', flexDirection: 'column', gap: 24 },
  pipeline: { display: 'flex', alignItems: 'center', gap: 0, padding: '20px 24px', border: '1px solid rgba(245,241,234,0.07)', background: 'rgba(245,241,234,0.015)', overflowX: 'auto' },
  pipeStep: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', border: '1px solid rgba(245,241,234,0.07)', background: 'rgba(245,241,234,0.02)', opacity: 0.45 },
  pipeStepDone: { opacity: 1 },
  pipeStepFailed: { opacity: 1, borderColor: 'rgba(180,100,100,0.3)', background: 'rgba(180,100,100,0.04)' },
  pipeIcon: { fontFamily: 'monospace', fontSize: 11, color: 'rgba(245,241,234,0.5)', width: 16, textAlign: 'center', flexShrink: 0 },
  pipeName: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, letterSpacing: '0.12em', color: '#F5F1EA', whiteSpace: 'nowrap' },
  pipeDur: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, color: 'rgba(245,241,234,0.25)', marginTop: 2 },
  pipeArrow: { width: 20, height: 1, flexShrink: 0 },
  meta: { display: 'flex', gap: 32, padding: '16px 24px', border: '1px solid rgba(245,241,234,0.06)', flexWrap: 'wrap' },
  terminal: { border: '1px solid rgba(245,241,234,0.08)', overflow: 'hidden' },
  terminalHead: { background: 'rgba(245,241,234,0.04)', borderBottom: '1px solid rgba(245,241,234,0.06)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  terminalDots: { display: 'flex', gap: 6 },
  termDot: { width: 8, height: 8, borderRadius: '50%' },
  terminalTitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.2em', color: 'rgba(245,241,234,0.3)', flex: 1, textAlign: 'center' },
  terminalClose: { fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.2em', color: 'rgba(245,241,234,0.2)' },
  terminalBody: { padding: '16px 20px', maxHeight: 280, overflowY: 'auto', background: '#060504' },
  logLine: { display: 'flex', gap: 16, marginBottom: 3, alignItems: 'baseline' },
  logTime: { fontFamily: 'monospace', fontSize: 10, color: 'rgba(245,241,234,0.18)', flexShrink: 0, minWidth: 36 },
  logText: { fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 },
};
