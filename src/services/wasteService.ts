import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import type {
  WasteCollection,
  WasteCollectionStatus,
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

export async function claimWasteCollection(
  collectionId: string,
  partner: UserProfile
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  const ref = doc(db, 'wasteCollections', collectionId);
  await updateDoc(ref, {
    partnerId: partner.uid,
    partnerName: partner.organizationName || partner.name,
    partnerPhone: partner.phone || '',
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
}

export async function updateWasteStatus(
  collectionId: string,
  newStatus: WasteCollectionStatus,
  notes?: string
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('Firestore is not configured');

  const ref = doc(db, 'wasteCollections', collectionId);
  const updates: Record<string, any> = {
    status: newStatus,
    updatedAt: serverTimestamp(),
  };

  if (notes) {
    updates.notes = notes;
  }

  await updateDoc(ref, updates);
}
