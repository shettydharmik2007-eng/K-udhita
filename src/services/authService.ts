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

/**
 * Wraps a promise with a timeout to avoid hanging indefinitely
 * when Firestore is offline, disabled, or uninitialized.
 */
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

export async function signUpUser(params: SignUpParams): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('Firebase is not configured. Please complete the setup with your credentials.');
  }

  const cleanEmail = params.email.trim();
  const cleanName = params.name.trim();
  const cleanOrg = (params.organizationName || params.name).trim();
  const cleanPhone = params.phone.trim();
  const cleanAddress = params.address.trim();

  let user: FirebaseUser;

  // 1. Obtain authenticated Firebase user
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, params.password);
    user = userCredential.user;
  } catch (authErr: any) {
    // If the account was already registered in Firebase Authentication
    // (e.g. from an earlier attempt where Firestore profile creation stalled),
    // authenticate with the provided password to retrieve the user's UID and finish profile setup.
    if (authErr?.code === 'auth/email-already-in-use') {
      try {
        const signInCredential = await signInWithEmailAndPassword(auth, cleanEmail, params.password);
        user = signInCredential.user;
      } catch (signInErr: any) {
        // If password doesn't match or another issue, bubble the original error
        throw authErr;
      }
    } else {
      throw authErr;
    }
  }

  // 2. Set Firebase Auth displayName
  try {
    await updateProfile(user, { displayName: cleanName });
  } catch (err) {
    console.warn('Could not update Auth displayName:', err);
  }

  // 3. Prepare UserProfile document matching project schema
  const profileData: UserProfile = {
    uid: user.uid,
    email: cleanEmail,
    name: cleanName,
    role: params.role,
    organizationName: cleanOrg,
    phone: cleanPhone,
    address: cleanAddress,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 4. Save profile in Firestore collection 'users' with document ID = user.uid
  try {
    await withTimeout(
      setDoc(doc(db, 'users', user.uid), profileData, { merge: true }),
      10000,
      'Cloud Firestore timed out while saving your profile. Please ensure Cloud Firestore Database is enabled in Firebase Console (Build → Firestore Database → Create database).'
    );
  } catch (fsErr: any) {
    console.error('Firestore user profile write failed:', fsErr);
    let msg = fsErr?.message || 'Failed to create user profile in Firestore.';
    if (
      fsErr?.code === 'permission-denied' ||
      msg.includes('Cloud Firestore API has not been used') ||
      msg.includes('PERMISSION_DENIED')
    ) {
      msg =
        'Cloud Firestore Database is not enabled in your Firebase project. Please open Firebase Console → Firestore Database and click "Create database", then try again.';
    } else if (fsErr?.code === 'unavailable' || msg.includes('offline')) {
      msg =
        'Could not reach Cloud Firestore. Please verify that your Firestore database is active in Firebase Console and check your internet connection.';
    }
    const enhancedErr: any = new Error(msg);
    enhancedErr.code = fsErr?.code || 'firestore/write-failed';
    throw enhancedErr;
  }

  return profileData;
}

export async function signInUser(email: string, password: string): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('Firebase is not configured. Please complete the setup with your credentials.');
  }

  const cleanEmail = email.trim();
  const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
  const user = userCredential.user;

  const profile = await getUserProfile(user.uid);
  if (!profile) {
    // If profile document doesn't exist, create default fallback
    const fallbackProfile: UserProfile = {
      uid: user.uid,
      email: user.email || cleanEmail,
      name: user.displayName || 'User',
      role: 'requester',
      organizationName: user.displayName || 'Community Member',
      phone: '',
      address: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await withTimeout(
        setDoc(doc(db, 'users', user.uid), fallbackProfile, { merge: true }),
        8000,
        'Firestore write timed out'
      );
    } catch (fsErr) {
      console.warn('Could not save fallback profile to Firestore:', fsErr);
    }
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
  try {
    const userDoc = await withTimeout(
      getDoc(doc(db, 'users', uid)),
      8000,
      'Firestore read timed out'
    );
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (err) {
    console.warn('Failed to load user profile from Firestore:', err);
    return null;
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Omit<UserProfile, 'uid' | 'createdAt'>>
): Promise<void> {
  if (!db) throw new Error('Firestore is not available');
  await withTimeout(
    updateDoc(doc(db, 'users', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    }),
    8000,
    'Failed to update profile: Firestore timed out'
  );
}
