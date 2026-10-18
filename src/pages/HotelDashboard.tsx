import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import {
  getFoodListings,
  getFoodRequests,
  updateRequestStatus,
  updateFoodListing,
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
  Recycle,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Calendar,
  Layers,
  Thermometer,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  HeartHandshake,
  CheckCircle2,
  X,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string, params?: any) => void;
  onEditListing: (id: string) => void;
}

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  rice_pulao: { label: 'Rice & Pulao', icon: '🍚' },
  curries_dal: { label: 'Curries & Dal', icon: '🍲' },
  roti_bread: { label: 'Roti & Bread', icon: '🫓' },
  snacks_starters: { label: 'Snacks & Starters', icon: '🥟' },
  sweets_desserts: { label: 'Sweets & Desserts', icon: '🍨' },
  fruits_salad_others: { label: 'Fruits, Salad & Others', icon: '🥗' },
  cooked_meals: { label: 'Cooked Meals', icon: '🍱' },
  bakery: { label: 'Bakery & Bread', icon: '🥖' },
  raw_produce: { label: 'Fresh Produce', icon: '🥦' },
  packaged: { label: 'Packaged Food', icon: '📦' },
  dairy_desserts: { label: 'Dairy & Desserts', icon: '🥛' },
  beverages: { label: 'Beverages', icon: '🧃' },
  other: { label: 'Other Surplus', icon: '🍽️' },
};

export const HotelDashboard: React.FC<Props> = ({ onNavigate, onEditListing }) => {
  const { currentUser, userProfile, isDonor } = useAuth();
  const { showNotification } = useNotification();

  const [listings, setListings] = useState<FoodListing[]>([]);
  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter state
  const [activeTab, setActiveTab] = useState<
    'all' | 'available' | 'reserved' | 'overdue' | 'completed' | 'transferred_to_waste'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Waste transfer modal state
  const [wasteModalOpen, setWasteModalOpen] = useState(false);
  const [selectedListingForWaste, setSelectedListingForWaste] = useState<FoodListing | null>(null);
  const [wasteCategory, setWasteCategory] = useState<WasteCategory>('composting');
  const [destinationFacility, setDestinationFacility] = useState('Municipal Bio-Compost Facility');
  const [wasteNotes, setWasteNotes] = useState('');
  const [transferringWaste, setTransferringWaste] = useState(false);

  // Overdue review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedOverdueListing, setSelectedOverdueListing] = useState<FoodListing | null>(null);
  const [extendedDeadlineDate, setExtendedDeadlineDate] = useState('');
  const [extendedDeadlineTime, setExtendedDeadlineTime] = useState('');
  const [updatingOverdue, setUpdatingOverdue] = useState(false);

  // Photo enlargement modal state
  const [previewPhotoModal, setPreviewPhotoModal] = useState<{
    url: string;
    title: string;
    category: string;
  } | null>(null);

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
      showNotification('error', 'Data Load Error', err.message || 'Could not fetch hotel records');
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

  // Helper to format creation timestamp in local timezone
  const formatCreationTime = (createdAt: any): string => {
    if (!createdAt) return 'Recently';
    try {
      const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
      if (isNaN(date.getTime())) return 'Recently';
      return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recently';
    }
  };

  // Helper to calculate countdown and overdue status
  const getDeadlineStatus = (pickupDeadline: string) => {
    if (!pickupDeadline) {
      return { isOverdue: false, label: 'Flexible', urgency: 'normal' as const };
    }
    const deadlineTime = new Date(pickupDeadline).getTime();
    if (isNaN(deadlineTime)) {
      return { isOverdue: false, label: pickupDeadline, urgency: 'normal' as const };
    }

    const diffMs = deadlineTime - Date.now();
    const diffMinutes = Math.round(diffMs / (1000 * 60));

    if (diffMinutes <= 0) {
      return {
        isOverdue: true,
        label: 'Overdue (Review Required)',
        urgency: 'overdue' as const,
      };
    }

    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    const label = hours > 0 ? `${hours}h ${mins}m remaining` : `${mins}m remaining`;

    return {
      isOverdue: false,
      label,
      urgency: diffMinutes < 120 ? ('urgent' as const) : ('normal' as const),
    };
  };

  // Request status management
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

  // Cancel listing
  const handleCancelListing = async (listingId: string) => {
    if (!currentUser) return;
    if (!window.confirm('Are you sure you want to cancel this food listing?')) return;

    try {
      await updateFoodListing(listingId, { status: 'cancelled' }, currentUser.uid);
      showNotification('success', 'Listing Cancelled', 'The food listing has been cancelled.');
      loadData();
    } catch (err: any) {
      showNotification('error', 'Cancellation Failed', err.message || 'Could not cancel listing');
    }
  };

  // Waste transfer modal openers
  const openWasteTransferModal = (item: FoodListing) => {
    setSelectedListingForWaste(item);
    setWasteNotes(`Surplus food (${item.remainingQuantityKg} kg) routed for certified circular recycling.`);
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
        'Transferred to Waste Partner',
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

  // Overdue review modal openers
  const openOverdueReviewModal = (item: FoodListing) => {
    setSelectedOverdueListing(item);
    const newDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000);
    setExtendedDeadlineDate(newDeadline.toISOString().split('T')[0]);
    setExtendedDeadlineTime(
      `${newDeadline.getHours().toString().padStart(2, '0')}:${newDeadline
        .getMinutes()
        .toString()
        .padStart(2, '0')}`
    );
    setReviewModalOpen(true);
  };

  const handleExtendDeadline = async () => {
    if (!selectedOverdueListing || !currentUser) return;
    setUpdatingOverdue(true);
    try {
      const newDeadlineIso = new Date(
        `${extendedDeadlineDate}T${extendedDeadlineTime}`
      ).toISOString();

      await updateFoodListing(
        selectedOverdueListing.id,
        {
          pickupDeadline: newDeadlineIso,
          status: 'available',
          foodCondition: 'suitable',
        },
        currentUser.uid
      );

      showNotification('success', 'Pickup Window Extended', 'Deadline updated and listing reactivated.');
      setReviewModalOpen(false);
      loadData();
    } catch (err: any) {
      showNotification('error', 'Extension Failed', err.message || 'Could not extend deadline');
    } finally {
      setUpdatingOverdue(false);
    }
  };

  // ==========================================
  // Summary Metrics (Point 1 of Requirements)
  // ==========================================
  const activeListings = listings.filter((l) => l.status === 'available');
  const activeCount = activeListings.length;

  const availableKg = activeListings.reduce(
    (acc, l) => acc + (Number(l.remainingQuantityKg) || 0),
    0
  );

  const donatedKgFromRequests = requests
    .filter((r) => r.status === 'completed' || r.status === 'accepted')
    .reduce((acc, r) => acc + (Number(r.requestedQuantityKg) || 0), 0);

  const completedListingsKg = listings
    .filter((l) => l.status === 'completed')
    .reduce((acc, l) => acc + (Number(l.initialQuantityKg) || 0), 0);

  const totalDonatedKg = Math.max(donatedKgFromRequests, completedListingsKg);

  const awaitingCollectionCount =
    requests.filter((r) => r.status === 'accepted' || r.status === 'pending').length +
    listings.filter((l) => l.status === 'reserved').length;

  // Filter listings by tab & search query
  const filteredListings = listings.filter((item) => {
    const deadlineStatus = getDeadlineStatus(item.pickupDeadline);
    const isOverdue = deadlineStatus.isOverdue && item.status === 'available';

    let matchesTab = true;
    if (activeTab === 'available') matchesTab = item.status === 'available' && !isOverdue;
    else if (activeTab === 'reserved') matchesTab = item.status === 'reserved';
    else if (activeTab === 'overdue') matchesTab = isOverdue || item.status === 'overdue' || item.foodCondition === 'requires_review';
    else if (activeTab === 'completed') matchesTab = item.status === 'completed';
    else if (activeTab === 'transferred_to_waste') matchesTab = item.status === 'transferred_to_waste';

    const matchesSearch =
      !searchQuery.trim() ||
      item.foodName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesTab && matchesSearch;
  });

  return (
    <div className="page-container">
      {/* Top Banner */}
      <div className="dashboard-header-flex">
        <div>
          <div className="page-header-badge">
            <Building2 size={16} className="text-emerald" />
            <span>Hospitality Surplus & Donation Portal</span>
          </div>
          <h1 className="page-title">{userProfile?.organizationName || 'Hotel & Banquet Hall Dashboard'}</h1>
          <p className="page-subtitle">
            Record direct banquet food weights, track pickup deadlines in real time, and route edible meals to NGOs or organic waste partners.
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

      {/* 4 Summary Cards (Requirement 1) */}
      <div className="metrics-summary-grid">
        {/* Card 1: Active Listings */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-emerald-light">
            <Layers size={22} className="text-emerald" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Active Listings</span>
            <span className="metric-value">{activeCount}</span>
            <small className="metric-sub text-emerald-700 font-semibold">
              Live for NGO pickup
            </small>
          </div>
        </div>

        {/* Card 2: Food Available (kg) */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-blue-light">
            <Scale size={22} className="text-blue" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Food Available</span>
            <span className="metric-value">
              {availableKg.toFixed(1)} <span className="unit">kg</span>
            </span>
            <small className="metric-sub text-blue-700 font-semibold">
              ~{Math.round(availableKg * 3)} verified portions
            </small>
          </div>
        </div>

        {/* Card 3: Food Donated */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-amber-light">
            <HeartHandshake size={22} className="text-amber-600" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Food Donated</span>
            <span className="metric-value">
              {totalDonatedKg.toFixed(1)} <span className="unit">kg</span>
            </span>
            <small className="metric-sub text-amber-700 font-semibold">
              Redistributed to community
            </small>
          </div>
        </div>

        {/* Card 4: Food Awaiting Collection */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-purple-light" style={{ background: '#f3e8ff' }}>
            <Clock size={22} style={{ color: '#9333ea' }} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Awaiting Collection</span>
            <span className="metric-value" style={{ color: '#9333ea' }}>
              {awaitingCollectionCount}
            </span>
            <small className="metric-sub font-semibold" style={{ color: '#7e22ce' }}>
              Claimed by partner shelters
            </small>
          </div>
        </div>
      </div>

      {/* Main Listings Section */}
      <div className="dashboard-section mt-8">
        <div className="section-header-flex items-center justify-between mb-4">
          <div>
            <h2 className="section-title">Your Food Surplus Listings</h2>
            <p className="section-desc">
              Manage live banquet portions, review deadlines, and monitor NGO pickups.
            </p>
          </div>

          {/* Quick Search */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              className="form-control text-sm py-1.5"
              placeholder="Search dishes or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '220px' }}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => onNavigate('add-food')}
            >
              <PlusCircle size={14} /> Add Food
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="hotel-tabs-container">
          <button
            type="button"
            className={`hotel-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <span>All Listings</span>
            <span className="badge-pill-count">{listings.length}</span>
          </button>

          <button
            type="button"
            className={`hotel-tab-btn ${activeTab === 'available' ? 'active' : ''}`}
            onClick={() => setActiveTab('available')}
          >
            <span>Active Available</span>
            <span className="badge-pill-count">{activeCount}</span>
          </button>

          <button
            type="button"
            className={`hotel-tab-btn ${activeTab === 'reserved' ? 'active' : ''}`}
            onClick={() => setActiveTab('reserved')}
          >
            <span>Awaiting Pickup</span>
            <span className="badge-pill-count">
              {listings.filter((l) => l.status === 'reserved').length}
            </span>
          </button>

          <button
            type="button"
            className={`hotel-tab-btn ${activeTab === 'overdue' ? 'active' : ''}`}
            onClick={() => setActiveTab('overdue')}
          >
            <span>Overdue / Review Needed</span>
            <span className="badge-pill-count">
              {
                listings.filter((l) => {
                  const ds = getDeadlineStatus(l.pickupDeadline);
                  return (ds.isOverdue && l.status === 'available') || l.foodCondition === 'requires_review';
                }).length
              }
            </span>
          </button>

          <button
            type="button"
            className={`hotel-tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            <span>Completed / Donated</span>
            <span className="badge-pill-count">
              {listings.filter((l) => l.status === 'completed').length}
            </span>
          </button>

          <button
            type="button"
            className={`hotel-tab-btn ${activeTab === 'transferred_to_waste' ? 'active' : ''}`}
            onClick={() => setActiveTab('transferred_to_waste')}
          >
            <span>Routed to Waste</span>
            <span className="badge-pill-count">
              {listings.filter((l) => l.status === 'transferred_to_waste').length}
            </span>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="spinner-large" />
            <p className="mt-4 text-muted">Retrieving your listings from Cloud Firestore...</p>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="empty-state-card">
            <Building2 size={48} className="text-muted" />
            <h3>No Surplus Food Listings Found</h3>
            <p>
              {searchQuery || activeTab !== 'all'
                ? 'No listings match your selected filter criteria. Try changing filters.'
                : 'When a wedding, conference, or buffet concludes, enter the recorded surplus food weight to share with community shelters.'}
            </p>
            <button
              type="button"
              className="btn btn-primary mt-4"
              onClick={() => onNavigate('add-food')}
            >
              <PlusCircle size={16} /> Post New Food Listing
            </button>
          </div>
        ) : (
          <div className="listings-grid">
            {filteredListings.map((item) => {
              const deadlineStatus = getDeadlineStatus(item.pickupDeadline);
              const isOverdue = deadlineStatus.isOverdue && item.status === 'available';
              const catMeta = CATEGORY_META[item.category] || {
                label: item.category.replace('_', ' '),
                icon: '🍽️',
              };

              return (
                <div
                  key={item.id}
                  className={`hotel-listing-card ${isOverdue ? 'border-amber-400 bg-amber-50/20' : ''}`}
                >
                  {/* Card Media with Overlay Badges */}
                  <div className="listing-card-media relative">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.foodName}
                        className="listing-thumb cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() =>
                          setPreviewPhotoModal({
                            url: item.imageUrl!,
                            title: item.foodName,
                            category: catMeta.label,
                          })
                        }
                        title="Click to view full photo"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const ph = e.currentTarget.parentElement?.querySelector('.listing-thumb-placeholder');
                          if (ph) (ph as HTMLElement).style.display = 'flex';
                        }}
                      />
                    ) : null}

                    <div
                      className="listing-thumb-placeholder"
                      style={{ display: item.imageUrl ? 'none' : 'flex' }}
                    >
                      <span className="text-3xl mb-1">{catMeta.icon}</span>
                      <span className="font-semibold">{catMeta.label}</span>
                    </div>

                    <div className="media-overlay-tags">
                      <StatusBadge status={item.status} type="listing" />
                      <span className="dietary-badge">{item.dietaryType}</span>
                    </div>

                    {/* Food Condition badge */}
                    {item.foodCondition && (
                      <div className="absolute bottom-2 left-2">
                        <StatusBadge status={item.foodCondition} />
                      </div>
                    )}
                  </div>

                  <div className="listing-card-body">
                    {/* Category & Title */}
                    <div className="flex items-center gap-1.5 text-xs text-muted font-bold uppercase tracking-wide">
                      <span>{catMeta.icon}</span>
                      <span>{catMeta.label}</span>
                    </div>
                    <h3 className="listing-title text-base font-bold text-slate-900 mt-0.5">
                      {item.foodName}
                    </h3>

                    {/* Direct Weight Display (Requirement 5) */}
                    <div className="listing-meta-row bg-slate-50 p-2 rounded-lg border border-slate-100 my-2">
                      <div className="flex items-center gap-2">
                        <Scale size={16} className="text-emerald" />
                        <div>
                          <div className="text-xs text-muted">Recorded Food Weight</div>
                          <div className="font-extrabold text-slate-900 text-sm">
                            {item.recordedWeight ? (
                              <>
                                {item.recordedWeight} {item.weightUnit || 'kg'}{' '}
                                <span className="text-xs font-normal text-slate-600">
                                  ({item.measurementMethod === 'digital_scale'
                                    ? 'Digital Scale'
                                    : 'Manual Estimate'})
                                </span>
                              </>
                            ) : (
                              `${item.remainingQuantityKg} kg remaining`
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Preparation Time & Local Creation Time (Requirements 6 & 7) */}
                    <div className="text-xs text-slate-600 space-y-1 my-1">
                      {item.prepTime && (
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          <span>Prepared: {item.prepDate || 'Today'} at {item.prepTime}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar size={12} className="text-slate-400" />
                        <span>Listed: {formatCreationTime(item.createdAt)} (Local)</span>
                      </div>
                    </div>

                    {/* Pickup Deadline & Countdown / Overdue Alert (Requirement 8) */}
                    <div className="my-2">
                      <div
                        className={`countdown-badge ${deadlineStatus.urgency} w-full justify-center`}
                      >
                        <Clock size={13} />
                        <span>{deadlineStatus.label}</span>
                      </div>
                    </div>

                    {/* Storage Condition & Location */}
                    <div className="listing-meta-row text-xs text-muted flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Thermometer size={12} className="text-blue-500" />
                        <span>
                          {item.storageCondition === 'hot_holding'
                            ? 'Kept Hot (≥60°C)'
                            : item.storageCondition === 'refrigerated'
                            ? 'Refrigerated (≤5°C)'
                            : 'Room Temp'}
                        </span>
                      </span>

                      <span className="flex items-center gap-1 truncate max-w-[140px]" title={item.location}>
                        <MapPin size={12} className="text-slate-400 shrink-0" />
                        <span className="truncate">{item.location}</span>
                      </span>
                    </div>

                    {/* Progress Bar (Remaining vs Initial Quantity) */}
                    <div className="progress-bar-container mt-2">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            (Number(item.remainingQuantityKg) / Number(item.initialQuantityKg || 1)) * 100
                          )}%`,
                        }}
                      />
                    </div>

                    {/* Action Buttons (Requirement 11) */}
                    <div className="listing-card-actions mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      {/* Edit Button */}
                      {item.status !== 'completed' && item.status !== 'transferred_to_waste' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline flex items-center gap-1 text-xs"
                          onClick={() => onEditListing(item.id)}
                        >
                          <Edit size={13} />
                          <span>Edit</span>
                        </button>
                      )}

                      {/* Overdue Review Action */}
                      {isOverdue && (
                        <button
                          type="button"
                          className="btn btn-sm btn-warning flex items-center gap-1 text-xs"
                          onClick={() => openOverdueReviewModal(item)}
                          title="Review overdue listing: extend pickup window or route to recycling"
                        >
                          <AlertTriangle size={13} />
                          <span>Review</span>
                        </button>
                      )}

                      {/* Cancel Listing (if active) */}
                      {item.status === 'available' && !isOverdue && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline text-red-600 border-red-200 hover:bg-red-50 text-xs"
                          onClick={() => handleCancelListing(item.id)}
                          title="Cancel listing"
                        >
                          <X size={13} />
                          <span>Cancel</span>
                        </button>
                      )}

                      {/* Route to Organic Waste Loop (Composting/Biogas) */}
                      {item.status !== 'transferred_to_waste' &&
                        item.status !== 'completed' &&
                        Number(item.remainingQuantityKg) > 0 && (
                          <button
                            type="button"
                            className="btn btn-sm btn-waste flex items-center gap-1 text-xs"
                            onClick={() => openWasteTransferModal(item)}
                            title="Route surplus or unsuitable food to organic composting or biogas circular loop"
                          >
                            <Recycle size={13} />
                            <span>Waste Loop</span>
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Incoming Requests Section */}
      <div className="dashboard-section mt-12">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title">Incoming Community Requests</h2>
            <p className="section-desc">
              Surplus food claims submitted by verified shelters, charities, and NGOs.
            </p>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="empty-sub-card">
            <p>No community food requests received for your listings yet.</p>
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
                        <div className="text-muted text-sm">
                          {req.requesterName} • {req.requesterPhone}
                        </div>
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
                              handleUpdateReqStatus(
                                req.id,
                                req.listingId,
                                'accepted',
                                req.requestedQuantityKg
                              )
                            }
                          >
                            <CheckCircle size={14} /> Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() =>
                              handleUpdateReqStatus(
                                req.id,
                                req.listingId,
                                'rejected',
                                req.requestedQuantityKg
                              )
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
                            handleUpdateReqStatus(
                              req.id,
                              req.listingId,
                              'completed',
                              req.requestedQuantityKg
                            )
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

      {/* OVERDUE REVIEW MODAL (Requirement 8 & 12) */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title="Review Overdue Food Listing"
      >
        {selectedOverdueListing && (
          <div className="overdue-review-modal space-y-4">
            <div className="alert alert-warning">
              <AlertTriangle size={18} />
              <div>
                <strong>Pickup Deadline Passed:</strong>
                <p className="text-sm mt-1">
                  The pickup deadline for <strong>{selectedOverdueListing.foodName}</strong> has
                  expired. Under Kṣudhita protocol, food is not automatically declared unsafe;
                  please verify storage integrity and choose an action.
                </p>
              </div>
            </div>

            {selectedOverdueListing.imageUrl && (
              <div className="flex items-center gap-3 p-2 bg-slate-100 rounded-lg border border-slate-200">
                <img
                  src={selectedOverdueListing.imageUrl}
                  alt={selectedOverdueListing.foodName}
                  className="w-16 h-16 object-cover rounded-md shadow-sm"
                />
                <div>
                  <div className="font-bold text-slate-800 text-sm">
                    {selectedOverdueListing.foodName}
                  </div>
                  <div className="text-xs text-muted">
                    {selectedOverdueListing.remainingQuantityKg} kg remaining
                  </div>
                </div>
              </div>
            )}

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm space-y-1">
              <div>
                <strong>Current Food Condition:</strong>{' '}
                <StatusBadge status={selectedOverdueListing.foodCondition || 'requires_review'} />
              </div>
              <div>
                <strong>Storage Method:</strong>{' '}
                {selectedOverdueListing.storageCondition === 'hot_holding'
                  ? 'Kept Hot (≥ 60°C)'
                  : selectedOverdueListing.storageCondition === 'refrigerated'
                  ? 'Refrigerated (≤ 5°C)'
                  : 'Room Temperature'}
              </div>
              <div>
                <strong>Remaining Quantity:</strong> {selectedOverdueListing.remainingQuantityKg} kg
              </div>
            </div>

            <div className="pt-2">
              <h4 className="font-bold text-slate-800 text-sm mb-2">
                Option A: Extend Pickup Window (If Temperature Is Maintained)
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">New Date</label>
                  <input
                    type="date"
                    className="form-control text-sm"
                    value={extendedDeadlineDate}
                    onChange={(e) => setExtendedDeadlineDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">New Time</label>
                  <input
                    type="time"
                    className="form-control text-sm"
                    value={extendedDeadlineTime}
                    onChange={(e) => setExtendedDeadlineTime(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm w-full mt-2"
                onClick={handleExtendDeadline}
                disabled={updatingOverdue}
              >
                {updatingOverdue ? 'Extending...' : 'Extend Deadline & Reactivate'}
              </button>
            </div>

            <div className="pt-3 border-t">
              <h4 className="font-bold text-slate-800 text-sm mb-1">
                Option B: Route to Organic Waste Recycling
              </h4>
              <p className="text-xs text-muted mb-2">
                If the food can no longer be served, divert it to circular composting or biogas.
              </p>
              <button
                type="button"
                className="btn btn-waste btn-sm w-full"
                onClick={() => {
                  setReviewModalOpen(false);
                  openWasteTransferModal(selectedOverdueListing);
                }}
              >
                <Recycle size={14} className="inline mr-1" />
                Dispatch to Organic Waste Loop
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* TRANSFER TO WASTE MODAL */}
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
                  processing prevents landfill methane emissions (UN SDGs 12 & 13).
                </p>
              </div>
            </div>

            {selectedListingForWaste.imageUrl && (
              <div className="flex items-center gap-3 p-2 bg-slate-100 rounded-lg border border-slate-200">
                <img
                  src={selectedListingForWaste.imageUrl}
                  alt={selectedListingForWaste.foodName}
                  className="w-16 h-16 object-cover rounded-md shadow-sm"
                />
                <div>
                  <div className="font-bold text-slate-800 text-sm">
                    {selectedListingForWaste.foodName}
                  </div>
                  <div className="text-xs text-muted">
                    {selectedListingForWaste.remainingQuantityKg} kg surplus
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label font-semibold">Processing Stream *</label>
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
              <label className="form-label font-semibold">Destination Facility / Partner Name *</label>
              <input
                type="text"
                className="form-control"
                value={destinationFacility}
                onChange={(e) => setDestinationFacility(e.target.value)}
                placeholder="e.g. City Bio-Compost Facility / GreenPower Biogas Plant"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label font-semibold">Notes & Container Info</label>
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

      {/* PHOTO ENLARGEMENT / INSPECTION MODAL */}
      <Modal
        isOpen={Boolean(previewPhotoModal)}
        onClose={() => setPreviewPhotoModal(null)}
        title={previewPhotoModal?.title || 'Food Photo'}
      >
        {previewPhotoModal && (
          <div className="photo-preview-modal-body p-2 text-center">
            <div className="rounded-xl overflow-hidden bg-slate-900 max-h-[70vh] flex items-center justify-center mb-3">
              <img
                src={previewPhotoModal.url}
                alt={previewPhotoModal.title}
                className="max-w-full max-h-[65vh] object-contain"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600 px-1">
              <span className="font-semibold text-slate-800">{previewPhotoModal.title}</span>
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                {previewPhotoModal.category}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
