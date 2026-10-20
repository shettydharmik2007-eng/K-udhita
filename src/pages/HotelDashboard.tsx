import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { db, isFirebaseConfigured } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
  getFoodListings,
  getFoodRequests,
  updateRequestStatus,
  updateFoodListing,
  transferListingToWaste,
  formatTimestamp,
  parsePickupDeadlineMs,
  isListingExpired,
} from '../services/foodService';
import {
  getWasteCollections,
  updateWasteCollectionWorkflow,
} from '../services/wasteService';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import type {
  FoodListing,
  FoodRequest,
  FoodRequestStatus,
  WasteCategory,
  WasteCollection,
} from '../types';
import {
  Building2,
  PlusCircle,
  Clock,
  MapPin,
  Scale,
  Edit,
  Recycle,
  CheckCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Calendar,
  Layers,
  Thermometer,
  HeartHandshake,
  X,
  AlertTriangle,
  Truck,
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
  const { currentUser, userProfile } = useAuth();
  const { showNotification } = useNotification();

  const [listings, setListings] = useState<FoodListing[]>([]);
  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const [wasteCollections, setWasteCollections] = useState<WasteCollection[]>([]);
  const [loading, setLoading] = useState(isFirebaseConfigured && !!currentUser);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [updatingWasteId, setUpdatingWasteId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

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

  const loadData = useCallback(async () => {
    if (!currentUser || !isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const [listingsData, requestsData, wasteData] = await Promise.all([
        getFoodListings({ donorId: currentUser.uid }),
        getFoodRequests({ donorId: currentUser.uid }),
        getWasteCollections({ donorId: currentUser.uid }),
      ]);
      setListings(listingsData);
      setRequests(requestsData);
      setWasteCollections(wasteData);
    } catch (err: any) {
      console.error('Failed to load hotel dashboard data:', err);
      showNotification('error', 'Data Load Error', err.message || 'Could not fetch hotel records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, showNotification]);

  useEffect(() => {
    if (!currentUser || !isFirebaseConfigured) return;

    // 1. Initial full fetch
    loadData();

    // 2. Real-time Firestore subscription for donor's reservations & pickups
    if (!db) return;
    const reqQuery = query(
      collection(db, 'foodRequests'),
      where('donorId', '==', currentUser.uid)
    );

    const unsubscribeReq = onSnapshot(
      reqQuery,
      (snapshot) => {
        const liveRequests: FoodRequest[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FoodRequest, 'id'>),
        }));
        liveRequests.sort((a, b) => {
          const tA = a.createdAt?.toDate?.()?.getTime?.() || new Date(a.createdAt).getTime() || 0;
          const tB = b.createdAt?.toDate?.()?.getTime?.() || new Date(b.createdAt).getTime() || 0;
          return tB - tA;
        });
        setRequests(liveRequests);
      },
      (err) => {
        console.warn('Real-time donor requests sync warning:', err);
      }
    );

    // 3. Real-time Firestore subscription for donor's waste collection requests
    const wasteQuery = query(
      collection(db, 'wasteCollections'),
      where('donorId', '==', currentUser.uid)
    );

    const unsubscribeWaste = onSnapshot(
      wasteQuery,
      (snapshot) => {
        const liveWaste: WasteCollection[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<WasteCollection, 'id'>),
        }));
        liveWaste.sort((a, b) => {
          const tA = a.createdAt?.toDate?.()?.getTime?.() || new Date(a.createdAt).getTime() || 0;
          const tB = b.createdAt?.toDate?.()?.getTime?.() || new Date(b.createdAt).getTime() || 0;
          return tB - tA;
        });
        setWasteCollections(liveWaste);
      },
      (err) => {
        console.warn('Real-time donor waste collections sync warning:', err);
      }
    );

    return () => {
      unsubscribeReq();
      unsubscribeWaste();
    };
  }, [currentUser, loadData]);

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

  // Request action loading state (prevents duplicate clicks)
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);

  // Helper to calculate countdown and overdue status
  const getDeadlineStatus = (pickupDeadline?: any) => {
    if (!pickupDeadline) {
      return { isOverdue: false, label: 'Flexible', urgency: 'normal' as const };
    }
    const deadlineTime = parsePickupDeadlineMs(pickupDeadline);
    if (isNaN(deadlineTime)) {
      return { isOverdue: false, label: String(pickupDeadline), urgency: 'normal' as const };
    }

    const diffMs = deadlineTime - currentTime;
    const diffMinutes = Math.round(diffMs / (1000 * 60));

    if (diffMinutes <= 0) {
      return {
        isOverdue: true,
        label: `Overdue (Expired ${formatTimestamp(pickupDeadline)})`,
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

  // Request status management (Mark as picked up, accept, reject)
  const handleUpdateReqStatus = async (
    requestId: string,
    newStatus: FoodRequestStatus
  ) => {
    if (!currentUser) return;
    if (updatingRequestId) return; // Prevent concurrent or duplicate actions

    setUpdatingRequestId(requestId);

    try {
      await updateRequestStatus(requestId, newStatus, currentUser.uid);
      const actionMsg =
        newStatus === 'completed'
          ? 'Food pickup confirmed! Handover complete.'
          : newStatus === 'accepted'
          ? 'Request accepted. Ready for NGO pickup.'
          : 'Request updated.';
      showNotification('success', 'Status Updated', actionMsg);
      await loadData();
    } catch (err: any) {
      console.error('Failed to update request:', err);
      showNotification('error', 'Action Failed', err.message || 'Failed to update request status');
      await loadData();
    } finally {
      setUpdatingRequestId(null);
    }
  };

  // Waste collection request status management (Accept or Reject collection requests)
  const handleUpdateWasteCollectionStatus = async (
    collectionId: string,
    newStatus: 'accepted' | 'rejected'
  ) => {
    if (!currentUser) return;
    if (updatingWasteId) return; // Prevent concurrent or duplicate actions

    setUpdatingWasteId(collectionId);

    try {
      await updateWasteCollectionWorkflow(
        collectionId,
        { status: newStatus },
        currentUser.uid
      );
      const actionMsg =
        newStatus === 'accepted'
          ? 'Recycling collection request accepted! Partner notified for pickup.'
          : 'Recycling collection request rejected.';
      showNotification('success', 'Status Updated', actionMsg);
      await loadData();
    } catch (err: any) {
      console.error('Failed to update waste collection status:', err);
      showNotification('error', 'Action Failed', err.message || 'Failed to update collection request status');
      await loadData();
    } finally {
      setUpdatingWasteId(null);
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

  const activeReservations = useMemo(
    () => requests.filter((r) => r.status === 'pending' || r.status === 'accepted'),
    [requests]
  );

  const completedPickups = useMemo(
    () => requests.filter((r) => r.status === 'completed'),
    [requests]
  );

  const donatedKgFromRequests = completedPickups.reduce(
    (acc, r) => acc + (Number(r.requestedQuantityKg) || 0),
    0
  );

  const completedListingsKg = listings
    .filter((l) => l.status === 'completed')
    .reduce((acc, l) => acc + (Number(l.initialQuantityKg) || 0), 0);

  const totalDonatedKg = Math.max(donatedKgFromRequests, completedListingsKg);

  const awaitingCollectionCount =
    activeReservations.length + listings.filter((l) => l.status === 'reserved').length;

  const pendingWasteRequests = useMemo(
    () => wasteCollections.filter((w) => w.status === 'collection_requested'),
    [wasteCollections]
  );

  const activeWasteCollections = useMemo(
    () =>
      wasteCollections.filter(
        (w) =>
          w.status === 'collection_requested' ||
          w.status === 'accepted' ||
          w.status === 'collected' ||
          w.status === 'processing'
      ),
    [wasteCollections]
  );

  const historyWasteCollections = useMemo(
    () =>
      wasteCollections.filter(
        (w) =>
          w.status === 'processed' ||
          w.status === 'completed' ||
          w.status === 'rejected' ||
          w.status === 'cancelled'
      ),
    [wasteCollections]
  );

  // Filter listings by tab & search query
  const filteredListings = listings.filter((item) => {
    const isOverdue = isListingExpired(item, currentTime) && item.status === 'available';

    let matchesTab = true;
    if (activeTab === 'available') matchesTab = item.status === 'available' && !isOverdue;
    else if (activeTab === 'reserved') {
      const hasActiveClaims = requests.some(
        (r) => r.listingId === item.id && (r.status === 'pending' || r.status === 'accepted')
      );
      matchesTab = item.status === 'reserved' || hasActiveClaims;
    }
    else if (activeTab === 'overdue') matchesTab = isOverdue || item.status === 'overdue' || item.foodCondition === 'requires_review';
    else if (activeTab === 'completed') matchesTab = item.status === 'completed';
    else if (activeTab === 'transferred_to_waste') {
      const hasWasteRecord = wasteCollections.some(
        (w) => w.sourceListingId === item.id && w.status !== 'cancelled' && w.status !== 'rejected'
      );
      matchesTab = item.status === 'transferred_to_waste' || hasWasteRecord;
    }

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

      {/* Pending Waste Requests Attention Banner */}
      {pendingWasteRequests.length > 0 && (
        <div className="alert alert-warning my-6 flex items-center justify-between p-4 bg-amber-50 border border-amber-300 rounded-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-600 shrink-0" size={22} />
            <div>
              <strong className="text-amber-900 text-sm">
                {pendingWasteRequests.length} Waste Collection Request{pendingWasteRequests.length > 1 ? 's' : ''} Awaiting Approval:
              </strong>
              <p className="text-xs text-amber-800 mt-0.5">
                Certified recycling partners have requested surplus or expired food batches for bio-conversion.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary whitespace-nowrap text-xs"
            onClick={() => {
              setActiveTab('transferred_to_waste');
              window.scrollTo({ top: 400, behavior: 'smooth' });
            }}
          >
            Review & Respond
          </button>
        </div>
      )}

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
              {awaitingCollectionCount}
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
              {listings.filter((l) => l.status === 'completed').length + completedPickups.length}
            </span>
          </button>

          <button
            type="button"
            className={`hotel-tab-btn ${activeTab === 'transferred_to_waste' ? 'active' : ''}`}
            onClick={() => setActiveTab('transferred_to_waste')}
          >
            <span>Routed to Waste</span>
            <span className="badge-pill-count">
              {listings.filter((l) => l.status === 'transferred_to_waste').length + activeWasteCollections.length}
            </span>
          </button>
        </div>

        {/* Prominently render Active Community Reservations when Awaiting Pickup tab is active */}
        {activeTab === 'reserved' && (
          <div className="mb-8 p-5 bg-white border-2 border-emerald-500/30 shadow-md rounded-2xl animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Clock size={22} className="text-emerald" />
                  <span>NGO Surplus Claims Awaiting Handover</span>
                </h3>
                <p className="text-sm text-slate-600 mt-0.5">
                  Confirm physical pickup when verified NGO volunteers arrive at your hotel kitchen or banquet loading bay.
                </p>
              </div>
              <span className="badge-pill-count text-sm px-3 py-1 bg-emerald-100 text-emerald-800 font-bold">
                {activeReservations.length} Pending Handover
              </span>
            </div>

            {activeReservations.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-600 font-medium">No pending NGO claims right now. When an NGO requests portions of your food, it will immediately appear here with NGO details and a &quot;Mark as Picked Up&quot; button.</p>
              </div>
            ) : (
              <div className="requests-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Food Item</th>
                      <th>NGO / Trust Name</th>
                      <th>Reserved Quantity</th>
                      <th>Request Date</th>
                      <th>Status</th>
                      <th>Confirm Pickup Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeReservations.map((req) => (
                      <tr key={req.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            {req.imageUrl ? (
                              <img
                                src={req.imageUrl}
                                alt={req.foodName}
                                className="w-10 h-10 object-cover rounded shadow-sm flex-shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-lg flex-shrink-0">
                                🍽️
                              </div>
                            )}
                            <div>
                              <strong>{req.foodName}</strong>
                              <div className="text-muted text-xs">
                                Est: {req.pickupTimeEstimate || 'Within window'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong>{req.requesterOrg || req.requesterName || 'Community Trust'}</strong>
                            <div className="text-muted text-xs">
                              {req.requesterName} {req.requesterPhone ? `• ${req.requesterPhone}` : ''}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge-qty font-bold text-slate-900">{req.requestedQuantityKg} kg</span>
                          <small className="d-block text-muted">~{req.requestedPortions} portions</small>
                        </td>
                        <td>
                          <span className="text-xs text-slate-700">
                            {formatTimestamp(req.createdAt)}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={req.status} type="request" />
                        </td>
                        <td>
                          <div className="action-button-group flex items-center gap-1.5">
                            {req.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success"
                                  disabled={updatingRequestId === req.id}
                                  onClick={() => handleUpdateReqStatus(req.id, 'accepted')}
                                  title="Accept claim and hold portions"
                                >
                                  <CheckCircle size={14} /> Accept
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  disabled={updatingRequestId === req.id}
                                  onClick={() => handleUpdateReqStatus(req.id, 'rejected')}
                                  title="Decline claim"
                                >
                                  <XCircle size={14} /> Reject
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              className="btn btn-sm btn-primary flex items-center gap-1.5 font-bold shadow-sm"
                              disabled={updatingRequestId === req.id}
                              onClick={() => handleUpdateReqStatus(req.id, 'completed')}
                              title="Click to confirm physical collection by NGO volunteer"
                            >
                              {updatingRequestId === req.id ? (
                                <>
                                  <div className="spinner-small" />
                                  <span>Confirming...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={15} />
                                  <span>Mark as Picked Up</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Prominently render Waste Collection Requests when Routed to Waste tab is active */}
        {activeTab === 'transferred_to_waste' && (
          <div className="mb-8 p-5 bg-white border-2 border-emerald-600/30 shadow-md rounded-2xl animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Recycle size={22} className="text-emerald" />
                  <span>Waste Partner Organic Recycling Requests</span>
                </h3>
                <p className="text-sm text-slate-600 mt-0.5">
                  Review and accept or reject collection requests from certified bio-composting and biogas recycling partners.
                </p>
              </div>
              <span className="badge-pill-count text-sm px-3 py-1 bg-emerald-100 text-emerald-800 font-bold">
                {activeWasteCollections.length} Collection Records
              </span>
            </div>

            {activeWasteCollections.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-600 font-medium">
                  No active collection requests from waste partners right now. When a certified recycler requests to collect surplus or expired batches, their requests will appear here with Accept and Reject buttons.
                </p>
              </div>
            ) : (
              <div className="requests-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Food Item</th>
                      <th>Waste Partner</th>
                      <th>Remaining / Requested Qty</th>
                      <th>Request Date</th>
                      <th>Status</th>
                      <th>Hotel Decision / Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeWasteCollections.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            {w.imageUrl ? (
                              <img
                                src={w.imageUrl}
                                alt={w.foodName}
                                className="w-10 h-10 object-cover rounded shadow-sm flex-shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-lg flex-shrink-0">
                                ♻️
                              </div>
                            )}
                            <div>
                              <strong>{w.foodName}</strong>
                              <div className="text-muted text-xs">
                                Category: {w.category?.replace('_', ' ')}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong>{w.partnerOrg || w.partnerName || 'Certified Recycler'}</strong>
                            <div className="text-muted text-xs">
                              {w.partnerName} {w.partnerPhone ? `• ${w.partnerPhone}` : ''}
                            </div>
                            {w.partnerType && (
                              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                {w.partnerType.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="badge-qty font-bold text-slate-900">{w.quantityKg} kg</span>
                          {w.actualCollectedKg ? (
                            <small className="d-block text-emerald-700 font-semibold">
                              Weighed: {w.actualCollectedKg} kg
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <span className="text-xs text-slate-700">
                            {formatTimestamp(w.createdAt)}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={w.status} type="waste" />
                        </td>
                        <td>
                          {w.status === 'collection_requested' ? (
                            <div className="action-button-group flex items-center gap-1.5">
                              <button
                                type="button"
                                className="btn btn-sm btn-success flex items-center gap-1 font-bold shadow-xs"
                                disabled={updatingWasteId === w.id}
                                onClick={() => handleUpdateWasteCollectionStatus(w.id, 'accepted')}
                                title="Accept collection request from recycling partner"
                              >
                                {updatingWasteId === w.id ? (
                                  <span className="spinner-small" />
                                ) : (
                                  <CheckCircle size={14} />
                                )}
                                <span>Accept</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger flex items-center gap-1 font-bold"
                                disabled={updatingWasteId === w.id}
                                onClick={() => handleUpdateWasteCollectionStatus(w.id, 'rejected')}
                                title="Decline collection request"
                              >
                                {updatingWasteId === w.id ? (
                                  <span className="spinner-small" />
                                ) : (
                                  <XCircle size={14} />
                                )}
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : w.status === 'accepted' ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                              <CheckCircle2 size={14} className="text-emerald" />
                              <span>Accepted • Awaiting Pickup</span>
                            </div>
                          ) : w.status === 'collected' ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200">
                              <Truck size={14} className="text-blue-600" />
                              <span>Collected by Recycler</span>
                            </div>
                          ) : w.status === 'processing' ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                              <RefreshCw size={14} className="text-amber-600 spin-icon" />
                              <span>In Bio-Conversion</span>
                            </div>
                          ) : (
                            <div className="text-xs text-muted">
                              {w.status.replace('_', ' ')}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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

                    {/* Active NGO Reservations on this listing */}
                    {(() => {
                      const itemActiveClaims = requests.filter(
                        (r) => r.listingId === item.id && (r.status === 'pending' || r.status === 'accepted')
                      );
                      if (itemActiveClaims.length === 0) return null;
                      return (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 my-2">
                          <div className="text-xs font-bold text-emerald-900 flex items-center justify-between mb-1.5">
                            <span className="flex items-center gap-1">
                              <Clock size={13} className="text-emerald" />
                              <span>Reserved by NGO</span>
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-800">
                              {itemActiveClaims.reduce((s, c) => s + c.requestedQuantityKg, 0)} kg total
                            </span>
                          </div>
                          {itemActiveClaims.map((claim) => (
                            <div
                              key={claim.id}
                              className="flex items-center justify-between text-xs py-1.5 border-t border-emerald-100 first:border-0"
                            >
                              <div className="truncate mr-2">
                                <span className="font-bold text-slate-900">
                                  {claim.requesterOrg || claim.requesterName || 'NGO Partner'}
                                </span>
                                <span className="text-slate-600 font-semibold ml-1">
                                  ({claim.requestedQuantityKg} kg)
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn btn-xs btn-primary font-bold flex items-center gap-1 shadow-xs shrink-0"
                                disabled={updatingRequestId === claim.id}
                                onClick={() => handleUpdateReqStatus(claim.id, 'completed')}
                                title="Confirm physical handover to NGO"
                              >
                                {updatingRequestId === claim.id ? (
                                  <span>...</span>
                                ) : (
                                  <>
                                    <CheckCircle2 size={12} />
                                    <span>Mark as Picked Up</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Active Waste Recycling Requests on this listing */}
                    {(() => {
                      const itemWaste = wasteCollections.filter(
                        (w) =>
                          w.sourceListingId === item.id &&
                          w.status !== 'cancelled' &&
                          w.status !== 'rejected' &&
                          w.status !== 'processed' &&
                          w.status !== 'completed'
                      );
                      if (itemWaste.length === 0) return null;
                      return (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 my-2">
                          <div className="text-xs font-bold text-amber-900 flex items-center justify-between mb-1.5">
                            <span className="flex items-center gap-1">
                              <Recycle size={13} className="text-emerald-700" />
                              <span>Recycling Partner Request</span>
                            </span>
                            <span className="text-[11px] font-semibold text-amber-800">
                              {itemWaste.reduce((s, w) => s + w.quantityKg, 0)} kg total
                            </span>
                          </div>
                          {itemWaste.map((w) => (
                            <div
                              key={w.id}
                              className="flex items-center justify-between text-xs py-1.5 border-t border-amber-100 first:border-0"
                            >
                              <div className="truncate mr-2">
                                <span className="font-bold text-slate-900">
                                  {w.partnerOrg || w.partnerName || 'Recycler'}
                                </span>
                                <span className="text-slate-600 font-semibold ml-1">
                                  ({w.quantityKg} kg)
                                </span>
                                <div className="text-[11px] text-muted">
                                  Status: <strong className="capitalize text-slate-700">{w.status.replace('_', ' ')}</strong>
                                </div>
                              </div>
                              {w.status === 'collection_requested' ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    className="btn btn-xs btn-success font-bold flex items-center gap-1 shadow-xs"
                                    disabled={updatingWasteId === w.id}
                                    onClick={() => handleUpdateWasteCollectionStatus(w.id, 'accepted')}
                                    title="Accept collection request"
                                  >
                                    <CheckCircle size={12} /> Accept
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-xs btn-outline-danger font-bold flex items-center gap-1 shadow-xs"
                                    disabled={updatingWasteId === w.id}
                                    onClick={() => handleUpdateWasteCollectionStatus(w.id, 'rejected')}
                                    title="Reject collection request"
                                  >
                                    <XCircle size={12} /> Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  {w.status === 'accepted' ? 'Accepted' : w.status.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

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

      {/* Section 1: Active Community Reservations (Requirement 2) */}
      <div className="dashboard-section mt-12">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Clock size={20} className="text-emerald" />
              <span>Active Community Reservations</span>
            </h2>
            <p className="section-desc">
              Pending claims and scheduled pickups awaiting physical handover to verified NGOs and charitable trusts.
            </p>
          </div>
        </div>

        {requests.filter((r) => r.status === 'pending' || r.status === 'accepted').length === 0 ? (
          <div className="empty-sub-card">
            <p>No active reservations awaiting pickup right now. New claims submitted by NGOs will appear here.</p>
          </div>
        ) : (
          <div className="requests-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Food Item</th>
                  <th>NGO / Organization</th>
                  <th>Reserved Quantity</th>
                  <th>Request Date</th>
                  <th>Reservation Status</th>
                  <th>Confirm Physical Handover</th>
                </tr>
              </thead>
              <tbody>
                {requests
                  .filter((r) => r.status === 'pending' || r.status === 'accepted')
                  .map((req) => (
                    <tr key={req.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          {req.imageUrl ? (
                            <img
                              src={req.imageUrl}
                              alt={req.foodName}
                              className="w-10 h-10 object-cover rounded shadow-sm flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-lg flex-shrink-0">
                              🍽️
                            </div>
                          )}
                          <div>
                            <strong>{req.foodName}</strong>
                            <div className="text-muted text-xs">
                              Est: {req.pickupTimeEstimate || 'Within window'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>
                          <strong>{req.requesterOrg || req.requesterName || 'Community Trust'}</strong>
                          <div className="text-muted text-xs">
                            {req.requesterName} {req.requesterPhone ? `• ${req.requesterPhone}` : ''}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge-qty">{req.requestedQuantityKg} kg</span>
                        <small className="d-block text-muted">~{req.requestedPortions} portions</small>
                      </td>
                      <td>
                        <span className="text-xs text-slate-700">
                          {formatTimestamp(req.createdAt)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={req.status} type="request" />
                      </td>
                      <td>
                        <div className="action-button-group flex items-center gap-1.5">
                          {req.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-success"
                                disabled={updatingRequestId === req.id}
                                onClick={() => handleUpdateReqStatus(req.id, 'accepted')}
                                title="Accept request and hold quantity"
                              >
                                <CheckCircle size={14} /> Accept
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                disabled={updatingRequestId === req.id}
                                onClick={() => handleUpdateReqStatus(req.id, 'rejected')}
                                title="Decline request and release food"
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </>
                          )}

                          {/* Clear Mark as Picked Up Button (Requirement 2) */}
                          <button
                            type="button"
                            className="btn btn-sm btn-primary flex items-center gap-1 font-semibold"
                            disabled={updatingRequestId === req.id}
                            onClick={() => handleUpdateReqStatus(req.id, 'completed')}
                            title="Confirm physical collection by NGO"
                          >
                            {updatingRequestId === req.id ? (
                              <>
                                <div className="spinner-small" />
                                <span>Confirming...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={14} />
                                <span>Mark as Picked Up</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 1B: Waste Partner Collection Requests (Requirement 2 & 3) */}
      <div className="dashboard-section mt-12">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Recycle size={20} className="text-emerald" />
              <span>Waste Partner Collection Requests</span>
            </h2>
            <p className="section-desc">
              Review and accept or reject collection requests from certified bio-composting and biogas recycling partners.
            </p>
          </div>
          {pendingWasteRequests.length > 0 && (
            <span className="badge-pill-count text-sm px-3 py-1 bg-amber-100 text-amber-900 font-bold">
              {pendingWasteRequests.length} Pending Approval
            </span>
          )}
        </div>

        {activeWasteCollections.length === 0 ? (
          <div className="empty-sub-card">
            <p>
              No active collection requests from organic waste partners right now. When a recycling partner requests to collect surplus or expired food, it will appear here with Accept and Reject buttons.
            </p>
          </div>
        ) : (
          <div className="requests-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Food Item</th>
                  <th>Waste Partner</th>
                  <th>Remaining / Requested Qty</th>
                  <th>Request Date</th>
                  <th>Status</th>
                  <th>Hotel Decision / Action</th>
                </tr>
              </thead>
              <tbody>
                {activeWasteCollections.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {w.imageUrl ? (
                          <img
                            src={w.imageUrl}
                            alt={w.foodName}
                            className="w-10 h-10 object-cover rounded shadow-sm flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-lg flex-shrink-0">
                            ♻️
                          </div>
                        )}
                        <div>
                          <strong>{w.foodName}</strong>
                          <div className="text-muted text-xs">
                            Category: {w.category?.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{w.partnerOrg || w.partnerName || 'Certified Recycler'}</strong>
                        <div className="text-muted text-xs">
                          {w.partnerName} {w.partnerPhone ? `• ${w.partnerPhone}` : ''}
                        </div>
                        {w.partnerType && (
                          <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {w.partnerType.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge-qty font-bold text-slate-900">{w.quantityKg} kg</span>
                      {w.actualCollectedKg ? (
                        <small className="d-block text-emerald-700 font-semibold">
                          Weighed: {w.actualCollectedKg} kg
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <span className="text-xs text-slate-700">
                        {formatTimestamp(w.createdAt)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={w.status} type="waste" />
                    </td>
                    <td>
                      {w.status === 'collection_requested' ? (
                        <div className="action-button-group flex items-center gap-1.5">
                          <button
                            type="button"
                            className="btn btn-sm btn-success flex items-center gap-1 font-bold shadow-xs"
                            disabled={updatingWasteId === w.id}
                            onClick={() => handleUpdateWasteCollectionStatus(w.id, 'accepted')}
                            title="Accept collection request from recycling partner"
                          >
                            {updatingWasteId === w.id ? (
                              <span className="spinner-small" />
                            ) : (
                              <CheckCircle size={14} />
                            )}
                            <span>Accept</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger flex items-center gap-1 font-bold"
                            disabled={updatingWasteId === w.id}
                            onClick={() => handleUpdateWasteCollectionStatus(w.id, 'rejected')}
                            title="Reject collection request"
                          >
                            {updatingWasteId === w.id ? (
                              <span className="spinner-small" />
                            ) : (
                              <XCircle size={14} />
                            )}
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : w.status === 'accepted' ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                          <CheckCircle2 size={14} className="text-emerald" />
                          <span>Accepted • Awaiting Pickup</span>
                        </div>
                      ) : w.status === 'collected' ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200">
                          <Truck size={14} className="text-blue-600" />
                          <span>Collected by Recycler</span>
                        </div>
                      ) : w.status === 'processing' ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                          <RefreshCw size={14} className="text-amber-600 spin-icon" />
                          <span>In Bio-Conversion</span>
                        </div>
                      ) : (
                        <div className="text-xs text-muted">
                          {w.status.replace('_', ' ')}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Pickup History / Completed Pickups (Requirement 4) */}
      <div className="dashboard-section mt-12">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <CheckCircle2 size={20} className="text-emerald" />
              <span>Pickup History & Completed Handaways</span>
            </h2>
            <p className="section-desc">
              Audit log of surplus meals physically collected and redistributed by partner charitable organizations.
            </p>
          </div>
        </div>

        {requests.filter((r) => r.status === 'completed').length === 0 ? (
          <div className="empty-sub-card">
            <p>No completed food pickups recorded yet. Completed collections confirmed by your team will appear here.</p>
          </div>
        ) : (
          <div className="requests-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Food Item</th>
                  <th>NGO / Charitable Partner</th>
                  <th>Quantity Picked Up</th>
                  <th>Request Date</th>
                  <th>Handover Date & Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requests
                  .filter((r) => r.status === 'completed')
                  .map((req) => (
                    <tr key={req.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          {req.imageUrl ? (
                            <img
                              src={req.imageUrl}
                              alt={req.foodName}
                              className="w-10 h-10 object-cover rounded shadow-sm flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-lg flex-shrink-0">
                              🍽️
                            </div>
                          )}
                          <strong>{req.foodName}</strong>
                        </div>
                      </td>
                      <td>
                        <div>
                          <strong>{req.requesterOrg || req.requesterName || 'Charity / NGO'}</strong>
                          <div className="text-muted text-xs">
                            {req.requesterName} {req.requesterPhone ? `• ${req.requesterPhone}` : ''}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge-qty">{req.requestedQuantityKg} kg</span>
                        <small className="d-block text-muted">~{req.requestedPortions} portions</small>
                      </td>
                      <td>
                        <span className="text-xs text-muted">
                          {formatTimestamp(req.createdAt)}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 size={13} className="text-emerald" />
                          {formatTimestamp(req.pickedUpAt || req.updatedAt)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status="completed" type="request" />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {historyWasteCollections.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
              <Recycle size={18} className="text-emerald-700" />
              <span>Organic Recycling & Circular Repurposing Log</span>
            </h3>
            <div className="requests-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Food Item</th>
                    <th>Certified Recycler</th>
                    <th>Quantity (kg)</th>
                    <th>Conversion Method</th>
                    <th>Request Date</th>
                    <th>Processed / Concluded Date</th>
                    <th>Final Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyWasteCollections.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          {w.imageUrl ? (
                            <img
                              src={w.imageUrl}
                              alt={w.foodName}
                              className="w-10 h-10 object-cover rounded shadow-sm flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-lg flex-shrink-0">
                              ♻️
                            </div>
                          )}
                          <strong>{w.foodName}</strong>
                        </div>
                      </td>
                      <td>
                        <div>
                          <strong>{w.partnerOrg || w.partnerName || 'Recycler'}</strong>
                          <div className="text-muted text-xs">
                            {w.partnerName} {w.partnerPhone ? `• ${w.partnerPhone}` : ''}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge-qty font-bold text-slate-900">
                          {w.actualCollectedKg || w.quantityKg} kg
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-slate-700">
                          {w.processingMethod || 'Organic Bio-Compost / Biogas'}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-muted">
                          {formatTimestamp(w.createdAt)}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 size={13} className="text-emerald" />
                          {formatTimestamp(w.processedAt || w.rejectedAt || w.updatedAt)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={w.status} type="waste" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
