import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import type { UserProfile, UserRole } from '../types';

export interface SignUpParams {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  organizationName: string;
  phone: string;
  address: string;
}

export async function signUpUser(params: SignUpParams): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('Firebase is not configured. Please complete the setup with your credentials.');
  }

  const userCredential = await createUserWithEmailAndPassword(auth, params.email, params.password);
  const user = userCredential.user;

  await updateProfile(user, { displayName: params.name });

  const profileData: UserProfile = {
    uid: user.uid,
    email: params.email,
    name: params.name,
    role: params.role,
    organizationName: params.organizationName || params.name,
    phone: params.phone,
    address: params.address,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', user.uid), profileData);
  return profileData;
}

export async function signInUser(email: string, password: string): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('Firebase is not configured. Please complete the setup with your credentials.');
  }

  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  const profile = await getUserProfile(user.uid);
  if (!profile) {
    // If profile document doesn't exist, create default fallback
    const fallbackProfile: UserProfile = {
      uid: user.uid,
      email: user.email || email,
      name: user.displayName || 'User',
      role: 'requester',
      organizationName: 'Community Member',
      phone: '',
      address: '',
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', user.uid), fallbackProfile);
    return fallbackProfile;
  }
  return profile;
}

export async function signOutUser(): Promise<void> {
  if (auth) {
    await signOut(auth);
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }
  return null;
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Omit<UserProfile, 'uid' | 'createdAt'>>
): Promise<void> {
  if (!db) throw new Error('Firestore is not available');
  await updateDoc(doc(db, 'users', uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}
