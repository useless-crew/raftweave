// state.tsx — Global state, context, and failover simulation engine
import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';

export type CloudId = 'aws' | 'azure' | 'gcp';
export type CloudRole = 'leader' | 'follower' | 'candidate' | 'offline';
export type CloudStatus = 'healthy' | 'degraded' | 'unreachable';
export type DbRole = 'primary' | 'standby' | 'fenced';

export type Screen =
  | 'auth' | 'onboarding' | 'topology' | 'raft' | 'replication' | 'build' | 'timeline';

export type FailoverPhase = 'idle' | 'detecting' | 'electing' | 'fencing' | 'rerouting' | 'complete';

export interface CloudState {
  id: CloudId;
  name: string;
  short: string;
  region: string;
  role: CloudRole;
  status: CloudStatus;
  compute: { running: number; desired: number; type: string };
  database: { role: DbRole; lag: number | null };
  lb: { type: string; active: boolean };
  nodeId: string;
}

export interface RaftState {
  term: number;
  leader: CloudId | null;
  logIndex: number;
  commitIndex: number;
  appliedIndex: number;
  heartbeatOk: boolean;
  electionInProgress: boolean;
}

export interface LagPoint { t: number; azure: number; gcp: number }

export interface TimelineEvent {
  id: number;
  ts: number;
  type: 'deploy' | 'failover' | 'election' | 'success' | 'error' | 'scale';
  title: string;
  detail: string;
  rto: string | null;
  rpo: string | null;
}

export interface BuildLogLine { t: string; txt: string; lvl: 'info' | 'ok' | 'muted' | 'err' }

export interface BuildHistoryItem {
  id: number;
  commit: string;
  branch: string;
  msg: string;
  status: 'deployed' | 'failed' | 'building';
  ago: string;
}

export interface AppState {
  screen: Screen;
  isAuthenticated: boolean;
  onboardingStep: number;
  clouds: Record<CloudId, CloudState>;
  raft: RaftState;
  lagHistory: LagPoint[];
  timelineEvents: TimelineEvent[];
  failoverPhase: FailoverPhase;
  buildLog: BuildLogLine[];
  buildHistory: BuildHistoryItem[];
}

const initialClouds: Record<CloudId, CloudState> = {
  aws: {
    id: 'aws', name: 'Amazon Web Services', short: 'AWS', region: 'us-east-1',
    role: 'leader', status: 'healthy',
    compute: { running: 2, desired: 2, type: 'ECS Fargate' },
    database: { role: 'primary', lag: null },
    lb: { type: 'Global Accelerator', active: true },
    nodeId: 'raft-node-1',
  },
  azure: {
    id: 'azure', name: 'Microsoft Azure', short: 'AZR', region: 'eastus',
    role: 'follower', status: 'healthy',
    compute: { running: 2, desired: 2, type: 'ACI' },
    database: { role: 'standby', lag: 0.8 },
    lb: { type: 'Azure Front Door', active: false },
    nodeId: 'raft-node-2',
  },
  gcp: {
    id: 'gcp', name: 'Google Cloud Platform', short: 'GCP', region: 'us-central1',
    role: 'follower', status: 'healthy',
    compute: { running: 2, desired: 2, type: 'Cloud Run' },
    database: { role: 'standby', lag: 1.2 },
    lb: { type: 'GCP Global LB', active: false },
    nodeId: 'raft-node-3',
  },
};

const initialRaft: RaftState = {
  term: 7, leader: 'aws', logIndex: 2847, commitIndex: 2847,
  appliedIndex: 2846, heartbeatOk: true, electionInProgress: false,
};

const baseLagHistory: LagPoint[] = Array.from({ length: 60 }, (_, i) => ({
  t: i,
  azure: Math.max(0.2, 0.8 + Math.sin(i * 0.3) * 0.3 + (Math.sin(i * 1.7) * 0.1)),
  gcp:   Math.max(0.3, 1.2 + Math.sin(i * 0.25 + 1) * 0.4 + (Math.sin(i * 2.1) * 0.15)),
}));

const initialTimelineEvents: TimelineEvent[] = [
  { id: 1, ts: Date.now() - 120000,    type: 'deploy',   title: 'Build #47 deployed to all clouds', detail: 'Commit abc1234 · ECS Fargate / ACI / Cloud Run · 2/2 replicas healthy.', rto: null, rpo: null },
  { id: 2, ts: Date.now() - 10800000,  type: 'deploy',   title: 'Build #46 deployed to all clouds', detail: 'Commit def5678 · Minor dependency update.', rto: null, rpo: null },
  { id: 3, ts: Date.now() - 28800000,  type: 'error',    title: 'Build #45 failed — image push timeout', detail: 'Kaniko push to internal registry timed out after 900s. Retried automatically.', rto: null, rpo: null },
  { id: 4, ts: Date.now() - 86400000,  type: 'scale',    title: 'Manual scale — replicas 1 → 2', detail: 'Operator scaled all clouds from 1 to 2 replicas. No disruption.', rto: null, rpo: null },
  { id: 5, ts: Date.now() - 259200000, type: 'election', title: 'Raft re-election (Term 6 → 7)', detail: 'Routine leader rotation. AWS us-east-1 won quorum in 847 ms.', rto: null, rpo: null },
];

const initialState: AppState = {
  screen: 'auth',
  isAuthenticated: false,
  onboardingStep: 0,
  clouds: initialClouds,
  raft: initialRaft,
  lagHistory: baseLagHistory,
  timelineEvents: initialTimelineEvents,
  failoverPhase: 'idle',
  buildLog: [
    { t: '00:00', txt: 'Detecting language from repository…', lvl: 'info' },
    { t: '00:00', txt: '→ Detected: Go 1.24 (go.mod found)', lvl: 'ok' },
    { t: '00:01', txt: 'Generating optimised multi-stage Dockerfile…', lvl: 'info' },
    { t: '00:01', txt: '→ Base: gcr.io/distroless/static-debian12', lvl: 'muted' },
    { t: '00:02', txt: 'Building image with Kaniko (unprivileged)…', lvl: 'info' },
    { t: '00:05', txt: 'FROM golang:1.24-alpine AS builder', lvl: 'muted' },
    { t: '00:12', txt: 'WORKDIR /app', lvl: 'muted' },
    { t: '00:14', txt: 'RUN go mod download  [cached]', lvl: 'muted' },
    { t: '00:50', txt: 'RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server', lvl: 'muted' },
    { t: '01:24', txt: '→ Build complete. Image size: 8.4 MB', lvl: 'ok' },
    { t: '01:24', txt: 'Pushing sha256:a7f3c8d9e1b2… to internal registry', lvl: 'info' },
    { t: '01:36', txt: '→ Pushed successfully (digest-addressed)', lvl: 'ok' },
    { t: '01:36', txt: 'Deploying to AWS us-east-1 (ECS Fargate)…', lvl: 'info' },
    { t: '01:45', txt: '→ AWS: 2/2 tasks healthy', lvl: 'ok' },
    { t: '01:45', txt: 'Deploying to Azure eastus (ACI)…', lvl: 'info' },
    { t: '01:52', txt: '→ Azure: 2/2 containers healthy', lvl: 'ok' },
    { t: '01:52', txt: 'Deploying to GCP us-central1 (Cloud Run)…', lvl: 'info' },
    { t: '02:04', txt: '→ GCP: 2/2 instances healthy', lvl: 'ok' },
    { t: '02:04', txt: '✓ Build #47 complete — all clouds deployed', lvl: 'ok' },
  ],
  buildHistory: [
    { id: 47, commit: 'abc1234', branch: 'main', msg: 'feat: improve health check retry logic', status: 'deployed', ago: '2m ago' },
    { id: 46, commit: 'def5678', branch: 'main', msg: 'chore: update go dependencies', status: 'deployed', ago: '3h ago' },
    { id: 45, commit: 'cde9012', branch: 'feat/retry', msg: 'feat: configurable retry backoff', status: 'failed', ago: '8h ago' },
    { id: 44, commit: 'bcd3456', branch: 'main', msg: 'fix: replication lag threshold', status: 'deployed', ago: '1d ago' },
    { id: 43, commit: 'abc7890', branch: 'main', msg: 'refactor: consensus engine cleanup', status: 'deployed', ago: '2d ago' },
  ],
};

export type Action =
  | { type: 'SET_SCREEN'; screen: Screen }
  | { type: 'AUTH' }
  | { type: 'SET_AUTHENTICATED'; authenticated: boolean }
  | { type: 'ONBOARDING_NEXT' }
  | { type: 'ONBOARDING_BACK' }
  | { type: 'FAILOVER_DETECTING' }
  | { type: 'FAILOVER_ELECTING' }
  | { type: 'FAILOVER_FENCING' }
  | { type: 'FAILOVER_REROUTING' }
  | { type: 'FAILOVER_COMPLETE' }
  | { type: 'RESET_FAILOVER' }
  | { type: 'UPDATE_LAG' }
  | { type: 'TICK_RAFT' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.screen };
    case 'AUTH':
      return { ...state, isAuthenticated: true, screen: 'onboarding' };
    case 'SET_AUTHENTICATED':
      if (action.authenticated) {
        // A restored session (page reload) skips the auth/onboarding screens.
        return { ...state, isAuthenticated: true, screen: state.screen === 'auth' ? 'topology' : state.screen };
      }
      return { ...state, isAuthenticated: false, screen: 'auth' };
    case 'ONBOARDING_NEXT':
      if (state.onboardingStep >= 4) return { ...state, screen: 'topology', onboardingStep: 0 };
      return { ...state, onboardingStep: state.onboardingStep + 1 };
    case 'ONBOARDING_BACK':
      if (state.onboardingStep <= 0) return { ...state, screen: 'auth' };
      return { ...state, onboardingStep: state.onboardingStep - 1 };

    case 'FAILOVER_DETECTING':
      return { ...state, failoverPhase: 'detecting',
        clouds: { ...state.clouds, aws: { ...state.clouds.aws, status: 'degraded' } } };

    case 'FAILOVER_ELECTING':
      return { ...state, failoverPhase: 'electing',
        clouds: { ...state.clouds,
          aws:   { ...state.clouds.aws,   status: 'unreachable', role: 'offline' },
          azure: { ...state.clouds.azure, role: 'candidate' },
        },
        raft: { ...state.raft, electionInProgress: true, term: state.raft.term + 1, leader: null, heartbeatOk: false },
      };

    case 'FAILOVER_FENCING':
      return { ...state, failoverPhase: 'fencing',
        clouds: { ...state.clouds,
          aws:   { ...state.clouds.aws,   compute: { ...state.clouds.aws.compute, running: 0 } },
          azure: { ...state.clouds.azure, role: 'leader' },
        },
        raft: { ...state.raft, electionInProgress: false, leader: 'azure', logIndex: state.raft.logIndex + 3 },
      };

    case 'FAILOVER_REROUTING':
      return { ...state, failoverPhase: 'rerouting',
        clouds: { ...state.clouds,
          aws:   { ...state.clouds.aws,   lb: { ...state.clouds.aws.lb, active: false }, database: { role: 'fenced', lag: null } },
          azure: { ...state.clouds.azure, database: { role: 'primary', lag: null }, lb: { ...state.clouds.azure.lb, active: true } },
        },
        timelineEvents: [
          { id: Date.now(),   ts: Date.now(), type: 'failover', title: 'AWS us-east-1 health check failure', detail: `Failure detected for 600ms. Raft election initiated — Term ${state.raft.term + 1}.`, rto: null, rpo: null },
          { id: Date.now()+1, ts: Date.now(), type: 'election', title: `Raft re-election complete (Term ${state.raft.term} → ${state.raft.term + 1})`, detail: 'Azure eastus (raft-node-2) won quorum in 943ms. AWS node fenced.', rto: null, rpo: null },
          ...state.timelineEvents,
        ],
      };

    case 'FAILOVER_COMPLETE':
      return { ...state, failoverPhase: 'complete',
        clouds: { ...state.clouds,
          azure: { ...state.clouds.azure, status: 'healthy', role: 'leader', database: { role: 'primary', lag: null }, lb: { ...state.clouds.azure.lb, active: true } },
        },
        raft: { ...state.raft, leader: 'azure', heartbeatOk: true, logIndex: state.raft.logIndex + 5, commitIndex: state.raft.commitIndex + 5 },
        timelineEvents: [
          { id: Date.now()+2, ts: Date.now(), type: 'success', title: 'Failover complete — Azure eastus is now primary', detail: 'All traffic rerouted via Azure Front Door. Workload fully operational.', rto: '24.7s', rpo: '1.8s' },
          ...state.timelineEvents,
        ],
      };

    case 'RESET_FAILOVER':
      return { ...initialState, screen: state.screen, isAuthenticated: true };

    case 'UPDATE_LAG': {
      const last = state.lagHistory[state.lagHistory.length - 1];
      const isAzurePrimary = state.clouds.azure.database.role === 'primary';
      const newPt: LagPoint = {
        t: last.t + 1,
        azure: isAzurePrimary ? 0 : Math.max(0.2, last.azure * 0.85 + 0.15 * (0.8 + Math.sin(last.t * 0.31) * 0.3) + (Math.random() - 0.5) * 0.15),
        gcp:   Math.max(0.3, last.gcp   * 0.85 + 0.15 * (1.2 + Math.sin(last.t * 0.26) * 0.4) + (Math.random() - 0.5) * 0.2),
      };
      const updatedAzureLag = isAzurePrimary ? null : newPt.azure;
      return {
        ...state,
        lagHistory: [...state.lagHistory.slice(1), newPt],
        clouds: { ...state.clouds,
          azure: { ...state.clouds.azure, database: { ...state.clouds.azure.database, lag: updatedAzureLag } },
          gcp:   { ...state.clouds.gcp,   database: { ...state.clouds.gcp.database,   lag: newPt.gcp } },
        },
      };
    }

    case 'TICK_RAFT':
      if (!state.raft.leader || state.raft.electionInProgress) return state;
      return { ...state, raft: { ...state.raft, logIndex: state.raft.logIndex + 1, commitIndex: state.raft.commitIndex + 1, appliedIndex: state.raft.appliedIndex + 1 } };

    default: return state;
  }
}

interface RaftContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  simulateFailover: () => void;
  resetFailover: () => void;
}

const RaftContext = createContext<RaftContextValue | null>(null);

export function RaftProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const lagTimer  = setInterval(() => dispatch({ type: 'UPDATE_LAG' }),  3000);
    const raftTimer = setInterval(() => dispatch({ type: 'TICK_RAFT' }),   1200);
    return () => { clearInterval(lagTimer); clearInterval(raftTimer); };
  }, []);

  const simulateFailover = () => {
    if (state.failoverPhase !== 'idle') return;
    dispatch({ type: 'FAILOVER_DETECTING' });
    setTimeout(() => dispatch({ type: 'FAILOVER_ELECTING'  }), 2000);
    setTimeout(() => dispatch({ type: 'FAILOVER_FENCING'   }), 4500);
    setTimeout(() => dispatch({ type: 'FAILOVER_REROUTING' }), 7000);
    setTimeout(() => dispatch({ type: 'FAILOVER_COMPLETE'  }), 10000);
  };

  const resetFailover = () => dispatch({ type: 'RESET_FAILOVER' });

  return (
    <RaftContext.Provider value={{ state, dispatch, simulateFailover, resetFailover }}>
      {children}
    </RaftContext.Provider>
  );
}

export function useRaft() {
  const ctx = useContext(RaftContext);
  if (!ctx) throw new Error('useRaft must be used within a RaftProvider');
  return ctx;
}
