import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { getFoodListingById, updateFoodListing, deleteFoodListing } from '../services/foodService';
import type {
  FoodListing,
  FoodListingStatus,
  FoodCondition,
  StorageCondition,
  WeightUnit,
  WeightMeasurementMethod,
} from '../types';
import {
  Edit3,
  Scale,
  Calendar,
  Clock,
  AlertCircle,
  Trash2,
  ArrowLeft,
  CheckCircle,
  Building2,
  Thermometer,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Save,
} from 'lucide-react';

interface Props {
  listingId: string;
  onNavigate: (page: string) => void;
}

export const EditFoodListing: React.FC<Props> = ({ listingId, onNavigate }) => {
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();

  const [listing, setListing] = useState<FoodListing | null>(null);
  const [foodName, setFoodName] = useState('');
  const [recordedWeight, setRecordedWeight] = useState<number | ''>('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [measurementMethod, setMeasurementMethod] = useState<WeightMeasurementMethod>('digital_scale');
  const [remainingQuantityKg, setRemainingQuantityKg] = useState<number | ''>('');
  const [pickupDeadlineDate, setPickupDeadlineDate] = useState('');
  const [pickupDeadlineTime, setPickupDeadlineTime] = useState('');
  const [status, setStatus] = useState<FoodListingStatus>('available');
  const [foodCondition, setFoodCondition] = useState<FoodCondition>('suitable');
  const [storageCondition, setStorageCondition] = useState<StorageCondition>('hot_holding');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [description, setDescription] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getFoodListingById(listingId);
        if (!data) {
          setErrorMessage('Listing not found');
          return;
        }

        // Ownership check
        if (currentUser && data.donorId !== currentUser.uid) {
          setErrorMessage('Permission denied. You can only edit your own hotel listings.');
          return;
        }

        setListing(data);
        setFoodName(data.foodName);
        setRecordedWeight(data.recordedWeight || data.remainingQuantityKg || '');
        setWeightUnit(data.weightUnit || 'kg');
        setMeasurementMethod(data.measurementMethod || 'digital_scale');
        setRemainingQuantityKg(data.remainingQuantityKg);
        setStatus(data.status);
        setFoodCondition(data.foodCondition || 'suitable');
        setStorageCondition(data.storageCondition || 'hot_holding');
        setPickupInstructions(data.pickupInstructions || '');
        setDescription(data.description || '');

        if (data.pickupDeadline) {
          const d = new Date(data.pickupDeadline);
          if (!isNaN(d.getTime())) {
            setPickupDeadlineDate(d.toISOString().split('T')[0]);
            setPickupDeadlineTime(
              `${d.getHours().toString().padStart(2, '0')}:${d
                .getMinutes()
                .toString()
                .padStart(2, '0')}`
            );
          }
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load listing');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [listingId, currentUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !listing) return;

    // Prevent modifying completed or collected listings back into active workflows (Requirement 12)
    if (listing.status === 'completed' && status !== 'completed') {
      setErrorMessage('Completed and collected food listings cannot be reactivated.');
      return;
    }

    if (listing.status === 'transferred_to_waste' && status !== 'transferred_to_waste') {
      setErrorMessage('Listings already routed to waste management cannot be reactivated.');
      return;
    }

    if (recordedWeight === '' || Number(recordedWeight) <= 0) {
      setErrorMessage('Please provide a valid quantity greater than zero.');
      return;
    }

    if (!pickupDeadlineDate || !pickupDeadlineTime) {
      setErrorMessage('Please specify the pickup deadline date and time.');
      return;
    }

    const deadlineIso = new Date(`${pickupDeadlineDate}T${pickupDeadlineTime}`).toISOString();
    const normalizedKg = weightUnit === 'g' ? Number(recordedWeight) / 1000 : Number(recordedWeight);

    setSaving(true);
    setErrorMessage(null);
    try {
      await updateFoodListing(
        listingId,
        {
          foodName: foodName.trim(),
          recordedWeight: Number(recordedWeight),
          weightUnit,
          measurementMethod,
          remainingQuantityKg: normalizedKg,
          pickupDeadline: deadlineIso,
          foodCondition,
          storageCondition,
          pickupInstructions: pickupInstructions.trim(),
          status,
          description: description.trim(),
        },
        currentUser.uid
      );

      showNotification('success', 'Listing Updated', 'Food listing details updated successfully.');
      onNavigate('hotel-dashboard');
    } catch (err: any) {
      console.error('Update failed:', err);
      const msg = err.message || 'Failed to update listing';
      setErrorMessage(msg);
      showNotification('error', 'Update Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUser || !listing) return;
    if (listing.status === 'completed') {
      alert('Completed donations cannot be deleted.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this listing? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteFoodListing(listingId, currentUser.uid);
      showNotification('success', 'Listing Deleted', 'The listing has been removed.');
      onNavigate('hotel-dashboard');
    } catch (err: any) {
      showNotification('error', 'Delete Failed', err.message || 'Could not delete listing');
    }
  };

  if (loading) {
    return (
      <div className="page-container text-center py-12">
        <div className="spinner-large" />
        <p className="mt-4 text-muted">Loading listing details...</p>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="page-container text-center py-12">
        <div className="alert alert-danger max-w-lg mx-auto">{errorMessage || 'Listing not found'}</div>
        <button
          type="button"
          className="btn btn-outline mt-4"
          onClick={() => onNavigate('hotel-dashboard')}
        >
          <ArrowLeft size={16} /> Back to Hotel Dashboard
        </button>
      </div>
    );
  }

  const isLocked = listing.status === 'completed' || listing.status === 'transferred_to_waste';

  return (
    <div className="page-container">
      <div className="page-header">
        <button
          type="button"
          className="btn-back-link"
          onClick={() => onNavigate('hotel-dashboard')}
        >
          <ArrowLeft size={16} />
          <span>Back to Hotel Dashboard</span>
        </button>
        <h1 className="page-title mt-2">Edit Food Listing</h1>
        <p className="page-subtitle">
          Update measured weights, extend pickup deadlines, or revise storage condition details.
        </p>
      </div>

      {isLocked && (
        <div className="alert alert-warning mb-6" role="alert">
          <AlertCircle size={18} />
          <div>
            <strong>Notice:</strong> This listing is marked as <strong>{listing.status}</strong>.
            Completed or waste-dispatched records cannot be reactivated into active workflows.
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-danger mb-6" role="alert">
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="form-card max-w-3xl mx-auto">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Dish Name */}
          <div className="form-group">
            <label className="form-label font-bold text-slate-800">Dish Name *</label>
            <input
              type="text"
              className="form-control text-base font-semibold"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              disabled={isLocked}
              required
            />
          </div>

          {/* Direct Weight Entry (Requirement 5) */}
          <div className="weight-entry-wrapper">
            <label className="form-label font-bold text-slate-800">
              Remaining Food Weight *
            </label>
            <div className="form-row-2 gap-4">
              <div className="weight-input-container">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className="form-control font-bold"
                  value={recordedWeight}
                  onChange={(e) =>
                    setRecordedWeight(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                  disabled={isLocked}
                  required
                />
                <div className="unit-switch-group">
                  <button
                    type="button"
                    className={`unit-switch-btn ${weightUnit === 'kg' ? 'active' : ''}`}
                    onClick={() => setWeightUnit('kg')}
                    disabled={isLocked}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    className={`unit-switch-btn ${weightUnit === 'g' ? 'active' : ''}`}
                    onClick={() => setWeightUnit('g')}
                    disabled={isLocked}
                  >
                    g
                  </button>
                </div>
              </div>

              {/* Measurement Method */}
              <div>
                <select
                  className="form-control"
                  value={measurementMethod}
                  onChange={(e) => setMeasurementMethod(e.target.value as WeightMeasurementMethod)}
                  disabled={isLocked}
                >
                  <option value="digital_scale">Digital Weighing Scale Verified</option>
                  <option value="manual_estimate">Manual Chef Estimate</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pickup Deadline */}
          <div className="form-row-2 gap-4">
            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">
                <Calendar size={14} className="inline mr-1 text-emerald" /> Pickup Deadline Date *
              </label>
              <input
                type="date"
                className="form-control"
                value={pickupDeadlineDate}
                onChange={(e) => setPickupDeadlineDate(e.target.value)}
                disabled={isLocked}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">
                <Clock size={14} className="inline mr-1 text-emerald" /> Pickup Deadline Time *
              </label>
              <input
                type="time"
                className="form-control"
                value={pickupDeadlineTime}
                onChange={(e) => setPickupDeadlineTime(e.target.value)}
                disabled={isLocked}
                required
              />
            </div>
          </div>

          {/* Food Condition & Storage */}
          <div className="form-row-2 gap-4">
            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">Food Safety Condition *</label>
              <select
                className="form-control"
                value={foodCondition}
                onChange={(e) => setFoodCondition(e.target.value as FoodCondition)}
                disabled={isLocked}
              >
                <option value="suitable">Suitable for Donation (Safe for Community Distribution)</option>
                <option value="not_suitable">Not Suitable for Donation (Route to Organic Waste)</option>
                <option value="requires_review">Requires Review (Pending Supervisor Inspection)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">Storage Condition *</label>
              <select
                className="form-control"
                value={storageCondition}
                onChange={(e) => setStorageCondition(e.target.value as StorageCondition)}
                disabled={isLocked}
              >
                <option value="hot_holding">Kept Hot (≥ 60°C)</option>
                <option value="refrigerated">Refrigerated (≤ 5°C)</option>
                <option value="room_temp">Room Temperature</option>
                <option value="other">Other Temperature Controlled</option>
              </select>
            </div>
          </div>

          {/* Listing Status */}
          <div className="form-group">
            <label className="form-label font-semibold text-slate-800">Listing Status</label>
            <select
              className="form-control"
              value={status}
              onChange={(e) => setStatus(e.target.value as FoodListingStatus)}
              disabled={isLocked}
            >
              <option value="available">Available for Pickup</option>
              <option value="reserved">Reserved by NGO</option>
              <option value="completed">Completed / Handed Over</option>
              <option value="overdue">Overdue (Review Required)</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Pickup Instructions */}
          <div className="form-group">
            <label className="form-label font-semibold text-slate-800">
              Pickup Instructions & Gate Details
            </label>
            <textarea
              className="form-control"
              rows={2}
              value={pickupInstructions}
              onChange={(e) => setPickupInstructions(e.target.value)}
              disabled={isLocked}
            />
          </div>

          {/* Action Buttons */}
          <div className="form-actions-bar border-t pt-4 flex items-center justify-between">
            <div>
              {!isLocked && (
                <button
                  type="button"
                  className="btn btn-outline text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-1.5"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  <Trash2 size={16} />
                  <span>Delete Listing</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onNavigate('hotel-dashboard')}
                disabled={saving}
              >
                Cancel
              </button>

              {!isLocked && (
                <button
                  type="submit"
                  className="btn btn-primary flex items-center gap-2"
                  disabled={saving}
                >
                  <Save size={16} />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
