import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { getFoodListingById, updateFoodListing, deleteFoodListing } from '../services/foodService';
import type { FoodListing, FoodListingStatus } from '../types';
import {
  Edit3,
  Scale,
  Calendar,
  AlertCircle,
  Trash2,
  ArrowLeft,
  CheckCircle,
  Building2,
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
  const [remainingQuantityKg, setRemainingQuantityKg] = useState<number | ''>('');
  const [pickupDeadline, setPickupDeadline] = useState('');
  const [status, setStatus] = useState<FoodListingStatus>('available');
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
        setListing(data);
        setFoodName(data.foodName);
        setRemainingQuantityKg(data.remainingQuantityKg);
        setPickupDeadline(data.pickupDeadline);
        setStatus(data.status);
        setDescription(data.description || '');
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load listing');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [listingId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (remainingQuantityKg === '' || Number(remainingQuantityKg) < 0) {
      setErrorMessage('Please provide a valid quantity (>= 0 kg).');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      await updateFoodListing(
        listingId,
        {
          foodName,
          remainingQuantityKg: Number(remainingQuantityKg),
          pickupDeadline,
          status,
          description,
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
    if (!currentUser) return;
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
      <div className="page-container text-center py-8">
        <div className="spinner-large" />
        <p className="mt-4 text-muted">Loading listing details...</p>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="page-container text-center py-8">
        <div className="alert alert-danger">{errorMessage || 'Listing not found'}</div>
        <button type="button" className="btn btn-outline mt-4" onClick={() => onNavigate('hotel-dashboard')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    );
  }

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
        <p className="page-subtitle">Update quantities, revise pickup deadlines, or mark food unavailable.</p>
      </div>

      {errorMessage && (
        <div className="alert alert-danger mb-4" role="alert">
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="form-card-container">
        <form onSubmit={handleSave} className="standard-form">
          <div className="form-group">
            <label className="form-label" htmlFor="edit-food-name">
              Food / Dish Name
            </label>
            <input
              id="edit-food-name"
              type="text"
              className="form-control"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              required
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-remaining-kg">
                Remaining Quantity (kg)
              </label>
              <div className="input-with-icon">
                <Scale size={18} className="input-icon" />
                <input
                  id="edit-remaining-kg"
                  type="number"
                  step="0.5"
                  min="0"
                  className="form-control"
                  value={remainingQuantityKg}
                  onChange={(e) =>
                    setRemainingQuantityKg(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  required
                />
              </div>
              <small className="form-hint">
                Original quantity: {listing.initialQuantityKg} kg
              </small>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-status">
                Availability Status
              </label>
              <select
                id="edit-status"
                className="form-control"
                value={status}
                onChange={(e) => setStatus(e.target.value as FoodListingStatus)}
              >
                <option value="available">Available for Pickup</option>
                <option value="reserved">Reserved</option>
                <option value="completed">Completed / Picked Up</option>
                <option value="expired">Expired / Unavailable</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-deadline">
              Pickup Deadline
            </label>
            <div className="input-with-icon">
              <Calendar size={18} className="input-icon" />
              <input
                id="edit-deadline"
                type="datetime-local"
                className="form-control"
                value={pickupDeadline}
                onChange={(e) => setPickupDeadline(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-desc">
              Description & Notes
            </label>
            <textarea
              id="edit-desc"
              className="form-control"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-actions-split">
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 size={16} />
              <span>Delete Listing</span>
            </button>

            <div className="actions-right">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onNavigate('hotel-dashboard')}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
