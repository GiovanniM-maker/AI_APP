import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log('[Firebase] Initialized successfully');
console.log('[Firebase] Project ID:', firebaseConfig.projectId);
