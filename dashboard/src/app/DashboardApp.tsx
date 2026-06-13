// DashboardApp.tsx — App shell + screen router
import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { RaftProvider, useRaft, type Screen } from './state';
import { useAuth } from './auth/AuthContext';
import TopNav from './TopNav';
import AuthScreen from './screens/AuthScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import TopologyScreen from './screens/TopologyScreen';
import RaftScreen from './screens/RaftScreen';
import ReplicationScreen from './screens/ReplicationScreen';
import BuildScreen from './screens/BuildScreen';
import TimelineScreen from './screens/TimelineScreen';

export default function DashboardApp() {
  return (
    <RaftProvider>
      <AppShell />
    </RaftProvider>
  );
}

const screenMap: Record<Screen, ReactNode> = {
  auth:        <AuthScreen />,
  onboarding:  <OnboardingScreen />,
  topology:    <TopologyScreen />,
  raft:        <RaftScreen />,
  replication: <ReplicationScreen />,
  build:       <BuildScreen />,
  timeline:    <TimelineScreen />,
};

function AppShell() {
  const { state, dispatch } = useRaft();
  const { isAuthenticated: authReady, isLoading } = useAuth();
  const { screen } = state;

  // Mirror the AuthContext's authentication status into the dashboard's
  // own state so every screen is gated, not just the initial render.
  useEffect(() => {
    if (isLoading) return;
    dispatch({ type: 'SET_AUTHENTICATED', authenticated: authReady });
  }, [authReady, isLoading, dispatch]);

  if (isLoading) return null;

  // Unauthenticated visitors (and anyone whose session expires) see the
  // auth screen regardless of which screen the app was last showing.
  const effectiveScreen: Screen = authReady ? screen : 'auth';

  return (
    <div style={appSt.shell}>
      <div className="screen-kanji" aria-hidden="true">流</div>
      <TopNav />
      <div style={appSt.content}>
        <ScreenTransition screenKey={effectiveScreen}>
          {screenMap[effectiveScreen] || screenMap.topology}
        </ScreenTransition>
      </div>
    </div>
  );
}

// ── Animated screen transition ──────────────────────────────────────────────

function ScreenTransition({ screenKey, children }: { screenKey: string; children: ReactNode }) {
  const [displayed, setDisplayed] = useState(children);
  const [phase, setPhase] = useState<'visible' | 'exiting' | 'entering'>('visible');
  const prevKey = useRef(screenKey);

  useEffect(() => {
    if (screenKey === prevKey.current) return;
    prevKey.current = screenKey;

    setPhase('exiting');
    const t1 = setTimeout(() => {
      setDisplayed(children);
      setPhase('entering');
    }, 180);
    const t2 = setTimeout(() => {
      setPhase('visible');
    }, 360);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);

  useEffect(() => { setDisplayed(children); }, [children]);

  const opacity = phase === 'exiting' ? 0 : 1;
  const translateY = phase === 'entering' ? 10 : 0;

  return (
    <div style={{
      opacity,
      transform: `translateY(${translateY}px)`,
      transition: 'opacity 0.18s ease, transform 0.18s ease',
      minHeight: '100vh',
    }}>
      {displayed}
    </div>
  );
}

const appSt: Record<string, CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: '#080706',
    color: '#F5F1EA',
    position: 'relative',
  },
  content: {
    // TopNav is 56px fixed
  },
};
