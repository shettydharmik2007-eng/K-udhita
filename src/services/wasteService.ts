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
import { db, isFirebaseConfigured } from './firebase';
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
  if (!isFirebaseConfigured || !db) return [];

  const wasteCol = collection(db, 'wasteCollections');
  let q = query(wasteCol, orderBy('createdAt', 'desc'));

  if (filters?.donorId) {
    q = query(wasteCol, where('donorId', '==', filters.donorId));
  } else if (filters?.partnerId) {
    q = query(wasteCol, where('partnerId', '==', filters.partnerId));
  } else if (filters?.status) {
    q = query(wasteCol, where('status', '==', filters.status));
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

  if (filters?.category && filters.category !== 'all') {
    list = list.filter((item) => item.category === filters.category);
  }

  return list;
}

import { parsePickupDeadlineMs, syncExpiredFoodListings } from './foodService';

// Fetch both transferred waste and hotel surplus eligible for recycling:
// 1) Hotel surplus marked 'not_suitable'
// 2) Expired surplus whose pickup deadline has passed with remaining uncollected food
// Safe rule: Edible food with an active future deadline remains reserved for human relief
export async function getAvailableWasteForRecyclers(): Promise<{
  wasteRecords: WasteCollection[];
  unsuitableListings: FoodListing[];
}> {
  if (!isFirebaseConfigured || !db) {
    return { wasteRecords: [], unsuitableListings: [] };
  }

  // Trigger background expiry sync across active listings
  void syncExpiredFoodListings();

  // 1. Fetch available wasteCollections
  const wasteCol = collection(db, 'wasteCollections');
  const wasteSnap = await withTimeout(
    getDocs(query(wasteCol, orderBy('createdAt', 'desc'))),
    5000,
    'Waste query timed out'
  );
  const wasteRecords: WasteCollection[] = wasteSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<WasteCollection, 'id'>),
  }));

  // Track listings already processed into wasteCollections to prevent duplicates
  const existingSourceListingIds = new Set(
    wasteRecords
      .map((w) => w.sourceListingId)
      .filter((id): id is string => Boolean(id))
  );

  // 2. Fetch foodListings
  const listingsCol = collection(db, 'foodListings');
  const listingsSnap = await withTimeout(
    getDocs(query(listingsCol, orderBy('createdAt', 'desc'))),
    5000,
    'Listings query timed out'
  );
  const allListings: FoodListing[] = listingsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<FoodListing, 'id'>),
  }));

  const now = Date.now();

  // Filter listings:
  // - Must have positive remaining quantity
  // - Not fully collected, transferred, or cancelled
  // - Not already converted to a wasteCollection record
  // - Food condition is 'not_suitable' OR status is 'expired' OR deadline has passed
  const unsuitableListings = allListings.filter((item) => {
    const hasRemaining = Number(item.remainingQuantityKg) > 0;
    const isAvailableState =
      item.status !== 'transferred_to_waste' &&
      item.status !== 'completed' &&
      item.status !== 'cancelled';
    const notAlreadyInWaste = !existingSourceListingIds.has(item.id);

    if (!hasRemaining || !isAvailableState || !notAlreadyInWaste) {
      return false;
    }

    const isUnsuitable = item.foodCondition === 'not_suitable';
    const deadlineMs = parsePickupDeadlineMs(item.pickupDeadline);
    const isExpired = item.status === 'expired' || (!isNaN(deadlineMs) && deadlineMs <= now);

    return isUnsuitable || isExpired;
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

    const deadlineMs = parsePickupDeadlineMs(data.pickupDeadline);
    const isExpired = data.status === 'expired' || (!isNaN(deadlineMs) && deadlineMs <= Date.now());

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
      throw new Error('This waste batch has already been transferred or claimed by another facility.');
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
