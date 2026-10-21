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

const cloudinaryCloudName = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
const cloudinaryUploadPreset = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();

export const isCloudinaryConfigured = Boolean(
  cloudinaryCloudName &&
  cloudinaryCloudName !== 'your_cloudinary_cloud_name' &&
  cloudinaryUploadPreset &&
  cloudinaryUploadPreset !== 'your_unsigned_upload_preset'
);

/**
 * Uploads an image to Cloudinary using an unsigned upload preset.
 * Provides real-time percentage progress and returns the public HTTPS secure_url.
 */
export async function uploadToCloudinary(
  fileBlob: Blob,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryCloudName)}/image/upload`;

    xhr.open('POST', url, true);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && response.secure_url) {
          if (onProgress) onProgress(100);
          console.info(`[Cloudinary Upload] Food photo successfully hosted: ${response.secure_url}`);
          resolve(response.secure_url);
        } else {
          const rawMsg = response.error?.message || xhr.statusText || 'Upload failed';
          console.error(`[Cloudinary Error] Code: ${xhr.status} | Message: ${rawMsg}`);
          let userHint = rawMsg;
          if (rawMsg.toLowerCase().includes('whitelisted for unsigned')) {
            userHint = `Cloudinary preset "${cloudinaryUploadPreset}" is set to Signed. In Cloudinary Console → Settings → Upload → Upload presets, edit "${cloudinaryUploadPreset}" and change Signing Mode to "Unsigned".`;
          }
          const err = new Error(userHint);
          (err as any).code = 'cloudinary/upload-failed';
          reject(err);
        }
      } catch {
        const err = new Error(`Invalid server response from Cloudinary (HTTP ${xhr.status})`);
        (err as any).code = 'cloudinary/parse-error';
        reject(err);
      }
    };

    xhr.onerror = () => {
      console.error('[Cloudinary Error] Network request failed');
      const err = new Error('Network error uploading food photo to Cloudinary.');
      (err as any).code = 'cloudinary/network-error';
      reject(err);
    };

    xhr.ontimeout = () => {
      console.error('[Cloudinary Error] Upload timed out after 25s');
      const err = new Error('Food photo upload to Cloudinary timed out.');
      (err as any).code = 'cloudinary/timeout';
      reject(err);
    };

    xhr.timeout = 25000;

    const formData = new FormData();
    formData.append('file', fileBlob, fileName);
    formData.append('upload_preset', cloudinaryUploadPreset);
    xhr.send(formData);
  });
}

/**
 * Uploads a food photo with real-time percentage progress callback.
 * Prefers Cloudinary if configured; otherwise uploads to Firebase Storage.
 * Returns the public HTTPS URL.
 */
export async function uploadFoodImage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  // Optimize image to under 1280px to ensure fast, reliable uploads
  const optimizedBlob = await compressAndOptimizeImage(file, 1280, 0.85);
  const cleanName = (file.name || 'food_photo.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');

  // Primary Path: If Cloudinary is configured, use it directly (ideal for free plan without Firebase Blaze)
  if (isCloudinaryConfigured) {
    console.info(
      `[Food Photo Upload] Using Cloudinary (Cloud: "${cloudinaryCloudName}", Preset: "${cloudinaryUploadPreset}")`
    );
    return await uploadToCloudinary(optimizedBlob, cleanName, onProgress);
  }

  // Secondary Path: Firebase Storage
  if (!isFirebaseConfigured || !storage) {
    throw new Error(
      'Image upload is not configured. Please set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET, or VITE_FIREBASE_STORAGE_BUCKET in your environment settings.'
    );
  }

  const storageRef = ref(storage, `foodListings/${Date.now()}_${cleanName}`);

  // Diagnostic logging: reports bucket name, target path, and payload size without credentials
  console.info(
    `[Firebase Storage Upload] Target Bucket: "${storageRef.bucket}" | Path: "${storageRef.fullPath}" | Size: ${optimizedBlob.size} bytes`
  );

  return new Promise((resolve, reject) => {
    let completed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const uploadTask = uploadBytesResumable(storageRef, optimizedBlob, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });

    // Timeout guard: If the upload is stuck at 0% for more than 10 seconds (e.g. preflight 404 / CORS retry loop),
    // cancel the upload and report the exact diagnostic error instead of hanging for 10 minutes.
    timer = setTimeout(() => {
      if (!completed && uploadTask.snapshot.bytesTransferred === 0) {
        try {
          uploadTask.cancel();
        } catch {
          // ignore error on cancel
        }
        const errorMsg = `Upload timed out at 0% connecting to bucket "${storageRef.bucket}". Firebase Storage preflight returned 404/CORS. Please check Firebase Console → Storage → Files to verify that Cloud Storage is activated and that the bucket name matches gs://${storageRef.bucket}.`;
        console.error(`[Firebase Storage Diagnostic] ${errorMsg}`);
        const timeoutErr = new Error(errorMsg);
        (timeoutErr as any).code = 'storage/preflight-not-found';
        reject(timeoutErr);
      }
    }, 10000);

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
        completed = true;
        if (timer) clearTimeout(timer);

        // Explicit error logging: reports bucket name, error code, and error message
        console.error(
          `[Firebase Storage Error] Bucket: "${storageRef.bucket}" | Code: "${error.code}" | Message: "${error.message}"`
        );
        if ((error as any).serverResponse) {
          console.error(`[Firebase Storage Server Response] ${(error as any).serverResponse}`);
        }

        let userMsg = error.message;
        if (error.code === 'storage/unauthorized') {
          userMsg =
            'Storage permission denied. You must be signed in as a registered donor to upload food photos.';
        } else if (error.code === 'storage/canceled') {
          userMsg = `Photo upload was canceled or timed out for bucket "${storageRef.bucket}".`;
        } else if (error.code === 'storage/quota-exceeded') {
          userMsg = 'Firebase Storage quota exceeded. Please contact administrator.';
        } else if (error.code === 'storage/unknown' || error.code === 'storage/retry-limit-exceeded') {
          userMsg = `Storage upload failed for bucket "${storageRef.bucket}". The Storage bucket may not be initialized in Firebase Console or the bucket name is incorrect (preflight returned 404 Not Found / CORS). Check Firebase Console → Storage → Files.`;
        } else {
          userMsg = `Storage error (${error.code || 'unknown'}): ${error.message} (Bucket: ${storageRef.bucket})`;
        }
        const err = new Error(userMsg);
        (err as any).code = error.code;
        reject(err);
      },
      async () => {
        completed = true;
        if (timer) clearTimeout(timer);
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          if (onProgress) onProgress(100);
          console.info(`[Firebase Storage Upload] Success for bucket "${storageRef.bucket}". URL obtained.`);
          resolve(downloadUrl);
        } catch (urlErr: any) {
          console.error(
            `[Firebase Storage Error] Failed to get download URL from bucket "${storageRef.bucket}":`,
            urlErr?.message || urlErr
          );
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

export function parsePickupDeadlineMs(pickupDeadline?: any): number {
  if (pickupDeadline === undefined || pickupDeadline === null || pickupDeadline === '') {
    return NaN;
  }

  // 1. Firestore Timestamp instance or object with toDate()
  if (typeof pickupDeadline === 'object') {
    if (typeof pickupDeadline.toDate === 'function') {
      try {
        const d = pickupDeadline.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d.getTime();
      } catch {
        // continue
      }
    }
    // 2. Serialized Firestore Timestamp: { seconds, nanoseconds } or { _seconds, _nanoseconds }
    const secs = pickupDeadline.seconds ?? pickupDeadline._seconds;
    if (secs !== undefined && secs !== null) {
      const numSecs = Number(secs);
      if (!isNaN(numSecs)) {
        const nanos = pickupDeadline.nanoseconds ?? pickupDeadline._nanoseconds ?? 0;
        return Math.round(numSecs * 1000 + Number(nanos) / 1000000);
      }
    }
    // 3. Native Date instance
    if (pickupDeadline instanceof Date) {
      return pickupDeadline.getTime();
    }
  }

  // 4. Numeric timestamp (milliseconds or seconds)
  if (typeof pickupDeadline === 'number') {
    if (pickupDeadline > 1e11) return pickupDeadline; // milliseconds
    if (pickupDeadline > 1e8) return pickupDeadline * 1000; // seconds
    return NaN;
  }

  // 5. String timestamp or ISO string
  if (typeof pickupDeadline === 'string') {
    const trimmed = pickupDeadline.trim();
    if (!trimmed) return NaN;

    // Check if string is purely numeric
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num > 1e11) return num;
      if (num > 1e8) return num * 1000;
    }

    // Try standard Date.parse
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) return parsed;

    // Replace space with T for "YYYY-MM-DD HH:mm:ss"
    const isoLike = trimmed.replace(' ', 'T');
    const parsedIso = Date.parse(isoLike);
    if (!isNaN(parsedIso)) return parsedIso;

    // Handle "DD/MM/YYYY, HH:mm" or "DD-MM-YYYY HH:mm"
    const dmyMatch = trimmed.match(
      /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
    );
    if (dmyMatch) {
      const [, day, month, year, hours = '0', mins = '0', secs = '0'] = dmyMatch;
      const d = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hours),
        Number(mins),
        Number(secs)
      );
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }

  return NaN;
}

/**
 * Returns the effective deadline timestamp (ms) for a listing document,
 * checking standard and alternative field names.
 */
export function getListingPickupDeadlineMs(item: Partial<FoodListing> | any): number {
  if (!item) return NaN;
  const rawDeadline =
    item.pickupDeadline ??
    item.deadline ??
    item.expiresAt ??
    item.expirationDate ??
    item.expiryTime ??
    item.pickupWindowEnd;

  const ms = parsePickupDeadlineMs(rawDeadline);
  if (!isNaN(ms)) return ms;

  // Fallback: If listing has prepDate and prepTime, check if it's past a 24-hour safe margin
  if (item.prepDate && item.prepTime) {
    const combinedStr = `${item.prepDate}T${item.prepTime}`;
    const prepMs = parsePickupDeadlineMs(combinedStr);
    if (!isNaN(prepMs) && Date.now() - prepMs > 24 * 60 * 60 * 1000) {
      return prepMs + 6 * 60 * 60 * 1000;
    }
  }

  return NaN;
}

/**
 * Evaluates whether a food listing is expired based on status or pickup deadline.
 */
export function isListingExpired(
  item: Partial<FoodListing> | any,
  now = Date.now()
): boolean {
  if (!item) return false;
  if (item.status === 'expired') return true;
  if (
    item.status === 'completed' ||
    item.status === 'cancelled' ||
    item.status === 'transferred_to_waste'
  ) {
    return false;
  }

  const deadlineMs = getListingPickupDeadlineMs(item);
  if (!isNaN(deadlineMs) && deadlineMs <= now) {
    return true;
  }

  return false;
}

export function formatTimestamp(val: any): string {
  if (!val) return 'Recently';
  try {
    let date: Date;
    if (typeof val === 'object' && typeof val.toDate === 'function') {
      date = val.toDate();
    } else if (typeof val === 'object' && (typeof val.seconds === 'number' || typeof val._seconds === 'number')) {
      const s = val.seconds ?? val._seconds;
      date = new Date(Number(s) * 1000);
    } else if (typeof val === 'number') {
      date = new Date(val > 1e11 ? val : val * 1000);
    } else {
      date = new Date(val);
    }
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
}

let lastSyncExpiredTime = 0;

/**
 * Scans active listings whose pickup deadlines have passed and marks them as 'expired' in Firestore.
 * Throttled to execute at most once every 15 seconds to avoid excess Firestore writes.
 */
export async function syncExpiredFoodListings(): Promise<number> {
  if (!isFirebaseConfigured || !db) return 0;

  const now = Date.now();
  if (now - lastSyncExpiredTime < 15000) {
    return 0;
  }
  lastSyncExpiredTime = now;

  try {
    const listingsCol = collection(db, 'foodListings');
    const q = query(listingsCol, where('status', 'in', ['available', 'reserved']));
    const snap = await withTimeout(getDocs(q), 8000, 'Expiry sync timed out');

    let updatedCount = 0;
    const updatePromises: Promise<any>[] = [];

    snap.docs.forEach((d) => {
      const data = d.data() as FoodListing;
      if (isListingExpired(data, now)) {
        const remaining = Number(data.remainingQuantityKg) || 0;
        if (remaining > 0) {
          updatedCount++;
          updatePromises.push(
            updateDoc(doc(db!, 'foodListings', d.id), {
              status: 'expired',
              updatedAt: serverTimestamp(),
            }).catch(() => {})
          );
        }
      }
    });

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    return updatedCount;
  } catch (err) {
    console.warn('[Expiry Sync] Error during expired listings sync:', err);
    return 0;
  }
}

export async function getFoodListings(filters?: {
  donorId?: string;
  status?: string;
  category?: string;
}): Promise<FoodListing[]> {
  if (!isFirebaseConfigured || !db) return [];

  // Trigger background sync for expired listings
  void syncExpiredFoodListings();

  const listingsCol = collection(db, 'foodListings');
  let q;

  const validDonorId = filters?.donorId && typeof filters.donorId === 'string' && filters.donorId.trim() !== '';

  if (validDonorId) {
    q = query(listingsCol, where('donorId', '==', filters!.donorId!.trim()));
  } else {
    q = query(listingsCol);
  }

  const snapshot = await withTimeout(
    getDocs(q),
    8000,
    'Listing query timed out after 8 seconds.'
  );

  const now = Date.now();
  const listings: FoodListing[] = snapshot.docs.map((d) => {
    const item = {
      id: d.id,
      ...(d.data() as Omit<FoodListing, 'id'>),
    };

    // Ensure in-memory consistency: if deadline passed and remaining kg > 0, status is expired
    if (
      isListingExpired(item, now) &&
      Number(item.remainingQuantityKg) > 0 &&
      (item.status === 'available' || item.status === 'reserved')
    ) {
      item.status = 'expired';
    }
    return item;
  });

  // Sort by createdAt descending
  listings.sort((a, b) => {
    const timeA = a.createdAt?.toDate?.()?.getTime?.() || new Date(a.createdAt).getTime() || 0;
    const timeB = b.createdAt?.toDate?.()?.getTime?.() || new Date(b.createdAt).getTime() || 0;
    return timeB - timeA;
  });

  let result = listings;
  if (filters?.category && filters.category !== 'all') {
    result = result.filter((item) => item.category === filters.category);
  }
  if (filters?.status) {
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

    // 3. Must not be expired
    const isExpired = isListingExpired(item, now);

    return isAvailable && isSuitable && !isExpired;
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

    // Expiry check: pickup deadline must not have passed
    if (isListingExpired(listingData)) {
      throw new Error('The pickup deadline for this food listing has expired and cannot be reserved.');
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
      donorOrg: listingData.donorOrg || listingData.donorName || 'Hospitality Partner',
      donorPhone: listingData.donorPhone || input.donorPhone || '',
      requesterId: input.requester.uid,
      requesterName: input.requester.name,
      requesterOrg: input.requester.organizationName || input.requester.name || 'Charitable Trust',
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

export async function getFoodRequests(filters?: {
  donorId?: string;
  requesterId?: string;
  listingId?: string;
}): Promise<FoodRequest[]> {
  if (!isFirebaseConfigured || !db) return [];

  const requestsCol = collection(db, 'foodRequests');
  let q;

  const validDonorId = filters?.donorId && typeof filters.donorId === 'string' && filters.donorId.trim() !== '';
  const validRequesterId = filters?.requesterId && typeof filters.requesterId === 'string' && filters.requesterId.trim() !== '';
  const validListingId = filters?.listingId && typeof filters.listingId === 'string' && filters.listingId.trim() !== '';

  if (validDonorId) {
    q = query(requestsCol, where('donorId', '==', filters!.donorId!.trim()));
  } else if (validRequesterId) {
    q = query(requestsCol, where('requesterId', '==', filters!.requesterId!.trim()));
  } else if (validListingId) {
    q = query(requestsCol, where('listingId', '==', filters!.listingId!.trim()));
  } else {
    q = query(requestsCol);
  }

  const snapshot = await withTimeout(
    getDocs(q),
    8000,
    'Food requests query timed out after 8 seconds.'
  );

  const list: FoodRequest[] = snapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<FoodRequest, 'id'>),
  }));

  // Sort by createdAt descending
  list.sort((a, b) => {
    const timeA = a.createdAt?.toDate?.()?.getTime?.() || new Date(a.createdAt).getTime() || 0;
    const timeB = b.createdAt?.toDate?.()?.getTime?.() || new Date(b.createdAt).getTime() || 0;
    return timeB - timeA;
  });

  return list;
}

export async function updateRequestStatus(
  requestId: string,
  newStatus: FoodRequestStatus,
  currentUserId: string
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  const requestRef = doc(db, 'foodRequests', requestId);

  // Pre-fetch request for authorization and sibling active claims check
  const preSnap = await getDoc(requestRef);
  if (!preSnap.exists()) throw new Error('Request not found');

  const preData = preSnap.data() as FoodRequest;
  const isDonor = preData.donorId === currentUserId;
  const isRequester = preData.requesterId === currentUserId;

  if (!isDonor && !isRequester) {
    throw new Error('Not authorized to update this request');
  }

  // Only the donor hotel can confirm physical pickup (mark as completed)
  if (newStatus === 'completed' && !isDonor) {
    throw new Error('Permission denied. Only the owning donor hotel can confirm physical pickup.');
  }

  // A completed request cannot be modified or reactivated
  if (preData.status === 'completed') {
    throw new Error('This request has already been marked as completed/picked up.');
  }

  // Check sibling active requests if marking completed, scoping query to donorId for rules compliance
  let otherActiveCount = 0;
  if (newStatus === 'completed' && preData.listingId && preData.donorId) {
    try {
      const sibQuery = query(
        collection(db, 'foodRequests'),
        where('donorId', '==', preData.donorId)
      );
      const sibSnap = await getDocs(sibQuery);
      otherActiveCount = sibSnap.docs.filter(
        (d) =>
          d.id !== requestId &&
          d.data().listingId === preData.listingId &&
          (d.data().status === 'pending' || d.data().status === 'accepted')
      ).length;
    } catch (sibErr) {
      console.warn('Sibling requests check warning:', sibErr);
      otherActiveCount = 0;
    }
  }

  const executeStatusUpdate = async (includePickedUpAt: boolean) => {
    await runTransaction(db!, async (transaction) => {
      const reqSnap = await transaction.get(requestRef);
      if (!reqSnap.exists()) throw new Error('Request not found');

      const reqData = reqSnap.data() as FoodRequest;
      if (reqData.status === 'completed') {
        throw new Error('This request has already been marked as completed/picked up.');
      }

      let listingRef: any = null;
      let listingSnap: any = null;
      let listing: FoodListing | null = null;

      if (reqData.listingId) {
        listingRef = doc(db!, 'foodListings', reqData.listingId);
        listingSnap = await transaction.get(listingRef);
        if (listingSnap.exists()) {
          listing = listingSnap.data() as FoodListing;
        }
      }

      // If cancelled or rejected from pending or accepted, release the quantity back to the listing
      if (
        (newStatus === 'rejected' || newStatus === 'cancelled') &&
        (reqData.status === 'pending' || reqData.status === 'accepted') &&
        listingRef &&
        listing
      ) {
        const currentRemaining = Number(listing.remainingQuantityKg) || 0;
        const initialQty = Number(listing.initialQuantityKg) || currentRemaining;
        const restoredRemaining = Math.min(
          initialQty,
          Math.round((currentRemaining + Number(reqData.requestedQuantityKg)) * 100) / 100
        );
        const isExpired = isListingExpired(listing);
        const nextStatus = isExpired ? 'expired' : 'available';

        transaction.update(listingRef, {
          remainingQuantityKg: restoredRemaining,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }

      // If marked completed, update listing:
      // If remaining quantity is 0 and no sibling claims exist, mark listing as 'completed'
      // If remaining quantity > 0, check if expired, otherwise stays 'available'
      if (newStatus === 'completed' && listingRef && listing) {
        const currentRemaining = Number(listing.remainingQuantityKg) || 0;
        if (currentRemaining === 0 && otherActiveCount === 0) {
          transaction.update(listingRef, {
            status: 'completed',
            updatedAt: serverTimestamp(),
          });
        } else if (currentRemaining > 0) {
          const isExpired = isListingExpired(listing);
          if (isExpired && listing.status !== 'expired') {
            transaction.update(listingRef, {
              status: 'expired',
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      const updatePayload: Record<string, any> = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };
      if (newStatus === 'completed' && includePickedUpAt) {
        updatePayload.pickedUpAt = serverTimestamp();
      }

      transaction.update(requestRef, updatePayload);
    });
  };

  try {
    await executeStatusUpdate(true);
  } catch (err: any) {
    if (err?.code === 'permission-denied' && newStatus === 'completed') {
      console.warn('[Food Service] pickedUpAt field was rejected by current deployed rules; retrying status update with server timestamp fallback.');
      await executeStatusUpdate(false);
    } else {
      throw err;
    }
  }
}

/**
 * Convenience method for hotel donors to confirm that food has been collected by the NGO.
 */
export async function confirmFoodPickup(
  requestId: string,
  donorUserId: string
): Promise<void> {
  return updateRequestStatus(requestId, 'completed', donorUserId);
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
