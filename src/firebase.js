import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableNetwork, disableNetwork, doc, getDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const validateFirebaseConfig = () => {
  const missing = [];
  const config = {};

  REQUIRED_ENV_VARS.forEach((key) => {
    const value = import.meta.env[key];
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      missing.push(key);
    } else {
      config[key] = value.trim();
    }
  });

  if (missing.length > 0) {
    const errorMsg = `❌ Firebase configuration incomplete. Missing: ${missing.join(', ')}`;
    console.error(errorMsg);
    if (import.meta.env.MODE === 'production') {
      throw new Error(errorMsg);
    }
    console.warn('⚠️ Using fallback values in development mode');
  }

  return {
    apiKey: config.VITE_FIREBASE_API_KEY || 'AIzaSyBfW-DJsytPbGbIutbYfd9kXO9y7jCqCEg',
    authDomain: config.VITE_FIREBASE_AUTH_DOMAIN || 'eataly-creative-ai-suite.firebaseapp.com',
    projectId: config.VITE_FIREBASE_PROJECT_ID || 'eataly-creative-ai-suite',
    storageBucket: config.VITE_FIREBASE_STORAGE_BUCKET || 'eataly-creative-ai-suite.appspot.com',
    messagingSenderId: config.VITE_FIREBASE_MESSAGING_SENDER_ID || '392418318075',
    appId: config.VITE_FIREBASE_APP_ID || '1:392418318075:web:3c1aa88df71dca64da425e',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim() || 'G-GSE68WH3P9',
  };
};

const firebaseConfig = validateFirebaseConfig();

console.log('[Firebase] Initializing with project:', firebaseConfig.projectId);
console.log('[Firebase] Storage bucket:', firebaseConfig.storageBucket);
console.log('[Firebase] Auth domain:', firebaseConfig.authDomain);

const existingApps = getApps();
let app;

if (existingApps.length > 0) {
  const existingApp = existingApps[0];
  const existingProjectId = existingApp.options?.projectId;
  
  if (existingProjectId && existingProjectId !== firebaseConfig.projectId) {
    console.warn(
      `[Firebase] Existing app with different project (${existingProjectId}). Re-initializing with ${firebaseConfig.projectId}`
    );
    app = initializeApp(firebaseConfig, `app-${Date.now()}`);
  } else {
    app = existingApp;
    console.log('[Firebase] Reusing existing Firebase app');
  }
} else {
  app = initializeApp(firebaseConfig);
  console.log('[Firebase] Initialized new Firebase app');
}

const auth = getAuth(app);

// Initialize Firestore with explicit settings
// Note: Firebase SDK uses internal retry logic and connection management.
// Stack traces showing setTimeout/Promise chains are normal and indicate
// the SDK is managing persistent connections and automatic reconnection.
const db = getFirestore(app);

// Log Firestore initialization details
console.log('[Firebase] Firestore initialized:', {
  appName: db.app.name,
  projectId: db.app.options?.projectId,
  databaseId: db._databaseId?.databaseId || 'default',
  settings: db._settings || 'default',
});

// Force Firestore to connect online immediately
// This is critical to prevent "offline" errors
let networkEnabled = false;
const enableFirestoreNetwork = async () => {
  try {
    await enableNetwork(db);
    networkEnabled = true;
    console.log('[Firebase] ✅ Firestore network enabled - connection forced online');
    
    // Verify connection with a test query
    try {
      const testRef = doc(db, '_health', 'check');
      await getDoc(testRef);
      console.log('[Firebase] ✅ Firestore connection verified');
    } catch (testError) {
      console.warn('[Firebase] ⚠️ Firestore network enabled but test query failed:', {
        code: testError?.code,
        message: testError?.message,
      });
    }
  } catch (networkError) {
    console.error('[Firebase] ❌ CRITICAL: Could not enable Firestore network:', {
      code: networkError?.code,
      message: networkError?.message,
      name: networkError?.name,
      stack: networkError?.stack,
    });
    networkEnabled = false;
  }
};

// Enable network immediately (don't wait, but log the promise)
const networkPromise = enableFirestoreNetwork();
networkPromise.catch((err) => {
  console.error('[Firebase] ❌ Network enable promise rejected:', err);
});

const storage = getStorage(app);

console.log('[Firebase] FIREBASE PROJECT ID:', firebaseConfig.projectId);
console.log('[Firebase] Firestore instance created:', db.app.name);
console.log('[Firebase] Firestore project:', db.app.options.projectId);

// Log all environment variables for debugging
console.group('[Firebase] Environment Variables Check');
REQUIRED_ENV_VARS.forEach((key) => {
  const value = import.meta.env[key];
  const isSet = value && typeof value === 'string' && value.trim().length > 0;
  if (isSet) {
    // Show first 10 chars and last 4 chars for verification (without exposing full value)
    const preview = value.length > 14 
      ? `${value.substring(0, 10)}...${value.substring(value.length - 4)}`
      : '***';
    console.log(`${key}: ✅ SET (${value.length} chars, preview: ${preview})`);
  } else {
    console.error(`${key}: ❌ MISSING`);
  }
});
console.log('Full config check:', {
  apiKey: firebaseConfig.apiKey ? `SET (${firebaseConfig.apiKey.length} chars)` : 'MISSING',
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket,
});
console.groupEnd();

if (import.meta.env.MODE === 'production') {
  console.log('[Firebase] Production mode - verifying configuration...');
  if (firebaseConfig.projectId !== 'eataly-creative-ai-suite') {
    console.error('[Firebase] ⚠️ WARNING: Project ID mismatch! Expected: eataly-creative-ai-suite, Got:', firebaseConfig.projectId);
  }
  
  // Verify all required vars are set in production
  const missingInProd = REQUIRED_ENV_VARS.filter(
    (key) => !import.meta.env[key] || typeof import.meta.env[key] !== 'string' || import.meta.env[key].trim().length === 0
  );
  if (missingInProd.length > 0) {
    console.error('[Firebase] ⚠️ CRITICAL: Missing environment variables in production:', missingInProd);
  }
}

// Export helper function to check Firestore connection status
export const checkFirestoreConnection = async () => {
  const status = {
    networkEnabled: networkEnabled,
    projectId: db.app.options?.projectId,
    timestamp: new Date().toISOString(),
  };

  try {
    // Try a simple read operation
    const testRef = doc(db, '_health', 'connection-test');
    await getDoc(testRef);
    status.connected = true;
    status.error = null;
    console.log('[Firebase] ✅ Connection check: SUCCESS', status);
  } catch (error) {
    status.connected = false;
    status.error = {
      code: error?.code,
      message: error?.message,
      name: error?.name,
    };
    console.error('[Firebase] ❌ Connection check: FAILED', status);
  }

  return status;
};

export { app, auth, db, storage };

