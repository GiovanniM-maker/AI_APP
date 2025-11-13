import { 
  doc, 
  getDoc, 
  setDoc, 
  enableNetwork, 
  disableNetwork,
  clearIndexedDbPersistence,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import { db } from '../firebase.js';

/**
 * Check Firestore connection status by attempting a test read/write
 * @returns {Promise<{connected: boolean, error?: {code: string, message: string}, details: object}>}
 */
export const checkFirestoreConnection = async () => {
  const status = {
    connected: false,
    details: {
      projectId: db.app.options?.projectId,
      timestamp: new Date().toISOString(),
    },
    error: null,
  };

  try {
    // Test read operation
    const testReadRef = doc(db, '_diagnostics', 'connection-test');
    await getDoc(testReadRef);
    
    // Test write operation (if read succeeds)
    const testWriteRef = doc(db, '_diagnostics', 'connection-test-write');
    await setDoc(testWriteRef, {
      timestamp: new Date().toISOString(),
      test: true,
    }, { merge: true });
    
    status.connected = true;
    console.log('[FIRESTORE DIAGNOSTICS] ✅ Connection check: SUCCESS', status.details);
  } catch (error) {
    status.connected = false;
    status.error = {
      code: error?.code || 'unknown',
      message: error?.message || 'Unknown error',
      name: error?.name || 'Error',
    };
    console.error('[FIRESTORE DIAGNOSTICS] ❌ Connection check: FAILED', {
      ...status.details,
      error: status.error,
    });
  }

  return status;
};

/**
 * Reset Firestore persistence by clearing IndexedDB and re-enabling
 * @returns {Promise<{success: boolean, error?: object}>}
 */
export const resetFirestorePersistence = async () => {
  const result = {
    success: false,
    error: null,
  };

  try {
    console.log('[FIRESTORE DIAGNOSTICS] Resetting persistence...');
    
    // Disable network temporarily
    try {
      await disableNetwork(db);
    } catch (err) {
      console.warn('[FIRESTORE DIAGNOSTICS] Could not disable network:', err);
    }
    
    // Clear IndexedDB persistence
    await clearIndexedDbPersistence(db);
    console.log('[FIRESTORE DIAGNOSTICS] Cleared IndexedDB persistence');
    
    // Re-enable persistence
    try {
      await enableIndexedDbPersistence(db);
      console.log('[FIRESTORE DIAGNOSTICS] Re-enabled persistence');
    } catch (persistError) {
      console.warn('[FIRESTORE DIAGNOSTICS] Could not re-enable persistence:', persistError);
    }
    
    // Re-enable network
    await enableNetwork(db);
    console.log('[FIRESTORE DIAGNOSTICS] Re-enabled network');
    
    result.success = true;
    console.log('[FIRESTORE DIAGNOSTICS] ✅ Persistence reset complete');
  } catch (error) {
    result.error = {
      code: error?.code || 'unknown',
      message: error?.message || 'Unknown error',
      name: error?.name || 'Error',
    };
    console.error('[FIRESTORE DIAGNOSTICS] ❌ Persistence reset failed:', result.error);
    
    // Try to re-enable network even if reset failed
    try {
      await enableNetwork(db);
    } catch (networkError) {
      console.error('[FIRESTORE DIAGNOSTICS] ❌ Could not re-enable network after reset failure');
    }
  }

  return result;
};

/**
 * Get current Firestore connection state
 * @returns {object} Connection state information
 */
export const getFirestoreState = () => {
  return {
    projectId: db.app.options?.projectId,
    appName: db.app.name,
    timestamp: new Date().toISOString(),
  };
};

