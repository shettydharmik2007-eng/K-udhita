import React, { useState } from 'react';
import { signInUser } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import { LogIn, Lock, Mail, Building2, Truck, AlertCircle, ArrowRight, HeartHandshake } from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const Login: React.FC<Props> = ({ onNavigate }) => {
  const { refreshProfile } = useAuth();
  const { showNotification } = useNotification();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isFirebaseConfigured) {
      setErrorMessage(
        'Firebase credentials are not configured in .env. Please configure Firebase to enable sign in.'
      );
      return;
    }

    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    const flowStartTime = performance.now();
    console.group(`[Kṣudhita Login Flow] Started at ${new Date().toLocaleTimeString()}`);
    console.log('[Login Flow] Target email:', email.trim());

    try {
      // Step 1 & 2: Firebase Authentication & Firestore Profile Fetch
      console.time('[Login Flow] 1. Authentication & Profile Retrieval');
      const profile = await signInUser(email.trim(), password);
      console.timeEnd('[Login Flow] 1. Authentication & Profile Retrieval');

      // Step 3: Context & Role Synchronization
      console.time('[Login Flow] 2. State & Role Synchronization');
      await refreshProfile(profile);
      console.timeEnd('[Login Flow] 2. State & Role Synchronization');

      // Step 4: Role-Based Dashboard Navigation
      console.time('[Login Flow] 3. Dashboard Navigation');
      showNotification('success', 'Signed In', `Welcome back to Kṣudhita, ${profile.name}!`);

      const targetRole = profile.role || 'requester';
      console.log(`[Login Flow] User authenticated with role "${targetRole}". Navigating to panel...`);

      if (targetRole === 'donor') {
        onNavigate('hotel-dashboard');
      } else if (targetRole === 'waste_partner') {
        onNavigate('partner-dashboard');
      } else {
        onNavigate('my-requests');
      }
      console.timeEnd('[Login Flow] 3. Dashboard Navigation');
      console.log(`[Login Flow] Total duration: ${(performance.now() - flowStartTime).toFixed(1)}ms`);
    } catch (err: any) {
      console.error('[Login Flow] Sign in process failed:', err);
      console.error('[Login Flow] Original Firebase Error Code:', err?.code);
      console.error('[Login Flow] Original Firebase Error Message:', err?.message);
      let msg = err?.message || 'Failed to sign in. Please check your credentials.';

      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        msg = 'Invalid email or password. Please verify and try again.';
      } else if (err?.code === 'auth/user-not-found') {
        msg = 'No registered account found with this email. Please register first.';
      } else if (err?.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (err?.code === 'auth/network-request-failed') {
        msg = 'Network connection failed. Please check your internet connection.';
      }

      setErrorMessage(msg);
      showNotification('error', 'Sign In Failed', msg);
    } finally {
      console.groupEnd();
      // Ensure loading state is unconditionally reset so button never stays stuck
      setLoading(false);
    }
  };

  return (
    <div className="page-container auth-page">
      <div className="auth-card animate-fade-in-up">
        <div className="auth-header">
          <div className="auth-icon-badge">
            <LogIn size={26} className="text-emerald" />
          </div>
          <h2>Sign In to Kṣudhita</h2>
          <p>Access your dedicated portal to manage food surplus, community requests, or organic waste.</p>
        </div>

        {/* 3 User Types Pills */}
        <div className="role-hints-banner">
          <div className="role-hint-pill">
            <Building2 size={13} />
            <span>Hotels & Banquet Halls</span>
          </div>
          <div className="role-hint-pill">
            <HeartHandshake size={13} />
            <span>Trusts & NGOs</span>
          </div>
          <div className="role-hint-pill">
            <Truck size={13} />
            <span>Waste Recyclers</span>
          </div>
        </div>

        {errorMessage && (
          <div className="alert alert-danger" role="alert">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email Address
            </label>
            <div className="input-with-icon">
              <Mail size={18} className="input-icon" />
              <input
                id="login-email"
                type="email"
                className="form-control"
                placeholder="e.g. manager@grandhotel.com or trust@help.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                id="login-password"
                type="password"
                className="form-control"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg btn-motion"
            disabled={loading}
          >
            {loading ? (
              <span className="spinner-inline">Signing in to Kṣudhita...</span>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Do not have an account yet?{' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => onNavigate('signup')}
            >
              Register here
            </button>
          </p>
          {!isFirebaseConfigured && (
            <p className="mt-2 text-muted">
              Need help connecting Firebase?{' '}
              <button
                type="button"
                className="btn-link text-warning"
                onClick={() => onNavigate('setup-guide')}
              >
                View Setup Guide
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
