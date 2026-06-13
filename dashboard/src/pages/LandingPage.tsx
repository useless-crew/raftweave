import { Link } from 'react-router-dom';
import './LandingPage.css';

function LogoMark({ stroke = '#0D0B09' }: { stroke?: string }) {
  return (
    <svg className="nav-logo-icon" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 5 Q7.5 6.5 6.5 9 Q5.5 12 6 16 Q6.5 20 5.5 23" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M14 4 Q15.5 5.5 14.5 8.5 Q13.5 12 14 15.5 Q14.5 19 13.5 23.5" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M22 6 Q23 8 22 11 Q21 14.5 21.5 18 Q22 21 21 24" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M4.5 12.5 Q9 10.5 14 11.5 Q19 12.5 24 11" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      <path d="M5 8 Q9.5 6.5 14 7 Q18.5 7.5 23.5 7" stroke={stroke} strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.5"/>
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="landing">
      {/* ═══════════════════ NAV ═══════════════════ */}
      <nav>
        <a href="#hero" className="nav-logo">
          <LogoMark />
          <span className="nav-logo-name">raftweave</span>
        </a>

        <ul className="nav-links">
          <li><a href="#features">Products</a></li>
          <li><a href="#architecture">Architecture</a></li>
          <li><a href="#sla">Why RaftWeave</a></li>
          <li><a href="#">Pricing</a></li>
          <li><a href="#">Company</a></li>
        </ul>

        <div className="nav-actions">
          <Link to="/app" className="nav-signin">sign in</Link>
          <a href="#" className="nav-btn">Request Demo</a>
        </div>
      </nav>

      {/* ═══════════════════ HERO ═══════════════════ */}
      <section className="hero" id="hero">
        <div className="hero-rail">
          <span className="hero-rail-text">Sovereign Infrastructure</span>
          <div className="hero-rail-line"></div>
          <span className="hero-rail-text">Multi-Cloud Consensus</span>
          <div className="hero-rail-line"></div>
          <span className="hero-rail-text">Zero Dependency</span>
        </div>

        <div className="hero-kanji" aria-hidden="true">統</div>

        <div className="hero-content">
          <div className="hero-eyebrow">
            <div className="hero-eyebrow-line"></div>
            <span className="hero-eyebrow-text">Sovereign Multi-Cloud Orchestration Platform</span>
          </div>

          <h1 className="hero-title">
            Failover Without<br />
            <em>Human Hands.</em>
          </h1>

          <p className="hero-subtitle">
            RaftWeave uses a from-scratch Raft consensus engine to autonomously move your entire workload — compute and database — across AWS, Azure, and GCP in under thirty seconds.
          </p>

          <div className="hero-cta">
            <a href="#" className="btn-primary">Request Early Access</a>
            <a href="#architecture" className="btn-ghost">See the Architecture</a>
          </div>
        </div>

        <div className="hero-metrics">
          <div className="hero-metric">
            <div className="hero-metric-val">&lt;30<span>s</span></div>
            <div className="hero-metric-lbl">Recovery Time Objective</div>
          </div>
          <div className="hero-metric">
            <div className="hero-metric-val">&lt;5<span>s</span></div>
            <div className="hero-metric-lbl">Recovery Point Objective</div>
          </div>
          <div className="hero-metric">
            <div className="hero-metric-val">&lt;2<span>s</span></div>
            <div className="hero-metric-lbl">Failure Detection</div>
          </div>
          <div className="hero-metric">
            <div className="hero-metric-val">&lt;1.2<span>s</span></div>
            <div className="hero-metric-lbl">Raft Election Time</div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ CLOUDS STRIP ═══════════════════ */}
      <div className="clouds-section">
        <span className="clouds-label">Native support for</span>
        <div className="clouds-divider"></div>
        <div className="clouds-list">
          <div className="cloud-chip">
            <div className="cloud-chip-icon">AWS</div>
            <span className="cloud-chip-name">Amazon Web Services</span>
          </div>
          <div className="cloud-chip">
            <div className="cloud-chip-icon">AZR</div>
            <span className="cloud-chip-name">Microsoft Azure</span>
          </div>
          <div className="cloud-chip">
            <div className="cloud-chip-icon">GCP</div>
            <span className="cloud-chip-name">Google Cloud</span>
          </div>
        </div>
        <div className="clouds-divider"></div>
        <span className="clouds-label" style={{ whiteSpace: 'nowrap' }}>ECS · EKS · ACI · AKS · Cloud Run · GKE</span>
      </div>

      {/* ═══════════════════ FEATURES ═══════════════════ */}
      <section className="section" id="features">
        <div className="section-eyebrow">
          <div className="section-eyebrow-dash"></div>
          <span className="section-eyebrow-text">Core Capabilities</span>
        </div>
        <h2 className="section-heading">Four Pillars of<br />Resilient Infrastructure</h2>

        <div className="features-grid">
          <div className="feature">
            <div className="feature-num">01</div>
            <div className="feature-title">Raft Consensus Engine</div>
            <p className="feature-body">
              A complete from-scratch Raft implementation in pure Go. Mathematically guaranteed at-most-one-leader, no split-brain, quorum-safe failover decisions persisted to bbolt — even through network partitions and arbitrary node failures.
            </p>
            <span className="feature-tag">Leader Election · Log Replication · Snapshots</span>
          </div>

          <div className="feature">
            <div className="feature-num">02</div>
            <div className="feature-title">Full Workload Portability</div>
            <p className="feature-body">
              A single cloud-agnostic <code>ComputeSpec</code> translates to ECS, AKS, or Cloud Run without modification. Build once — deploy anywhere. The same OCI image runs identically across all three hyperscalers.
            </p>
            <span className="feature-tag">AWS · Azure · GCP · Nixpacks · Kaniko</span>
          </div>

          <div className="feature">
            <div className="feature-num">03</div>
            <div className="feature-title">Sovereign Architecture</div>
            <p className="feature-body">
              No hyperscaler owns your control plane. RaftWeave runs on operator-controlled infrastructure. Your Raft nodes, your registry, your consensus — zero dependency on any cloud vendor's orchestration primitives.
            </p>
            <span className="feature-tag">Self-Hosted · OCI Registry · Operator-Controlled</span>
          </div>

          <div className="feature">
            <div className="feature-num">04</div>
            <div className="feature-title">Zero-Trust Security</div>
            <p className="feature-body">
              mTLS on every inter-service call via SPIFFE/SPIRE-issued X.509 SVIDs. HashiCorp Vault manages all credentials — no secret ever touches an environment variable or a plaintext database field.
            </p>
            <span className="feature-tag">mTLS · SPIFFE · Vault · OIDC · RBAC</span>
          </div>
        </div>
      </section>

      <div className="brush-divider"></div>

      {/* ═══════════════════ ARCHITECTURE FLOW ═══════════════════ */}
      <section className="section-dark" id="architecture">
        <div className="dark-rail" aria-hidden="true">
          Ingestion · Build · Consensus · Provision · Replicate · Dashboard · Security
        </div>
        <div className="dark-kanji" aria-hidden="true">流</div>

        <div className="section-eyebrow">
          <div className="section-eyebrow-dash"></div>
          <span className="section-eyebrow-text">End-to-End Control Plane</span>
        </div>
        <h2 className="section-heading">Seven Systems.<br />One Decision.</h2>

        <div className="flow">
          <div className="flow-step">
            <div className="flow-node" style={{ position: 'relative' }}>
              <span className="flow-node-num">01</span>
              <div className="flow-arrow"></div>
            </div>
            <div className="flow-step-title">Ingestion</div>
            <p className="flow-step-desc">Webhook validation, HMAC auth, workload descriptor parsing, Vault credential storage</p>
          </div>

          <div className="flow-step">
            <div className="flow-node" style={{ position: 'relative' }}>
              <span className="flow-node-num">02</span>
              <div className="flow-arrow"></div>
            </div>
            <div className="flow-step-title">Build Pipeline</div>
            <p className="flow-step-desc">Nixpacks detection, Kaniko build, digest-addressed image push to sovereign OCI registry</p>
          </div>

          <div className="flow-step">
            <div className="flow-node" style={{ position: 'relative' }}>
              <span className="flow-node-num">03</span>
              <div className="flow-arrow"></div>
            </div>
            <div className="flow-step-title">Consensus Engine</div>
            <p className="flow-step-desc">Raft election, log commitment, failover command issuance — quorum-safe, bbolt-persisted</p>
          </div>

          <div className="flow-step">
            <div className="flow-node" style={{ position: 'relative' }}>
              <span className="flow-node-num">04</span>
              <div className="flow-arrow"></div>
            </div>
            <div className="flow-step-title">Multi-Cloud Provisioner</div>
            <p className="flow-step-desc">Cloud-agnostic translation, global LB update, fencing of stale primary, traffic rerouting</p>
          </div>

          <div className="flow-step">
            <div className="flow-node">
              <span className="flow-node-num">05</span>
            </div>
            <div className="flow-step-title">Replication Layer</div>
            <p className="flow-step-desc">pglogrepl WAL streaming, RPO enforcement, standby promotion, connection string rotation</p>
          </div>
        </div>
      </section>

      {/* ═══════════════════ DASHBOARD PREVIEW ═══════════════════ */}
      <section className="preview-section" id="dashboard">
        <div className="section-eyebrow">
          <div className="section-eyebrow-dash"></div>
          <span className="section-eyebrow-text">Observable Consensus</span>
        </div>
        <h2 className="section-heading">Every Heartbeat.<br />Every Vote. Live.</h2>

        <div className="preview-wrap">
          <div className="preview-placeholder">
            <div className="preview-panels">
              <div className="preview-panel tall"></div>
              <div className="preview-panel"></div>
              <div className="preview-panel"></div>
              <div className="preview-panel"></div>
              <div className="preview-panel"></div>
            </div>
            <div className="preview-inner">
              <div className="preview-inner-label">Dashboard Screenshot Placeholder</div>
            </div>
          </div>
          <div className="preview-label-bar">
            <span className="preview-label-text">Real-time Raft visualizer, replication lag graph, build pipeline, failover timeline</span>
            <span className="preview-label-tag">Angular 19 · Signals · Connect-RPC Streaming</span>
          </div>
        </div>
      </section>

      {/* ═══════════════════ SLA / PROOF ═══════════════════ */}
      <section className="sla-section" id="sla">
        <div className="sla-left">
          <div className="section-eyebrow">
            <div className="section-eyebrow-dash"></div>
            <span className="section-eyebrow-text">Guaranteed SLAs</span>
          </div>
          <h2 className="section-heading" style={{ marginBottom: 0 }}>Measured.<br />Not Estimated.</h2>
          <div className="sla-table">
            <div className="sla-row">
              <span className="sla-metric-name">Recovery Time Objective</span>
              <span className="sla-metric-val">&lt; 30s</span>
              <span className="sla-metric-note">Raft election + Global LB fencing + DNS</span>
            </div>
            <div className="sla-row">
              <span className="sla-metric-name">Recovery Point Objective</span>
              <span className="sla-metric-val">&lt; 5s</span>
              <span className="sla-metric-note">pglogrepl WAL streaming + RPO enforcer</span>
            </div>
            <div className="sla-row">
              <span className="sla-metric-name">Failure Detection</span>
              <span className="sla-metric-val">&lt; 2s</span>
              <span className="sla-metric-note">200 ms health agents + 600 ms Raft timeout</span>
            </div>
            <div className="sla-row">
              <span className="sla-metric-name">Raft Election</span>
              <span className="sla-metric-val">&lt; 1.2s</span>
              <span className="sla-metric-note">Randomised 150–300 ms timeouts, 3-node quorum</span>
            </div>
            <div className="sla-row">
              <span className="sla-metric-name">Traffic Rerouting</span>
              <span className="sla-metric-val">&lt; 10s</span>
              <span className="sla-metric-note">BGP anycast via Global LB, not DNS TTL</span>
            </div>
          </div>
        </div>

        <div className="sla-right">
          <div className="section-eyebrow">
            <div className="section-eyebrow-dash"></div>
            <span className="section-eyebrow-text">Target Users</span>
          </div>
          <h2 className="section-heading">Built for Platform<br />Engineering Teams.</h2>
          <p className="sla-body">
            RaftWeave is designed for DevOps and Platform Engineering teams operating mission-critical workloads that cannot afford cloud vendor lock-in, human-in-the-loop failover delays, or opaque control planes.
          </p>
          <p className="sla-body" style={{ marginBottom: 48 }}>
            Unlike Zerto, Crossplane, or Spinnaker — RaftWeave combines compute and database failover into a single consensus-driven decision, with full visibility into every Raft term, every vote, and every log entry.
          </p>
          <a href="#" className="btn-primary" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>Read the Architecture Docs</a>
        </div>
      </section>

      {/* ═══════════════════ CTA ═══════════════════ */}
      <section className="cta-section" id="cta">
        <div className="cta-bg-text" aria-hidden="true">RAFTWEAVE</div>
        <div className="cta-kanji" aria-hidden="true">守</div>

        <div className="cta-eyebrow">
          <div className="cta-eyebrow-line"></div>
          <span className="cta-eyebrow-text">Take Back Your Control Plane</span>
          <div className="cta-eyebrow-line"></div>
        </div>

        <h2 className="cta-title">Eliminate Cloud<br />Dependency.</h2>
        <p className="cta-subtitle">
          No hyperscaler owns your failover. Request early access today.
        </p>

        <div className="cta-btns">
          <a href="#" className="btn-primary">Request Early Access</a>
          <a href="#" className="btn-ghost">Schedule a Demo</a>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer>
        <div className="footer-grid">
          <div>
            <div className="footer-brand-row">
              <svg width="22" height="22" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.5">
                <path d="M6 5 Q7.5 6.5 6.5 9 Q5.5 12 6 16 Q6.5 20 5.5 23" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M14 4 Q15.5 5.5 14.5 8.5 Q13.5 12 14 15.5 Q14.5 19 13.5 23.5" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M22 6 Q23 8 22 11 Q21 14.5 21.5 18 Q22 21 21 24" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M4.5 12.5 Q9 10.5 14 11.5 Q19 12.5 24 11" stroke="#F5F1EA" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <span className="footer-brand-name">raftweave</span>
            </div>
            <p className="footer-blurb">
              Sovereign multi-cloud orchestration. Raft consensus-driven failover across AWS, Azure, and GCP — without hyperscaler dependency.
            </p>
          </div>

          <div>
            <div className="footer-col-heading">Product</div>
            <ul className="footer-links">
              <li><a href="#">Overview</a></li>
              <li><a href="#">Architecture</a></li>
              <li><a href="#">Dashboard</a></li>
              <li><a href="#">Pricing</a></li>
              <li><a href="#">Changelog</a></li>
            </ul>
          </div>

          <div>
            <div className="footer-col-heading">Developers</div>
            <ul className="footer-links">
              <li><a href="#">Documentation</a></li>
              <li><a href="#">API Reference</a></li>
              <li><a href="#">raftweave.yaml</a></li>
              <li><a href="#">GitHub</a></li>
              <li><a href="#">Status</a></li>
            </ul>
          </div>

          <div>
            <div className="footer-col-heading">Company</div>
            <ul className="footer-links">
              <li><a href="#">About</a></li>
              <li><a href="#">Blog</a></li>
              <li><a href="#">Careers</a></li>
              <li><a href="#">Security</a></li>
              <li><a href="#">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="footer-copy">© 2026 RaftWeave. All rights reserved.</span>
          <svg className="footer-seal" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="34" height="34" stroke="#7A2020" strokeWidth="1.2" opacity="0.6"/>
            <rect x="4" y="4" width="28" height="28" stroke="#7A2020" strokeWidth="0.6" opacity="0.4"/>
            <text x="18" y="24" textAnchor="middle" fontFamily="serif" fontSize="16" fill="#7A2020" opacity="0.7">統</text>
          </svg>
        </div>
      </footer>
    </div>
  );
}
