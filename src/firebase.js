import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  enableNetwork, 
  enableIndexedDbPersistence,
  clearIndexedDbPersistence 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration - uses ONLY Vercel environment variables
// NO fallbacks, NO hardcoded values - ONLY from Vercel env vars
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Validate that all required config values are present from Vercel
// If any are missing, throw error immediately - NO fallbacks allowed
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const missingKeys = requiredKeys.filter(key => {
  const value = firebaseConfig[key];
  return !value || (typeof value === 'string' && value.trim().length === 0);
});

if (missingKeys.length > 0) {
  const errorMsg = `❌ CRITICAL: Firebase configuration missing from Vercel environment variables: ${missingKeys.join(', ')}. Please add all required VITE_FIREBASE_* variables in Vercel project settings.`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}

// Initialize Firebase app - ensure only ONE instance exists
let app;
const existingApps = getApps();

if (existingApps.length > 0) {
  app = getApp();
  console.log('[FIRESTORE] Reusing existing Firebase app:', app.name);
} else {
  app = initializeApp(firebaseConfig);
  console.log('[FIRESTORE] App initialized:', app.name);
}

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log('[FIRESTORE] Project ID:', firebaseConfig.projectId);
console.log('[FIRESTORE] Storage Bucket:', firebaseConfig.storageBucket);
console.log('[FIRESTORE] Auth Domain:', firebaseConfig.authDomain);

// Enable IndexedDB persistence with automatic fallback
let persistenceEnabled = false;
const enablePersistence = async () => {
  try {
    await enableIndexedDbPersistence(db);
    persistenceEnabled = true;
    console.log('[FIRESTORE] Persistence enabled');
  } catch (error) {
    const errorCode = error?.code || '';
    const errorMessage = error?.message || '';
    
    if (errorCode === 'failed-precondition') {
      console.warn('[FIRESTORE] Persistence failed - multiple tabs open. Using online-only mode.');
    } else if (errorCode === 'unimplemented') {
      console.warn('[FIRESTORE] Persistence not supported in this environment. Using online-only mode.');
    } else {
      console.warn('[FIRESTORE] Persistence error, attempting to clear and retry:', errorCode);
      
      // Try to clear corrupted persistence and retry
      try {
        await clearIndexedDbPersistence(db);
        await enableIndexedDbPersistence(db);
        persistenceEnabled = true;
        console.log('[FIRESTORE] Persistence enabled after clearing corrupted data');
      } catch (retryError) {
        console.warn('[FIRESTORE] Could not enable persistence after clear. Using online-only mode.');
      }
    }
  }
};

// Force Firestore to connect online immediately
// This is CRITICAL to prevent "client is offline" errors
const enableNetworkConnection = async () => {
  try {
    await enableNetwork(db);
    console.log('[FIRESTORE] Network enabled - forced online connection');
  } catch (networkError) {
    console.error('[FIRESTORE] ❌ CRITICAL: Failed to enable Firestore network:', {
      code: networkError?.code,
      message: networkError?.message,
      name: networkError?.name,
    });
    throw networkError;
  }
};

// Initialize persistence and network asynchronously
(async () => {
  try {
    await enablePersistence();
    await enableNetworkConnection();
    console.log('[FIRESTORE] Initialization complete - ready for use');
  } catch (error) {
    console.error('[FIRESTORE] ❌ Initialization failed:', error);
  }
})();

export { app };
