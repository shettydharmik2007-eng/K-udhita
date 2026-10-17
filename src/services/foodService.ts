import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, isFirebaseConfigured } from './firebase';
import type {
  FoodListing,
  FoodRequest,
  FoodRequestStatus,
  UserProfile,
  WasteCategory,
} from '../types';

export async function uploadFoodImage(file: File): Promise<string> {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Firebase Storage is not configured. Please complete setup in .env');
  }

  // Generate safe unique filename
  const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storageRef = ref(storage, `foodListings/${Date.now()}_${cleanName}`);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
  });
  return await getDownloadURL(snapshot.ref);
}

export type CreateFoodListingInput = Omit<
  FoodListing,
  'id' | 'createdAt' | 'updatedAt' | 'remainingQuantityKg' | 'status'
>;

export async function createFoodListing(
  input: CreateFoodListingInput
): Promise<string> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firestore is not configured. Cannot save listing.');
  }

  const listingsCol = collection(db, 'foodListings');
  const docRef = await addDoc(listingsCol, {
    ...input,
    initialQuantityKg: Number(input.initialQuantityKg),
    remainingQuantityKg: Number(input.initialQuantityKg),
    portions: Number(input.portions),
    status: 'available',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function getFoodListings(filters?: {
  donorId?: string;
  status?: string;
  category?: string;
}): Promise<FoodListing[]> {
  if (!isFirebaseConfigured || !db) return [];

  const listingsCol = collection(db, 'foodListings');
  let q = query(listingsCol, orderBy('createdAt', 'desc'));

  if (filters?.donorId) {
    q = query(listingsCol, where('donorId', '==', filters.donorId));
  } else if (filters?.status) {
    q = query(listingsCol, where('status', '==', filters.status));
  }

  const snapshot = await getDocs(q);
  const listings: FoodListing[] = snapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<FoodListing, 'id'>),
  }));

  // Additional in-memory filtering for compound criteria (avoids composite index requirement in Firestore)
  let result = listings;
  if (filters?.category && filters.category !== 'all') {
    result = result.filter((item) => item.category === filters.category);
  }
  if (filters?.status && filters.donorId) {
    result = result.filter((item) => item.status === filters.status);
  }

  return result;
}

export async function getFoodListingById(id: string): Promise<FoodListing | null> {
  if (!isFirebaseConfigured || !db) return null;
  const docRef = doc(db, 'foodListings', id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<FoodListing, 'id'>) };
}

export async function updateFoodListing(
  id: string,
  updates: Partial<FoodListing>,
  currentUserId: string
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  const listingRef = doc(db, 'foodListings', id);
  const snap = await getDoc(listingRef);
  if (!snap.exists()) throw new Error('Food listing not found');

  const data = snap.data();
  if (data.donorId !== currentUserId) {
    throw new Error('Permission denied. Only the listing creator can update this food.');
  }

  await updateDoc(listingRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteFoodListing(
  id: string,
  currentUserId: string
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  const listingRef = doc(db, 'foodListings', id);
  const snap = await getDoc(listingRef);
  if (!snap.exists()) throw new Error('Food listing not found');

  if (snap.data().donorId !== currentUserId) {
    throw new Error('Permission denied. Only the listing creator can delete this food.');
  }

  await deleteDoc(listingRef);
}

export interface RequestFoodInput {
  listingId: string;
  requestedQuantityKg: number;
  requestedPortions: number;
  requester: UserProfile;
  pickupTimeEstimate: string;
  notes?: string;
}

// Atomically validates available quantity and records food request using Firestore transaction
export async function requestFood(input: RequestFoodInput): Promise<string> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firestore is not configured');
  }

  const requestedKg = Number(input.requestedQuantityKg);
  if (requestedKg <= 0) {
    throw new Error('Requested quantity must be greater than 0 kg');
  }

  const listingRef = doc(db, 'foodListings', input.listingId);
  const requestsCol = collection(db, 'foodRequests');

  const result = await runTransaction(db, async (transaction) => {
    const listingSnap = await transaction.get(listingRef);
    if (!listingSnap.exists()) {
      throw new Error('Listing does not exist');
    }

    const listingData = listingSnap.data() as FoodListing;
    const currentRemaining = Number(listingData.remainingQuantityKg);

    if (listingData.status !== 'available' && listingData.status !== 'reserved') {
      throw new Error(`This listing is currently ${listingData.status} and cannot be requested.`);
    }

    if (requestedKg > currentRemaining) {
      throw new Error(
        `Requested quantity (${requestedKg} kg) exceeds available quantity (${currentRemaining} kg).`
      );
    }

    const newRemaining = Math.max(0, currentRemaining - requestedKg);
    const newStatus = newRemaining === 0 ? 'reserved' : 'available';

    // Update listing remaining quantity
    transaction.update(listingRef, {
      remainingQuantityKg: newRemaining,
      status: newStatus,
      updatedAt: serverTimestamp(),
    });

    // Create food request document
    const newRequestRef = doc(requestsCol);
    transaction.set(newRequestRef, {
      listingId: input.listingId,
      foodName: listingData.foodName,
      donorId: listingData.donorId,
      donorOrg: listingData.donorOrg,
      requesterId: input.requester.uid,
      requesterName: input.requester.name,
      requesterOrg: input.requester.organizationName,
      requesterPhone: input.requester.phone || '',
      requestedQuantityKg: requestedKg,
      requestedPortions: Number(input.requestedPortions) || 1,
      pickupTimeEstimate: input.pickupTimeEstimate,
      notes: input.notes || '',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return newRequestRef.id;
  });

  return result;
}

export async function getFoodRequests(filters: {
  donorId?: string;
  requesterId?: string;
  listingId?: string;
}): Promise<FoodRequest[]> {
  if (!isFirebaseConfigured || !db) return [];

  const requestsCol = collection(db, 'foodRequests');
  let q = query(requestsCol, orderBy('createdAt', 'desc'));

  if (filters.donorId) {
    q = query(requestsCol, where('donorId', '==', filters.donorId));
  } else if (filters.requesterId) {
    q = query(requestsCol, where('requesterId', '==', filters.requesterId));
  } else if (filters.listingId) {
    q = query(requestsCol, where('listingId', '==', filters.listingId));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<FoodRequest, 'id'>),
  }));
}

export async function updateRequestStatus(
  requestId: string,
  newStatus: FoodRequestStatus,
  currentUserId: string
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  const requestRef = doc(db, 'foodRequests', requestId);

  await runTransaction(db, async (transaction) => {
    const reqSnap = await transaction.get(requestRef);
    if (!reqSnap.exists()) throw new Error('Request not found');

    const reqData = reqSnap.data() as FoodRequest;
    const isDonor = reqData.donorId === currentUserId;
    const isRequester = reqData.requesterId === currentUserId;

    if (!isDonor && !isRequester) {
      throw new Error('Not authorized to update this request');
    }

    // If cancelled or rejected, release the quantity back to the listing
    if ((newStatus === 'rejected' || newStatus === 'cancelled') && reqData.status === 'pending') {
      const listingRef = doc(db!, 'foodListings', reqData.listingId);
      const listingSnap = await transaction.get(listingRef);
      if (listingSnap.exists()) {
        const listing = listingSnap.data() as FoodListing;
        const restoredRemaining = Number(listing.remainingQuantityKg) + Number(reqData.requestedQuantityKg);
        transaction.update(listingRef, {
          remainingQuantityKg: restoredRemaining,
          status: 'available',
          updatedAt: serverTimestamp(),
        });
      }
    }

    transaction.update(requestRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  });
}

// Transfer surplus/expired listing food into waste management collection
export async function transferListingToWaste(
  listingId: string,
  category: WasteCategory,
  destinationFacility: string,
  notes?: string
): Promise<string> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  const listingRef = doc(db, 'foodListings', listingId);
  const wasteCol = collection(db, 'wasteCollections');

  const wasteId = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(listingRef);
    if (!snap.exists()) throw new Error('Listing not found');

    const listing = snap.data() as FoodListing;
    const wasteQty = Number(listing.remainingQuantityKg);

    if (wasteQty <= 0) {
      throw new Error('No remaining food to transfer to waste');
    }

    // Mark listing as transferred_to_waste
    transaction.update(listingRef, {
      remainingQuantityKg: 0,
      status: 'transferred_to_waste',
      updatedAt: serverTimestamp(),
    });

    // Create waste collection record
    const newWasteRef = doc(wasteCol);
    transaction.set(newWasteRef, {
      sourceListingId: listingId,
      donorId: listing.donorId,
      donorOrg: listing.donorOrg,
      donorPhone: listing.donorPhone || '',
      foodName: listing.foodName,
      category,
      quantityKg: wasteQty,
      location: listing.location,
      destinationFacility,
      status: 'pending',
      notes: notes || `Transferred from listing: ${listing.foodName}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return newWasteRef.id;
  });

  return wasteId;
}
