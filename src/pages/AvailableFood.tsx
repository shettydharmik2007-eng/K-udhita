import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import { getFoodListings, requestFood, parsePickupDeadlineMs, isListingExpired } from '../services/foodService';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import type { FoodListing } from '../types';
import {
  Search,
  MapPin,
  Clock,
  Scale,
  Users,
  Building2,
  Utensils,
  AlertCircle,
  Thermometer,
  ArrowRight,
  X,
  PlusCircle,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const AvailableFood: React.FC<Props> = ({ onNavigate }) => {
  const { userProfile, isAuthenticated, isDonor } = useAuth();
  const { showNotification } = useNotification();

  const [listings, setListings] = useState<FoodListing[]>([]);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDietary, setSelectedDietary] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'deadline' | 'quantity'>('deadline');
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Request modal state
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<FoodListing | null>(null);
  const [requestedKg, setRequestedKg] = useState<number | ''>('');
  const [requestedPortions, setRequestedPortions] = useState<number | ''>('');
  const [pickupEstimate, setPickupEstimate] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const loadListings = async () => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const data = await getFoodListings();
      setListings(data);
    } catch (err: any) {
      console.error('Error fetching food listings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let ignore = false;
    getFoodListings()
      .then((data) => {
        if (!ignore) {
          setListings(data);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (!ignore) {
          console.error('Error fetching food listings:', err);
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Filter listings
  const filteredListings = listings
    .filter((item) => {
      const matchesSearch =
        item.foodName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.donorOrg.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.location.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      const matchesDietary =
        selectedDietary === 'all' || item.dietaryType === selectedDietary;

      const isExpired = isListingExpired(item, currentTime);

      const isAvailable =
        item.status === 'available' &&
        Number(item.remainingQuantityKg) > 0 &&
        item.foodCondition === 'suitable' &&
        !isExpired;

      return matchesSearch && matchesCategory && matchesDietary && isAvailable;
    })
    .sort((a, b) => {
      if (sortBy === 'deadline') {
        return new Date(a.pickupDeadline).getTime() - new Date(b.pickupDeadline).getTime();
      }
      return Number(b.remainingQuantityKg) - Number(a.remainingQuantityKg);
    });

  const handleOpenRequestModal = (item: FoodListing) => {
    if (!isAuthenticated) {
      showNotification('warning', 'Sign In Required', 'Please sign in or register to claim food for your community.');
      onNavigate('login');
      return;
    }
    setSelectedListing(item);
    setRequestedKg(item.remainingQuantityKg);
    setRequestedPortions(item.portions);
    setPickupEstimate('Within 1-2 hours');
    setRequestNotes('');
    setRequestError(null);
    setRequestModalOpen(true);
  };

  const handleConfirmRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListing || !userProfile) return;

    const reqKg = Number(requestedKg);
    if (!reqKg || reqKg <= 0) {
      setRequestError('Please specify a quantity greater than 0 kg.');
      return;
    }

    if (reqKg > Number(selectedListing.remainingQuantityKg)) {
      setRequestError(
        `Requested quantity (${reqKg} kg) exceeds remaining available amount (${selectedListing.remainingQuantityKg} kg).`
      );
      return;
    }

    setSubmittingRequest(true);
    setRequestError(null);
    try {
      await requestFood({
        listingId: selectedListing.id,
        requestedQuantityKg: reqKg,
        requestedPortions: Number(requestedPortions) || 1,
        requester: userProfile,
        pickupTimeEstimate: pickupEstimate,
        notes: requestNotes,
      });

      showNotification(
        'success',
        'Food Claimed Successfully!',
        `Reserved ${reqKg} kg of ${selectedListing.foodName}. The donor hotel has been notified.`
      );
      setRequestModalOpen(false);
      loadListings();
      onNavigate('my-requests');
    } catch (err: any) {
      console.error('Request submission failed:', err);
      const msg = err.message || 'Failed to submit food request';
      setRequestError(msg);
      showNotification('error', 'Request Failed', msg);
    } finally {
      setSubmittingRequest(false);
    }
  };

  const categoryList = [
    { id: 'all', label: 'All Items' },
    { id: 'cooked_meals', label: 'Cooked Buffet' },
    { id: 'bakery', label: 'Bakery & Bread' },
    { id: 'raw_produce', label: 'Raw Produce' },
    { id: 'packaged', label: 'Packaged Food' },
    { id: 'dairy_desserts', label: 'Dairy & Desserts' },
    { id: 'beverages', label: 'Beverages' },
  ];

  const dietaryList = [
    { id: 'all', label: 'All Diets' },
    { id: 'veg', label: 'Vegetarian (Veg)' },
    { id: 'non-veg', label: 'Non-Vegetarian' },
    { id: 'vegan', label: 'Vegan (Plant-Based)' },
  ];

  return (
    <div className="page-container">
      {/* Marketplace Header */}
      <div className="page-header text-center animate-fade-in-up">
        <div className="page-header-badge mx-auto">
          <Utensils size={15} className="text-emerald" />
          <span>Surplus Redistribution Hub</span>
        </div>
        <h1 className="page-title">Available Leftover Food</h1>
        <p className="page-subtitle max-w-2xl mx-auto">
          Fresh, safe commercial meals and banquet platters offered by hotels and event halls,
          available for community trusts, NGOs, and hunger relief shelters.
        </p>
      </div>

      {/* Redesigned Filter Hub with All Items & Options */}
      <div className="filter-hub-container card-glass animate-fade-in-up">
        {/* Full-width Search Bar */}
        <div className="filter-hub-search-row">
          <div className="search-bar-unified">
            <Search size={20} className="search-icon-unified" />
            <input
              type="text"
              className="search-field-unified"
              placeholder="Search by dish name, hotel/banquet hall, area, or landmark..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-field-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Categories Bar: "All Items" and all specific options */}
        <div className="filter-hub-section">
          <div className="filter-section-title">
            <span>Select Category:</span>
          </div>
          <div className="filter-pills-row">
            {categoryList.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`filter-tab-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.id === 'all' && <Utensils size={14} className="mr-1" />}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dietary & Sorting Options Bar */}
        <div className="filter-hub-suboptions-row">
          <div className="suboption-group">
            <span className="suboption-label">Dietary Preference:</span>
            <div className="suboption-pills">
              {dietaryList.map((diet) => (
                <button
                  key={diet.id}
                  type="button"
                  className={`suboption-pill ${selectedDietary === diet.id ? 'active' : ''}`}
                  onClick={() => setSelectedDietary(diet.id)}
                >
                  {diet.id === 'veg' && <span className="diet-dot veg-dot" />}
                  {diet.id === 'non-veg' && <span className="diet-dot non-veg-dot" />}
                  {diet.id === 'vegan' && <span className="diet-dot vegan-dot" />}
                  <span>{diet.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="suboption-group right-align">
            <span className="suboption-label">Sort:</span>
            <select
              className="filter-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'deadline' | 'quantity')}
            >
              <option value="deadline">Expiring Soonest</option>
              <option value="quantity">Highest Quantity First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Header Count */}
      <div className="results-count-bar">
        <span>
          Showing <strong>{filteredListings.length}</strong> available food {filteredListings.length === 1 ? 'item' : 'items'}
        </span>
        {isDonor && (
          <button
            type="button"
            className="btn btn-sm btn-primary btn-motion"
            onClick={() => onNavigate('add-food')}
          >
            <PlusCircle size={15} />
            <span>List New Surplus Dish</span>
          </button>
        )}
      </div>

      {/* Listings Section */}
      {loading ? (
        <div className="text-center py-16">
          <div className="spinner-large" />
          <p className="mt-4 text-muted">Checking real-time database for available surplus food...</p>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="empty-state-card animate-fade-in-up">
          <div className="empty-state-icon-wrap">
            <Utensils size={48} className="text-muted" />
          </div>
          <h3>No Surplus Food Listings Found</h3>
          <p>
            {listings.length === 0
              ? 'There are currently no active surplus food listings in the database. Hotels and banquet halls post listings after breakfast, lunch, or dinner events conclude.'
              : 'No items match your active filters. Try switching back to "All Items" or adjusting your search term.'}
          </p>

          <div className="empty-state-actions mt-4">
            {(selectedCategory !== 'all' || selectedDietary !== 'all' || searchQuery) && (
              <button
                type="button"
                className="btn btn-outline mr-2"
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedDietary('all');
                  setSearchQuery('');
                }}
              >
                Reset All Filters
              </button>
            )}

            {isDonor ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate('add-food')}
              >
                <PlusCircle size={16} /> Post Surplus Food
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onNavigate('signup')}
              >
                Register as Hotel Donor
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="listings-grid">
          {filteredListings.map((item) => (
            <div key={item.id} className="food-marketplace-card animate-hover-lift">
              <div className="food-card-media">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.foodName}
                    className="food-card-img"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const ph = e.currentTarget.parentElement?.querySelector('.food-card-placeholder');
                      if (ph) (ph as HTMLElement).style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="food-card-placeholder"
                  style={{ display: item.imageUrl ? 'none' : 'flex' }}
                >
                  <Utensils size={40} />
                  <span>{(item.category || 'surplus').replace('_', ' ')}</span>
                </div>
                <div className="food-card-tags">
                  <span className={`tag-dietary ${item.dietaryType || 'veg'}`}>
                    {(item.dietaryType || 'vegetarian').toUpperCase()}
                  </span>
                  <StatusBadge status={item.status} type="listing" />
                </div>
              </div>

              <div className="food-card-content">
                <div className="donor-org-header">
                  <Building2 size={14} className="text-emerald" />
                  <span className="donor-org-name">{item.donorOrg}</span>
                </div>

                <h3 className="food-card-title">{item.foodName}</h3>

                <div className="food-specs-grid">
                  <div className="food-spec-item">
                    <Scale size={15} className="text-muted" />
                    <div>
                      <span className="spec-val">{item.remainingQuantityKg} kg</span>
                      <small className="spec-label">Available</small>
                    </div>
                  </div>

                  <div className="food-spec-item">
                    <Users size={15} className="text-muted" />
                    <div>
                      <span className="spec-val">~{item.portions}</span>
                      <small className="spec-label">Portions</small>
                    </div>
                  </div>

                  <div className="food-spec-item">
                    <Thermometer size={15} className="text-muted" />
                    <div>
                      <span className="spec-val">
                        {item.storageCondition === 'refrigerated'
                          ? 'Chilled'
                          : item.storageCondition === 'hot_holding'
                          ? 'Hot Held'
                          : 'Ambient'}
                      </span>
                      <small className="spec-label">Storage</small>
                    </div>
                  </div>
                </div>

                <div className="food-info-block">
                  <div className="info-line text-danger">
                    <Clock size={14} />
                    <span>
                      Pickup by:{' '}
                      <strong>
                        {new Date(item.pickupDeadline).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </strong>
                    </span>
                  </div>

                  <div className="info-line">
                    <MapPin size={14} />
                    <span>{item.location}</span>
                  </div>

                  {item.description && (
                    <p className="food-desc-snippet">{item.description}</p>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-block mt-4 btn-motion"
                  onClick={() => handleOpenRequestModal(item)}
                >
                  <span>Request Food</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request Food Modal */}
      <Modal
        isOpen={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        title="Request Surplus Food"
      >
        {selectedListing && (
          <form onSubmit={handleConfirmRequest} className="request-food-form">
            <div className="request-summary-box flex items-center gap-3">
              {selectedListing.imageUrl && (
                <img
                  src={selectedListing.imageUrl}
                  alt={selectedListing.foodName}
                  className="w-16 h-16 object-cover rounded-lg shadow-sm shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="summary-title truncate">{selectedListing.foodName}</div>
                <div className="summary-sub truncate">
                  Offered by <strong>{selectedListing.donorOrg}</strong> • {selectedListing.location}
                </div>
                <div className="summary-available-pill mt-1">
                  Available: <strong>{selectedListing.remainingQuantityKg} kg</strong> (~{selectedListing.portions} portions)
                </div>
              </div>
            </div>

            {requestError && (
              <div className="alert alert-danger" role="alert">
                <AlertCircle size={16} />
                <span>{requestError}</span>
              </div>
            )}

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="req-quantity-kg">
                  Quantity Needed (kg) *
                </label>
                <div className="input-with-icon">
                  <Scale size={18} className="input-icon" />
                  <input
                    id="req-quantity-kg"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max={selectedListing.remainingQuantityKg}
                    className="form-control"
                    value={requestedKg}
                    onChange={(e) =>
                      setRequestedKg(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    required
                  />
                </div>
                <small className="form-hint">
                  Max allowed: {selectedListing.remainingQuantityKg} kg
                </small>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="req-portions">
                  Target Servings / Portions
                </label>
                <div className="input-with-icon">
                  <Users size={18} className="input-icon" />
                  <input
                    id="req-portions"
                    type="number"
                    min="1"
                    className="form-control"
                    value={requestedPortions}
                    onChange={(e) =>
                      setRequestedPortions(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    required
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="req-pickup-time">
                Estimated Pickup Time *
              </label>
              <input
                id="req-pickup-time"
                type="text"
                className="form-control"
                placeholder="e.g. Today by 6:30 PM (Volunteer vehicle arriving)"
                value={pickupEstimate}
                onChange={(e) => setPickupEstimate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="req-notes">
                Notes for Hotel / Food Preparation Team
              </label>
              <textarea
                id="req-notes"
                className="form-control"
                rows={2}
                placeholder="e.g. Bringing insulated carrier boxes. Volunteer contact: +91 98765..."
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
              />
            </div>

            <div className="modal-actions-bar">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setRequestModalOpen(false)}
                disabled={submittingRequest}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingRequest}
              >
                {submittingRequest ? 'Confirming with Database...' : 'Confirm Food Request'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
