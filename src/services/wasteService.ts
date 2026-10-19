import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './firebase';
import type {
  WasteCollection,
  WasteCollectionStatus,
  UserProfile,
  WasteCategory,
  FoodListing,
} from '../types';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(timeoutMessage);
      (err as any).code = 'firestore/timeout';
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

// Maps hotel food category to standardized organic waste category
export function mapFoodCategoryToWaste(category: string): WasteCategory {
  switch (category) {
    case 'rice_pulao':
    case 'roti_bread':
    case 'bakery':
      return 'rice_bread';
    case 'curries_dal':
    case 'cooked_meals':
    case 'snacks_starters':
    case 'sweets_desserts':
      return 'cooked_food';
    case 'fruits_salad_others':
    case 'raw_produce':
      return 'veg_fruit';
    case 'composting':
      return 'veg_fruit';
    case 'biogas':
      return 'cooked_food';
    default:
      return 'mixed_organic';
  }
}

export interface CreateWasteInput {
  foodName: string;
  category: WasteCategory;
  quantityKg: number;
  location: string;
  destinationFacility: string;
  donorId: string;
  donorOrg: string;
  donorPhone?: string;
  notes?: string;
  sourceListingId?: string;
  pickupDeadline?: string;
  prepDate?: string;
  prepTime?: string;
  storageCondition?: any;
  foodCondition?: any;
  imageUrl?: string;
}

export async function createWasteCollection(input: CreateWasteInput): Promise<string> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firestore is not configured. Cannot record waste collection.');
  }

  const wasteCol = collection(db, 'wasteCollections');
  const docRef = await addDoc(wasteCol, {
    ...input,
    quantityKg: Number(input.quantityKg),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function getWasteCollections(filters?: {
  status?: string;
  partnerId?: string;
  donorId?: string;
  category?: string;
}): Promise<WasteCollection[]> {
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return [];

  const wasteCol = collection(db, 'wasteCollections');
  let q;

  if (filters?.donorId) {
    q = query(wasteCol, where('donorId', '==', filters.donorId));
  } else if (filters?.partnerId) {
    q = query(wasteCol, where('partnerId', '==', filters.partnerId));
  } else if (filters?.status) {
    q = query(wasteCol, where('status', '==', filters.status));
  } else {
    q = query(wasteCol);
  }

  const snapshot = await withTimeout(
    getDocs(q),
    5000,
    'Waste collections query timed out after 5 seconds.'
  );
  let list: WasteCollection[] = snapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<WasteCollection, 'id'>),
  }));

  // Sort in-memory by createdAt descending
  list.sort((a, b) => {
    const timeA = a.createdAt?.toDate?.()?.getTime?.() || new Date(a.createdAt).getTime() || 0;
    const timeB = b.createdAt?.toDate?.()?.getTime?.() || new Date(b.createdAt).getTime() || 0;
    return timeB - timeA;
  });

  if (filters?.category && filters.category !== 'all') {
    list = list.filter((item) => item.category === filters.category);
  }

  return list;
}

import { isListingExpired, parsePickupDeadlineMs } from './foodService';

// Fetch both transferred waste and hotel surplus eligible for recycling:
// 1) Hotel surplus marked 'not_suitable'
// 2) Expired surplus whose pickup deadline has passed with remaining uncollected food
// Safe rule: Edible food with an active future deadline remains reserved for human relief
export async function getAvailableWasteForRecyclers(): Promise<{
  wasteRecords: WasteCollection[];
  unsuitableListings: FoodListing[];
}> {
  if (!isFirebaseConfigured || !db || !auth?.currentUser) {
    return { wasteRecords: [], unsuitableListings: [] };
  }

  // 1. Fetch available wasteCollections
  const wasteCol = collection(db, 'wasteCollections');
  const wasteSnap = await withTimeout(
    getDocs(wasteCol),
    10000,
    'Waste query timed out'
  );
  const wasteRecords: WasteCollection[] = wasteSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<WasteCollection, 'id'>),
  }));

  // Sort waste records in-memory by createdAt descending
  wasteRecords.sort((a, b) => {
    const timeA = a.createdAt?.toDate?.()?.getTime?.() || new Date(a.createdAt).getTime() || 0;
    const timeB = b.createdAt?.toDate?.()?.getTime?.() || new Date(b.createdAt).getTime() || 0;
    return timeB - timeA;
  });

  // Track listings already processed into wasteCollections to prevent duplicates
  const existingSourceListingIds = new Set(
    wasteRecords
      .filter((w) => w.status !== 'cancelled' && Boolean(w.sourceListingId))
      .map((w) => w.sourceListingId!)
  );

  // 2. Fetch foodListings using rules-compatible query filters:
  // Query status in ['available', 'reserved', 'expired'] to cover active, reserved, and expired surplus
  const listingsCol = collection(db, 'foodListings');
  const qStatusListings = query(
    listingsCol,
    where('status', 'in', ['available', 'reserved', 'expired'])
  );

  const listingsSnap = await withTimeout(
    getDocs(qStatusListings),
    10000,
    'Listings query timed out'
  );

  const listingsMap = new Map<string, FoodListing>();
  listingsSnap.docs.forEach((d) => {
    listingsMap.set(d.id, {
      id: d.id,
      ...(d.data() as Omit<FoodListing, 'id'>),
    });
  });

  // Also query any listing marked 'not_suitable' (if not already captured)
  try {
    const qUnsuitable = query(listingsCol, where('foodCondition', '==', 'not_suitable'));
    const unsSnap = await withTimeout(getDocs(qUnsuitable), 6000, 'Unsuitable query timed out');
    unsSnap.docs.forEach((d) => {
      if (!listingsMap.has(d.id)) {
        listingsMap.set(d.id, {
          id: d.id,
          ...(d.data() as Omit<FoodListing, 'id'>),
        });
      }
    });
  } catch (unsErr) {
    console.warn('[Waste Service] Unsuitable foodCondition query warning:', unsErr);
  }

  const allListings = Array.from(listingsMap.values());
  const now = Date.now();

  // Filter listings:
  // - Must have positive remaining quantity
  // - Fully collected food (status === 'completed' or remaining <= 0) must NEVER be recycled
  // - Food condition is 'not_suitable' OR status is 'expired' OR deadline has passed
  const unsuitableListings = allListings.filter((item) => {
    const hasRemaining = Number(item.remainingQuantityKg) > 0;
    const isCompletedOrGone =
      item.status === 'completed' ||
      item.status === 'transferred_to_waste' ||
      item.status === 'cancelled';
    const notAlreadyInWaste = !existingSourceListingIds.has(item.id);

    if (!hasRemaining || isCompletedOrGone || !notAlreadyInWaste) {
      return false;
    }

    const isUnsuitable = item.foodCondition === 'not_suitable';
    const isExpired = isListingExpired(item, now);

    return isUnsuitable || isExpired;
  });

  // Sort unsuitable/expired listings in-memory by createdAt descending
  unsuitableListings.sort((a, b) => {
    const timeA = a.createdAt?.toDate?.()?.getTime?.() || new Date(a.createdAt).getTime() || 0;
    const timeB = b.createdAt?.toDate?.()?.getTime?.() || new Date(b.createdAt).getTime() || 0;
    return timeB - timeA;
  });

  return { wasteRecords, unsuitableListings };
}

// Atomically claim or request collection directly from a hotel listing marked 'not_suitable' or 'expired'
export async function requestCollectionFromListing(
  listing: FoodListing,
  partner: UserProfile,
  notes?: string
): Promise<string> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  if (partner.role !== 'waste_partner' && partner.role !== 'admin') {
    throw new Error('Only authorized waste recycling partners can request organic waste collections.');
  }

  const listingRef = doc(db, 'foodListings', listing.id);
  const wasteCol = collection(db, 'wasteCollections');

  const wasteId = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(listingRef);
    if (!snap.exists()) throw new Error('Listing does not exist or has been removed');

    const data = snap.data() as FoodListing;

    const isExpired = isListingExpired(data);

    // Strict safety check: Never process active donation surplus as waste UNLESS it has expired
    if (!isExpired) {
      if (data.foodCondition === 'suitable') {
        throw new Error('This listing is marked Suitable for Donation and is currently active for community relief.');
      }

      if (data.foodCondition === 'requires_review') {
        throw new Error('This listing requires safety inspection and is not yet released for collection.');
      }
    }

    const wasteQty = Number(data.remainingQuantityKg);
    if (wasteQty <= 0 || data.status === 'transferred_to_waste' || data.status === 'completed') {
      throw new Error('This food listing has already been transferred, claimed, or fully completed.');
    }

    // Atomically transfer listing out of donation circulation
    transaction.update(listingRef, {
      remainingQuantityKg: 0,
      status: 'transferred_to_waste',
      updatedAt: serverTimestamp(),
    });

    // Create waste collection record assigned to this partner
    const newWasteRef = doc(wasteCol);
    const wasteCat = mapFoodCategoryToWaste(data.category);

    transaction.set(newWasteRef, {
      sourceListingId: listing.id,
      donorId: data.donorId,
      donorOrg: data.donorOrg,
      donorPhone: data.donorPhone || '',
      foodName: data.foodName,
      category: wasteCat,
      quantityKg: wasteQty,
      location: data.location,
      destinationFacility: partner.organizationName || 'Recycling Plant',
      partnerId: partner.uid,
      partnerName: partner.organizationName || partner.name,
      partnerPhone: partner.phone || '',
      status: 'collection_requested',
      pickupDeadline: data.pickupDeadline || '',
      prepDate: data.prepDate || '',
      prepTime: data.prepTime || '',
      storageCondition: data.storageCondition || 'room_temp',
      foodCondition: data.foodCondition,
      imageUrl: data.imageUrl || '',
      notes: notes || `Collection requested by ${partner.organizationName}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return newWasteRef.id;
  });

  return wasteId;
}

// Request collection on an unassigned waste record
export async function claimWasteCollection(
  collectionId: string,
  partner: UserProfile,
  notes?: string
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  if (partner.role !== 'waste_partner' && partner.role !== 'admin') {
    throw new Error('Only authorized waste recycling partners can request organic waste collections.');
  }

  const ref = doc(db, 'wasteCollections', collectionId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Waste record not found');

    const data = snap.data() as WasteCollection;
    if (data.partnerId && data.partnerId !== partner.uid && data.status !== 'pending') {
      throw new Error('This waste collection has already been claimed by another recycling facility.');
    }

    transaction.update(ref, {
      partnerId: partner.uid,
      partnerName: partner.organizationName || partner.name,
      partnerPhone: partner.phone || '',
      destinationFacility: partner.organizationName,
      status: 'collection_requested',
      notes: notes || data.notes || '',
      updatedAt: serverTimestamp(),
    });
  });
}

// Update Collection Lifecycle Workflow
// Available → Collection Requested → Accepted → Collected → Processing → Processed
export async function updateWasteCollectionWorkflow(
  collectionId: string,
  updates: {
    status: WasteCollectionStatus;
    actualCollectedKg?: number;
    processingMethod?: string;
    notes?: string;
  },
  currentUserId: string
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  const ref = doc(db, 'wasteCollections', collectionId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Waste record not found');

    const data = snap.data() as WasteCollection;
    const isPartner = data.partnerId === currentUserId;
    const isDonor = data.donorId === currentUserId;

    if (!isPartner && !isDonor) {
      throw new Error('Not authorized to update this collection record.');
    }

    // Prevent completed or cancelled records from being reactivated
    if (data.status === 'processed' || data.status === 'completed') {
      throw new Error('Completed and processed waste records cannot be reactivated.');
    }

    const payload: Record<string, any> = {
      status: updates.status,
      updatedAt: serverTimestamp(),
    };

    if (updates.notes) {
      payload.notes = updates.notes;
    }

    // When status is 'collected', record actual weighed kilograms
    if (updates.status === 'collected') {
      if (updates.actualCollectedKg !== undefined && Number(updates.actualCollectedKg) > 0) {
        payload.actualCollectedKg = Number(updates.actualCollectedKg);
      } else {
        payload.actualCollectedKg = data.quantityKg;
      }
      payload.collectedAt = serverTimestamp();
    }

    // When status is 'processed', record conversion method
    if (updates.status === 'processed') {
      payload.processingMethod = updates.processingMethod || 'Biogas / Composting Conversion';
      payload.processedAt = serverTimestamp();
    }

    // If cancelled, release if possible
    if (updates.status === 'cancelled') {
      if (data.sourceListingId) {
        const listingRef = doc(db!, 'foodListings', data.sourceListingId);
        const listingSnap = await transaction.get(listingRef);
        if (listingSnap.exists()) {
          transaction.update(listingRef, {
            remainingQuantityKg: data.quantityKg,
            status: 'available',
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    transaction.update(ref, payload);
  });
}

// Maintain Recycler Facility Profile
export async function updateRecyclerProfile(
  uid: string,
  profileUpdates: Partial<UserProfile>
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    ...profileUpdates,
    updatedAt: serverTimestamp(),
  });
}
