import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import {
  getFoodListings,
  getFoodRequests,
  requestFood,
  updateRequestStatus,
} from '../services/foodService';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import type {
  FoodListing,
  FoodRequest,
  FoodCategory,
  DietaryType,
} from '../types';
import {
  HeartHandshake,
  Scale,
  Users,
  Clock,
  Building2,
  MapPin,
  Thermometer,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  Phone,
  Utensils,
  Layers,
  Sparkles,
  Info,
  Check,
  XCircle,
  LogIn,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
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

const STORAGE_LABELS: Record<string, { label: string; color: string }> = {
  hot_holding: { label: 'Kept Hot (≥ 60°C)', color: '#dc2626' },
  refrigerated: { label: 'Refrigerated (≤ 5°C)', color: '#0284c7' },
  room_temp: { label: 'Room Temperature', color: '#16a34a' },
  other: { label: 'Temperature Controlled', color: '#64748b' },
};

export const NgoDashboard: React.FC<Props> = ({ onNavigate }) => {
  const { currentUser, userProfile, isAuthenticated, isRequester, isDonor, isWastePartner } = useAuth();
  const { showNotification } = useNotification();

  // Active Main Tab: 'available' (Surplus Marketplace) or 'my_requests' (Tracking)
  const [activeTab, setActiveTab] = useState<'available' | 'my_requests'>('available');

  // Listings & Requests State
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filter state for Available Listings
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [dietaryFilter, setDietaryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'deadline' | 'quantity'>('deadline');

  // Filter for My Requests tab
  const [requestsSubTab, setRequestsSubTab] = useState<'all' | 'accepted' | 'pending' | 'completed' | 'cancelled'>('all');

  // Food Details Modal State
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<FoodListing | null>(null);

  // Claim Form State
  const [claimQuantityKg, setClaimQuantityKg] = useState<number | ''>('');
  const [claimPortions, setClaimPortions] = useState<number | ''>('');
  const [pickupEstimate, setPickupEstimate] = useState('Within 1-2 hours');
  const [claimNotes, setClaimNotes] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Action states for My Requests
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Load live listings and user's requests from Cloud Firestore
  const loadDashboardData = async () => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch live food listings
      const allListings = await getFoodListings();
      setListings(allListings);

      // 2. Fetch requests for this logged in NGO (if authenticated)
      if (currentUser) {
        const myRequests = await getFoodRequests({ requesterId: currentUser.uid });
        setRequests(myRequests);
      } else {
        setRequests([]);
      }
    } catch (err: any) {
      console.error('[NGO Dashboard] Data load failed:', err);
      showNotification('error', 'Sync Failed', err.message || 'Could not load surplus food data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [currentUser]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  // Helper to calculate countdown time remaining
  const getDeadlineStatus = (pickupDeadline: string) => {
    if (!pickupDeadline) {
      return { isOverdue: false, label: 'Flexible', urgency: 'normal' as const, diffMinutes: 999 };
    }
    const deadlineTime = new Date(pickupDeadline).getTime();
    if (isNaN(deadlineTime)) {
      return { isOverdue: false, label: pickupDeadline, urgency: 'normal' as const, diffMinutes: 999 };
    }

    const diffMs = deadlineTime - Date.now();
    const diffMinutes = Math.round(diffMs / (1000 * 60));

    if (diffMinutes <= 0) {
      return {
        isOverdue: true,
        label: 'Deadline Passed',
        urgency: 'overdue' as const,
        diffMinutes,
      };
    }

    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    const label = hours > 0 ? `${hours}h ${mins}m remaining` : `${mins}m remaining`;

    return {
      isOverdue: false,
      label,
      urgency: diffMinutes < 120 ? ('urgent' as const) : ('normal' as const),
      diffMinutes,
    };
  };

  // STRICT FILTERING FOR NGO DONATION (Requirement 2):
  // - status === 'available' and not collected, donated, cancelled, completed
  // - foodCondition === 'suitable' (Suitable for Donation)
  // - deadline has not passed
  // - remainingQuantityKg > 0
  // - NEVER show 'not_suitable' or 'requires_review'
  const suitableAvailableListings = useMemo(() => {
    const now = Date.now();
    return listings.filter((item) => {
      // 1. Availability and quantity
      const isAvailable = item.status === 'available' && Number(item.remainingQuantityKg) > 0;

      // 2. Food safety certification: strictly suitable for donation
      const isSuitable = item.foodCondition === 'suitable';

      // 3. Deadline has not passed
      const deadlineMs = item.pickupDeadline ? new Date(item.pickupDeadline).getTime() : NaN;
      const isNotExpired = isNaN(deadlineMs) || deadlineMs > now;

      return isAvailable && isSuitable && isNotExpired;
    });
  }, [listings]);

  // Extract unique locations from suitable listings for the filter dropdown
  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    suitableAvailableListings.forEach((item) => {
      if (item.location) {
        // Use clean city or locality part
        const parts = item.location.split(',');
        const clean = parts[parts.length - 1].trim() || parts[0].trim();
        if (clean) set.add(clean);
      }
    });
    return Array.from(set).sort();
  }, [suitableAvailableListings]);

  // Filtered and sorted listings based on user search & filter bar
  const displayedListings = useMemo(() => {
    return suitableAvailableListings
      .filter((item) => {
        // Search by dish name, hotel/banquet name, or location
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          item.foodName.toLowerCase().includes(q) ||
          item.donorOrg.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q);

        // Category filter
        const matchesCategory =
          categoryFilter === 'all' || item.category === categoryFilter;

        // Location filter
        const matchesLocation =
          locationFilter === 'all' ||
          item.location.toLowerCase().includes(locationFilter.toLowerCase());

        // Dietary filter
        const matchesDietary =
          dietaryFilter === 'all' || item.dietaryType === dietaryFilter;

        return matchesSearch && matchesCategory && matchesLocation && matchesDietary;
      })
      .sort((a, b) => {
        if (sortBy === 'deadline') {
          return new Date(a.pickupDeadline).getTime() - new Date(b.pickupDeadline).getTime();
        }
        return Number(b.remainingQuantityKg) - Number(a.remainingQuantityKg);
      });
  }, [suitableAvailableListings, searchQuery, categoryFilter, locationFilter, dietaryFilter, sortBy]);

  // Calculate 4 Summary KPI Cards (Requirement 1):
  // 1. Available Food Listings count
  const availableListingsCount = suitableAvailableListings.length;

  // 2. Total Food Available (kg) across all suitable listings
  const totalAvailableKg = suitableAvailableListings.reduce(
    (sum, item) => sum + (Number(item.remainingQuantityKg) || 0),
    0
  );

  // 3. My Food Requests (Total requests placed by this NGO)
  const myRequestsCount = requests.length;

  // 4. Confirmed Pickups (Requests accepted/scheduled or completed for this NGO)
  const confirmedPickupsCount = requests.filter(
    (r) => r.status === 'accepted' || r.status === 'completed'
  ).length;

  // Filtered requests for the My Requests tab
  const displayedRequests = useMemo(() => {
    return requests.filter((r) => {
      if (requestsSubTab === 'all') return true;
      if (requestsSubTab === 'cancelled') return r.status === 'cancelled' || r.status === 'rejected';
      return r.status === requestsSubTab;
    });
  }, [requests, requestsSubTab]);

  // Open Food Details Modal (Requirement 3)
  const handleOpenDetails = (item: FoodListing) => {
    setSelectedListing(item);
    setClaimQuantityKg(item.remainingQuantityKg);
    setClaimPortions(item.portions);
    setPickupEstimate('Within 1-2 hours');
    setClaimNotes('');
    setClaimError(null);
    setDetailsModalOpen(true);
  };

  // Adjust portions proportionally when quantity changes
  const handleQuantityChange = (val: string) => {
    const num = Number(val);
    setClaimQuantityKg(val === '' ? '' : num);
    if (selectedListing && num > 0) {
      const remaining = Number(selectedListing.remainingQuantityKg) || 1;
      const ratio = num / remaining;
      const estPortions = Math.max(1, Math.round(Number(selectedListing.portions) * ratio));
      setClaimPortions(estPortions);
    }
  };

  // Check if this NGO has already claimed this listing
  const alreadyClaimedListing = useMemo(() => {
    if (!selectedListing || !currentUser) return null;
    return requests.find(
      (r) =>
        r.listingId === selectedListing.id &&
        (r.status === 'pending' || r.status === 'accepted')
    );
  }, [selectedListing, requests, currentUser]);

  // Request Food Workflow (Requirement 4)
  const handleConfirmClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListing) return;

    // 1. Verify user is authenticated
    if (!isAuthenticated || !currentUser) {
      showNotification('warning', 'Sign In Required', 'Please sign in with your Trust / NGO credentials to request food.');
      onNavigate('login');
      return;
    }

    // 2. Verify user has requester role
    if (!isRequester && userProfile?.role !== 'admin') {
      showNotification(
        'warning',
        'NGO Access Only',
        'Food requests can only be placed by registered Charitable Trusts and NGOs. Your current role is ' +
          (userProfile?.role || 'unassigned') + '.'
      );
      return;
    }

    const reqKg = Number(claimQuantityKg);
    if (!reqKg || reqKg <= 0) {
      setClaimError('Please specify a valid food weight greater than 0 kg.');
      return;
    }

    const remainingAvailable = Number(selectedListing.remainingQuantityKg);
    if (reqKg > remainingAvailable) {
      setClaimError(
        `Requested quantity (${reqKg} kg) exceeds remaining available amount (${remainingAvailable} kg).`
      );
      return;
    }

    setSubmittingClaim(true);
    setClaimError(null);

    try {
      await requestFood({
        listingId: selectedListing.id,
        requestedQuantityKg: reqKg,
        requestedPortions: Number(claimPortions) || Math.max(1, Math.round(reqKg * 3)),
        requester: userProfile!,
        pickupTimeEstimate: pickupEstimate,
        notes: claimNotes,
        imageUrl: selectedListing.imageUrl || '',
        location: selectedListing.location,
        pickupDeadline: selectedListing.pickupDeadline,
        pickupInstructions: selectedListing.pickupInstructions || '',
        category: selectedListing.category,
        donorPhone: selectedListing.donorPhone || '',
      });

      showNotification(
        'success',
        'Food Request Submitted!',
        `Successfully requested ${reqKg} kg of ${selectedListing.foodName}. The hotel has been notified.`
      );

      setDetailsModalOpen(false);
      await loadDashboardData();
      // Switch to My Requests tab so NGO can monitor approval
      setActiveTab('my_requests');
    } catch (err: any) {
      console.error('[NGO Dashboard] Request submission failed:', err);
      const msg = err.message || 'Failed to submit food claim. Please try again.';
      setClaimError(msg);
      showNotification('error', 'Claim Failed', msg);
    } finally {
      setSubmittingClaim(false);
    }
  };

  // Cancel a Pending Request (Requirement 5)
  const handleCancelPendingRequest = async (req: FoodRequest) => {
    if (!currentUser) return;
    if (
      !window.confirm(
        `Are you sure you want to cancel the request for ${req.foodName}? The reserved food (${req.requestedQuantityKg} kg) will be returned to the hotel's available surplus.`
      )
    ) {
      return;
    }

    setActionLoadingId(req.id);
    try {
      await updateRequestStatus(req.id, 'cancelled', currentUser.uid);
      showNotification('info', 'Request Cancelled', 'Quantity restored to the hotel surplus listing.');
      await loadDashboardData();
    } catch (err: any) {
      console.error('[NGO Dashboard] Request cancellation failed:', err);
      showNotification('error', 'Cancellation Failed', err.message || 'Could not cancel request');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Mark Food Collected / Pickup Completed (Requirement 6)
  const handleMarkCollected = async (req: FoodRequest) => {
    if (!currentUser) return;
    if (
      !window.confirm(
        `Confirm that you have picked up and received ${req.requestedQuantityKg} kg of ${req.foodName} from ${req.donorOrg}?`
      )
    ) {
      return;
    }

    setActionLoadingId(req.id);
    try {
      await updateRequestStatus(req.id, 'completed', currentUser.uid);
      showNotification(
        'success',
        'Pickup Completed!',
        `Thank you for redistributing ${req.requestedQuantityKg} kg of surplus food to community shelters!`
      );
      await loadDashboardData();
    } catch (err: any) {
      console.error('[NGO Dashboard] Collection update failed:', err);
      showNotification('error', 'Update Failed', err.message || 'Could not complete pickup status');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="page-container ngo-dashboard-wrapper animate-fade-in-up">
      {/* Role Alert Notice for non-requesters */}
      {isAuthenticated && !isRequester && (
        <div className="alert alert-info flex items-center justify-between" role="alert">
          <div className="flex items-center gap-2">
            <Info size={18} />
            <span>
              You are signed in as <strong>{userProfile?.role === 'donor' ? 'Hotel / Banquet Donor' : 'Waste Recycler'}</strong>.
              Viewing the Trust & NGO Relief Portal.
            </span>
          </div>
          {isDonor && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => onNavigate('hotel-dashboard')}
            >
              Back to Hotel Panel
            </button>
          )}
          {isWastePartner && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => onNavigate('partner-dashboard')}
            >
              Back to Recycler Panel
            </button>
          )}
        </div>
      )}

      {/* Header Banner */}
      <div className="dashboard-header-flex">
        <div>
          <div className="page-header-badge">
            <HeartHandshake size={16} className="text-emerald" />
            <span>Verified Trust & NGO Portal</span>
          </div>
          <h1 className="page-title">
            {userProfile?.organizationName || 'Trust & NGO Food Relief Dashboard'}
          </h1>
          <p className="page-subtitle">
            Browse verified, safe surplus food donated by hotels and banquet halls, coordinate zero-waste pickups, and nourish local shelter communities.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Refresh database records"
          >
            <RefreshCw size={16} className={refreshing ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>

          {!isAuthenticated ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onNavigate('login')}
            >
              <LogIn size={16} />
              <span>NGO Sign In</span>
            </button>
          ) : (
            <button
              type="button"
              className={`btn ${activeTab === 'available' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('available')}
            >
              <Utensils size={16} />
              <span>Browse Surplus Food</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 SUMMARY CARDS (Requirement 1) */}
      <div className="metrics-summary-grid">
        {/* Card 1: Available Food Listings */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-emerald-light">
            <Layers size={24} className="text-emerald" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Available Food Listings</span>
            <span className="metric-value">{availableListingsCount}</span>
            <small className="metric-sub font-semibold text-emerald-700">
              Fresh surplus ready for NGO claim
            </small>
          </div>
        </div>

        {/* Card 2: Total Food Available (kg) */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-blue-light">
            <Scale size={24} className="text-blue" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Food Available</span>
            <span className="metric-value">
              {totalAvailableKg.toFixed(1)} <span className="unit">kg</span>
            </span>
            <small className="metric-sub font-semibold text-blue-700">
              ~{Math.round(totalAvailableKg * 3)} verified warm meals
            </small>
          </div>
        </div>

        {/* Card 3: My Food Requests */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-amber-light">
            <Utensils size={24} className="text-amber-600" />
          </div>
          <div className="metric-info">
            <span className="metric-label">My Food Requests</span>
            <span className="metric-value">{myRequestsCount}</span>
            <small className="metric-sub font-semibold text-amber-700">
              {requests.filter((r) => r.status === 'pending').length} awaiting hotel confirmation
            </small>
          </div>
        </div>

        {/* Card 4: Confirmed Pickups */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon" style={{ background: '#f3e8ff' }}>
            <CheckCircle2 size={24} style={{ color: '#9333ea' }} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Confirmed Pickups</span>
            <span className="metric-value" style={{ color: '#9333ea' }}>
              {confirmedPickupsCount}
            </span>
            <small className="metric-sub font-semibold" style={{ color: '#7e22ce' }}>
              Approved & completed collections
            </small>
          </div>
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="ngo-tabs-nav">
        <button
          type="button"
          className={`ngo-tab-btn ${activeTab === 'available' ? 'active' : ''}`}
          onClick={() => setActiveTab('available')}
        >
          <Utensils size={18} />
          <span>Available Food Listings</span>
          <span className="ngo-tab-badge">{availableListingsCount}</span>
        </button>

        <button
          type="button"
          className={`ngo-tab-btn ${activeTab === 'my_requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('my_requests')}
        >
          <Clock size={18} />
          <span>My Food Requests</span>
          <span className="ngo-tab-badge">{myRequestsCount}</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: AVAILABLE FOOD LISTINGS (Requirement 2)
          ========================================================================= */}
      {activeTab === 'available' && (
        <div className="flex flex-col gap-6">
          {/* Search and Filters Bar */}
          <div className="ngo-filter-bar">
            <div className="ngo-filter-row">
              {/* Search by dish name / hotel / location */}
              <div className="ngo-search-input-wrap">
                <Search size={18} className="ngo-search-icon" />
                <input
                  type="text"
                  className="ngo-search-input"
                  placeholder="Search by dish name, hotel or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Category Filter */}
              <select
                className="ngo-filter-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by food category"
              >
                <option value="all">All Food Categories</option>
                <option value="rice_pulao">🍚 Rice & Pulao</option>
                <option value="curries_dal">🍲 Curries & Dal</option>
                <option value="roti_bread">🫓 Roti & Bread</option>
                <option value="snacks_starters">🥟 Snacks & Starters</option>
                <option value="sweets_desserts">🍨 Sweets & Desserts</option>
                <option value="fruits_salad_others">🥗 Fruits & Salad</option>
                <option value="cooked_meals">🍱 Cooked Meals</option>
                <option value="bakery">🥖 Bakery & Bread</option>
                <option value="other">🍽️ Other Surplus</option>
              </select>

              {/* Location Filter */}
              <select
                className="ngo-filter-select"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                aria-label="Filter by pickup location"
              >
                <option value="all">All Pickup Locations</option>
                {uniqueLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    📍 {loc}
                  </option>
                ))}
              </select>

              {/* Dietary Filter */}
              <select
                className="ngo-filter-select"
                value={dietaryFilter}
                onChange={(e) => setDietaryFilter(e.target.value)}
                aria-label="Filter by dietary preference"
              >
                <option value="all">All Dietary Types</option>
                <option value="veg">Vegetarian (Pure Veg)</option>
                <option value="non-veg">Non-Vegetarian</option>
                <option value="vegan">Vegan</option>
              </select>

              {/* Sort By */}
              <select
                className="ngo-filter-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort listings"
              >
                <option value="deadline">⏱️ Closest Pickup Deadline</option>
                <option value="quantity">⚖️ Highest Quantity</option>
              </select>

              {/* Clear filters button */}
              {(searchQuery || categoryFilter !== 'all' || locationFilter !== 'all' || dietaryFilter !== 'all') && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setLocationFilter('all');
                    dietaryFilter !== 'all' && setDietaryFilter('all');
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* Listings Content */}
          {loading ? (
            <div className="text-center py-16">
              <div className="spinner-large" />
              <p className="mt-4 text-muted">Retrieving verified surplus food listings from Cloud Firestore...</p>
            </div>
          ) : displayedListings.length === 0 ? (
            /* Friendly Empty State (Requirement 2) */
            <div className="empty-state-card animate-fade-in-up">
              <Utensils size={52} className="text-muted" />
              <h3>No Suitable Food Listings Available</h3>
              <p>
                {searchQuery || categoryFilter !== 'all' || locationFilter !== 'all' || dietaryFilter !== 'all'
                  ? 'No available listings matched your filter criteria. Try adjusting your search query or reset the filters.'
                  : 'There are currently no hotel surplus listings marked Suitable for Donation with an active pickup deadline. As soon as hotels enter banquet surplus weights, listings will appear here.'}
              </p>
              {(searchQuery || categoryFilter !== 'all' || locationFilter !== 'all' || dietaryFilter !== 'all') ? (
                <button
                  type="button"
                  className="btn btn-outline mt-4"
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setLocationFilter('all');
                    setDietaryFilter('all');
                  }}
                >
                  Clear All Filters
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary mt-4"
                  onClick={handleManualRefresh}
                >
                  <RefreshCw size={16} /> Check for New Listings
                </button>
              )}
            </div>
          ) : (
            /* Food Cards Grid (Requirement 2) */
            <div className="ngo-listings-grid">
              {displayedListings.map((item) => {
                const deadline = getDeadlineStatus(item.pickupDeadline);
                const catMeta = CATEGORY_META[item.category] || {
                  label: item.category.replace('_', ' '),
                  icon: '🍽️',
                };
                const storageInfo = STORAGE_LABELS[item.storageCondition] || {
                  label: item.storageCondition,
                  color: '#64748b',
                };

                return (
                  <div key={item.id} className="ngo-card">
                    {/* Media wrap with Category and Safety overlay */}
                    <div className="ngo-card-image-wrap">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.foodName}
                          className="ngo-card-img"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const ph = e.currentTarget.parentElement?.querySelector('.ngo-card-img-placeholder');
                            if (ph) (ph as HTMLElement).style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="ngo-card-img-placeholder"
                        style={{ display: item.imageUrl ? 'none' : 'flex' }}
                      >
                        <span className="text-3xl mb-1">{catMeta.icon}</span>
                        <span className="font-semibold text-sm">{catMeta.label}</span>
                      </div>

                      {/* Top Left: Dietary & Category */}
                      <div className="ngo-card-badge-top-left">
                        <span className={`tag-dietary ${item.dietaryType}`}>
                          {item.dietaryType.toUpperCase()}
                        </span>
                        <span className="badge-neutral text-xs font-semibold px-2 py-0.5 rounded shadow-sm bg-white">
                          {catMeta.icon} {catMeta.label}
                        </span>
                      </div>

                      {/* Top Right: Food Safety Status (Suitable for Donation) */}
                      <div className="ngo-card-badge-top-right">
                        <span className="badge-success shadow-sm flex items-center gap-1">
                          <ShieldCheck size={13} />
                          <span>Suitable</span>
                        </span>
                      </div>

                      {/* Bottom Banner: Pickup Countdown */}
                      <div className="ngo-card-badge-bottom">
                        <span className={`countdown-badge ${deadline.urgency}`}>
                          <Clock size={12} />
                          <span>{deadline.label}</span>
                        </span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="ngo-card-body">
                      {/* Donor Hotel / Banquet Name */}
                      <div className="ngo-hotel-line">
                        <Building2 size={15} className="text-emerald" />
                        <span>{item.donorOrg || item.donorName || 'Hospitality Partner'}</span>
                      </div>

                      {/* Dish Name */}
                      <h3 className="ngo-card-title">{item.foodName}</h3>

                      {/* Available Weight and Portions */}
                      <div className="ngo-weight-pill-box">
                        <div>
                          <span className="text-xs text-muted font-bold block">Available Weight</span>
                          <span className="ngo-weight-val">
                            {item.remainingQuantityKg} kg
                            {item.recordedWeight && item.weightUnit === 'g' ? ` (${item.recordedWeight}g)` : ''}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-muted font-bold block">Estimated</span>
                          <span className="ngo-weight-portions">~{item.portions} portions</span>
                        </div>
                      </div>

                      {/* Details: Prep Time, Storage, Location */}
                      <div className="ngo-card-details-list">
                        <div className="ngo-card-detail-row">
                          <Calendar size={14} className="text-muted flex-shrink-0" />
                          <span>
                            Prepared:{' '}
                            <strong>
                              {item.prepDate || 'Today'} at {item.prepTime || 'Freshly made'}
                            </strong>
                          </span>
                        </div>

                        <div className="ngo-card-detail-row">
                          <Thermometer size={14} className="text-muted flex-shrink-0" />
                          <span className="ngo-storage-pill">
                            {storageInfo.label}
                          </span>
                        </div>

                        <div className="ngo-card-detail-row">
                          <MapPin size={14} className="text-muted flex-shrink-0" />
                          <span className="truncate" title={item.location}>
                            {item.location}
                          </span>
                        </div>
                      </div>

                      {/* Action Button: View Details & Request (Requirement 3) */}
                      <div className="ngo-card-footer">
                        <button
                          type="button"
                          className="btn btn-primary btn-block"
                          onClick={() => handleOpenDetails(item)}
                        >
                          <Utensils size={16} />
                          <span>View Details & Request</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: MY FOOD REQUESTS (Requirements 5 & 6)
          ========================================================================= */}
      {activeTab === 'my_requests' && (
        <div className="flex flex-col gap-6">
          {/* Sub-filter tabs */}
          <div className="partner-tabs-row">
            <button
              type="button"
              className={`partner-tab-btn ${requestsSubTab === 'all' ? 'active' : ''}`}
              onClick={() => setRequestsSubTab('all')}
            >
              <span>All Requests</span>
              <span className="tab-count-badge">{requests.length}</span>
            </button>

            <button
              type="button"
              className={`partner-tab-btn ${requestsSubTab === 'accepted' ? 'active' : ''}`}
              onClick={() => setRequestsSubTab('accepted')}
            >
              <span>Approved / Confirmed</span>
              <span className="tab-count-badge">
                {requests.filter((r) => r.status === 'accepted').length}
              </span>
            </button>

            <button
              type="button"
              className={`partner-tab-btn ${requestsSubTab === 'pending' ? 'active' : ''}`}
              onClick={() => setRequestsSubTab('pending')}
            >
              <span>Pending Hotel Review</span>
              <span className="tab-count-badge">
                {requests.filter((r) => r.status === 'pending').length}
              </span>
            </button>

            <button
              type="button"
              className={`partner-tab-btn ${requestsSubTab === 'completed' ? 'active' : ''}`}
              onClick={() => setRequestsSubTab('completed')}
            >
              <span>Completed Pickups</span>
              <span className="tab-count-badge">
                {requests.filter((r) => r.status === 'completed').length}
              </span>
            </button>

            <button
              type="button"
              className={`partner-tab-btn ${requestsSubTab === 'cancelled' ? 'active' : ''}`}
              onClick={() => setRequestsSubTab('cancelled')}
            >
              <span>Cancelled / Declined</span>
              <span className="tab-count-badge">
                {requests.filter((r) => r.status === 'cancelled' || r.status === 'rejected').length}
              </span>
            </button>
          </div>

          {!isAuthenticated ? (
            <div className="empty-state-card animate-fade-in-up">
              <LogIn size={48} className="text-muted" />
              <h3>Sign In to View Your Organization's Claims</h3>
              <p>Sign in with your Charitable Trust or NGO account to manage food requests, view pickup addresses, and confirm collections.</p>
              <button
                type="button"
                className="btn btn-primary mt-4"
                onClick={() => onNavigate('login')}
              >
                Sign In Now
              </button>
            </div>
          ) : loading ? (
            <div className="text-center py-16">
              <div className="spinner-large" />
              <p className="mt-4 text-muted">Loading your organization's food claims...</p>
            </div>
          ) : displayedRequests.length === 0 ? (
            <div className="empty-state-card animate-fade-in-up">
              <Clock size={48} className="text-muted" />
              <h3>No Requests in This Filter</h3>
              <p>
                {requests.length === 0
                  ? 'Your organization has not claimed any surplus food yet. Explore the surplus food listings to request available banquet meals.'
                  : 'There are no claims matching the selected filter.'}
              </p>
              <button
                type="button"
                className="btn btn-primary mt-4"
                onClick={() => setActiveTab('available')}
              >
                <Utensils size={16} /> Browse Available Surplus Food
              </button>
            </div>
          ) : (
            <div className="ngo-requests-list">
              {displayedRequests.map((req) => {
                const requestDateStr = req.createdAt?.toDate
                  ? req.createdAt.toDate().toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Recently';

                const isActionLoading = actionLoadingId === req.id;

                return (
                  <div key={req.id} className="ngo-request-card">
                    {/* Header: Food Thumbnail, Title, Donor & Status */}
                    <div className="ngo-req-header-row">
                      <div className="ngo-req-thumb-title">
                        {req.imageUrl ? (
                          <img
                            src={req.imageUrl}
                            alt={req.foodName}
                            className="ngo-req-thumb"
                          />
                        ) : (
                          <div className="ngo-req-thumb flex items-center justify-center text-2xl">
                            🍽️
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 text-xs text-muted font-bold">
                            <Building2 size={14} className="text-emerald" />
                            <span>{req.donorOrg}</span>
                            {req.donorPhone && (
                              <span className="flex items-center gap-0.5 ml-2 text-slate-500">
                                <Phone size={11} /> {req.donorPhone}
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                            {req.foodName}
                          </h3>
                        </div>
                      </div>

                      <StatusBadge status={req.status} type="request" />
                    </div>

                    {/* Request Details Grid */}
                    <div className="ngo-req-body-grid">
                      <div>
                        <span className="text-xs text-muted block font-semibold">Quantity Claimed</span>
                        <strong className="text-base text-slate-900">
                          {req.requestedQuantityKg} kg
                        </strong>
                        <span className="text-xs text-muted ml-1">
                          (~{req.requestedPortions} portions)
                        </span>
                      </div>

                      <div>
                        <span className="text-xs text-muted block font-semibold">Requested On</span>
                        <strong>{requestDateStr}</strong>
                      </div>

                      <div>
                        <span className="text-xs text-muted block font-semibold">Estimated Pickup Time</span>
                        <strong>{req.pickupTimeEstimate || 'Flexible'}</strong>
                      </div>

                      {req.pickupDeadline && (
                        <div>
                          <span className="text-xs text-muted block font-semibold">Pickup Deadline</span>
                          <strong className="text-amber-700">
                            {new Date(req.pickupDeadline).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* Pickup Address & Special Instructions */}
                    {req.location && (
                      <div className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <MapPin size={16} className="text-emerald mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Collection Address:</strong> {req.location}
                        </div>
                      </div>
                    )}

                    {req.pickupInstructions && (
                      <div className="ngo-pickup-instructions-box">
                        <strong>Chef & Hotel Instructions:</strong> {req.pickupInstructions}
                      </div>
                    )}

                    {req.notes && (
                      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
                        <strong>Your Organization Notes:</strong> {req.notes}
                      </div>
                    )}

                    {/* Status Highlights & Action Buttons (Requirements 5 & 6) */}
                    <div className="ngo-req-footer-row">
                      {req.status === 'pending' && (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
                            <Clock size={14} />
                            <span>Awaiting hotel kitchen supervisor confirmation...</span>
                          </div>

                          {/* Cancel Pending Request Button */}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleCancelPendingRequest(req)}
                            disabled={isActionLoading}
                          >
                            <XCircle size={14} />
                            <span>Cancel Request</span>
                          </button>
                        </>
                      )}

                      {req.status === 'accepted' && (
                        <>
                          <div className="badge-approved-pickup">
                            <CheckCircle2 size={16} />
                            <span>Approved! Ready for collection at hotel premises.</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Cancel accepted button */}
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleCancelPendingRequest(req)}
                              disabled={isActionLoading}
                              title="Cancel pickup and release food"
                            >
                              Cancel
                            </button>

                            {/* Mark Collected Button */}
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleMarkCollected(req)}
                              disabled={isActionLoading}
                            >
                              <Check size={14} />
                              <span>Mark Food Collected</span>
                            </button>
                          </div>
                        </>
                      )}

                      {req.status === 'completed' && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200">
                          <CheckCircle2 size={15} className="text-emerald" />
                          <span>Food Successfully Collected & Distributed to Community (Completed)</span>
                        </div>
                      )}

                      {req.status === 'rejected' && (
                        <div className="flex items-center gap-1.5 text-xs text-red-700 font-medium bg-red-50 px-3 py-1.5 rounded-md border border-red-200">
                          <XCircle size={14} />
                          <span>Hotel was unable to fulfill this claim.</span>
                        </div>
                      )}

                      {req.status === 'cancelled' && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <span>Request was cancelled.</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          FOOD DETAILS & REQUEST MODAL (Requirements 3 & 4)
          ========================================================================= */}
      {detailsModalOpen && selectedListing && (
        <Modal
          isOpen={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          title={`Food Details: ${selectedListing.foodName}`}
          maxWidth="640px"
        >
          <div className="ngo-modal-detail-grid">
            {/* Hero Image */}
            <div className="ngo-modal-hero">
              {selectedListing.imageUrl ? (
                <img
                  src={selectedListing.imageUrl}
                  alt={selectedListing.foodName}
                />
              ) : (
                <div className="ngo-card-img-placeholder">
                  <span className="text-4xl mb-1">
                    {CATEGORY_META[selectedListing.category]?.icon || '🍽️'}
                  </span>
                  <span className="font-bold text-slate-600">
                    {CATEGORY_META[selectedListing.category]?.label || 'Surplus Food'}
                  </span>
                </div>
              )}
              <div className="ngo-card-badge-top-left">
                <span className={`tag-dietary ${selectedListing.dietaryType}`}>
                  {selectedListing.dietaryType.toUpperCase()}
                </span>
                <span className="badge-success shadow-sm flex items-center gap-1">
                  <ShieldCheck size={13} />
                  <span>Certified Suitable for Donation</span>
                </span>
              </div>
            </div>

            {/* Title & Donor Info */}
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-600 font-bold mb-1">
                <Building2 size={16} className="text-emerald" />
                <span>{selectedListing.donorOrg || selectedListing.donorName}</span>
                {selectedListing.donorPhone && (
                  <span className="flex items-center gap-1 text-slate-500 ml-2">
                    <Phone size={12} /> {selectedListing.donorPhone}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900">
                {selectedListing.foodName}
              </h2>
            </div>

            {/* Spec Matrix */}
            <div className="ngo-modal-info-grid">
              <div className="ngo-modal-info-item">
                <span className="ngo-modal-info-label">Available Surplus</span>
                <span className="ngo-modal-info-val text-emerald-700">
                  {selectedListing.remainingQuantityKg} kg
                </span>
                <small className="text-xs text-muted">~{selectedListing.portions} portions</small>
              </div>

              <div className="ngo-modal-info-item">
                <span className="ngo-modal-info-label">Pickup Deadline</span>
                <span className="ngo-modal-info-val text-amber-700">
                  {getDeadlineStatus(selectedListing.pickupDeadline).label}
                </span>
                <small className="text-xs text-muted">
                  {new Date(selectedListing.pickupDeadline).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              </div>

              <div className="ngo-modal-info-item">
                <span className="ngo-modal-info-label">Storage Condition</span>
                <span className="ngo-modal-info-val text-blue-700">
                  {STORAGE_LABELS[selectedListing.storageCondition]?.label || selectedListing.storageCondition}
                </span>
              </div>

              <div className="ngo-modal-info-item">
                <span className="ngo-modal-info-label">Preparation Time</span>
                <span className="ngo-modal-info-val text-slate-800">
                  {selectedListing.prepDate || 'Today'} • {selectedListing.prepTime}
                </span>
              </div>
            </div>

            {/* Location Address */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm">
              <div className="flex items-start gap-2">
                <MapPin size={18} className="text-emerald flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-900">Pickup Address:</strong>
                  <span className="text-slate-700">{selectedListing.location}</span>
                </div>
              </div>
            </div>

            {/* Chef / Collection Instructions */}
            {selectedListing.pickupInstructions && (
              <div className="ngo-pickup-instructions-box">
                <strong>Collection Instructions:</strong> {selectedListing.pickupInstructions}
              </div>
            )}

            {/* Description if available */}
            {selectedListing.description && (
              <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                <strong>Description:</strong> {selectedListing.description}
              </div>
            )}

            {/* REQUEST FOOD FORM (Requirement 4) */}
            {alreadyClaimedListing ? (
              <div className="alert alert-info flex items-center justify-between" role="alert">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} />
                  <span>
                    Your organization already has an active claim (
                    <strong>{alreadyClaimedListing.status.toUpperCase()}</strong>) for {alreadyClaimedListing.requestedQuantityKg} kg of this food.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setDetailsModalOpen(false);
                    setActiveTab('my_requests');
                  }}
                >
                  View in My Requests
                </button>
              </div>
            ) : (
              <form onSubmit={handleConfirmClaim} className="ngo-claim-form-box">
                <div className="ngo-claim-form-title">
                  <Utensils size={18} className="text-emerald" />
                  <span>Request Food for Community Distribution</span>
                </div>

                {claimError && (
                  <div className="alert alert-danger text-sm flex items-center gap-2" role="alert">
                    <AlertCircle size={16} />
                    <span>{claimError}</span>
                  </div>
                )}

                {/* Requested Quantity Input */}
                <div className="form-row-2 gap-4">
                  <div className="form-group">
                    <label className="form-label font-bold text-slate-800">
                      Quantity to Claim (kg) *
                    </label>
                    <div className="input-with-icon">
                      <Scale size={16} className="input-icon" />
                      <input
                        type="number"
                        className="form-control"
                        step="0.1"
                        min="0.1"
                        max={selectedListing.remainingQuantityKg}
                        value={claimQuantityKg}
                        onChange={(e) => handleQuantityChange(e.target.value)}
                        required
                      />
                    </div>
                    <small className="text-xs text-muted mt-1 block">
                      Max available: {selectedListing.remainingQuantityKg} kg
                    </small>
                  </div>

                  <div className="form-group">
                    <label className="form-label font-bold text-slate-800">
                      Estimated Portions
                    </label>
                    <div className="input-with-icon">
                      <Users size={16} className="input-icon" />
                      <input
                        type="number"
                        className="form-control"
                        min="1"
                        value={claimPortions}
                        onChange={(e) => setClaimPortions(Number(e.target.value))}
                        required
                      />
                    </div>
                    <small className="text-xs text-muted mt-1 block">
                      Beneficiaries to be nourished
                    </small>
                  </div>
                </div>

                {/* Pickup Time Estimate */}
                <div className="form-group">
                  <label className="form-label font-bold text-slate-800">
                    Estimated Pickup Time / Arrival Window *
                  </label>
                  <select
                    className="form-control"
                    value={pickupEstimate}
                    onChange={(e) => setPickupEstimate(e.target.value)}
                    required
                  >
                    <option value="Within 30-45 minutes">Within 30-45 minutes (Immediate Volunteer)</option>
                    <option value="Within 1-2 hours">Within 1-2 hours</option>
                    <option value="Within 3 hours">Within 3 hours (Before Deadline)</option>
                    <option value="Today Evening">Today Evening</option>
                  </select>
                </div>

                {/* Organization Remarks / Vehicle Info */}
                <div className="form-group">
                  <label className="form-label font-semibold text-slate-800">
                    Collection Remarks / Vehicle Details (Optional)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Arriving with insulated containers in white van"
                    value={claimNotes}
                    onChange={(e) => setClaimNotes(e.target.value)}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 mt-2">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setDetailsModalOpen(false)}
                    disabled={submittingClaim}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submittingClaim || !claimQuantityKg || Number(claimQuantityKg) <= 0}
                  >
                    {submittingClaim ? (
                      <>
                        <div className="spinner-small" />
                        <span>Securing Request...</span>
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>Submit Food Request</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
