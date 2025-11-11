import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const FALLBACK_STORAGE_BUCKETS = [
  'auiki-x-eataly.firebasestorage.app',
  'auiki-x-eataly.appspot.com',
];

const resolveStorageBucket = () => {
  const raw = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed) {
    return trimmed;
  }
  return FALLBACK_STORAGE_BUCKETS[0];
};

const primaryStorageBucket = resolveStorageBucket();

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: primaryStorageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app, `gs://${primaryStorageBucket}`);

const getBucketStorage = (bucket) => {
  const fallback = primaryStorageBucket;
  const target =
    typeof bucket === 'string' && bucket.trim().length > 0 ? bucket.trim() : fallback;
  return getStorage(app, `gs://${target}`);
};

const STORAGE_BUCKET_CANDIDATES = Array.from(
  new Set([primaryStorageBucket, ...FALLBACK_STORAGE_BUCKETS])
);

export {
  app,
  auth,
  db,
  storage,
  getBucketStorage,
  primaryStorageBucket as storageBucket,
  STORAGE_BUCKET_CANDIDATES,
};

