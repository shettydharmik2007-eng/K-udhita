import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import {
  getAvailableWasteForRecyclers,
  requestCollectionFromListing,
  claimWasteCollection,
  updateWasteCollectionWorkflow,
  updateRecyclerProfile,
  mapFoodCategoryToWaste,
} from '../services/wasteService';
import { parsePickupDeadlineMs, formatTimestamp } from '../services/foodService';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import type {
  WasteCollection,
  WasteCategory,
  RecyclerType,
  FoodListing,
} from '../types';
import {
  Truck,
  Recycle,
  Scale,
  Clock,
  MapPin,
  Building2,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Search,
  Flame,
  Leaf,
  Layers,
  Info,
  ShieldAlert,
  ArrowRight,
  Phone,
  Check,
  Building,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

const WASTE_CATEGORY_META: Record<
  WasteCategory,
  { label: string; icon: string; desc: string }
> = {
  cooked_food: {
    label: 'Cooked Food Waste',
    icon: '🍲',
    desc: 'Buffet surplus, mixed cooked gravies, catering leftovers',
  },
  rice_bread: {
    label: 'Rice & Bread Waste',
    icon: '🍚',
    desc: 'Cooked rice, pulao, rotis, naans, bakery scraps',
  },
  veg_fruit: {
    label: 'Vegetable & Fruit Waste',
    icon: '🥦',
    desc: 'Raw kitchen peelings, cut fruit trimmings, spoiled produce',
  },
  mixed_organic: {
    label: 'Mixed Organic Waste',
    icon: '🍂',
    desc: 'Combined banquet organic scraps and post-event platters',
  },
  other_organic: {
    label: 'Other Organic Waste',
    icon: '📦',
    desc: 'Coffee grounds, tea bag residue, floral waste',
  },
  composting: {
    label: 'Composting Biomass',
    icon: '🌱',
    desc: 'Vegetative organic matter for windrow composting',
  },
  biogas: {
    label: 'Biogas Digestible Waste',
    icon: '🔥',
    desc: 'Energy-dense organic waste for anaerobic digesters',
  },
  other_disposal: {
    label: 'Other Bio Waste',
    icon: '♻️',
    desc: 'Non-compostable organic waste for controlled bio-processing',
  },
};

export const PartnerDashboard: React.FC<Props> = ({ onNavigate }) => {
  const { currentUser, userProfile, isWastePartner, isDonor, isRequester } = useAuth();
  const { showNotification } = useNotification();

  // Main Tabs: 'available' | 'active' | 'history' | 'profile'
  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'history' | 'profile'>('available');

  // Data states
  const [wasteRecords, setWasteRecords] = useState<WasteCollection[]>([]);
  const [unsuitableListings, setUnsuitableListings] = useState<FoodListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters for Available Waste Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [filterOnlyAccepted, setFilterOnlyAccepted] = useState(false);

  // Filters for Active Collections Tab
  const [activeSubTab, setActiveSubTab] = useState<
    'all' | 'collection_requested' | 'accepted' | 'collected' | 'processing'
  >('all');

  // Modal 1: Details & Request Collection Modal
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<{
    isListing: boolean;
    listing?: FoodListing;
    record?: WasteCollection;
  } | null>(null);
  const [collectionNotes, setCollectionNotes] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Modal 2: Mark as Collected Modal (Records Actual Collected Weight)
  const [collectedModalOpen, setCollectedModalOpen] = useState(false);
  const [itemToCollect, setItemToCollect] = useState<WasteCollection | null>(null);
  const [actualWeightKg, setActualWeightKg] = useState<number | ''>('');
  const [collectNotes, setCollectNotes] = useState('');
  const [submittingCollect, setSubmittingCollect] = useState(false);

  // Modal 3: Mark as Processed Modal (Records Processing Method)
  const [processedModalOpen, setProcessedModalOpen] = useState(false);
  const [itemToProcess, setItemToProcess] = useState<WasteCollection | null>(null);
  const [processingMethod, setProcessingMethod] = useState('Biogas Methane Generation (Anaerobic Digestion)');
  const [processNotes, setProcessNotes] = useState('');
  const [submittingProcess, setSubmittingProcess] = useState(false);

  // Recycler Profile Form state (Requirement 5)
  const [profileOrgName, setProfileOrgName] = useState('');
  const [profileRecyclerType, setProfileRecyclerType] = useState<RecyclerType>('biogas_plant');
  const [profileContactPerson, setProfileContactPerson] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileServiceArea, setProfileServiceArea] = useState('');
  const [profileAcceptedCategories, setProfileAcceptedCategories] = useState<WasteCategory[]>([
    'cooked_food',
    'rice_bread',
    'veg_fruit',
    'mixed_organic',
  ]);
  const [profileMaxCapacityKg, setProfileMaxCapacityKg] = useState<number | ''>(5000);
  const [profilePickupArrangements, setProfilePickupArrangements] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Initialize profile form when userProfile changes
  const [syncedProfileUid, setSyncedProfileUid] = useState<string | null>(null);
  if (userProfile && userProfile.uid !== syncedProfileUid) {
    setSyncedProfileUid(userProfile.uid);
    setProfileOrgName(userProfile.organizationName || userProfile.name || '');
    setProfileRecyclerType(userProfile.recyclerType || 'biogas_plant');
    setProfileContactPerson(userProfile.name || '');
    setProfilePhone(userProfile.phone || '');
    setProfileAddress(userProfile.address || '');
    setProfileServiceArea(userProfile.serviceArea || 'Metro & Industrial Region, 35 km radius');
    if (userProfile.acceptedCategories && userProfile.acceptedCategories.length > 0) {
      setProfileAcceptedCategories(userProfile.acceptedCategories);
    }
    setProfileMaxCapacityKg(userProfile.maxCapacityKg || 5000);
    setProfilePickupArrangements(
      userProfile.pickupArrangements || 'Equipped with digital weighing scales and vacuum wet-waste tankers.'
    );
  }

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load live data from Firestore
  const loadData = useCallback(async () => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch available waste from both wasteCollections & unsuitable foodListings
      const availableData = await getAvailableWasteForRecyclers();
      setWasteRecords(availableData.wasteRecords);
      setUnsuitableListings(availableData.unsuitableListings);
    } catch (err: any) {
      console.error('[Recycler Dashboard] Data load failed:', err);
      showNotification('error', 'Sync Failed', err.message || 'Could not load waste records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showNotification]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let ignore = false;
    getAvailableWasteForRecyclers()
      .then((availableData) => {
        if (!ignore) {
          setWasteRecords(availableData.wasteRecords);
          setUnsuitableListings(availableData.unsuitableListings);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (!ignore) {
          console.error('[Recycler Dashboard] Data load failed:', err);
          showNotification('error', 'Sync Failed', err.message || 'Could not load waste records');
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [currentUser, showNotification]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Helper to format countdown
  const getDeadlineStatus = (pickupDeadline?: any) => {
    if (!pickupDeadline) {
      return { isOverdue: false, label: 'Flexible Window', urgency: 'normal' as const };
    }
    const deadlineTime = parsePickupDeadlineMs(pickupDeadline);
    if (isNaN(deadlineTime)) {
      return { isOverdue: false, label: String(pickupDeadline), urgency: 'normal' as const };
    }

    const diffMinutes = Math.round((deadlineTime - currentTime) / (1000 * 60));
    if (diffMinutes <= 0) {
      return {
        isOverdue: true,
        label: `Expired (${formatTimestamp(pickupDeadline)})`,
        urgency: 'overdue' as const,
      };
    }

    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    const label = hours > 0 ? `${hours}h ${mins}m remaining` : `${mins}m remaining`;
    return { isOverdue: false, label, urgency: diffMinutes < 180 ? ('urgent' as const) : ('normal' as const) };
  };

  // Normalize all available waste batches into unified view items
  interface UnifiedAvailableWaste {
    id: string;
    isListing: boolean;
    hotelName: string;
    foodName: string;
    category: WasteCategory;
    weightKg: number;
    location: string;
    pickupDeadline?: any;
    prepDate?: string;
    prepTime?: string;
    storageCondition?: string;
    foodCondition: string;
    status: string;
    imageUrl?: string;
    isExpired?: boolean;
    listing?: FoodListing;
    record?: WasteCollection;
  }

  const normalizedAvailableWaste: UnifiedAvailableWaste[] = useMemo(() => {
    const list: UnifiedAvailableWaste[] = [];
    const now = currentTime;

    // 1. Hotel Listings eligible for recycling (unsuitable or expired)
    unsuitableListings.forEach((item) => {
      const deadlineMs = parsePickupDeadlineMs(item.pickupDeadline);
      const isExpired = item.status === 'expired' || (!isNaN(deadlineMs) && deadlineMs <= now);

      list.push({
        id: `listing_${item.id}`,
        isListing: true,
        hotelName: item.donorOrg || item.donorName || 'Hospitality Partner',
        foodName: item.foodName,
        category: mapFoodCategoryToWaste(item.category),
        weightKg: Number(item.remainingQuantityKg),
        location: item.location,
        pickupDeadline: item.pickupDeadline,
        prepDate: item.prepDate,
        prepTime: item.prepTime,
        storageCondition: item.storageCondition,
        foodCondition: item.foodCondition || 'not_suitable',
        status: isExpired ? 'Expired Surplus (Recycle Priority)' : 'Available for Recycler Pickup',
        imageUrl: item.imageUrl || '',
        isExpired,
        listing: item,
      });
    });

    // 2. Unassigned Waste Collection records
    wasteRecords
      .filter((w) => w.status === 'pending' && !w.partnerId)
      .forEach((record) => {
        list.push({
          id: `record_${record.id}`,
          isListing: false,
          hotelName: record.donorOrg || 'Hospitality Partner',
          foodName: record.foodName,
          category: record.category,
          weightKg: Number(record.quantityKg),
          location: record.location,
          pickupDeadline: record.pickupDeadline,
          prepDate: record.prepDate,
          prepTime: record.prepTime,
          storageCondition: record.storageCondition,
          foodCondition: 'not_suitable',
          status: 'Available for Recycler Pickup',
          imageUrl: record.imageUrl || '',
          isExpired: true,
          record,
        });
      });

    return list;
  }, [unsuitableListings, wasteRecords, currentTime]);

  // Extract unique locations for filter
  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    normalizedAvailableWaste.forEach((item) => {
      if (item.location) {
        const parts = item.location.split(',');
        const clean = parts[parts.length - 1].trim() || parts[0].trim();
        if (clean) set.add(clean);
      }
    });
    return Array.from(set).sort();
  }, [normalizedAvailableWaste]);

  // Filtered available waste items
  const filteredAvailableWaste = useMemo(() => {
    return normalizedAvailableWaste.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.foodName.toLowerCase().includes(q) ||
        item.hotelName.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q);

      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      const matchesLocation =
        selectedLocation === 'all' ||
        item.location.toLowerCase().includes(selectedLocation.toLowerCase());

      const matchesAccepted =
        !filterOnlyAccepted ||
        !profileAcceptedCategories.length ||
        profileAcceptedCategories.includes(item.category);

      return matchesSearch && matchesCategory && matchesLocation && matchesAccepted;
    });
  }, [normalizedAvailableWaste, searchQuery, selectedCategory, selectedLocation, filterOnlyAccepted, profileAcceptedCategories]);

  // Recycler's active and history collections
  const myAssignedCollections = useMemo(() => {
    if (!currentUser) return [];
    return wasteRecords.filter((w) => w.partnerId === currentUser.uid);
  }, [wasteRecords, currentUser]);

  const activeCollections = useMemo(() => {
    return myAssignedCollections.filter(
      (w) => w.status !== 'processed' && w.status !== 'completed' && w.status !== 'cancelled'
    );
  }, [myAssignedCollections]);

  const historyCollections = useMemo(() => {
    return myAssignedCollections.filter(
      (w) => w.status === 'processed' || w.status === 'completed' || w.status === 'cancelled'
    );
  }, [myAssignedCollections]);

  // Filtered Active Collections
  const displayedActiveCollections = useMemo(() => {
    if (activeSubTab === 'all') return activeCollections;
    return activeCollections.filter((c) => c.status === activeSubTab);
  }, [activeCollections, activeSubTab]);

  // Calculate 4 Summary Cards (Requirement 1):
  // 1. Available Organic Waste (total available kg & count)
  const totalAvailableWasteKg = normalizedAvailableWaste.reduce(
    (sum, item) => sum + Number(item.weightKg),
    0
  );
  const availableBatchesCount = normalizedAvailableWaste.length;

  // 2. Pending Collection Requests
  const pendingRequestsCount = activeCollections.filter(
    (c) => c.status === 'collection_requested' || c.status === 'pending'
  ).length;

  // 3. Waste Collected (currently at facility or processing)
  const totalWasteCollectedKg = myAssignedCollections
    .filter((c) => c.status === 'collected' || c.status === 'processing' || c.status === 'processed' || c.status === 'completed')
    .reduce((sum, c) => sum + (Number(c.actualCollectedKg) || Number(c.quantityKg)), 0);

  // 4. Total Waste Processed (converted into biogas or compost)
  const totalWasteProcessedKg = historyCollections
    .filter((c) => c.status === 'processed' || c.status === 'completed')
    .reduce((sum, c) => sum + (Number(c.actualCollectedKg) || Number(c.quantityKg)), 0);

  // Action: Open Details Modal
  const handleOpenDetails = (item: UnifiedAvailableWaste) => {
    setSelectedItemForDetails({
      isListing: item.isListing,
      listing: item.listing,
      record: item.record,
    });
    setCollectionNotes('');
    setDetailsModalOpen(true);
  };

  // Action: Submit Collection Request (Requirement 4)
  const handleConfirmCollectionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) {
      showNotification('warning', 'Sign In Required', 'Please sign in with your recycler credentials.');
      onNavigate('login');
      return;
    }

    if (!selectedItemForDetails) return;

    setSubmittingRequest(true);
    try {
      if (selectedItemForDetails.isListing && selectedItemForDetails.listing) {
        // Request from hotel listing marked not_suitable
        await requestCollectionFromListing(
          selectedItemForDetails.listing,
          userProfile,
          collectionNotes
        );
      } else if (selectedItemForDetails.record) {
        // Claim existing unassigned waste record
        await claimWasteCollection(
          selectedItemForDetails.record.id,
          userProfile,
          collectionNotes
        );
      }

      showNotification(
        'success',
        'Collection Requested!',
        'Your pickup request has been dispatched to the hotel management.'
      );
      setDetailsModalOpen(false);
      await loadData();
      setActiveTab('active');
    } catch (err: any) {
      console.error('[Recycler Dashboard] Request failed:', err);
      showNotification('error', 'Request Failed', err.message || 'Could not request waste collection');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Action: Open Mark as Collected Modal (Requirement 4 & 6)
  const handleOpenMarkCollected = (item: WasteCollection) => {
    setItemToCollect(item);
    setActualWeightKg(item.quantityKg);
    setCollectNotes(item.notes || '');
    setCollectedModalOpen(true);
  };

  const handleConfirmCollected = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToCollect || !currentUser) return;

    const weighedKg = Number(actualWeightKg);
    if (!weighedKg || weighedKg <= 0) {
      showNotification('warning', 'Invalid Weight', 'Please enter a valid weighed amount in kilograms.');
      return;
    }

    setSubmittingCollect(true);
    try {
      await updateWasteCollectionWorkflow(
        itemToCollect.id,
        {
          status: 'collected',
          actualCollectedKg: weighedKg,
          notes: collectNotes,
        },
        currentUser.uid
      );
      showNotification(
        'success',
        'Weigh-In Confirmed',
        `Successfully logged ${weighedKg} kg collected from ${itemToCollect.donorOrg}.`
      );
      setCollectedModalOpen(false);
      await loadData();
    } catch (err: any) {
      showNotification('error', 'Update Failed', err.message || 'Could not confirm collection');
    } finally {
      setSubmittingCollect(false);
    }
  };

  // Action: Advance to Processing
  const handleAdvanceToProcessing = async (item: WasteCollection) => {
    if (!currentUser) return;
    if (
      !window.confirm(
        `Move ${item.actualCollectedKg || item.quantityKg} kg of ${item.foodName} into active bio-conversion/composting?`
      )
    ) {
      return;
    }

    try {
      await updateWasteCollectionWorkflow(
        item.id,
        { status: 'processing' },
        currentUser.uid
      );
      showNotification('info', 'Processing Started', 'Batch status updated to In Processing.');
      await loadData();
    } catch (err: any) {
      showNotification('error', 'Update Failed', err.message || 'Could not update status');
    }
  };

  // Action: Open Mark as Processed Modal (Requirement 4 & 6)
  const handleOpenMarkProcessed = (item: WasteCollection) => {
    setItemToProcess(item);
    setProcessingMethod('Biogas Methane Generation (Anaerobic Digestion)');
    setProcessNotes('');
    setProcessedModalOpen(true);
  };

  const handleConfirmProcessed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToProcess || !currentUser) return;

    setSubmittingProcess(true);
    try {
      await updateWasteCollectionWorkflow(
        itemToProcess.id,
        {
          status: 'processed',
          processingMethod,
          notes: processNotes,
        },
        currentUser.uid
      );
      showNotification(
        'success',
        'Waste Batch Processed!',
        `Successfully converted ${itemToProcess.actualCollectedKg || itemToProcess.quantityKg} kg into sustainable clean energy / compost!`
      );
      setProcessedModalOpen(false);
      await loadData();
      setActiveTab('history');
    } catch (err: any) {
      showNotification('error', 'Update Failed', err.message || 'Could not mark processed');
    } finally {
      setSubmittingProcess(false);
    }
  };

  // Action: Cancel Request
  const handleCancelRequest = async (item: WasteCollection) => {
    if (!currentUser) return;
    if (!window.confirm('Are you sure you want to cancel this collection request?')) return;

    try {
      await updateWasteCollectionWorkflow(
        item.id,
        { status: 'cancelled' },
        currentUser.uid
      );
      showNotification('info', 'Request Cancelled', 'Collection request was cancelled.');
      await loadData();
    } catch (err: any) {
      showNotification('error', 'Cancel Failed', err.message || 'Could not cancel request');
    }
  };

  // Action: Save Recycler Profile (Requirement 5)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setSavingProfile(true);
    try {
      await updateRecyclerProfile(currentUser.uid, {
        organizationName: profileOrgName.trim(),
        recyclerType: profileRecyclerType,
        name: profileContactPerson.trim(),
        phone: profilePhone.trim(),
        address: profileAddress.trim(),
        serviceArea: profileServiceArea.trim(),
        acceptedCategories: profileAcceptedCategories,
        maxCapacityKg: Number(profileMaxCapacityKg) || 5000,
        pickupArrangements: profilePickupArrangements.trim(),
      });

      showNotification('success', 'Profile Updated', 'Your facility capabilities and coverage area have been saved.');
    } catch (err: any) {
      console.error('[Recycler Dashboard] Profile save failed:', err);
      showNotification('error', 'Save Failed', err.message || 'Could not update profile in Firestore');
    } finally {
      setSavingProfile(false);
    }
  };

  // Toggle Category Checkbox in Profile
  const toggleAcceptedCategory = (cat: WasteCategory) => {
    if (profileAcceptedCategories.includes(cat)) {
      setProfileAcceptedCategories(profileAcceptedCategories.filter((c) => c !== cat));
    } else {
      setProfileAcceptedCategories([...profileAcceptedCategories, cat]);
    }
  };

  return (
    <div className="page-container recycler-dashboard-wrapper animate-fade-in-up">
      {/* Role Alert for non-waste partners */}
      {currentUser && !isWastePartner && (
        <div className="alert alert-info flex items-center justify-between" role="alert">
          <div className="flex items-center gap-2">
            <Info size={18} />
            <span>
              You are currently signed in as <strong>{userProfile?.role === 'donor' ? 'Hotel Donor' : 'Trust / NGO Requester'}</strong>.
              Viewing the Waste Recycler Circular Dashboard.
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
          {isRequester && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => onNavigate('my-requests')}
            >
              Back to NGO Panel
            </button>
          )}
        </div>
      )}

      {/* Top Banner */}
      <div className="dashboard-header-flex">
        <div>
          <div className="page-header-badge" style={{ background: '#f0fdfa', borderColor: '#99f6e4', color: '#0f766e' }}>
            <Recycle size={16} className="text-teal-700" />
            <span>Industrial Organic Waste Circular Loop</span>
          </div>
          <h1 className="page-title">
            {userProfile?.organizationName || 'Organic Waste Recycler Dashboard'}
          </h1>
          <p className="page-subtitle">
            Collect certified unservable banquet food waste, record weighbridge measurements, and convert organic nutrients into renewable biogas, compost, and bio-fertilizers.
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
        </div>
      </div>

      {/* 4 SUMMARY CARDS (Requirement 1) */}
      <div className="metrics-summary-grid">
        {/* Card 1: Available Organic Waste */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon" style={{ background: '#f0fdfa' }}>
            <Leaf size={24} style={{ color: '#0f766e' }} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Available Organic Waste</span>
            <span className="metric-value" style={{ color: '#0f766e' }}>
              {totalAvailableWasteKg.toFixed(1)} <span className="unit">kg</span>
            </span>
            <small className="metric-sub font-semibold text-teal-700">
              {availableBatchesCount} unservable hotel batches ready
            </small>
          </div>
        </div>

        {/* Card 2: Pending Collection Requests */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-amber-light">
            <Clock size={24} className="text-amber-600" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Pending Collection Requests</span>
            <span className="metric-value">{pendingRequestsCount}</span>
            <small className="metric-sub font-semibold text-amber-700">
              Awaiting hotel dispatch confirmation
            </small>
          </div>
        </div>

        {/* Card 3: Waste Collected */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon bg-blue-light">
            <Truck size={24} className="text-blue" />
          </div>
          <div className="metric-info">
            <span className="metric-label">Waste Collected</span>
            <span className="metric-value">
              {totalWasteCollectedKg.toFixed(1)} <span className="unit">kg</span>
            </span>
            <small className="metric-sub font-semibold text-blue-700">
              Transported to circular facility
            </small>
          </div>
        </div>

        {/* Card 4: Total Waste Processed */}
        <div className="metric-card animate-hover-lift">
          <div className="metric-icon" style={{ background: '#fef3c7' }}>
            <Flame size={24} style={{ color: '#d97706' }} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Waste Processed</span>
            <span className="metric-value" style={{ color: '#d97706' }}>
              {totalWasteProcessedKg.toFixed(1)} <span className="unit">kg</span>
            </span>
            <small className="metric-sub font-semibold text-amber-800">
              Converted into biogas & compost (Zero Waste)
            </small>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="recycler-tabs-nav">
        <button
          type="button"
          className={`recycler-tab-btn ${activeTab === 'available' ? 'active' : ''}`}
          onClick={() => setActiveTab('available')}
        >
          <Leaf size={17} />
          <span>Available Waste Listings</span>
          <span className="recycler-tab-badge">{availableBatchesCount}</span>
        </button>

        <button
          type="button"
          className={`recycler-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          <Truck size={17} />
          <span>Active Collections & Processing</span>
          <span className="recycler-tab-badge">{activeCollections.length}</span>
        </button>

        <button
          type="button"
          className={`recycler-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Recycle size={17} />
          <span>Collection History & Records</span>
          <span className="recycler-tab-badge">{historyCollections.length}</span>
        </button>

        <button
          type="button"
          className={`recycler-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <Building size={17} />
          <span>Facility Profile & Capabilities</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: AVAILABLE WASTE LISTINGS (Requirements 2 & 3)
          ========================================================================= */}
      {activeTab === 'available' && (
        <div className="flex flex-col gap-6">
          {/* Filters Bar */}
          <div className="ngo-filter-bar">
            <div className="ngo-filter-row">
              <div className="ngo-search-input-wrap">
                <Search size={18} className="ngo-search-icon" />
                <input
                  type="text"
                  className="ngo-search-input"
                  placeholder="Search hotel name, dish or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Category Filter */}
              <select
                className="ngo-filter-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Filter by waste category"
              >
                <option value="all">All Waste Categories</option>
                <option value="cooked_food">🍲 Cooked Food Waste</option>
                <option value="rice_bread">🍚 Rice & Bread Waste</option>
                <option value="veg_fruit">🥦 Vegetable & Fruit Waste</option>
                <option value="mixed_organic">🍂 Mixed Organic Waste</option>
                <option value="other_organic">📦 Other Organic Waste</option>
              </select>

              {/* Location Filter */}
              <select
                className="ngo-filter-select"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                aria-label="Filter by pickup location"
              >
                <option value="all">All Pickup Locations</option>
                {uniqueLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    📍 {loc}
                  </option>
                ))}
              </select>

              {/* Facility Compatibility Checkbox (Requirement 3) */}
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer bg-slate-50 px-3 py-2 rounded-md border border-slate-200">
                <input
                  type="checkbox"
                  checked={filterOnlyAccepted}
                  onChange={(e) => setFilterOnlyAccepted(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Only show categories accepted by my facility</span>
              </label>

              {(searchQuery || selectedCategory !== 'all' || selectedLocation !== 'all' || filterOnlyAccepted) && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setSelectedLocation('all');
                    setFilterOnlyAccepted(false);
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Listings Content */}
          {loading ? (
            <div className="text-center py-16">
              <div className="spinner-large" />
              <p className="mt-4 text-muted">Scanning Cloud Firestore for unservable organic surplus batches...</p>
            </div>
          ) : filteredAvailableWaste.length === 0 ? (
            <div className="empty-state-card animate-fade-in-up">
              <Recycle size={52} className="text-muted" />
              <h3>No Organic Waste Batches Available</h3>
              <p>
                {searchQuery || selectedCategory !== 'all' || selectedLocation !== 'all' || filterOnlyAccepted
                  ? 'No available waste listings match your filter criteria. Try adjusting or clearing your filters.'
                  : 'There are currently no hotel surplus listings marked Not Suitable for Donation awaiting recycling pickup. As soon as hotels identify expired or unservable banquet food, it will appear here.'}
              </p>
              <button
                type="button"
                className="btn btn-outline mt-4"
                onClick={handleManualRefresh}
              >
                <RefreshCw size={16} /> Check Again
              </button>
            </div>
          ) : (
            <div className="recycler-listings-grid">
              {filteredAvailableWaste.map((item) => {
                const deadline = getDeadlineStatus(item.pickupDeadline);
                const catMeta = WASTE_CATEGORY_META[item.category] || {
                  label: item.category.replace('_', ' '),
                  icon: '♻️',
                  desc: 'Organic Waste',
                };

                return (
                  <div key={item.id} className="recycler-card">
                    {/* Media wrap */}
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
                        style={{
                          background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
                          display: item.imageUrl ? 'none' : 'flex',
                        }}
                      >
                        <span className="text-3xl mb-1">{catMeta.icon}</span>
                        <span className="font-bold text-sm text-teal-800">{catMeta.label}</span>
                      </div>

                      {/* Top Left: Category Tag */}
                      <div className="ngo-card-badge-top-left">
                        <span className="badge-neutral text-xs font-bold px-2 py-0.5 rounded shadow-sm bg-white text-slate-800">
                          {catMeta.icon} {catMeta.label}
                        </span>
                      </div>

                      {/* Top Right: Expired / Not Suitable badge */}
                      <div className="ngo-card-badge-top-right">
                        {item.isExpired ? (
                          <span className="badge-danger text-xs font-bold px-2 py-0.5 rounded shadow-sm flex items-center gap-1 bg-red-100 text-red-800">
                            <ShieldAlert size={13} />
                            <span>Expired Surplus</span>
                          </span>
                        ) : (
                          <span className="recycler-badge-unsuitable">
                            <ShieldAlert size={13} />
                            <span>Not Suitable for Donation</span>
                          </span>
                        )}
                      </div>

                      {/* Bottom Banner: Pickup Window / Expiry time */}
                      <div className="ngo-card-badge-bottom">
                        <span className={`countdown-badge ${deadline.urgency}`}>
                          <Clock size={12} />
                          <span>{deadline.label}</span>
                        </span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="ngo-card-body">
                      {/* Hotel Name */}
                      <div className="ngo-hotel-line">
                        <Building2 size={15} className="text-teal-700" />
                        <strong>{item.hotelName}</strong>
                      </div>

                      {/* Food / Waste Name */}
                      <h3 className="ngo-card-title">{item.foodName}</h3>

                      {/* Estimated Weight */}
                      <div className="ngo-weight-pill-box" style={{ background: '#f0fdfa', borderColor: '#ccfbf1' }}>
                        <div>
                          <span className="text-xs text-muted font-bold block">Available Weight</span>
                          <span className="ngo-weight-val" style={{ color: '#0f766e' }}>
                            {item.weightKg} kg
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-muted font-bold block">Designation</span>
                          <span className="text-xs font-bold text-teal-800">Bio-Energy / Compost</span>
                        </div>
                      </div>

                      {/* Details: Prep Time, Storage, Location */}
                      <div className="ngo-card-details-list">
                        <div className="ngo-card-detail-row">
                          <Calendar size={14} className="text-muted flex-shrink-0" />
                          <span>
                            Recorded:{' '}
                            <strong>
                              {item.prepDate || 'Today'} • {item.prepTime || 'Kitchen Buffet'}
                            </strong>
                          </span>
                        </div>

                        {item.storageCondition && (
                          <div className="ngo-card-detail-row">
                            <Layers size={14} className="text-muted flex-shrink-0" />
                            <span className="ngo-storage-pill">
                              Storage: {item.storageCondition.replace('_', ' ')}
                            </span>
                          </div>
                        )}

                        <div className="ngo-card-detail-row">
                          <MapPin size={14} className="text-muted flex-shrink-0" />
                          <span className="truncate" title={item.location}>
                            {item.location}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="ngo-card-footer flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline flex-1"
                          onClick={() => handleOpenDetails(item)}
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary flex-1"
                          onClick={() => handleOpenDetails(item)}
                        >
                          <Truck size={14} /> Request Collection
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
          TAB 2: ACTIVE COLLECTIONS & PROCESSING (Requirement 4 & 6)
          ========================================================================= */}
      {activeTab === 'active' && (
        <div className="flex flex-col gap-6">
          {/* Sub Tabs */}
          <div className="partner-tabs-row">
            <button
              type="button"
              className={`partner-tab-btn ${activeSubTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('all')}
            >
              <span>All Active ({activeCollections.length})</span>
            </button>
            <button
              type="button"
              className={`partner-tab-btn ${activeSubTab === 'collection_requested' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('collection_requested')}
            >
              <span>Requested ({activeCollections.filter((c) => c.status === 'collection_requested').length})</span>
            </button>
            <button
              type="button"
              className={`partner-tab-btn ${activeSubTab === 'accepted' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('accepted')}
            >
              <span>Accepted / Ready ({activeCollections.filter((c) => c.status === 'accepted').length})</span>
            </button>
            <button
              type="button"
              className={`partner-tab-btn ${activeSubTab === 'collected' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('collected')}
            >
              <span>Collected at Facility ({activeCollections.filter((c) => c.status === 'collected').length})</span>
            </button>
            <button
              type="button"
              className={`partner-tab-btn ${activeSubTab === 'processing' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('processing')}
            >
              <span>In Bio-Processing ({activeCollections.filter((c) => c.status === 'processing').length})</span>
            </button>
          </div>

          {displayedActiveCollections.length === 0 ? (
            <div className="empty-state-card animate-fade-in-up">
              <Truck size={48} className="text-muted" />
              <h3>No Active Collection Tasks in this View</h3>
              <p>Explore Available Waste Listings to request collection of unservable organic surplus from hotels.</p>
              <button
                type="button"
                className="btn btn-primary mt-4"
                onClick={() => setActiveTab('available')}
              >
                Browse Available Waste
              </button>
            </div>
          ) : (
            <div className="ngo-requests-list">
              {displayedActiveCollections.map((item) => {
                const catMeta = WASTE_CATEGORY_META[item.category] || {
                  label: item.category,
                  icon: '♻️',
                  desc: 'Organic Waste',
                };

                return (
                  <div key={item.id} className="ngo-request-card">
                    {/* Header */}
                    <div className="ngo-req-header-row">
                      <div className="ngo-req-thumb-title">
                        <div className="ngo-req-thumb flex items-center justify-center text-2xl" style={{ background: '#f0fdfa' }}>
                          {catMeta.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 text-xs text-muted font-bold">
                            <Building2 size={14} className="text-teal-700" />
                            <span>{item.donorOrg}</span>
                            {item.donorPhone && (
                              <span className="flex items-center gap-0.5 ml-2 text-slate-500">
                                <Phone size={11} /> {item.donorPhone}
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                            {item.foodName}
                          </h3>
                        </div>
                      </div>

                      <StatusBadge status={item.status} type="waste" />
                    </div>

                    {/* Stepper Progression (Requirement 4) */}
                    <div className="recycler-workflow-stepper">
                      <span className={`workflow-step-chip ${item.status === 'collection_requested' ? 'current' : 'done'}`}>
                        1. Requested
                      </span>
                      <ArrowRight size={12} />
                      <span className={`workflow-step-chip ${item.status === 'accepted' ? 'current' : item.status === 'collected' || item.status === 'processing' || item.status === 'processed' ? 'done' : ''}`}>
                        2. Accepted
                      </span>
                      <ArrowRight size={12} />
                      <span className={`workflow-step-chip ${item.status === 'collected' ? 'current' : item.status === 'processing' || item.status === 'processed' ? 'done' : ''}`}>
                        3. Collected
                      </span>
                      <ArrowRight size={12} />
                      <span className={`workflow-step-chip ${item.status === 'processing' ? 'current' : item.status === 'processed' ? 'done' : ''}`}>
                        4. Processing
                      </span>
                      <ArrowRight size={12} />
                      <span className={`workflow-step-chip ${item.status === 'processed' ? 'current' : ''}`}>
                        5. Processed
                      </span>
                    </div>

                    {/* Body Grid */}
                    <div className="ngo-req-body-grid">
                      <div>
                        <span className="text-xs text-muted block font-semibold">Initial Estimate</span>
                        <strong className="text-base text-slate-900">{item.quantityKg} kg</strong>
                      </div>

                      {item.actualCollectedKg && (
                        <div>
                          <span className="text-xs text-muted block font-semibold">Weighed Collection</span>
                          <strong className="text-base text-teal-800">{item.actualCollectedKg} kg</strong>
                        </div>
                      )}

                      <div>
                        <span className="text-xs text-muted block font-semibold">Waste Category</span>
                        <strong>{catMeta.label}</strong>
                      </div>

                      <div>
                        <span className="text-xs text-muted block font-semibold">Destination Facility</span>
                        <strong>{item.destinationFacility || 'Recycling Plant'}</strong>
                      </div>
                    </div>

                    {/* Location Address */}
                    {item.location && (
                      <div className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <MapPin size={16} className="text-teal-700 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Collection Address:</strong> {item.location}
                        </div>
                      </div>
                    )}

                    {item.notes && (
                      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
                        <strong>Logistics Notes:</strong> {item.notes}
                      </div>
                    )}

                    {/* Action Buttons based on status */}
                    <div className="ngo-req-footer-row">
                      {item.status === 'collection_requested' && (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
                            <Clock size={14} />
                            <span>Awaiting hotel kitchen supervisor confirmation...</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleCancelRequest(item)}
                          >
                            Cancel Request
                          </button>
                        </>
                      )}

                      {item.status === 'accepted' && (
                        <>
                          <div className="badge-approved-pickup">
                            <CheckCircle2 size={16} />
                            <span>Hotel confirmed dispatch. Proceed to collect waste.</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleOpenMarkCollected(item)}
                          >
                            <Scale size={14} /> Mark as Collected (Enter Weighed Kg)
                          </button>
                        </>
                      )}

                      {item.status === 'collected' && (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold bg-blue-50 px-3 py-1.5 rounded-md border border-blue-200">
                            <Check size={14} />
                            <span>Collected ({item.actualCollectedKg || item.quantityKg} kg). Ready for digester/compost pit.</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleAdvanceToProcessing(item)}
                          >
                            <Flame size={14} /> Start Bio-Processing
                          </button>
                        </>
                      )}

                      {item.status === 'processing' && (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-teal-800 font-semibold bg-teal-50 px-3 py-1.5 rounded-md border border-teal-200">
                            <RefreshCw size={14} className="spin-icon" />
                            <span>Currently being processed in circular facility...</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            onClick={() => handleOpenMarkProcessed(item)}
                          >
                            <CheckCircle2 size={14} /> Mark as Processed
                          </button>
                        </>
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
          TAB 3: COLLECTION HISTORY & RECORDS (Requirement 6)
          ========================================================================= */}
      {activeTab === 'history' && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Collection & Processing History</h2>
              <p className="text-sm text-slate-500">
                Audit record of organic waste batches weighed, received, and converted into circular green energy or compost.
              </p>
            </div>
          </div>

          {historyCollections.length === 0 ? (
            <div className="empty-state-card animate-fade-in-up">
              <Recycle size={48} className="text-muted" />
              <h3>No Completed Processing Records Yet</h3>
              <p>As you collect waste batches and complete processing, your audited recycling logs will appear here.</p>
            </div>
          ) : (
            <div className="recycler-table-container">
              <table className="recycler-data-table">
                <thead>
                  <tr>
                    <th>Hotel / Banquet Hall</th>
                    <th>Waste Category</th>
                    <th>Requested Weight</th>
                    <th>Actual Weighed (kg)</th>
                    <th>Processing Method</th>
                    <th>Status</th>
                    <th>Date Logged</th>
                  </tr>
                </thead>
                <tbody>
                  {historyCollections.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.donorOrg}</strong>
                        <div className="text-xs text-muted truncate max-w-xs">{item.foodName}</div>
                      </td>
                      <td>
                        <span className="badge-neutral text-xs">
                          {WASTE_CATEGORY_META[item.category]?.icon || '♻️'} {WASTE_CATEGORY_META[item.category]?.label || item.category}
                        </span>
                      </td>
                      <td>{item.quantityKg} kg</td>
                      <td>
                        <strong className="text-teal-700">{item.actualCollectedKg || item.quantityKg} kg</strong>
                      </td>
                      <td>
                        <span className="font-semibold text-slate-800 text-xs">
                          {item.processingMethod || 'Biogas / Bio-Composting'}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={item.status} type="waste" />
                      </td>
                      <td>
                        <span className="text-xs text-muted">
                          {item.processedAt?.toDate
                            ? item.processedAt.toDate().toLocaleDateString()
                            : item.createdAt?.toDate
                            ? item.createdAt.toDate().toLocaleDateString()
                            : 'Recently'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 4: FACILITY PROFILE & CAPABILITIES (Requirement 5)
          ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="flex flex-col gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Building size={20} className="text-teal-700" />
                <span>Recycler Facility Profile & Capabilities</span>
              </h2>
              <p className="text-sm text-slate-500">
                Maintain your plant specifications, maximum daily processing throughput, and accepted waste categories so hotels and banquet halls can dispatch appropriate organic batches.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
              {/* Row 1: Org Name & Recycler Type */}
              <div className="form-row-2 gap-4">
                <div className="form-group">
                  <label className="form-label font-bold text-slate-800">
                    Facility / Company Name *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={profileOrgName}
                    onChange={(e) => setProfileOrgName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-slate-800">
                    Recycler Facility Type *
                  </label>
                  <select
                    className="form-control"
                    value={profileRecyclerType}
                    onChange={(e) => setProfileRecyclerType(e.target.value as RecyclerType)}
                    required
                  >
                    <option value="biogas_plant">🔥 Biogas Plant (Anaerobic Digestion)</option>
                    <option value="composting_facility">🌱 Bio-Composting Facility</option>
                    <option value="fertilizer_company">🌾 Organic Fertilizer Manufacturer</option>
                    <option value="other">♻️ Other Bio-Waste Circular Facility</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Contact Person & Phone */}
              <div className="form-row-2 gap-4">
                <div className="form-group">
                  <label className="form-label font-bold text-slate-800">
                    Contact Person Name *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={profileContactPerson}
                    onChange={(e) => setProfileContactPerson(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-slate-800">
                    Contact Phone Number *
                  </label>
                  <input
                    type="tel"
                    className="form-control"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Row 3: Address & Coverage Area */}
              <div className="form-row-2 gap-4">
                <div className="form-group">
                  <label className="form-label font-bold text-slate-800">
                    Plant Physical Address *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-slate-800">
                    Service / Pickup Coverage Area *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Greater Metro Area, 30km radius"
                    value={profileServiceArea}
                    onChange={(e) => setProfileServiceArea(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Row 4: Accepted Waste Categories (Requirement 3 & 5) */}
              <div className="form-group">
                <label className="form-label font-bold text-slate-800">
                  Accepted Waste Categories *
                </label>
                <p className="text-xs text-muted mb-2">
                  Select all waste streams that your digestion units or composting windrows are licensed to process:
                </p>

                <div className="checkbox-category-grid">
                  {(
                    [
                      'cooked_food',
                      'rice_bread',
                      'veg_fruit',
                      'mixed_organic',
                      'other_organic',
                    ] as WasteCategory[]
                  ).map((cat) => {
                    const isChecked = profileAcceptedCategories.includes(cat);
                    const meta = WASTE_CATEGORY_META[cat];
                    return (
                      <div
                        key={cat}
                        className={`checkbox-category-card ${isChecked ? 'selected' : ''}`}
                        onClick={() => toggleAcceptedCategory(cat)}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent onClick
                        />
                        <div>
                          <div className="font-bold text-sm text-slate-900">
                            {meta.icon} {meta.label}
                          </div>
                          <div className="text-xs text-muted mt-0.5">{meta.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Row 5: Capacity & Pickup Arrangements */}
              <div className="form-row-2 gap-4">
                <div className="form-group">
                  <label className="form-label font-bold text-slate-800">
                    Maximum Daily Processing Capacity (kg) *
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    min="100"
                    step="100"
                    value={profileMaxCapacityKg}
                    onChange={(e) => setProfileMaxCapacityKg(Number(e.target.value))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-slate-800">
                    Available Pickup Logistics Fleet & Arrangements *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Vacuum tankers equipped with mobile scales available 24/7"
                    value={profilePickupArrangements}
                    onChange={(e) => setProfilePickupArrangements(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <>
                      <div className="spinner-small" />
                      <span>Saving Profile...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>Save Facility Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: VIEW DETAILS & REQUEST COLLECTION
          ========================================================================= */}
      {detailsModalOpen && selectedItemForDetails && (
        <Modal
          isOpen={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          title={`Waste Details: ${
            selectedItemForDetails.listing?.foodName ||
            selectedItemForDetails.record?.foodName ||
            'Organic Waste Batch'
          }`}
          maxWidth="600px"
        >
          <div className="flex flex-col gap-4">
            {/* Safety Alert Banner (Requirement 2 & 9) */}
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <ShieldAlert size={24} className="text-red-600 flex-shrink-0" />
              <div className="text-xs text-red-900">
                <strong>Certified Not Suitable for Human Donation:</strong>
                <div>This batch has exceeded safety holding times or donation deadlines and is designated strictly for biogas conversion, composting, or organic recycling.</div>
              </div>
            </div>

            {/* Food Image Preview if present */}
            {(selectedItemForDetails.listing?.imageUrl || selectedItemForDetails.record?.imageUrl) && (
              <div className="flex items-center gap-3 p-2 bg-slate-100 rounded-lg border border-slate-200">
                <img
                  src={selectedItemForDetails.listing?.imageUrl || selectedItemForDetails.record?.imageUrl}
                  alt={selectedItemForDetails.listing?.foodName || selectedItemForDetails.record?.foodName}
                  className="w-16 h-16 object-cover rounded-md shadow-sm"
                />
                <div>
                  <div className="font-bold text-slate-800 text-sm">
                    {selectedItemForDetails.listing?.foodName || selectedItemForDetails.record?.foodName}
                  </div>
                  <div className="text-xs text-muted">
                    {selectedItemForDetails.listing?.remainingQuantityKg || selectedItemForDetails.record?.quantityKg} kg organic surplus
                  </div>
                </div>
              </div>
            )}

            {/* Spec Matrix */}
            <div className="ngo-modal-info-grid">
              <div className="ngo-modal-info-item">
                <span className="ngo-modal-info-label">Estimated Quantity</span>
                <span className="ngo-modal-info-val text-teal-800">
                  {selectedItemForDetails.listing?.remainingQuantityKg ||
                    selectedItemForDetails.record?.quantityKg}{' '}
                  kg
                </span>
              </div>

              <div className="ngo-modal-info-item">
                <span className="ngo-modal-info-label">Hotel / Banquet Donor</span>
                <span className="ngo-modal-info-val">
                  {selectedItemForDetails.listing?.donorOrg ||
                    selectedItemForDetails.record?.donorOrg}
                </span>
                {selectedItemForDetails.listing?.donorPhone && (
                  <small className="text-xs text-muted flex items-center gap-1 mt-0.5">
                    <Phone size={11} /> {selectedItemForDetails.listing.donorPhone}
                  </small>
                )}
              </div>

              <div className="ngo-modal-info-item">
                <span className="ngo-modal-info-label">Pickup Location</span>
                <span className="ngo-modal-info-val text-xs text-slate-700">
                  {selectedItemForDetails.listing?.location ||
                    selectedItemForDetails.record?.location}
                </span>
              </div>

              <div className="ngo-modal-info-item">
                <span className="ngo-modal-info-label">Collection Window</span>
                <span className="ngo-modal-info-val text-amber-700">
                  {getDeadlineStatus(
                    selectedItemForDetails.listing?.pickupDeadline ||
                      selectedItemForDetails.record?.pickupDeadline
                  ).label}
                </span>
              </div>
            </div>

            {/* Collection Request Form */}
            <form onSubmit={handleConfirmCollectionRequest} className="ngo-claim-form-box">
              <div className="ngo-claim-form-title">
                <Truck size={18} className="text-teal-700" />
                <span>Request Waste Collection Dispatch</span>
              </div>

              <div className="form-group">
                <label className="form-label font-bold text-slate-800">
                  Designated Processing Facility
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={userProfile?.organizationName || 'Recycling Plant'}
                  disabled
                />
              </div>

              <div className="form-group">
                <label className="form-label font-bold text-slate-800">
                  Fleet & Driver Notes (Optional)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Tanker vehicle KA-04-E-5678, Driver Rajesh"
                  value={collectionNotes}
                  onChange={(e) => setCollectionNotes(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setDetailsModalOpen(false)}
                  disabled={submittingRequest}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingRequest}
                >
                  {submittingRequest ? (
                    <>
                      <div className="spinner-small" />
                      <span>Submitting Request...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>Confirm Collection Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* =========================================================================
          MODAL 2: MARK AS COLLECTED (Record Actual Weighed Kg - Requirement 6)
          ========================================================================= */}
      {collectedModalOpen && itemToCollect && (
        <Modal
          isOpen={collectedModalOpen}
          onClose={() => setCollectedModalOpen(false)}
          title={`Confirm Pickup & Log Weighed Weight`}
          maxWidth="520px"
        >
          <form onSubmit={handleConfirmCollected} className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              Enter the exact weighed mass recorded from the hotel kitchen scale or your mobile weighbridge scale for <strong>{itemToCollect.foodName}</strong>.
            </p>

            <div className="form-group">
              <label className="form-label font-bold text-slate-800">
                Actual Weighed Mass (kg) *
              </label>
              <div className="input-with-icon">
                <Scale size={18} className="input-icon" />
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className="form-control font-bold text-lg"
                  value={actualWeightKg}
                  onChange={(e) => setActualWeightKg(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                />
              </div>
              <small className="text-xs text-muted mt-1 block">
                Estimated weight was: {itemToCollect.quantityKg} kg
              </small>
            </div>

            <div className="form-group">
              <label className="form-label font-bold text-slate-800">
                Logistics & Collection Remarks
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Loaded into Bio-Tanker 3; temperature 24°C"
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCollectedModalOpen(false)}
                disabled={submittingCollect}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingCollect || !actualWeightKg || Number(actualWeightKg) <= 0}
              >
                {submittingCollect ? (
                  <>
                    <div className="spinner-small" />
                    <span>Recording...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Confirm Pickup & Weighed Mass</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =========================================================================
          MODAL 3: MARK AS PROCESSED (Record Processing Method - Requirement 6)
          ========================================================================= */}
      {processedModalOpen && itemToProcess && (
        <Modal
          isOpen={processedModalOpen}
          onClose={() => setProcessedModalOpen(false)}
          title={`Confirm Bio-Processing Completion`}
          maxWidth="520px"
        >
          <form onSubmit={handleConfirmProcessed} className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              Confirm that this batch of <strong>{itemToProcess.actualCollectedKg || itemToProcess.quantityKg} kg</strong> from {itemToProcess.donorOrg} has completed circular processing.
            </p>

            <div className="form-group">
              <label className="form-label font-bold text-slate-800">
                Processing Method *
              </label>
              <select
                className="form-control"
                value={processingMethod}
                onChange={(e) => setProcessingMethod(e.target.value)}
                required
              >
                <option value="Biogas Methane Generation (Anaerobic Digestion)">
                  🔥 Biogas Methane Generation (Anaerobic Digestion)
                </option>
                <option value="Aerobic Bio-Composting (Organic Windrows)">
                  🌱 Aerobic Bio-Composting (Organic Windrows)
                </option>
                <option value="Organic Bio-Fertilizer Granulation">
                  🌾 Organic Bio-Fertilizer Granulation
                </option>
                <option value="Black Soldier Fly Larvae (BSFL) Bioconversion">
                  🪱 Black Soldier Fly Larvae (BSFL) Bioconversion
                </option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label font-bold text-slate-800">
                Output Notes / Energy Yield
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Yielded approx 28 m³ biogas methane / high nutrient compost"
                value={processNotes}
                onChange={(e) => setProcessNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setProcessedModalOpen(false)}
                disabled={submittingProcess}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success"
                disabled={submittingProcess}
              >
                {submittingProcess ? (
                  <>
                    <div className="spinner-small" />
                    <span>Completing...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Complete & Log as Processed</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
