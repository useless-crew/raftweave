// TimelineScreen.tsx — Failover Event Timeline
import type { CSSProperties } from 'react';
import { useRaft, type TimelineEvent as TimelineEventType } from '../state';

export default function TimelineScreen() {
  const { state } = useRaft();
  const { timelineEvents, failoverPhase } = state;

  return (
    <div style={tlSt.root}>
      <div style={tlSt.header}>
        <div>
          <div style={tlSt.eyebrow}><div style={tlSt.dash}/><span style={tlSt.eyebrowText}>Append-Only Audit Log · bbolt Persisted</span></div>
          <h2 style={tlSt.heading}>Failover Timeline</h2>
        </div>
        <div style={tlSt.headerRight}>
          <div style={tlSt.countChip}>
            <span style={tlSt.countNum}>{timelineEvents.length}</span>
            <span style={tlSt.countLabel}>events</span>
          </div>
        </div>
      </div>

      {failoverPhase !== 'idle' && failoverPhase !== 'complete' && (
        <div style={tlSt.activeBanner}>
          <span style={tlSt.bannerDot} />
          <span style={tlSt.bannerText}>Failover in progress — events will appear as they occur</span>
        </div>
      )}

      <div style={tlSt.timeline}>
        {timelineEvents.map((ev, i) => (
          <TimelineEvent key={ev.id} event={ev} isNew={i === 0 && failoverPhase !== 'idle'} />
        ))}
      </div>

      <div style={tlSt.footer}>
        <span style={tlSt.footerText}>Events are persisted to bbolt on every Raft log commit. This log is append-only and tamper-evident.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(245,241,234,0.3)', animation: 'pulse 2s ease-in-out infinite' }}/>
          <span style={tlSt.footerText}>Live</span>
        </div>
      </div>
    </div>
  );
}

function TimelineEvent({ event, isNew }: { event: TimelineEventType; isNew: boolean }) {
  const iconMap: Record<TimelineEventType['type'], { sym: string; color: string; bg: string }> = {
    deploy: { sym: '↑', color: 'rgba(245,241,234,0.6)', bg: 'rgba(245,241,234,0.06)' },
    failover: { sym: '!', color: 'rgba(200,130,130,0.8)', bg: 'rgba(200,130,130,0.07)' },
    election: { sym: '⟳', color: 'rgba(200,190,140,0.8)', bg: 'rgba(200,190,140,0.07)' },
    success: { sym: '✓', color: 'rgba(245,241,234,0.8)', bg: 'rgba(245,241,234,0.06)' },
    error: { sym: '✕', color: 'rgba(200,120,120,0.7)', bg: 'rgba(200,120,120,0.06)' },
    scale: { sym: '↔', color: 'rgba(245,241,234,0.5)', bg: 'rgba(245,241,234,0.04)' },
  };
  const ic = iconMap[event.type] || iconMap.deploy;

  return (
    <div style={{
      ...tlSt.event,
      animation: isNew ? 'slideIn 0.4s ease-out' : 'none',
    }}>
      <div style={tlSt.eventLeft}>
        <span style={tlSt.eventTime}>{formatTime(event.ts)}</span>
        <div style={{ ...tlSt.eventIcon, color: ic.color, background: ic.bg }}>
          {ic.sym}
        </div>
        <div style={tlSt.connector} />
      </div>

      <div style={tlSt.eventContent}>
        <div style={tlSt.eventTitle}>{event.title}</div>
        <div style={tlSt.eventDetail}>{event.detail}</div>

        {(event.rto || event.rpo) && (
          <div style={tlSt.slaRow}>
            {event.rto && <SlaTag label="RTO" val={event.rto} />}
            {event.rpo && <SlaTag label="RPO" val={event.rpo} />}
          </div>
        )}

        <TypeBadge type={event.type} color={ic.color} />
      </div>
    </div>
  );
}

function SlaTag({ label, val }: { label: string; val: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '4px 12px',
      border: '1px solid rgba(245,241,234,0.12)',
      background: 'rgba(245,241,234,0.03)',
    }}>
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.3)' }}>{label}</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: '0.06em', color: '#F5F1EA' }}>{val}</span>
    </div>
  );
}

function TypeBadge({ type, color }: { type: TimelineEventType['type']; color: string }) {
  const labels: Record<TimelineEventType['type'], string> = { deploy: 'Deployment', failover: 'Failover Event', election: 'Raft Election', success: 'Resolved', error: 'Error', scale: 'Scale Event' };
  return (
    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 10, letterSpacing: '0.18em', color, opacity: 0.7, display: 'block', marginTop: 8 }}>
      {labels[type] || type}
    </span>
  );
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff/3600000)}h ago`;
  return `${Math.round(diff/86400000)}d ago`;
}

const tlSt: Record<string, CSSProperties> = {
  root: { padding: '88px 48px 48px', minHeight: '100vh', background: '#080706' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  dash: { width: 20, height: 1, background: 'rgba(245,241,234,0.2)' },
  eyebrowText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(245,241,234,0.25)' },
  heading: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: '0.03em', color: '#F5F1EA', lineHeight: 1 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  countChip: { display: 'flex', alignItems: 'baseline', gap: 6, padding: '8px 16px', border: '1px solid rgba(245,241,234,0.08)', background: 'rgba(245,241,234,0.02)' },
  countNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#F5F1EA', letterSpacing: '0.04em' },
  countLabel: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, color: 'rgba(245,241,234,0.3)', letterSpacing: '0.2em' },
  activeBanner: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', border: '1px solid rgba(180,100,100,0.2)', background: 'rgba(180,100,100,0.05)', marginBottom: 28 },
  bannerDot: { width: 6, height: 6, borderRadius: '50%', background: 'rgba(200,130,130,0.8)', animation: 'pulse 0.8s ease-in-out infinite', display: 'inline-block', flexShrink: 0 },
  bannerText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontStyle: 'italic', color: 'rgba(200,160,160,0.7)', letterSpacing: '0.04em' },
  timeline: { display: 'flex', flexDirection: 'column', paddingLeft: 8 },
  event: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: 24, paddingBottom: 32, transition: 'opacity 0.4s' },
  eventLeft: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, position: 'relative' },
  eventTime: { fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.14em', color: 'rgba(245,241,234,0.22)', textAlign: 'right', paddingTop: 2 },
  eventIcon: { width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: 12, flexShrink: 0 },
  connector: { width: 1, flex: 1, background: 'rgba(245,241,234,0.06)', marginRight: 13 },
  eventContent: { paddingTop: 4, paddingBottom: 24, borderBottom: '1px solid rgba(245,241,234,0.05)' },
  eventTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: '0.06em', color: '#F5F1EA', marginBottom: 10, lineHeight: 1.2 },
  eventDetail: { fontFamily: "'Cormorant Garamond', serif", fontSize: 14, fontWeight: 300, lineHeight: 1.65, color: 'rgba(245,241,234,0.38)', marginBottom: 12 },
  slaRow: { display: 'flex', gap: 10, marginBottom: 10 },
  footer: { borderTop: '1px solid rgba(245,241,234,0.06)', paddingTop: 20, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontFamily: "'Cormorant Garamond', serif", fontSize: 12, fontStyle: 'italic', color: 'rgba(245,241,234,0.2)', letterSpacing: '0.04em' },
};
