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
 * Probes the Firestore REST endpoint to extract the authentic Google Cloud / Firebase
 * error code and message when a write or read does not resolve.
 */
export async function getFirestoreBackendDiagnostics(): Promise<{ code: string; message: string } | null> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    return {
      code: 'CONFIG_MISSING',
      message: 'Firebase configuration (VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID) is missing in .env.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?key=${apiKey}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      if (data?.error) {
        const errCode = data.error.status || `HTTP_${data.error.code}`;
        const errMsg = data.error.message || `Firestore returned HTTP status ${response.status}`;
        console.error('[Firebase Original Error Code]:', errCode);
        console.error('[Firebase Original Error Message]:', errMsg);
        console.error('[Firebase Error Details]:', data.error);
        return {
          code: errCode,
          message: errMsg,
        };
      }
      const genericMsg = `Firestore endpoint returned HTTP ${response.status}: ${response.statusText}`;
      console.error('[Firebase Original Error Code]:', `HTTP_${response.status}`);
      console.error('[Firebase Original Error Message]:', genericMsg);
      return {
        code: `HTTP_${response.status}`,
        message: genericMsg,
      };
    }
    return null;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        code: 'PROBE_TIMEOUT',
        message: 'Network request to Cloud Firestore backend timed out.',
      };
    }
    return {
      code: 'NETWORK_ERROR',
      message: err?.message || 'Network connectivity error reaching Firestore.',
    };
  }
}

/**
 * Wraps a promise with a timeout to avoid hanging indefinitely.
 * When the timeout fires, it actively probes the Firestore backend
 * to capture and log the original Firebase/Google error code and message.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, defaultTimeoutMessage: string): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(async () => {
      try {
        const diag = await getFirestoreBackendDiagnostics();
        if (diag) {
          console.error(`[Firestore Operation Failed] Code: ${diag.code} - ${diag.message}`);
          const err: any = new Error(`[${diag.code}] ${diag.message}`);
          err.code = diag.code;
          err.originalMessage = diag.message;
          reject(err);
          return;
        }
      } catch {}

      console.error('[Firestore Operation Failed] Code: firestore/timeout -', defaultTimeoutMessage);
      const err: any = new Error(defaultTimeoutMessage);
      err.code = 'firestore/timeout';
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
    console.error('[Firestore SignUp Write Error] Code:', fsErr?.code);
    console.error('[Firestore SignUp Write Error] Message:', fsErr?.message);
    throw fsErr;
  }

  return profileData;
}

const inFlightProfileFetches = new Map<string, Promise<UserProfile | null>>();

export async function signInUser(email: string, password: string): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('Firebase is not configured. Please complete the setup with your credentials.');
  }

  const cleanEmail = email.trim();
  console.log('[Auth Service] Starting sign-in for:', cleanEmail);

  // 1. Firebase Authentication with 6s timeout
  console.time('[Auth Service] 1. Firebase Auth (signInWithEmailAndPassword)');
  let user: FirebaseUser;
  try {
    const userCredential = await withTimeout(
      signInWithEmailAndPassword(auth, cleanEmail, password),
      6000,
      'Firebase Authentication request timed out after 6 seconds. Please check your network connection.'
    );
    user = userCredential.user;
    console.timeEnd('[Auth Service] 1. Firebase Auth (signInWithEmailAndPassword)');
    console.log('[Auth Service] Firebase Auth successful. Authenticated UID:', user.uid);
  } catch (authErr: any) {
    console.timeEnd('[Auth Service] 1. Firebase Auth (signInWithEmailAndPassword)');
    console.error('[Auth Service] Firebase Authentication failed:', authErr);
    throw authErr;
  }

  // 2. Fetch User Profile from Firestore with 4.5s timeout
  console.time('[Auth Service] 2. Firestore Profile Lookup');
  let profile: UserProfile | null = null;
  try {
    profile = await getUserProfile(user.uid, 4500);
    console.timeEnd('[Auth Service] 2. Firestore Profile Lookup');
  } catch (profileErr: any) {
    console.timeEnd('[Auth Service] 2. Firestore Profile Lookup');
    console.error('[Auth Service] Profile lookup failed. Signing out to prevent unverified session:', profileErr);
    try {
      await signOut(auth);
    } catch (soErr) {
      console.warn('[Auth Service] Sign out cleanup failed:', soErr);
    }
    // Strict requirement: Never treat a timeout or profile error as a successful login
    throw profileErr;
  }

  // 3. Handle rare case where Auth user exists but Firestore profile document does not
  if (!profile) {
    console.warn('[Auth Service] Profile document does not exist for UID:', user.uid, '- Initializing fallback profile');
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
        4000,
        'Timed out while initializing user profile in Cloud Firestore.'
      );
      profile = fallbackProfile;
    } catch (fsErr: any) {
      console.error('[Auth Service] Failed to initialize fallback profile:', fsErr);
      try {
        await signOut(auth);
      } catch {}
      throw fsErr;
    }
  }

  console.log('[Auth Service] Login flow completed. User role:', profile.role);
  return profile;
}

export async function signOutUser(): Promise<void> {
  if (auth) {
    await signOut(auth);
  }
}

export async function getUserProfile(uid: string, timeoutMs: number = 4500): Promise<UserProfile | null> {
  if (!db) return null;

  // Deduplicate in-flight requests for the same UID to prevent concurrent duplicate reads
  if (inFlightProfileFetches.has(uid)) {
    console.log(`[Firestore] Reusing in-flight profile fetch for users/${uid}`);
    return inFlightProfileFetches.get(uid)!;
  }

  const fetchPromise = (async () => {
    console.time(`[Firestore] getDoc users/${uid}`);
    try {
      const userDoc = await withTimeout(
        getDoc(doc(db, 'users', uid)),
        timeoutMs,
        `Cloud Firestore profile lookup for "${uid}" timed out after ${timeoutMs}ms.`
      );
      console.timeEnd(`[Firestore] getDoc users/${uid}`);

      if (userDoc.exists()) {
        const data = userDoc.data() as UserProfile;
        console.log(`[Firestore] Document users/${uid} found. Role:`, data.role);
        return data;
      }

      console.warn(`[Firestore] Document users/${uid} does not exist in Firestore.`);
      return null;
    } catch (err: any) {
      console.timeEnd(`[Firestore] getDoc users/${uid}`);
      console.error(`[Firestore Profile Fetch Error] Code:`, err?.code);
      console.error(`[Firestore Profile Fetch Error] Message:`, err?.message);
      throw err;
    }
  })().finally(() => {
    inFlightProfileFetches.delete(uid);
  });

  inFlightProfileFetches.set(uid, fetchPromise);
  return fetchPromise;
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
    5000,
    'Failed to update profile: Firestore timed out'
  );
}
