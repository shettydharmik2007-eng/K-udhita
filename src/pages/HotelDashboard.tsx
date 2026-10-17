import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import {
  getFoodListings,
  getFoodRequests,
  updateRequestStatus,
  transferListingToWaste,
} from '../services/foodService';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import type {
  FoodListing,
  FoodRequest,
  FoodRequestStatus,
  WasteCategory,
} from '../types';
import {
  Building2,
  PlusCircle,
  Clock,
  MapPin,
  Scale,
  Users,
  Edit,
  Trash2,
  Recycle,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Calendar,
  Layers,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string, params?: any) => void;
  onEditListing: (id: string) => void;
}

export const HotelDashboard: React.FC<Props> = ({ onNavigate, onEditListing }) => {
  const { currentUser, userProfile } = useAuth();
  const { showNotification } = useNotification();

  const [listings, setListings] = useState<FoodListing[]>([]);
  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Waste transfer modal state
  const [wasteModalOpen, setWasteModalOpen] = useState(false);
  const [selectedListingForWaste, setSelectedListingForWaste] = useState<FoodListing | null>(null);
  const [wasteCategory, setWasteCategory] = useState<WasteCategory>('composting');
  const [destinationFacility, setDestinationFacility] = useState('Municipal Bio-Compost Facility');
  const [wasteNotes, setWasteNotes] = useState('');
  const [transferringWaste, setTransferringWaste] = useState(false);

  const loadData = async () => {
    if (!currentUser || !isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const [listingsData, requestsData] = await Promise.all([
        getFoodListings({ donorId: currentUser.uid }),
        getFoodRequests({ donorId: currentUser.uid }),
      ]);
      setListings(listingsData);
      setRequests(requestsData);
    } catch (err: any) {
      console.error('Failed to load hotel dashboard data:', err);
      showNotification('error', 'Data Load Error', err.message || 'Could not fetch listings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleUpdateReqStatus = async (
    requestId: string,
    listingId: string,
    newStatus: FoodRequestStatus,
    requestedKg: number
  ) => {
    if (!currentUser) return;
    try {
      await updateRequestStatus(requestId, newStatus, currentUser.uid);
      showNotification('success', 'Status Updated', `Request marked as ${newStatus}.`);
      loadData();
    } catch (err: any) {
      showNotification('error', 'Action Failed', err.message || 'Failed to update request status');
    }
  };

  const openWasteTransferModal = (item: FoodListing) => {
    setSelectedListingForWaste(item);
    setWasteNotes(`Unsold banquet surplus (${item.remainingQuantityKg} kg) transferred for organic circular loop.`);
    setWasteModalOpen(true);
  };

  const handleConfirmWasteTransfer = async () => {
    if (!selectedListingForWaste) return;
    setTransferringWaste(true);
    try {
      await transferListingToWaste(
        selectedListingForWaste.id,
        wasteCategory,
        destinationFacility,
        wasteNotes
      );
      showNotification(
        'success',
        'Transferred to Waste Management',
        `${selectedListingForWaste.remainingQuantityKg} kg routed to ${wasteCategory} processing.`
      );
      setWasteModalOpen(false);
      loadData();
    } catch (err: any) {
      showNotification('error', 'Transfer Failed', err.message || 'Could not route to waste');
    } finally {
      setTransferringWaste(false);
    }
  };

  // Metrics
  const totalListingsCount = listings.length;
  const activeListingsCount = listings.filter((l) => l.status === 'available').length;
  const totalKgListed = listings.reduce((acc, l) => acc + (Number(l.initialQuantityKg) || 0), 0);
  const remainingKg = listings.reduce((acc, l) => acc + (Number(l.remainingQuantityKg) || 0), 0);

  return (
    <div className="page-container">
      {/* Top Banner */}
      <div className="dashboard-header-flex">
        <div>
          <div className="page-header-badge">
            <Building2 size={16} className="text-emerald" />
            <span>Hospitality Portal</span>
          </div>
          <h1 className="page-title">{userProfile?.organizationName || 'Hotel & Banquet Hall Dashboard'}</h1>
          <p className="page-subtitle">
            Manage surplus banquet food donations, process incoming community requests, and route leftovers to organic waste partners.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh records"
          >
            <RefreshCw size={16} className={refreshing ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate('add-food')}
          >
            <PlusCircle size={18} />
            <span>Add Surplus Food</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-summary-grid">
        <div className="metric-card">
          <div className="metric-icon bg-emerald-light">
            <Layers size={22} className="text-emerald" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Listings Posted</span>
            <span className="metric-value">{totalListingsCount}</span>
            <small className="metric-sub">{activeListingsCount} currently active</small>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon bg-blue-light">
            <Scale size={22} className="text-blue" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Food Weight Listed</span>
            <span className="metric-value">{totalKgListed.toFixed(1)} <span className="unit">kg</span></span>
            <small className="metric-sub">{remainingKg.toFixed(1)} kg awaiting pickup</small>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon bg-amber-light">
            <Users size={22} className="text-amber" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Incoming Requests</span>
            <span className="metric-value">{requests.length}</span>
            <small className="metric-sub">
              {requests.filter((r) => r.status === 'pending').length} pending approval
            </small>
          </div>
        </div>
      </div>

      {/* Active Listings Section */}
      <div className="dashboard-section mt-8">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title">Your Food Listings</h2>
            <p className="section-desc">Live listings visible to community requesters and NGOs.</p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => onNavigate('add-food')}
          >
            <PlusCircle size={14} /> New Listing
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="spinner-large" />
            <p className="mt-4 text-muted">Retrieving your listings from Cloud Firestore...</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="empty-state-card">
            <Building2 size={48} className="text-muted" />
            <h3>No Surplus Food Listings Yet</h3>
            <p>
              When a wedding, corporate conference, or buffet concludes, list surplus edible portions
              using your phone camera or gallery upload.
            </p>
            <button
              type="button"
              className="btn btn-primary mt-4"
              onClick={() => onNavigate('add-food')}
            >
              <PlusCircle size={16} /> Post Your First Food Listing
            </button>
          </div>
        ) : (
          <div className="listings-grid">
            {listings.map((item) => (
              <div key={item.id} className="hotel-listing-card">
                <div className="listing-card-media">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.foodName} className="listing-thumb" />
                  ) : (
                    <div className="listing-thumb-placeholder">
                      <Building2 size={32} />
                      <span>{item.category.replace('_', ' ')}</span>
                    </div>
                  )}
                  <div className="media-overlay-tags">
                    <StatusBadge status={item.status} type="listing" />
                    <span className="dietary-badge">{item.dietaryType}</span>
                  </div>
                </div>

                <div className="listing-card-body">
                  <h3 className="listing-title">{item.foodName}</h3>
                  <div className="listing-meta-row">
                    <span className="meta-item">
                      <Scale size={14} />
                      <strong>{item.remainingQuantityKg} kg</strong> remaining (of {item.initialQuantityKg} kg)
                    </span>
                    <span className="meta-item">
                      <Users size={14} />
                      ~{item.portions} portions
                    </span>
                  </div>

                  <div className="listing-meta-row">
                    <span className="meta-item text-danger">
                      <Clock size={14} />
                      Deadline: {new Date(item.pickupDeadline).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="listing-location-text">
                    <MapPin size={13} />
                    <span>{item.location}</span>
                  </div>

                  {/* Remaining Progress Bar */}
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          (Number(item.remainingQuantityKg) / Number(item.initialQuantityKg)) * 100
                        )}%`,
                      }}
                    />
                  </div>

                  {/* Card Actions */}
                  <div className="listing-card-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => onEditListing(item.id)}
                    >
                      <Edit size={14} />
                      <span>Edit</span>
                    </button>

                    {item.status !== 'transferred_to_waste' && Number(item.remainingQuantityKg) > 0 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-waste"
                        onClick={() => openWasteTransferModal(item)}
                        title="Transfer unsold food to Composting / Biogas waste loop"
                      >
                        <Recycle size={14} />
                        <span>Send to Waste Loop</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incoming Requests Section */}
      <div className="dashboard-section mt-12">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title">Incoming Food Requests</h2>
            <p className="section-desc">Claims submitted by verified community shelters and NGOs.</p>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="empty-sub-card">
            <p>No food requests received for your listings yet.</p>
          </div>
        ) : (
          <div className="requests-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Food Item</th>
                  <th>Requester / NGO</th>
                  <th>Quantity Claimed</th>
                  <th>Pickup Estimate</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <strong>{req.foodName}</strong>
                    </td>
                    <td>
                      <div>
                        <strong>{req.requesterOrg}</strong>
                        <div className="text-muted text-sm">{req.requesterName} • {req.requesterPhone}</div>
                      </div>
                    </td>
                    <td>
                      <span className="badge-qty">{req.requestedQuantityKg} kg</span>
                      <small className="d-block text-muted">~{req.requestedPortions} portions</small>
                    </td>
                    <td>
                      <span className="text-sm">{req.pickupTimeEstimate || 'Flexible'}</span>
                    </td>
                    <td>
                      <StatusBadge status={req.status} type="request" />
                    </td>
                    <td>
                      {req.status === 'pending' && (
                        <div className="action-button-group">
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            onClick={() =>
                              handleUpdateReqStatus(req.id, req.listingId, 'accepted', req.requestedQuantityKg)
                            }
                          >
                            <CheckCircle size={14} /> Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() =>
                              handleUpdateReqStatus(req.id, req.listingId, 'rejected', req.requestedQuantityKg)
                            }
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      )}
                      {req.status === 'accepted' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() =>
                            handleUpdateReqStatus(req.id, req.listingId, 'completed', req.requestedQuantityKg)
                          }
                        >
                          Mark Picked Up
                        </button>
                      )}
                      {req.status === 'completed' && (
                        <span className="text-muted text-sm">Transfer Completed</span>
                      )}
                      {req.status === 'rejected' && (
                        <span className="text-muted text-sm">Request Rejected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transfer to Waste Modal */}
      <Modal
        isOpen={wasteModalOpen}
        onClose={() => setWasteModalOpen(false)}
        title="Transfer Leftover to Organic Waste Management"
      >
        {selectedListingForWaste && (
          <div className="waste-transfer-form">
            <div className="alert alert-info">
              <Recycle size={18} />
              <div>
                <strong>Circular Economy Transfer:</strong>
                <p>
                  Routing {selectedListingForWaste.remainingQuantityKg} kg of{' '}
                  <strong>{selectedListingForWaste.foodName}</strong> to certified organic waste
                  processing prevents landfill methane emissions (SDG 12 & 13).
                </p>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Processing Stream *</label>
              <select
                className="form-control"
                value={wasteCategory}
                onChange={(e) => setWasteCategory(e.target.value as WasteCategory)}
              >
                <option value="composting">Aerobic Composting (Soil Enrichment)</option>
                <option value="biogas">Anaerobic Digestion (Biogas Energy Generation)</option>
                <option value="other_disposal">Other Certified Organic Disposal</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Destination Facility / Partner Name *</label>
              <input
                type="text"
                className="form-control"
                value={destinationFacility}
                onChange={(e) => setDestinationFacility(e.target.value)}
                placeholder="e.g. City Compost Yard / GreenPower Biogas Plant"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notes & Container Info</label>
              <textarea
                className="form-control"
                rows={2}
                value={wasteNotes}
                onChange={(e) => setWasteNotes(e.target.value)}
              />
            </div>

            <div className="modal-actions-bar">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setWasteModalOpen(false)}
                disabled={transferringWaste}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-waste"
                onClick={handleConfirmWasteTransfer}
                disabled={transferringWaste}
              >
                {transferringWaste ? 'Routing...' : 'Confirm Waste Dispatch'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
