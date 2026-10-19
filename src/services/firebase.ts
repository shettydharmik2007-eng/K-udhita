import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, setLogLevel, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export function normalizeStorageBucket(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/^["']|["']$/g, '') // strip quotes
    .replace(/^gs:\/\//i, '')    // strip gs:// prefix
    .replace(/\/+$/, '');        // strip trailing slashes
}

const rawBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const cleanBucket = normalizeStorageBucket(rawBucket);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: cleanBucket || undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const configuredStorageBucket = cleanBucket;

// Check if credentials are properly set and not default placeholders
export const isFirebaseConfigured: boolean = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey.trim() !== '' &&
  firebaseConfig.apiKey !== 'your_api_key_here' &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId.trim() !== '' &&
  firebaseConfig.projectId !== 'your_project_id'
);

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'your_api_key_here') missing.push('VITE_FIREBASE_API_KEY');
  if (!firebaseConfig.authDomain || firebaseConfig.authDomain.includes('your_project_id')) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!firebaseConfig.projectId || firebaseConfig.projectId === 'your_project_id') missing.push('VITE_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.storageBucket || firebaseConfig.storageBucket.includes('your_project_id')) missing.push('VITE_FIREBASE_STORAGE_BUCKET');
  if (!firebaseConfig.messagingSenderId || firebaseConfig.messagingSenderId === 'your_sender_id') missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
  if (!firebaseConfig.appId || firebaseConfig.appId === 'your_app_id') missing.push('VITE_FIREBASE_APP_ID');
  return missing;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Explicitly pass the bucket URL to getStorage to avoid default ambiguity
    const bucketUrl = cleanBucket ? `gs://${cleanBucket}` : undefined;
    storage = getStorage(app, bucketUrl);

    // Set fast retry timeout (8s instead of default 10min) so 404/CORS errors fail fast
    storage.maxUploadRetryTime = 8000;
    storage.maxOperationRetryTime = 8000;

    setLogLevel('error');
    console.info(
      `[Firebase Config] Project: "${firebaseConfig.projectId}" | Storage Bucket: "${cleanBucket || '(not configured)'}"`
    );
  } catch (err) {
    console.warn('Firebase initialization error:', err);
  }
}

export { app, auth, db, storage };
