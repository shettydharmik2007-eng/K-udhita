import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import { getFoodRequests, updateRequestStatus } from '../services/foodService';
import { StatusBadge } from '../components/common/StatusBadge';
import type { FoodRequest } from '../types';
import {
  ClipboardList,
  Building2,
  Clock,
  Scale,
  Users,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Phone,
  HeartHandshake,
  MapPin,
  Utensils,
  Layers,
  Sparkles,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const MyRequests: React.FC<Props> = ({ onNavigate }) => {
  const { currentUser, userProfile, isRequester } = useAuth();
  const { showNotification } = useNotification();

  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'accepted' | 'completed'>('all');

  const loadRequests = async () => {
    if (!currentUser || !isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const data = await getFoodRequests({ requesterId: currentUser.uid });
      setRequests(data);
    } catch (err: any) {
      console.error('Error fetching requests:', err);
      showNotification('error', 'Error', err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [currentUser]);

  const handleCancelRequest = async (req: FoodRequest) => {
    if (!currentUser) return;
    if (!window.confirm('Are you sure you want to cancel this food request? The reserved quantity will be returned to the hotel listing.')) {
      return;
    }

    try {
      await updateRequestStatus(req.id, 'cancelled', currentUser.uid);
      showNotification('info', 'Request Cancelled', 'Quantity has been safely restored.');
      loadRequests();
    } catch (err: any) {
      showNotification('error', 'Cancellation Failed', err.message || 'Could not cancel request');
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (activeTab === 'all') return true;
    return r.status === activeTab;
  });

  // Calculate NGO metrics
  const totalKgClaimed = requests
    .filter((r) => r.status === 'completed' || r.status === 'accepted')
    .reduce((sum, r) => sum + (Number(r.requestedQuantityKg) || 0), 0);

  const totalPortionsServed = requests
    .filter((r) => r.status === 'completed' || r.status === 'accepted')
    .reduce((sum, r) => sum + (Number(r.requestedPortions) || 0), 0);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'accepted').length;

  return (
    <div className="page-container">
      {/* Top Banner */}
      <div className="dashboard-header-flex animate-fade-in-up">
        <div>
          <div className="page-header-badge">
            <HeartHandshake size={16} className="text-emerald" />
            <span>Community Relief Portal</span>
          </div>
          <h1 className="page-title">{userProfile?.organizationName || 'Trust & NGO Food Dashboard'}</h1>
          <p className="page-subtitle">
            Manage your food assistance claims, coordinate hotel pickups, and track meals delivered to your community shelters.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn btn-outline btn-motion"
            onClick={() => {
              setRefreshing(true);
              loadRequests();
            }}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-motion"
            onClick={() => onNavigate('available-food')}
          >
            <Utensils size={16} />
            <span>Claim More Food</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Grid */}
      <div className="metrics-summary-grid mt-4 animate-fade-in-up">
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-emerald-light">
            <Scale size={24} className="text-emerald" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Food Claimed & Received</span>
            <span className="metric-value">{totalKgClaimed.toFixed(1)} <span className="unit">kg</span></span>
            <small className="metric-sub">Diverted from waste to community</small>
          </div>
        </div>

        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-blue-light">
            <Users size={24} className="text-blue" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Meals Provided</span>
            <span className="metric-value">~{totalPortionsServed}</span>
            <small className="metric-sub">Beneficiaries nourished (SDG 2)</small>
          </div>
        </div>

        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-amber-light">
            <Clock size={24} className="text-amber" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Active Claims</span>
            <span className="metric-value">{pendingCount + approvedCount}</span>
            <small className="metric-sub">
              {approvedCount} ready for pickup, {pendingCount} awaiting approval
            </small>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="partner-tabs-row mt-8">
        <button
          type="button"
          className={`partner-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <span>All Claims</span>
          <span className="tab-count-badge">{requests.length}</span>
        </button>

        <button
          type="button"
          className={`partner-tab-btn ${activeTab === 'accepted' ? 'active' : ''}`}
          onClick={() => setActiveTab('accepted')}
        >
          <span>Approved / Ready for Pickup</span>
          <span className="tab-count-badge">{approvedCount}</span>
        </button>

        <button
          type="button"
          className={`partner-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <span>Pending Hotel Review</span>
          <span className="tab-count-badge">{pendingCount}</span>
        </button>

        <button
          type="button"
          className={`partner-tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          <span>Distributed & Completed</span>
          <span className="tab-count-badge">{requests.filter((r) => r.status === 'completed').length}</span>
        </button>
      </div>

      {/* Content Section */}
      {loading ? (
        <div className="text-center py-16">
          <div className="spinner-large" />
          <p className="mt-4 text-muted">Retrieving your trust claims from Cloud Firestore...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="empty-state-card animate-fade-in-up mt-6">
          <ClipboardList size={52} className="text-muted" />
          <h3>No Claims in this Category</h3>
          <p>
            {requests.length === 0
              ? 'Your trust has not requested any surplus food yet. Explore the surplus marketplace to reserve fresh banquet meals.'
              : 'There are no claims matching the selected status filter.'}
          </p>
          <button
            type="button"
            className="btn btn-primary mt-4 btn-motion"
            onClick={() => onNavigate('available-food')}
          >
            <Utensils size={16} /> Browse Available Surplus Food
          </button>
        </div>
      ) : (
        <div className="requests-cards-list mt-6">
          {filteredRequests.map((req) => (
            <div key={req.id} className="request-card animate-hover-lift">
              <div className="request-card-header">
                <div>
                  <div className="request-donor-org">
                    <Building2 size={16} className="text-emerald" />
                    <strong>{req.donorOrg}</strong>
                  </div>
                  <h3 className="request-food-title">{req.foodName}</h3>
                </div>
                <StatusBadge status={req.status} type="request" />
              </div>

              <div className="request-card-body">
                <div className="request-details-grid">
                  <div className="req-detail-item">
                    <Scale size={16} className="text-muted" />
                    <span>
                      Claimed: <strong>{req.requestedQuantityKg} kg</strong>
                    </span>
                  </div>

                  <div className="req-detail-item">
                    <Users size={16} className="text-muted" />
                    <span>
                      Servings: <strong>~{req.requestedPortions}</strong>
                    </span>
                  </div>

                  <div className="req-detail-item">
                    <Clock size={16} className="text-muted" />
                    <span>
                      Pickup Time: <strong>{req.pickupTimeEstimate}</strong>
                    </span>
                  </div>
                </div>

                {req.notes && (
                  <div className="request-notes-box mt-3">
                    <strong>Pickup Remarks:</strong> {req.notes}
                  </div>
                )}
              </div>

              <div className="request-card-footer">
                <span className="request-date">
                  Requested on:{' '}
                  {req.createdAt?.toDate
                    ? req.createdAt.toDate().toLocaleDateString()
                    : 'Recently'}
                </span>

                <div className="request-actions">
                  {req.status === 'pending' && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleCancelRequest(req)}
                    >
                      Cancel Claim
                    </button>
                  )}
                  {req.status === 'accepted' && (
                    <div className="badge-highlight-success">
                      ✓ Approved by Hotel! Please proceed to pickup location.
                    </div>
                  )}
                  {req.status === 'completed' && (
                    <span className="text-muted text-sm">Successfully Collected & Distributed</span>
                  )}
                  {req.status === 'rejected' && (
                    <span className="text-danger text-sm">Hotel was unable to fulfill this claim</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
