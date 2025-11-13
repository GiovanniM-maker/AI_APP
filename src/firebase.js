import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  enableNetwork, 
  enableIndexedDbPersistence,
  clearIndexedDbPersistence 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

// =====================================================================
// SECTION 1 — ENVIRONMENT VARIABLE HANDLING
// =====================================================================
// Read variables ONLY from import.meta.env.VITE_FIREBASE_*
// Do NOT throw if any variable is missing - log warning instead

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Validate and warn about missing variables (DO NOT throw)
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
requiredKeys.forEach(key => {
  const value = firebaseConfig[key];
  if (!value || (typeof value === 'string' && value.trim().length === 0)) {
    console.warn(`[FIREBASE][WARN] Missing key: ${key}`);
  }
});

// =====================================================================
// SECTION 2 — SAFE INITIALIZATION OF FIREBASE APP
// =====================================================================
// Use getApps() / getApp() to ensure a single initialization

let app;
const existingApps = getApps();

if (existingApps.length > 0) {
  app = getApp();
  console.log('[FIREBASE] Reusing existing Firebase app');
} else {
  app = initializeApp(firebaseConfig);
  console.log('[FIREBASE] App initialized');
}

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// =====================================================================
// SECTION 3 — FIRESTORE OFFLINE FIX (MANDATORY)
// =====================================================================
// CRITICAL: This sequence MUST run immediately and MUST NOT block initialization
// It MUST ALWAYS run even if previous steps fail

(async () => {
  try {
    // Step 1: Clear any corrupted persistence
    try {
      await clearIndexedDbPersistence(db);
      console.log('[FIREBASE] persistence cleared');
    } catch (clearError) {
      const errorCode = clearError?.code || '';
      const errorMessage = clearError?.message || '';
      
      // Ignore errors if persistence is not enabled or already cleared
      if (errorCode === 'unimplemented' || errorMessage.includes('not enabled')) {
        console.log('[FIREBASE] persistence not enabled, skipping clear');
      } else {
        console.warn('[FIREBASE] could not clear persistence (non-critical):', {
          code: errorCode,
          message: errorMessage,
        });
      }
    }
    
    // Step 2: Enable IndexedDB persistence
    try {
      await enableIndexedDbPersistence(db);
      console.log('[FIREBASE] persistence enabled');
    } catch (persistError) {
      const errorCode = persistError?.code || '';
      const errorMessage = persistError?.message || '';
      
      if (errorCode === 'failed-precondition') {
        console.warn('[FIREBASE] persistence failed - multiple tabs open. Using online-only mode.');
      } else if (errorCode === 'unimplemented') {
        console.warn('[FIREBASE] persistence not supported in this environment. Using online-only mode.');
      } else {
        console.warn('[FIREBASE] could not enable persistence (non-critical):', {
          code: errorCode,
          message: errorMessage,
        });
      }
    }
    
    // Step 3: Force network connection - THIS IS CRITICAL
    try {
      await enableNetwork(db);
      console.log('[FIREBASE] network enabled');
    } catch (networkError) {
      console.error('[FIREBASE] error enabling network', networkError);
      // DO NOT throw - let the app continue
    }
  } catch (error) {
    console.error('[FIREBASE] initialization sequence error (non-critical):', error);
    // DO NOT throw - let the app continue
  }
})();

// =====================================================================
// SECTION 4 — testFirestoreConnection() HELPER
// =====================================================================

export async function testFirestoreConnection() {
  console.log('[FIREBASE TEST] Starting Firestore connection test...');
  
  try {
    const testDocRef = doc(db, 'system_test', 'connection-check');
    const testData = {
      timestamp: serverTimestamp(),
      test: true,
      createdAt: new Date().toISOString(),
    };
    
    // Test write
    console.log('[FIREBASE TEST] Attempting write operation...');
    await setDoc(testDocRef, testData, { merge: true });
    console.log('[FIREBASE TEST] Write operation successful');
    
    // Test read
    console.log('[FIREBASE TEST] Attempting read operation...');
    const snapshot = await getDoc(testDocRef);
    
    if (snapshot.exists()) {
      const data = snapshot.data();
      console.log('[FIREBASE TEST] Read operation successful');
      console.log('[FIREBASE TEST] Test document data:', data);
      return { ok: true, data };
    } else {
      console.warn('[FIREBASE TEST] Read operation returned empty document');
      return { ok: false, error: 'Document does not exist after write' };
    }
  } catch (error) {
    console.error('[FIREBASE TEST] Connection test failed:', {
      code: error?.code,
      message: error?.message,
      name: error?.name,
      error,
    });
    return { 
      ok: false, 
      error: {
        code: error?.code || 'unknown',
        message: error?.message || 'Unknown error',
        name: error?.name || 'Error',
      }
    };
  }
}

// =====================================================================
// EXPORTS (must match existing usage)
// =====================================================================

export { app };
