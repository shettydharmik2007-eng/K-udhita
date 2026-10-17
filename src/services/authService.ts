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
 * Probes the Firestore REST endpoint as separate backend diagnostic context
 * when a Firestore operation times out.
 * If a signed-in user is provided, probes their specific document with an ID token.
 */
export async function getFirestoreBackendDiagnostics(
  docPath?: string,
  user?: FirebaseUser | null
): Promise<{ code: string; message: string } | null> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    return {
      code: 'CONFIG_MISSING',
      message: 'Firebase configuration (VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID) is missing in .env.',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const headers: Record<string, string> = {};
    if (user) {
      try {
        const idToken = await user.getIdToken();
        if (idToken) {
          headers['Authorization'] = `Bearer ${idToken}`;
        }
      } catch (tokenErr) {
        console.warn('[Diagnostics] Could not obtain user ID token:', tokenErr);
      }
    }

    const targetPath = docPath || 'users';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${targetPath}?key=${apiKey}`;
    const response = await fetch(url, { signal: controller.signal, headers });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      if (data?.error) {
        const errCode = data.error.status || `HTTP_${data.error.code}`;
        const errMsg = data.error.message || `Firestore returned HTTP status ${response.status}`;
        console.warn('[Firestore Diagnostic Context] Code:', errCode);
        console.warn('[Firestore Diagnostic Context] Message:', errMsg);
        return {
          code: errCode,
          message: errMsg,
        };
      }
      const genericMsg = `Firestore endpoint returned HTTP ${response.status}: ${response.statusText}`;
      console.warn('[Firestore Diagnostic Context] Code:', `HTTP_${response.status}`);
      console.warn('[Firestore Diagnostic Context] Message:', genericMsg);
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
        message: 'Network probe to Cloud Firestore backend timed out.',
      };
    }
    return {
      code: 'NETWORK_ERROR',
      message: err?.message || 'Network connectivity error reaching Firestore.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Standard timeout wrapper for general/Authentication operations.
 * Retains and rejects strictly with the supplied timeout message without running Firestore diagnostics.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  errorCode: string = 'auth/timeout'
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error(timeoutMessage);
      err.code = errorCode;
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Timeout wrapper specifically for Firestore operations.
 * Upon timeout, gathers backend diagnostics as separate context and preserves
 * the original operation's timeout error.
 */
function withFirestoreTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  defaultTimeoutMessage: string,
  docPath?: string,
  user?: FirebaseUser | null
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(async () => {
      try {
        const diag = await getFirestoreBackendDiagnostics(docPath, user);
        if (diag) {
          console.warn(`[Firestore Backend Diagnostic Context] Code: ${diag.code} - ${diag.message}`);
        }
      } catch (diagErr) {
        console.warn('[Firestore Backend Diagnostic Context] Failed to collect diagnostics:', diagErr);
      }

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
    await withFirestoreTimeout(
      setDoc(doc(db, 'users', user.uid), profileData, { merge: true }),
      10000,
      'Cloud Firestore timed out while saving your profile. Please ensure Cloud Firestore Database is enabled in Firebase Console (Build → Firestore Database → Create database).',
      `users/${user.uid}`,
      user
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
      await withFirestoreTimeout(
        setDoc(doc(db, 'users', user.uid), fallbackProfile, { merge: true }),
        4000,
        'Timed out while initializing user profile in Cloud Firestore.',
        `users/${user.uid}`,
        user
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
      const userDoc = await withFirestoreTimeout(
        getDoc(doc(db, 'users', uid)),
        timeoutMs,
        `Cloud Firestore profile lookup for "${uid}" timed out after ${timeoutMs}ms.`,
        `users/${uid}`,
        auth?.currentUser
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
  await withFirestoreTimeout(
    updateDoc(doc(db, 'users', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    }),
    5000,
    'Failed to update profile: Firestore timed out',
    `users/${uid}`,
    auth?.currentUser
  );
}
