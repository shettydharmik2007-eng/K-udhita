import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import {
  getWasteCollections,
  claimWasteCollection,
  updateWasteStatus,
} from '../services/wasteService';
import { StatusBadge } from '../components/common/StatusBadge';
import type { WasteCollection, WasteCollectionStatus } from '../types';
import {
  Truck,
  Recycle,
  CheckCircle,
  Clock,
  MapPin,
  Building2,
  Scale,
  RefreshCw,
  AlertCircle,
  Leaf,
  Flame,
  ArrowRight,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const PartnerDashboard: React.FC<Props> = ({ onNavigate }) => {
  const { currentUser, userProfile, isWastePartner } = useAuth();
  const { showNotification } = useNotification();

  const [allWaste, setAllWaste] = useState<WasteCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'available' | 'my_assignments'>('available');

  const loadData = async () => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const data = await getWasteCollections();
      setAllWaste(data);
    } catch (err: any) {
      console.error('Failed to load partner waste dispatches:', err);
      showNotification('error', 'Error', err.message || 'Could not load waste tasks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleClaim = async (item: WasteCollection) => {
    if (!currentUser || !userProfile) {
      showNotification('warning', 'Sign In Required', 'Please sign in to accept waste dispatches.');
      onNavigate('login');
      return;
    }

    try {
      await claimWasteCollection(item.id, userProfile);
      showNotification(
        'success',
        'Dispatch Claimed!',
        `You are now assigned to collect ${item.quantityKg} kg from ${item.donorOrg}.`
      );
      loadData();
    } catch (err: any) {
      showNotification('error', 'Claim Failed', err.message || 'Could not claim dispatch');
    }
  };

  const handleAdvanceStatus = async (
    item: WasteCollection,
    newStatus: WasteCollectionStatus
  ) => {
    try {
      await updateWasteStatus(item.id, newStatus);
      showNotification('success', 'Status Updated', `Task status advanced to ${newStatus}.`);
      loadData();
    } catch (err: any) {
      showNotification('error', 'Update Failed', err.message || 'Could not advance status');
    }
  };

  // Split into available unassigned vs assigned to this partner
  const unassignedTasks = allWaste.filter((w) => w.status === 'pending');
  const myAssignedTasks = allWaste.filter(
    (w) => w.partnerId === currentUser?.uid || (w.status !== 'pending' && !w.partnerId)
  );

  return (
    <div className="page-container">
      {/* Top Banner */}
      <div className="dashboard-header-flex">
        <div>
          <div className="page-header-badge">
            <Truck size={16} className="text-emerald" />
            <span>Authorized Waste Logistics</span>
          </div>
          <h1 className="page-title">{userProfile?.organizationName || 'Waste Collection Partner Portal'}</h1>
          <p className="page-subtitle">
            Accept organic surplus dispatches, update physical collection timestamps, and confirm delivery
            to composting facilities and anaerobic biogas units.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="partner-tabs-row">
        <button
          type="button"
          className={`partner-tab-btn ${activeTab === 'available' ? 'active' : ''}`}
          onClick={() => setActiveTab('available')}
        >
          <span>Available Unassigned Pickups</span>
          <span className="tab-count-badge">{unassignedTasks.length}</span>
        </button>

        <button
          type="button"
          className={`partner-tab-btn ${activeTab === 'my_assignments' ? 'active' : ''}`}
          onClick={() => setActiveTab('my_assignments')}
        >
          <span>My Claimed Collections</span>
          <span className="tab-count-badge">{myAssignedTasks.length}</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="spinner-large" />
          <p className="mt-4 text-muted">Retrieving waste collection logs from Firestore...</p>
        </div>
      ) : activeTab === 'available' ? (
        /* Unassigned Pickups */
        <div className="partner-section mt-6">
          {unassignedTasks.length === 0 ? (
            <div className="empty-sub-card">
              <Truck size={48} className="text-muted" />
              <h4>No Pending Waste Dispatches</h4>
              <p>There are no unassigned organic waste dispatches currently awaiting collection.</p>
            </div>
          ) : (
            <div className="partner-tasks-grid">
              {unassignedTasks.map((item) => (
                <div key={item.id} className="partner-task-card">
                  <div className="task-card-header">
                    <div>
                      <span className={`waste-stream-pill ${item.category}`}>
                        {item.category === 'composting' ? '🌱 Composting' : '🔥 Biogas'}
                      </span>
                      <h3 className="task-title mt-1">{item.foodName}</h3>
                    </div>
                    <span className="badge-qty-large">{item.quantityKg} kg</span>
                  </div>

                  <div className="task-details-list">
                    <div className="task-detail-row">
                      <Building2 size={15} className="text-muted" />
                      <span>
                        Origin: <strong>{item.donorOrg}</strong>
                      </span>
                    </div>

                    <div className="task-detail-row">
                      <MapPin size={15} className="text-muted" />
                      <span>{item.location}</span>
                    </div>

                    <div className="task-detail-row">
                      <Truck size={15} className="text-muted" />
                      <span>
                        Destination: <strong>{item.destinationFacility}</strong>
                      </span>
                    </div>

                    {item.notes && (
                      <div className="task-notes-box">
                        <small>Notes: {item.notes}</small>
                      </div>
                    )}
                  </div>

                  <div className="task-card-footer">
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      onClick={() => handleClaim(item)}
                    >
                      <CheckCircle size={16} />
                      <span>Accept Collection Request</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* My Claimed Collections */
        <div className="partner-section mt-6">
          {myAssignedTasks.length === 0 ? (
            <div className="empty-sub-card">
              <CheckCircle size={48} className="text-muted" />
              <h4>No Claimed Collections</h4>
              <p>Browse available pickups to accept and schedule organic waste transfers.</p>
            </div>
          ) : (
            <div className="partner-tasks-grid">
              {myAssignedTasks.map((item) => (
                <div key={item.id} className="partner-task-card active-assignment">
                  <div className="task-card-header">
                    <div>
                      <StatusBadge status={item.status} type="waste" />
                      <h3 className="task-title mt-2">{item.foodName}</h3>
                    </div>
                    <span className="badge-qty-large">{item.quantityKg} kg</span>
                  </div>

                  <div className="task-details-list">
                    <div className="task-detail-row">
                      <Building2 size={15} className="text-muted" />
                      <span>Origin: <strong>{item.donorOrg}</strong> ({item.donorPhone || 'No phone'})</span>
                    </div>

                    <div className="task-detail-row">
                      <MapPin size={15} className="text-muted" />
                      <span>{item.location}</span>
                    </div>

                    <div className="task-detail-row">
                      <Truck size={15} className="text-muted" />
                      <span>Destination: <strong>{item.destinationFacility}</strong></span>
                    </div>
                  </div>

                  {/* Status Progression Controls */}
                  <div className="status-timeline-controls">
                    <div className="timeline-step-indicator">
                      <span className={`step-dot ${item.status === 'accepted' ? 'active' : 'done'}`}>1</span>
                      <span className="step-label">Accepted</span>
                      <span className="step-divider" />
                      <span className={`step-dot ${item.status === 'collected' ? 'active' : item.status === 'completed' ? 'done' : ''}`}>2</span>
                      <span className="step-label">Collected</span>
                      <span className="step-divider" />
                      <span className={`step-dot ${item.status === 'completed' ? 'active done' : ''}`}>3</span>
                      <span className="step-label">Completed</span>
                    </div>

                    <div className="timeline-action-buttons mt-4">
                      {item.status === 'accepted' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-block"
                          onClick={() => handleAdvanceStatus(item, 'collected')}
                        >
                          <Truck size={16} />
                          <span>Mark as Collected from Hotel</span>
                        </button>
                      )}

                      {item.status === 'collected' && (
                        <button
                          type="button"
                          className="btn btn-success btn-block"
                          onClick={() => handleAdvanceStatus(item, 'completed')}
                        >
                          <CheckCircle size={16} />
                          <span>Confirm Delivery to {item.category === 'composting' ? 'Compost Yard' : 'Biogas Plant'}</span>
                        </button>
                      )}

                      {item.status === 'completed' && (
                        <div className="completed-transfer-banner">
                          <CheckCircle size={16} className="text-emerald" />
                          <span>Transfer Verified & Completed</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
