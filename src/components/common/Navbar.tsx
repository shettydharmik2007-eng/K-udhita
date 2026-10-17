import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { isFirebaseConfigured } from '../../services/firebase';
import {
  Utensils,
  Leaf,
  BarChart3,
  Recycle,
  PlusCircle,
  HeartHandshake,
  Truck,
  Building2,
  LogIn,
  UserPlus,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const Navbar: React.FC<Props> = ({ currentPage, onNavigate }) => {
  const { currentUser, userProfile, logout, isDonor, isRequester, isWastePartner } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (page: string) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    handleNav('home');
  };

  return (
    <header className="navbar-header">
      <div className="navbar-container">
        {/* Brand Logo - Kṣudhita */}
        <button
          type="button"
          className="navbar-brand btn-motion"
          onClick={() => handleNav('home')}
        >
          <div className="brand-icon">
            <Leaf size={22} className="leaf-icon" />
            <Utensils size={14} className="utensils-icon" />
          </div>
          <div className="brand-text">
            <span className="brand-name">Kṣudhita</span>
            <span className="brand-tagline">Nourishing Lives • Zero Waste</span>
          </div>
        </button>

        {/* Desktop Navigation Links */}
        <nav className="navbar-nav desktop-only">
          <button
            type="button"
            className={`nav-link ${currentPage === 'home' ? 'active' : ''}`}
            onClick={() => handleNav('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={`nav-link ${currentPage === 'available-food' ? 'active' : ''}`}
            onClick={() => handleNav('available-food')}
          >
            <Utensils size={15} />
            Available Food
          </button>
          <button
            type="button"
            className={`nav-link ${currentPage === 'waste-management' ? 'active' : ''}`}
            onClick={() => handleNav('waste-management')}
          >
            <Recycle size={15} />
            Waste Loop
          </button>
          <button
            type="button"
            className={`nav-link ${currentPage === 'impact' ? 'active' : ''}`}
            onClick={() => handleNav('impact')}
          >
            <BarChart3 size={15} />
            Impact
          </button>

          {/* User Role Dedicated Panel Buttons */}
          {isDonor && (
            <>
              <button
                type="button"
                className={`nav-link panel-link donor-panel-btn ${currentPage === 'hotel-dashboard' ? 'active' : ''}`}
                onClick={() => handleNav('hotel-dashboard')}
              >
                <Building2 size={15} />
                Hotel Panel
              </button>
              <button
                type="button"
                className={`nav-link btn-nav-cta ${currentPage === 'add-food' ? 'active' : ''}`}
                onClick={() => handleNav('add-food')}
              >
                <PlusCircle size={15} />
                Add Food
              </button>
            </>
          )}

          {isRequester && (
            <button
              type="button"
              className={`nav-link panel-link trust-panel-btn ${currentPage === 'my-requests' || currentPage === 'ngo-dashboard' ? 'active' : ''}`}
              onClick={() => handleNav('my-requests')}
            >
              <HeartHandshake size={15} />
              Trust & NGO Panel
            </button>
          )}

          {isWastePartner && (
            <button
              type="button"
              className={`nav-link panel-link waste-panel-btn ${currentPage === 'partner-dashboard' || currentPage === 'recycler-dashboard' ? 'active' : ''}`}
              onClick={() => handleNav('partner-dashboard')}
            >
              <Truck size={15} />
              Recycler Panel
            </button>
          )}
        </nav>

        {/* Right side Actions */}
        <div className="navbar-actions desktop-only">
          {/* Firebase Connection Status Pill */}
          <button
            type="button"
            className={`firebase-status-pill ${isFirebaseConfigured ? 'connected' : 'unconfigured'}`}
            onClick={() => handleNav('setup-guide')}
            title={isFirebaseConfigured ? 'Live Firebase Connected' : 'Firebase unconfigured – click to view guide'}
          >
            {isFirebaseConfigured ? (
              <>
                <ShieldCheck size={14} />
                <span>Live DB</span>
              </>
            ) : (
              <>
                <AlertTriangle size={14} />
                <span>Setup Guide</span>
              </>
            )}
          </button>

          {currentUser ? (
            <div className="user-profile-menu">
              <div className="user-meta">
                <span className="user-name">{userProfile?.organizationName || userProfile?.name || 'User'}</span>
                <span className="user-role-badge">
                  {userProfile?.role === 'donor'
                    ? '🏨 Hotel Donor'
                    : userProfile?.role === 'waste_partner'
                    ? '♻️ Waste Recycler'
                    : '🤝 Trust / Requester'}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-icon btn-motion"
                onClick={handleLogout}
                title="Sign out"
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <button
                type="button"
                className="btn btn-outline btn-sm btn-motion"
                onClick={() => handleNav('login')}
              >
                <LogIn size={14} />
                Sign In
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm btn-motion"
                onClick={() => handleNav('signup')}
              >
                <UserPlus size={14} />
                Register
              </button>
            </div>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          className="mobile-menu-toggle mobile-only"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="mobile-menu-drawer animate-fade-in-down">
          <div className="mobile-menu-links">
            <button
              type="button"
              className={`mobile-link ${currentPage === 'home' ? 'active' : ''}`}
              onClick={() => handleNav('home')}
            >
              Home
            </button>
            <button
              type="button"
              className={`mobile-link ${currentPage === 'available-food' ? 'active' : ''}`}
              onClick={() => handleNav('available-food')}
            >
              <Utensils size={18} />
              Available Food
            </button>
            <button
              type="button"
              className={`mobile-link ${currentPage === 'waste-management' ? 'active' : ''}`}
              onClick={() => handleNav('waste-management')}
            >
              <Recycle size={18} />
              Organic Waste Loop
            </button>
            <button
              type="button"
              className={`mobile-link ${currentPage === 'impact' ? 'active' : ''}`}
              onClick={() => handleNav('impact')}
            >
              <BarChart3 size={18} />
              Impact Dashboard
            </button>

            {isDonor && (
              <>
                <button
                  type="button"
                  className={`mobile-link ${currentPage === 'hotel-dashboard' ? 'active' : ''}`}
                  onClick={() => handleNav('hotel-dashboard')}
                >
                  <Building2 size={18} />
                  Hotel & Banquet Dashboard
                </button>
                <button
                  type="button"
                  className={`mobile-link ${currentPage === 'add-food' ? 'active' : ''}`}
                  onClick={() => handleNav('add-food')}
                >
                  <PlusCircle size={18} />
                  Add Surplus Food Listing
                </button>
              </>
            )}

            {isRequester && (
              <button
                type="button"
                className={`mobile-link ${currentPage === 'my-requests' || currentPage === 'ngo-dashboard' ? 'active' : ''}`}
                onClick={() => handleNav('my-requests')}
              >
                <HeartHandshake size={18} />
                Trust & NGO Panel
              </button>
            )}

            {isWastePartner && (
              <button
                type="button"
                className={`mobile-link ${currentPage === 'partner-dashboard' || currentPage === 'recycler-dashboard' ? 'active' : ''}`}
                onClick={() => handleNav('partner-dashboard')}
              >
                <Truck size={18} />
                Waste Recycler Panel
              </button>
            )}

            <button
              type="button"
              className={`mobile-link ${currentPage === 'setup-guide' ? 'active' : ''}`}
              onClick={() => handleNav('setup-guide')}
            >
              <AlertTriangle size={18} />
              Firebase Setup Instructions
            </button>
          </div>

          <div className="mobile-menu-footer">
            {currentUser ? (
              <div className="mobile-user-section">
                <div className="mobile-user-info">
                  <strong>{userProfile?.organizationName || userProfile?.name}</strong>
                  <small>{userProfile?.email}</small>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-block"
                  onClick={handleLogout}
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="mobile-auth-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-block"
                  onClick={() => handleNav('login')}
                >
                  <LogIn size={16} />
                  Sign In
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => handleNav('signup')}
                >
                  <UserPlus size={16} />
                  Register Account
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
