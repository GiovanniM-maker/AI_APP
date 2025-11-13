# 🔥 Riferimenti Completi: Codice Firebase/Firestore

## 📁 FILE 1: `src/firebase.js`

### 🔹 Import Firebase SDK
```javascript
// Riga 1-10
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
```

### 🔹 Lettura Variabili d'Ambiente Vercel
```javascript
// Riga 14-22
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,              // ← Variabile Vercel
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,      // ← Variabile Vercel
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,        // ← Variabile Vercel
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, // ← Variabile Vercel
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, // ← Variabile Vercel
  appId: import.meta.env.VITE_FIREBASE_APP_ID,                // ← Variabile Vercel
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, // ← Variabile Vercel (opzionale)
};
```

### 🔹 Validazione Variabili
```javascript
// Riga 24-35
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const missingKeys = requiredKeys.filter(key => {
  const value = firebaseConfig[key];  // ← Usa firebaseConfig
  return !value || (typeof value === 'string' && value.trim().length === 0);
});

if (missingKeys.length > 0) {
  const errorMsg = `❌ CRITICAL: Firebase configuration missing from Vercel environment variables: ${missingKeys.join(', ')}. Please add all required VITE_FIREBASE_* variables in Vercel project settings.`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}
```

### 🔹 Inizializzazione App Firebase
```javascript
// Riga 38-51
let app;
const existingApps = getApps();  // ← Controlla app esistenti

if (existingApps.length > 0) {
  app = getApp();  // ← Riutilizza app esistente
  console.log('[FIREBASE] Reusing existing Firebase app:', app.name);
} else {
  app = initializeApp(firebaseConfig);  // ← Inizializza con firebaseConfig (variabili Vercel)
  console.log('[FIREBASE] App initialized:', app.name);
  console.log('[FIREBASE] Project ID:', firebaseConfig.projectId);        // ← Usa firebaseConfig
  console.log('[FIREBASE] Storage Bucket:', firebaseConfig.storageBucket); // ← Usa firebaseConfig
  console.log('[FIREBASE] Auth Domain:', firebaseConfig.authDomain);       // ← Usa firebaseConfig
}
```

### 🔹 Inizializzazione Servizi Firebase
```javascript
// Riga 53-58
export const auth = getAuth(app);      // ← Usa app inizializzata
export const db = getFirestore(app);    // ← Usa app inizializzata
export const storage = getStorage(app); // ← Usa app inizializzata

console.log('[FIREBASE] Services initialized: auth, db, storage');
```

### 🔹 Inizializzazione Connessione Firestore
```javascript
// Riga 60-133
const initializeFirestoreConnection = async () => {
  try {
    console.log('[FIREBASE] Starting Firestore connection initialization...');
    
    // Step 1: Clear persistence
    try {
      console.log('[FIREBASE] Clearing IndexedDB persistence...');
      await clearIndexedDbPersistence(db);  // ← Usa db
      console.log('[FIREBASE] ✅ Persistence cleared successfully');
    } catch (clearError) {
      // ... gestione errori
    }
    
    // Step 2: Enable persistence
    try {
      console.log('[FIREBASE] Enabling IndexedDB persistence...');
      await enableIndexedDbPersistence(db);  // ← Usa db
      console.log('[FIREBASE] ✅ Persistence enabled successfully');
    } catch (persistError) {
      // ... gestione errori
    }
    
    // Step 3: Force network
    try {
      console.log('[FIREBASE] Forcing network connection...');
      await enableNetwork(db);  // ← Usa db
      console.log('[FIREBASE] ✅ Network enabled - forced online connection');
    } catch (networkError) {
      // ... gestione errori
    }
  } catch (error) {
    // ... gestione errori
  }
};

// Chiamata immediata
initializeFirestoreConnection();
```

### 🔹 Funzione Test Connessione
```javascript
// Riga 135-180
export async function testFirestoreConnection() {
  console.log('[FIREBASE TEST] Starting Firestore connection test...');
  
  try {
    const testDocRef = doc(db, 'system_test', 'connection-check');  // ← Usa db
    const testData = {
      timestamp: serverTimestamp(),  // ← Funzione Firestore
      test: true,
      createdAt: new Date().toISOString(),
    };
    
    // Test write
    await setDoc(testDocRef, testData, { merge: true });  // ← Operazione Firestore
    
    // Test read
    const snapshot = await getDoc(testDocRef);  // ← Operazione Firestore
    
    if (snapshot.exists()) {
      return { ok: true };
    } else {
      return { ok: false, error: 'Document does not exist after write' };
    }
  } catch (error) {
    return { ok: false, error: { /* ... */ } };
  }
}
```

### 🔹 Export Finali
```javascript
// Riga 182
export { app };
```

---

## 📁 FILE 2: `src/App.jsx`

### 🔹 Import Firebase
```javascript
// Riga 2-9: Import Auth
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

// Riga 10-21: Import Firestore
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

// Riga 25: Import Storage
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Riga 26: Import Istanze Firebase
import { auth, db, storage } from './firebase.js';
```

### 🔹 Funzione Upload Immagini (Storage)
```javascript
// Riga 262-338
const uploadAttachmentsToStorage = async (attachments, userId, onStatusChange) => {
  // ...
  
  // Riga 302-303: Creazione riferimento Storage
  const storagePath = `uploads/${userId}/${Date.now()}-${index}-${randomId()}.${extension}`;
  const storageRef = ref(storage, storagePath);  // ← Usa storage da firebase.js
  
  // Riga 305-307: Upload file
  await uploadBytes(storageRef, file, {  // ← Operazione Storage
    contentType: mimeType,
  });
  
  // Riga 309: Download URL
  const url = await getDownloadURL(storageRef);  // ← Operazione Storage
  
  return results;
};
```

### 🔹 Lettura Preferenze Utente (Firestore)
```javascript
// Riga 640-688
const loadUserPreferences = useCallback(async (uid) => {
  try {
    // Riga 642: Creazione riferimento documento
    const userDocRef = doc(db, 'users', uid);  // ← Usa db da firebase.js
    
    // Riga 644-646: Lettura documento con retry
    const snapshot = await retryFirestoreOperation(async () => {
      return await getDoc(userDocRef);  // ← Operazione Firestore
    });
    
    if (snapshot.exists()) {
      const data = snapshot.data();
      // ... gestione dati
    }
  } catch (err) {
    // Riga 665-673: Logging con accesso configurazione
    console.error('[Firestore] Client offline. Check Firebase configuration:', {
      projectId: db.app.options?.projectId,  // ← Accede a projectId
      errorCode: err?.code,
      errorMessage: err?.message,
      firebaseConfig: {
        projectId: db.app.options?.projectId,  // ← Accede a projectId
        apiKey: db.app.options?.apiKey ? 'SET' : 'MISSING',  // ← Accede a apiKey
        authDomain: db.app.options?.authDomain,  // ← Accede a authDomain
      },
    });
  }
}, []);
```

### 🔹 Query Chat Real-time (Firestore)
```javascript
// Riga 690-763
const subscribeToChats = useCallback((uid) => {
  chatsListenerRef.current?.();
  
  // Riga 693-697: Creazione query
  const chatsQuery = query(
    collection(db, 'chats'),        // ← Usa db da firebase.js
    where('userId', '==', uid),    // ← Filtro Firestore
    orderBy('updatedAt', 'desc')   // ← Ordinamento Firestore
  );
  
  // Riga 699-762: Listener real-time
  chatsListenerRef.current = onSnapshot(
    chatsQuery,                    // ← Query creata con db
    (snapshot) => {
      // ... gestione snapshot
    },
    (err) => {
      // Riga 738: Logging con accesso configurazione
      console.error('[FIRESTORE] Error in chat subscription:', {
        projectId: db.app.options?.projectId,  // ← Accede a projectId
        errorCode,
        errorMessage,
      });
    }
  );
}, []);
```

### 🔹 Listener Autenticazione (Auth)
```javascript
// Riga 765-783
useEffect(() => {
  // Riga 766: Listener stato autenticazione
  const unsubscribe = onAuthStateChanged(auth, (currentUser) => {  // ← Usa auth da firebase.js
    setUser(currentUser);
    setError(null);
    
    if (currentUser) {
      loadUserPreferences(currentUser.uid);
      subscribeToChats(currentUser.uid);
    } else {
      // ... gestione logout
    }
  });
  
  return unsubscribe;
}, [loadUserPreferences, subscribeToChats]);
```

### 🔹 Salvataggio Preferenze Utente (Firestore)
```javascript
// Riga 785-821
useEffect(() => {
  if (!user || !isSettingsLoaded) {
    return undefined;
  }
  
  const timeout = setTimeout(() => {
    // Riga 791: Creazione riferimento documento
    const userDocRef = doc(db, 'users', user.uid);  // ← Usa db da firebase.js
    
    // Riga 792-797: Scrittura documento con retry
    retryFirestoreOperation(async () => {
      return await setDoc(  // ← Operazione Firestore
        userDocRef,
        {
          preferences: {
            model: settings.model,
            temperature: settings.temperature,
            topP: settings.topP,
            instructions: settings.instructions,
          },
        },
        { merge: true }
      );
    }).catch((err) => {
      // Riga 811: Logging con accesso configurazione
      console.error('[FIRESTORE] Client offline during preferences save:', {
        projectId: db.app.options?.projectId,  // ← Accede a projectId
        error: err,
      });
    });
  }, 500);
  
  return () => clearTimeout(timeout);
}, [settings, user, isSettingsLoaded]);
```

### 🔹 Autenticazione Email (Auth)
```javascript
// Riga 823-834
const handleEmailAuth = useCallback(async (email, password, mode) => {
  setIsAuthenticating(true);
  try {
    if (mode === 'signup') {
      // Riga 827: Creazione account
      await createUserWithEmailAndPassword(auth, email, password);  // ← Usa auth da firebase.js
    } else {
      // Riga 829: Login
      await signInWithEmailAndPassword(auth, email, password);  // ← Usa auth da firebase.js
    }
  } finally {
    setIsAuthenticating(false);
  }
}, []);
```

### 🔹 Autenticazione Google (Auth)
```javascript
// Riga 836-844
const handleGoogleSignIn = useCallback(async () => {
  setIsAuthenticating(true);
  try {
    // Riga 839-840: Login Google
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);  // ← Usa auth da firebase.js
  } finally {
    setIsAuthenticating(false);
  }
}, []);
```

### 🔹 Logout (Auth)
```javascript
// Riga 846-849
const handleLogout = useCallback(async () => {
  await signOut(auth);  // ← Usa auth da firebase.js
  resetStreaming();
}, [resetStreaming]);
```

### 🔹 Creazione Chat (Firestore)
```javascript
// Riga 851-895
const ensureChatExists = useCallback(
  async (currentChatId, initialTitle) => {
    if (!user) return null;
    
    if (currentChatId) {
      return currentChatId;
    }
    
    const chatTitle = initialTitle?.trim()?.slice(0, 60) || 'Nuova chat';
    
    // Riga 862-868: Payload chat
    const chatPayload = {
      userId: user.uid,
      title: chatTitle,
      messages: [],
      createdAt: serverTimestamp(),  // ← Funzione Firestore
      updatedAt: serverTimestamp(),  // ← Funzione Firestore
    };
    
    try {
      // Riga 871-873: Creazione documento con retry
      const chatRef = await retryFirestoreOperation(async () => {
        return await addDoc(collection(db, 'chats'), chatPayload);  // ← Usa db, operazione Firestore
      });
      
      // ... gestione risultato
    } catch (firestoreError) {
      // Riga 890: Logging con accesso configurazione
      console.error('[FIRESTORE] Failed to create chat after retry:', {
        projectId: db.app.options?.projectId,  // ← Accede a projectId
        errorCode,
        errorMessage,
      });
    }
  },
  [user]
);
```

### 🔹 Salvataggio Messaggio Utente (Firestore)
```javascript
// Riga 1016-1076
// Riga 1016: Creazione riferimento documento
const chatRef = doc(db, 'chats', chatId);  // ← Usa db da firebase.js

// ... preparazione messaggio

// Riga 1052-1064: Salvataggio con retry
try {
  await retryFirestoreOperation(async () => {
    return await setDoc(  // ← Operazione Firestore
      chatRef,
      {
        userId: user.uid,
        title: title || 'Nuova chat',
        messages: serializeMessagesForStorage(updatedMessages),
        updatedAt: serverTimestamp(),  // ← Funzione Firestore
      },
      { merge: true }
    );
  });
} catch (firestoreError) {
  // Riga 1078: Logging con accesso configurazione
  console.error('[FIRESTORE] Failed to save user message after retry:', {
    projectId: db.app.options?.projectId,  // ← Accede a projectId
    errorCode,
    errorMessage,
  });
}
```

### 🔹 Salvataggio Messaggi Finali (Firestore)
```javascript
// Riga 1179-1201
try {
  await retryFirestoreOperation(async () => {
    return await setDoc(  // ← Operazione Firestore
      chatRef,
      {
        messages: serializeMessagesForStorage(finalMessages),
        updatedAt: serverTimestamp(),  // ← Funzione Firestore
      },
      { merge: true }
    );
  });
} catch (firestoreError) {
  // Riga 1203: Logging con accesso configurazione
  console.error('[FIRESTORE] Failed to save final messages after retry:', {
    projectId: db.app.options?.projectId,  // ← Accede a projectId
    errorCode,
    errorMessage,
  });
}
```

### 🔹 Logging Debug (Accesso Configurazione)
```javascript
// Riga 549: Logging project ID
db.app.options?.projectId || 'N/D'  // ← Accede a projectId dalla configurazione
```

---

## 📁 FILE 3: `src/utils/firestoreDiagnostics.js`

### 🔹 Import Firebase
```javascript
// Riga 1-10
import { 
  doc, 
  getDoc, 
  setDoc, 
  enableNetwork, 
  disableNetwork,
  clearIndexedDbPersistence,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import { db } from '../firebase.js';  // ← Import db da firebase.js
```

### 🔹 Test Connessione Firestore
```javascript
// Riga 16-54
export const checkFirestoreConnection = async () => {
  const status = {
    connected: false,
    details: {
      // Riga 20: Accesso projectId
      projectId: db.app.options?.projectId,  // ← Accede a projectId dalla configurazione
      timestamp: new Date().toISOString(),
    },
    error: null,
  };
  
  try {
    // Riga 28: Test read
    const testReadRef = doc(db, '_diagnostics', 'connection-test');  // ← Usa db
    await getDoc(testReadRef);  // ← Operazione Firestore
    
    // Riga 32-36: Test write
    const testWriteRef = doc(db, '_diagnostics', 'connection-test-write');  // ← Usa db
    await setDoc(testWriteRef, {  // ← Operazione Firestore
      timestamp: new Date().toISOString(),
      test: true,
    }, { merge: true });
    
    status.connected = true;
  } catch (error) {
    // ... gestione errori
  }
  
  return status;
};
```

### 🔹 Reset Persistence Firestore
```javascript
// Riga 60-111
export const resetFirestorePersistence = async () => {
  try {
    // Riga 71: Disable network
    await disableNetwork(db);  // ← Usa db
    
    // Riga 77: Clear persistence
    await clearIndexedDbPersistence(db);  // ← Usa db
    
    // Riga 82: Re-enable persistence
    await enableIndexedDbPersistence(db);  // ← Usa db
    
    // Riga 89: Re-enable network
    await enableNetwork(db);  // ← Usa db
  } catch (error) {
    // Riga 104: Re-enable network anche in caso di errore
    await enableNetwork(db);  // ← Usa db
  }
};
```

### 🔹 Stato Firestore
```javascript
// Riga 117-123
export const getFirestoreState = () => {
  return {
    // Riga 119-120: Accesso configurazione
    projectId: db.app.options?.projectId,  // ← Accede a projectId
    appName: db.app.name,                  // ← Accede a nome app
    timestamp: new Date().toISOString(),
  };
};
```

---

## 📊 RIEPILOGO UTILIZZI

### Variabili d'Ambiente (solo in `firebase.js`):
- `VITE_FIREBASE_API_KEY` → `firebaseConfig.apiKey`
- `VITE_FIREBASE_AUTH_DOMAIN` → `firebaseConfig.authDomain`
- `VITE_FIREBASE_PROJECT_ID` → `firebaseConfig.projectId`
- `VITE_FIREBASE_STORAGE_BUCKET` → `firebaseConfig.storageBucket`
- `VITE_FIREBASE_MESSAGING_SENDER_ID` → `firebaseConfig.messagingSenderId`
- `VITE_FIREBASE_APP_ID` → `firebaseConfig.appId`
- `VITE_FIREBASE_MEASUREMENT_ID` → `firebaseConfig.measurementId`

### Istanze Firebase:
- `auth` → 5 usi in App.jsx (autenticazione)
- `db` → 20+ usi in App.jsx + firestoreDiagnostics.js + firebase.js
- `storage` → 3 usi in App.jsx (upload immagini)

### Operazioni Firestore:
- `getDoc()` → 3 usi
- `setDoc()` → 5 usi
- `addDoc()` → 1 uso
- `onSnapshot()` → 1 uso
- `doc()` → 8 usi
- `collection()` → 2 usi
- `query()` → 1 uso
- `where()` → 1 uso
- `orderBy()` → 1 uso
- `serverTimestamp()` → 4 usi

### Operazioni Storage:
- `ref()` → 1 uso
- `uploadBytes()` → 1 uso
- `getDownloadURL()` → 1 uso

### Operazioni Auth:
- `onAuthStateChanged()` → 1 uso
- `createUserWithEmailAndPassword()` → 1 uso
- `signInWithEmailAndPassword()` → 1 uso
- `signInWithPopup()` → 1 uso
- `signOut()` → 1 uso

### Accesso Configurazione (per logging):
- `db.app.options?.projectId` → 8 usi
- `db.app.options?.apiKey` → 1 uso
- `db.app.options?.authDomain` → 1 uso
- `db.app.name` → 1 uso

