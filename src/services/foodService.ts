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
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, isFirebaseConfigured } from './firebase';
import type {
  FoodListing,
  FoodListingStatus,
  FoodRequest,
  FoodRequestStatus,
  UserProfile,
  WasteCategory,
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

/**
 * Compresses and scales an image to maximum dimensions before uploading to minimize bandwidth
 * and ensure fast upload times even on slow mobile/hotel network connections.
 */
export async function compressAndOptimizeImage(
  file: File,
  maxDimension = 1280,
  quality = 0.85
): Promise<Blob> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(file);
      return;
    }

    if (!file.type.startsWith('image/') || file.type.includes('svg')) {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

/**
 * Uploads a food photo to Firebase Storage with real-time percentage progress callback.
 * Returns the public HTTPS download URL.
 */
export async function uploadFoodImage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!isFirebaseConfigured || !storage) {
    throw new Error(
      'Firebase Storage is not configured. Please verify VITE_FIREBASE_STORAGE_BUCKET in your environment settings.'
    );
  }

  // Optimize image to under 1280px to ensure fast, reliable uploads
  const optimizedBlob = await compressAndOptimizeImage(file, 1280, 0.85);

  const cleanName = (file.name || 'food_photo.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');
  const storageRef = ref(storage, `foodListings/${Date.now()}_${cleanName}`);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, optimizedBlob, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0) {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          if (onProgress) {
            onProgress(progress);
          }
        }
      },
      (error) => {
        console.error('Firebase Storage upload error:', error);
        let userMsg = error.message;
        if (error.code === 'storage/unauthorized') {
          userMsg =
            'Storage permission denied. You must be signed in as a registered donor to upload food photos.';
        } else if (error.code === 'storage/canceled') {
          userMsg = 'Photo upload was canceled.';
        } else if (error.code === 'storage/quota-exceeded') {
          userMsg = 'Firebase Storage quota exceeded. Please contact administrator.';
        } else if (error.code === 'storage/unknown') {
          userMsg = 'Storage upload failed. Please verify network connection or Firebase Storage bucket CORS.';
        }
        const err = new Error(userMsg);
        (err as any).code = error.code;
        reject(err);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          if (onProgress) onProgress(100);
          resolve(downloadUrl);
        } catch (urlErr) {
          reject(urlErr);
        }
      }
    );
  });
}

export type CreateFoodListingInput = Omit<
  FoodListing,
  'id' | 'createdAt' | 'updatedAt' | 'remainingQuantityKg' | 'status'
> & {
  remainingQuantityKg?: number;
  status?: FoodListingStatus;
};

export async function createFoodListing(
  input: CreateFoodListingInput
): Promise<string> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firestore is not configured. Cannot save listing.');
  }

  const listingsCol = collection(db, 'foodListings');

  // Determine standard kg quantity from direct weight entry
  let standardKg = Number(input.initialQuantityKg);
  if (input.recordedWeight && input.weightUnit) {
    standardKg = input.weightUnit === 'g' ? Number(input.recordedWeight) / 1000 : Number(input.recordedWeight);
  }
  if (!standardKg || standardKg <= 0) {
    throw new Error('Food weight must be greater than zero.');
  }

  // Estimated portions (defaults to ~3 portions per kg if not specified)
  const portionsCount = Number(input.portions) > 0 ? Number(input.portions) : Math.max(1, Math.round(standardKg * 3));

  const docRef = await addDoc(listingsCol, {
    ...input,
    initialQuantityKg: standardKg,
    remainingQuantityKg: standardKg,
    portions: portionsCount,
    recordedWeight: input.recordedWeight ? Number(input.recordedWeight) : standardKg,
    weightUnit: input.weightUnit || 'kg',
    measurementMethod: input.measurementMethod || 'digital_scale',
    foodCondition: input.foodCondition || 'suitable',
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

  const snapshot = await withTimeout(
    getDocs(q),
    5000,
    'Listing query timed out after 5 seconds.'
  );
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

// Fetch only verified surplus listings that meet strict criteria for NGO donation
export async function getNgoSurplusListings(): Promise<FoodListing[]> {
  const listings = await getFoodListings();
  const now = Date.now();
  return listings.filter((item) => {
    // 1. Must be available and have remaining quantity > 0
    const isAvailable = item.status === 'available' && Number(item.remainingQuantityKg) > 0;

    // 2. Must be marked Suitable for Donation (strictly exclude not_suitable and requires_review)
    const isSuitable = item.foodCondition === 'suitable';

    // 3. Deadline must not have passed
    const deadlineMs = item.pickupDeadline ? new Date(item.pickupDeadline).getTime() : NaN;
    const isNotExpired = isNaN(deadlineMs) || deadlineMs > now;

    return isAvailable && isSuitable && isNotExpired;
  });
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
  imageUrl?: string;
  location?: string;
  pickupDeadline?: string;
  pickupInstructions?: string;
  category?: FoodListing['category'];
  donorPhone?: string;
}

// Atomically validates available quantity and records food request using Firestore transaction
export async function requestFood(input: RequestFoodInput): Promise<string> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firestore is not configured');
  }

  // 1. Role verification: ensure user is a registered requester / NGO
  if (input.requester.role !== 'requester' && input.requester.role !== 'admin') {
    throw new Error('Only registered trusts and NGOs can claim surplus food.');
  }

  const requestedKg = Number(input.requestedQuantityKg);
  if (!requestedKg || requestedKg <= 0) {
    throw new Error('Requested quantity must be greater than 0 kg.');
  }

  const listingRef = doc(db, 'foodListings', input.listingId);
  const requestsCol = collection(db, 'foodRequests');

  // 2. Prevent duplicate active requests by the same NGO for the same listing
  try {
    const existingReqQuery = query(
      requestsCol,
      where('listingId', '==', input.listingId),
      where('requesterId', '==', input.requester.uid)
    );
    const existingSnap = await withTimeout(
      getDocs(existingReqQuery),
      4000,
      'Duplicate check timed out'
    );
    const hasActive = existingSnap.docs.some((d) => {
      const data = d.data();
      return data.status === 'pending' || data.status === 'accepted';
    });
    if (hasActive) {
      throw new Error(
        'Your organization already has an active claim (Pending or Approved) for this food listing. Please check "My Requests".'
      );
    }
  } catch (err: any) {
    if (err.message && err.message.includes('already has an active claim')) {
      throw err;
    }
    console.warn('Duplicate check warning, proceeding to atomic transaction:', err);
  }

  const result = await runTransaction(db, async (transaction) => {
    const listingSnap = await transaction.get(listingRef);
    if (!listingSnap.exists()) {
      throw new Error('Food listing not found or has been removed.');
    }

    const listingData = listingSnap.data() as FoodListing;
    const currentRemaining = Number(listingData.remainingQuantityKg);

    // Verify listing is available
    if (listingData.status !== 'available' && listingData.status !== 'reserved') {
      throw new Error(`This listing is currently ${listingData.status.replace('_', ' ')} and cannot be requested.`);
    }

    // Suitability check: never allow not_suitable or requires_review for NGO claims
    if (listingData.foodCondition === 'not_suitable') {
      throw new Error('This food listing is marked Not Suitable for Donation and cannot be claimed.');
    }
    if (listingData.foodCondition === 'requires_review') {
      throw new Error('This food listing requires kitchen safety review before it can be donated.');
    }

    // Deadline check: pickup deadline must not have passed
    if (listingData.pickupDeadline) {
      const deadlineMs = new Date(listingData.pickupDeadline).getTime();
      if (!isNaN(deadlineMs) && deadlineMs <= Date.now()) {
        throw new Error('The pickup deadline for this food listing has already expired.');
      }
    }

    // Quantity check
    if (currentRemaining <= 0) {
      throw new Error('This food listing has already been completely claimed by another partner.');
    }

    if (requestedKg > currentRemaining) {
      throw new Error(
        `Requested quantity (${requestedKg} kg) exceeds available quantity (${currentRemaining} kg).`
      );
    }

    const newRemaining = Math.max(0, Math.round((currentRemaining - requestedKg) * 100) / 100);
    const newStatus = newRemaining === 0 ? 'reserved' : 'available';

    // Update listing remaining quantity and status atomically
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
      donorPhone: listingData.donorPhone || input.donorPhone || '',
      requesterId: input.requester.uid,
      requesterName: input.requester.name,
      requesterOrg: input.requester.organizationName,
      requesterPhone: input.requester.phone || '',
      requestedQuantityKg: requestedKg,
      requestedPortions: Number(input.requestedPortions) || Math.max(1, Math.round(requestedKg * 3)),
      pickupTimeEstimate: input.pickupTimeEstimate || 'Within pickup window',
      notes: input.notes || '',
      imageUrl: listingData.imageUrl || input.imageUrl || '',
      location: listingData.location || input.location || '',
      pickupDeadline: listingData.pickupDeadline || input.pickupDeadline || '',
      pickupInstructions: listingData.pickupInstructions || input.pickupInstructions || '',
      category: listingData.category || input.category || 'other',
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

  const snapshot = await withTimeout(
    getDocs(q),
    5000,
    'Food requests query timed out after 5 seconds.'
  );
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

    // A completed request cannot be reactivated
    if (reqData.status === 'completed') {
      throw new Error('A completed request cannot be modified or reactivated.');
    }

    // If cancelled or rejected from pending or accepted, release the quantity back to the listing
    if (
      (newStatus === 'rejected' || newStatus === 'cancelled') &&
      (reqData.status === 'pending' || reqData.status === 'accepted')
    ) {
      const listingRef = doc(db!, 'foodListings', reqData.listingId);
      const listingSnap = await transaction.get(listingRef);
      if (listingSnap.exists()) {
        const listing = listingSnap.data() as FoodListing;
        const currentRemaining = Number(listing.remainingQuantityKg) || 0;
        const initialQty = Number(listing.initialQuantityKg) || currentRemaining;
        const restoredRemaining = Math.min(
          initialQty,
          Math.round((currentRemaining + Number(reqData.requestedQuantityKg)) * 100) / 100
        );
        transaction.update(listingRef, {
          remainingQuantityKg: restoredRemaining,
          status: 'available',
          updatedAt: serverTimestamp(),
        });
      }
    }

    // If marked completed, check if listing should also be marked completed if all portions taken
    if (newStatus === 'completed') {
      const listingRef = doc(db!, 'foodListings', reqData.listingId);
      const listingSnap = await transaction.get(listingRef);
      if (listingSnap.exists()) {
        const listing = listingSnap.data() as FoodListing;
        if (Number(listing.remainingQuantityKg) === 0 && listing.status === 'reserved') {
          transaction.update(listingRef, {
            status: 'completed',
            updatedAt: serverTimestamp(),
          });
        }
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
