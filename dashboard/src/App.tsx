import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DashboardApp from './app/DashboardApp';
import OAuthCallbackScreen from './app/screens/OAuthCallbackScreen';
import { AuthProvider } from './app/auth/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<DashboardApp />} />
        <Route path="/auth/callback" element={<OAuthCallbackScreen />} />
      </Routes>
    </AuthProvider>
  );
}
