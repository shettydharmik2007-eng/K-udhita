import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import {
  createWasteCollection,
  getWasteCollections,
} from '../services/wasteService';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import type { WasteCollection, WasteCategory } from '../types';
import {
  Recycle,
  Leaf,
  Flame,
  Truck,
  PlusCircle,
  AlertCircle,
  Scale,
  Info,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const WasteManagement: React.FC<Props> = ({ onNavigate }) => {
  const { currentUser, userProfile, isWastePartner, isAdmin } = useAuth();
  const { showNotification } = useNotification();

  const [wasteList, setWasteList] = useState<WasteCollection[]>([]);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Log new waste modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [foodName, setFoodName] = useState('');
  const [category, setCategory] = useState<WasteCategory>('composting');
  const [quantityKg, setQuantityKg] = useState<number | ''>('');
  const [location, setLocation] = useState(userProfile?.address || '');
  const [destinationFacility, setDestinationFacility] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadWaste = React.useCallback(async () => {
    if (!isFirebaseConfigured || !currentUser) {
      setLoading(false);
      return;
    }
    try {
      let data: WasteCollection[] = [];
      if (isAdmin) {
        // Administrators have full permission to audit the complete registry
        data = await getWasteCollections();
      } else if (isWastePartner) {
        // Recycling partners view dispatches assigned to their facility
        data = await getWasteCollections({ partnerId: currentUser.uid });
      } else {
        // Donors and hospitality partners view their own logged waste batches
        data = await getWasteCollections({ donorId: currentUser.uid });
      }
      setWasteList(data);
    } catch (err: any) {
      console.error('Failed to load waste collections:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser, isAdmin, isWastePartner]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    loadWaste();
  }, [loadWaste]);

  const handleCreateWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) {
      showNotification('warning', 'Sign In Required', 'Please sign in to log organic waste.');
      onNavigate('login');
      return;
    }

    if (!quantityKg || Number(quantityKg) <= 0) {
      setErrorMsg('Please specify a valid weight in kg (> 0).');
      return;
    }

    if (!destinationFacility.trim()) {
      setErrorMsg('Please designate an intended composting yard or biogas plant.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await createWasteCollection({
        donorId: currentUser.uid,
        donorOrg: userProfile.organizationName || userProfile.name,
        donorPhone: userProfile.phone || '',
        foodName,
        category,
        quantityKg: Number(quantityKg),
        location,
        destinationFacility,
        notes,
      });

      showNotification('success', 'Waste Dispatch Recorded', `${foodName} (${quantityKg} kg) queued for partner pickup.`);
      setModalOpen(false);
      // Reset form
      setFoodName('');
      setQuantityKg('');
      setDestinationFacility('');
      setNotes('');
      loadWaste();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record waste');
      showNotification('error', 'Error', err.message || 'Could not record waste');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = wasteList.filter((item) => {
    const matchesCat = filterCategory === 'all' || item.category === filterCategory;
    const matchesStat = filterStatus === 'all' || item.status === filterStatus;
    return matchesCat && matchesStat;
  });

  // Calculate waste stats
  const compostingTotalKg = wasteList
    .filter((w) => w.category === 'composting')
    .reduce((sum, w) => sum + (Number(w.quantityKg) || 0), 0);

  const biogasTotalKg = wasteList
    .filter((w) => w.category === 'biogas')
    .reduce((sum, w) => sum + (Number(w.quantityKg) || 0), 0);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="dashboard-header-flex">
        <div>
          <div className="page-header-badge">
            <Recycle size={16} className="text-emerald" />
            <span>Circular Economy Stream</span>
          </div>
          <h1 className="page-title">Leftover Organic Waste Management</h1>
          <p className="page-subtitle">
            Tracking post-sharing leftovers and commercial kitchen trimmings routed to certified
            composting yards and anaerobic biogas processing facilities (SDG 12 & SDG 13).
          </p>
        </div>

        <div className="dashboard-header-actions">
          {isWastePartner && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onNavigate('partner-dashboard')}
            >
              <Truck size={16} /> Partner Portal
            </button>
          )}

          <button
            type="button"
            className="btn btn-waste"
            onClick={() => setModalOpen(true)}
          >
            <PlusCircle size={18} />
            <span>Log Leftover Waste</span>
          </button>
        </div>
      </div>

      {/* Academic Integrity Disclaimer Banner */}
      <div className="academic-disclaimer-banner">
        <Info size={20} className="text-blue" />
        <div className="disclaimer-text">
          <strong>Academic & Telemetry Disclaimer:</strong>
          <span>
            {' '}This system rigorously tracks and verifies organic waste collection transfers, chain-of-custody,
            assigned partners, and transport statuses (Pending → Accepted → Collected → Completed).
            In accordance with scientific integrity standards, <strong>this portal does not claim that finished compost or biogas has already been produced</strong>;
            it records the physical material diversion and transfer logistics to authorized facilities.
          </span>
        </div>
      </div>

      {/* Stream Summary Cards */}
      <div className="waste-streams-grid mt-6">
        <div className="waste-stream-card stream-compost">
          <div className="stream-header">
            <div className="stream-icon">
              <Leaf size={24} />
            </div>
            <div>
              <h3>Composting Route</h3>
              <p>Aerobic soil enrichment & nutrient recovery</p>
            </div>
          </div>
          <div className="stream-stats">
            <span className="stream-value">{compostingTotalKg.toFixed(1)} <small>kg</small></span>
            <span className="stream-sub">Total material dispatched</span>
          </div>
          <div className="stream-footer">
            <span>Ideal for vegetable trimmings, grain remainders, fruit waste, coffee grounds.</span>
          </div>
        </div>

        <div className="waste-stream-card stream-biogas">
          <div className="stream-header">
            <div className="stream-icon">
              <Flame size={24} />
            </div>
            <div>
              <h3>Biogas Route</h3>
              <p>Anaerobic digestion for bio-methane clean fuel</p>
            </div>
          </div>
          <div className="stream-stats">
            <span className="stream-value">{biogasTotalKg.toFixed(1)} <small>kg</small></span>
            <span className="stream-sub">Total material dispatched</span>
          </div>
          <div className="stream-footer">
            <span>Ideal for cooked buffet leftovers, dairy, oils, sauces, starches, high-energy scraps.</span>
          </div>
        </div>
      </div>

      {/* Dispatches Filter */}
      <div className="dispatches-section mt-10">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title">Organic Waste Transfer Registry</h2>
            <p className="section-desc">Live Firestore records of logged waste dispatches and partner statuses.</p>
          </div>

          <div className="filter-select-group">
            <select
              className="form-control form-control-sm"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Disposal Routes</option>
              <option value="composting">Composting Only</option>
              <option value="biogas">Biogas Processing Only</option>
              <option value="other_disposal">Other Disposal</option>
            </select>

            <select
              className="form-control form-control-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Pickup</option>
              <option value="accepted">Partner Accepted</option>
              <option value="collected">Collected / In Transit</option>
              <option value="completed">Completed Delivery</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="spinner-large" />
            <p className="mt-4 text-muted">Retrieving waste transfer records from Firestore...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-sub-card">
            <Recycle size={42} className="text-muted" />
            <h4>No Waste Dispatches Found</h4>
            <p>
              When banquet food passes its pickup deadline or kitchens have unconsumed scraps,
              log the material here to alert local waste collection partners.
            </p>
          </div>
        ) : (
          <div className="requests-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organic Waste</th>
                  <th>Source Hotel / Hall</th>
                  <th>Quantity (kg)</th>
                  <th>Route / Category</th>
                  <th>Destination Facility</th>
                  <th>Assigned Partner</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.foodName}</strong>
                      {item.notes && <div className="text-xs text-muted mt-1">{item.notes}</div>}
                    </td>
                    <td>
                      <div>
                        <strong>{item.donorOrg}</strong>
                        <div className="text-xs text-muted">{item.location}</div>
                      </div>
                    </td>
                    <td>
                      <span className="badge-qty">{item.quantityKg} kg</span>
                    </td>
                    <td>
                      <span className={`waste-stream-pill ${item.category}`}>
                        {item.category === 'composting'
                          ? '🌱 Composting'
                          : item.category === 'biogas'
                          ? '🔥 Biogas'
                          : '♻️ Other Route'}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm font-medium">{item.destinationFacility}</span>
                    </td>
                    <td>
                      {item.partnerName ? (
                        <div>
                          <strong>{item.partnerName}</strong>
                          {item.partnerPhone && <div className="text-xs text-muted">{item.partnerPhone}</div>}
                        </div>
                      ) : (
                        <span className="text-muted text-sm italic">Awaiting partner</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={item.status} type="waste" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Waste Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Log Leftover Organic Waste"
      >
        <form onSubmit={handleCreateWaste} className="waste-entry-form">
          {errorMsg && (
            <div className="alert alert-danger" role="alert">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="waste-name">
              Description of Organic Waste *
            </label>
            <input
              id="waste-name"
              type="text"
              className="form-control"
              placeholder="e.g. Banquet Curry Leftovers, Vegetable Peelings, Stale Bread"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              required
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="waste-cat">
                Disposal Stream *
              </label>
              <select
                id="waste-cat"
                className="form-control"
                value={category}
                onChange={(e) => setCategory(e.target.value as WasteCategory)}
              >
                <option value="composting">Suitable for Composting</option>
                <option value="biogas">Suitable for Biogas Processing</option>
                <option value="other_disposal">Other Certified Organic Disposal</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="waste-qty">
                Weight in Kilograms (kg) *
              </label>
              <div className="input-with-icon">
                <Scale size={18} className="input-icon" />
                <input
                  id="waste-qty"
                  type="number"
                  step="0.5"
                  min="0.5"
                  className="form-control"
                  placeholder="e.g. 25.0"
                  value={quantityKg}
                  onChange={(e) =>
                    setQuantityKg(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="waste-dest">
              Designated Facility / Yard *
            </label>
            <input
              id="waste-dest"
              type="text"
              className="form-control"
              placeholder="e.g. GreenEarth Organic Compost Yard / Metro Bio-Digester"
              value={destinationFacility}
              onChange={(e) => setDestinationFacility(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="waste-loc">
              Pickup Address *
            </label>
            <input
              id="waste-loc"
              type="text"
              className="form-control"
              placeholder="Hotel Rear Loading Dock, Bin Section B"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="waste-notes">
              Handling & Contamination Notes
            </label>
            <textarea
              id="waste-notes"
              className="form-control"
              rows={2}
              placeholder="e.g. Free of plastic wrap and bones. Stored in 50L green organic drums."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="modal-actions-bar">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-waste"
              disabled={submitting}
            >
              {submitting ? 'Registering Dispatch...' : 'Queue Waste Collection'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
