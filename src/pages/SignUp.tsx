import React, { useState } from 'react';
import { signUpUser } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import type { UserRole } from '../types';
import {
  UserPlus,
  Building2,
  HeartHandshake,
  Truck,
  Mail,
  Lock,
  User,
  Phone,
  MapPin,
  AlertCircle,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const SignUp: React.FC<Props> = ({ onNavigate }) => {
  const { refreshProfile } = useAuth();
  const { showNotification } = useNotification();

  const [role, setRole] = useState<UserRole>('donor');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isFirebaseConfigured) {
      setErrorMessage(
        'Firebase is not configured in .env. Please configure Firebase to enable real account creation.'
      );
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);
    try {
      const profile = await signUpUser({
        email: email.trim(),
        password,
        name: name.trim(),
        role,
        organizationName: (organizationName || name).trim(),
        phone: phone.trim(),
        address: address.trim(),
      });

      // Synchronize authenticated user profile immediately across context
      await refreshProfile(profile);
      showNotification('success', 'Registration Successful', `Welcome to Kṣudhita, ${profile.name}!`);

      // Immediately navigate to their dedicated panel based on selected role
      const targetRole = profile.role || role;
      if (targetRole === 'donor') {
        onNavigate('hotel-dashboard');
      } else if (targetRole === 'waste_partner') {
        onNavigate('partner-dashboard');
      } else {
        onNavigate('my-requests');
      }
    } catch (err: any) {
      console.error('[Registration Flow] Registration failed:', err);
      console.error('[Registration Flow] Original Firebase Error Code:', err?.code);
      console.error('[Registration Flow] Original Firebase Error Message:', err?.message);
      let msg = err?.message || 'Registration failed. Please try again.';
      if (err?.code === 'permission-denied') {
        msg = 'Firestore permission denied: Your account is authenticated, but Cloud Firestore denied writing your profile. Please ensure the updated Firestore Security Rules are published in Firebase Console.';
      } else if (err?.code === 'auth/email-already-in-use') {
        msg = 'An account with this email address already exists. If this is your account, please sign in with your password.';
      } else if (err?.code === 'auth/weak-password') {
        msg = 'The password is too weak. Please use at least 6 characters.';
      } else if (err?.code === 'auth/invalid-email') {
        msg = 'The email address is invalid. Please verify and try again.';
      } else if (err?.code === 'auth/network-request-failed') {
        msg = 'Network connection error. Please verify your internet connection.';
      }
      setErrorMessage(msg);
      showNotification('error', 'Registration Error', msg);
    } finally {
      // Ensure loading state is always reset so UI never freezes
      setLoading(false);
    }
  };

  return (
    <div className="page-container auth-page">
      <div className="auth-card signup-card animate-fade-in-up">
        <div className="auth-header">
          <div className="auth-icon-badge">
            <UserPlus size={26} className="text-emerald" />
          </div>
          <h2>Join Kṣudhita</h2>
          <p>Please select your organization type to access your dedicated portal.</p>
        </div>

        {errorMessage && (
          <div className="alert alert-danger" role="alert">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {/* 3 User Types Selection Box */}
          <div className="form-group">
            <label className="form-label font-bold text-slate-800">
              1. Choose Your User Type (Select One) *
            </label>
            <div className="role-selection-grid">
              {/* Type 1: Hotel / Banquet Hall */}
              <button
                type="button"
                className={`role-select-box animate-hover-lift ${role === 'donor' ? 'selected' : ''}`}
                onClick={() => setRole('donor')}
              >
                <div className="role-icon">
                  <Building2 size={24} />
                </div>
                <div className="role-details">
                  <strong>Hotel / Banquet Hall / Caterer (Food Donor)</strong>
                  <span>Post surplus banquet food with camera upload, update quantities & route leftovers to waste partners</span>
                </div>
                {role === 'donor' && <CheckCircle size={20} className="role-check text-emerald" />}
              </button>

              {/* Type 2: NGO / Trust / Shelter */}
              <button
                type="button"
                className={`role-select-box animate-hover-lift ${role === 'requester' ? 'selected' : ''}`}
                onClick={() => setRole('requester')}
              >
                <div className="role-icon">
                  <HeartHandshake size={24} />
                </div>
                <div className="role-details">
                  <strong>Charitable Trust / NGO / Shelter (Food Requester)</strong>
                  <span>Claim safe, nutritious commercial meals for shelters, track approval & coordinate pickups</span>
                </div>
                {role === 'requester' && <CheckCircle size={20} className="role-check text-emerald" />}
              </button>

              {/* Type 3: Waste Collection Partner */}
              <button
                type="button"
                className={`role-select-box animate-hover-lift ${role === 'waste_partner' ? 'selected' : ''}`}
                onClick={() => setRole('waste_partner')}
              >
                <div className="role-icon">
                  <Truck size={24} />
                </div>
                <div className="role-details">
                  <strong>Organic Waste Recycler / Collector (Composting & Biogas)</strong>
                  <span>Accept unconsumed organic food dispatches, verify transport & deliver to compost/biogas plants</span>
                </div>
                {role === 'waste_partner' && <CheckCircle size={20} className="role-check text-emerald" />}
              </button>
            </div>
          </div>

          <div className="form-group mt-2">
            <label className="form-label font-bold text-slate-800">
              2. Organization & Contact Information
            </label>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="su-name">
                Authorized Contact Person *
              </label>
              <div className="input-with-icon">
                <User size={18} className="input-icon" />
                <input
                  id="su-name"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Rajesh Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="su-org">
                {role === 'donor'
                  ? 'Hotel / Banquet Hall Name *'
                  : role === 'waste_partner'
                  ? 'Recycling / Biogas Entity Name *'
                  : 'Trust / NGO Registered Name *'}
              </label>
              <div className="input-with-icon">
                <Building2 size={18} className="input-icon" />
                <input
                  id="su-org"
                  type="text"
                  className="form-control"
                  placeholder={
                    role === 'donor'
                      ? 'e.g. The Heritage Grand Palace'
                      : role === 'waste_partner'
                      ? 'e.g. CleanBio Compost & Gas Facilities'
                      : 'e.g. Annapurna Hunger Relief Trust'
                  }
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="su-email">
                Official Email Address *
              </label>
              <div className="input-with-icon">
                <Mail size={18} className="input-icon" />
                <input
                  id="su-email"
                  type="email"
                  className="form-control"
                  placeholder="contact@organization.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="su-phone">
                Contact Phone / Mobile Number *
              </label>
              <div className="input-with-icon">
                <Phone size={18} className="input-icon" />
                <input
                  id="su-phone"
                  type="tel"
                  className="form-control"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="su-address">
              Premises Address & Operating Landmark *
            </label>
            <div className="input-with-icon">
              <MapPin size={18} className="input-icon" />
              <input
                id="su-address"
                type="text"
                className="form-control"
                placeholder="Street address, City, Landmark (e.g. Gate 2, Hotel Lane)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="su-password">
                Create Password *
              </label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  id="su-password"
                  type="password"
                  className="form-control"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="su-confirm-password">
                Confirm Password *
              </label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  id="su-confirm-password"
                  type="password"
                  className="form-control"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg btn-motion mt-4"
            disabled={loading}
          >
            {loading ? (
              <span className="spinner-inline">Setting Up Your Kṣudhita Portal...</span>
            ) : (
              <>
                <span>Complete Registration & Open Dashboard</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have a registered account?{' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => onNavigate('login')}
            >
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
