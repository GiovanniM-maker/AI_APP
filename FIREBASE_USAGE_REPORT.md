# 📋 Report Completo: Utilizzo Variabili Firebase

## 🔍 1. INIZIALIZZAZIONE VARIABILI D'AMBIENTE

### File: `src/firebase.js`

**Righe 13-21**: Lettura variabili d'ambiente da Vercel
```javascript
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

**Righe 23-35**: Validazione variabili
```javascript
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const missingKeys = requiredKeys.filter(key => {
  const value = firebaseConfig[key];
  return !value || (typeof value === 'string' && value.trim().length === 0);
});

if (missingKeys.length > 0) {
  // ERRORE se mancano variabili - NO FALLBACK
  throw new Error(`❌ CRITICAL: Firebase configuration missing from Vercel...`);
}
```

**Righe 37-47**: Inizializzazione app Firebase
```javascript
let app;
const existingApps = getApps();

if (existingApps.length > 0) {
  app = getApp(); // Riutilizza app esistente
} else {
  app = initializeApp(firebaseConfig); // ← USA firebaseConfig (variabili Vercel)
}
```

**Righe 49-52**: Inizializzazione servizi Firebase
```javascript
export const auth = getAuth(app);      // ← Usa app inizializzata con variabili Vercel
export const db = getFirestore(app);    // ← Usa app inizializzata con variabili Vercel
export const storage = getStorage(app); // ← Usa app inizializzata con variabili Vercel
```

**Righe 54-56**: Logging configurazione
```javascript
console.log('[FIRESTORE] Project ID:', firebaseConfig.projectId);        // ← Variabile Vercel
console.log('[FIRESTORE] Storage Bucket:', firebaseConfig.storageBucket); // ← Variabile Vercel
console.log('[FIRESTORE] Auth Domain:', firebaseConfig.authDomain);       // ← Variabile Vercel
```

---

## 🔧 2. UTILIZZO ISTANZE FIREBASE

### File: `src/App.jsx`

**Riga 26**: Import istanze Firebase
```javascript
import { auth, db, storage } from './firebase.js';
```

**Riga 27**: Import diagnostica Firestore
```javascript
import { checkFirestoreConnection, resetFirestorePersistence } from './utils/firestoreDiagnostics.js';
```

---

## 🔐 3. UTILIZZO AUTH (Autenticazione)

### File: `src/App.jsx`

**Riga 766**: Listener stato autenticazione
```javascript
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
    // ← Usa auth da firebase.js
    setUser(currentUser);
    // ...
  });
  return unsubscribe;
}, [loadUserPreferences, subscribeToChats]);
```

**Riga 827**: Creazione account email
```javascript
await createUserWithEmailAndPassword(auth, email, password);
// ← Usa auth da firebase.js
```

**Riga 829**: Login email
```javascript
await signInWithEmailAndPassword(auth, email, password);
// ← Usa auth da firebase.js
```

**Riga 840**: Login Google
```javascript
const provider = new GoogleAuthProvider();
await signInWithPopup(auth, provider);
// ← Usa auth da firebase.js
```

**Riga 847**: Logout
```javascript
await signOut(auth);
// ← Usa auth da firebase.js
```

---

## 💾 4. UTILIZZO DB (Firestore)

### File: `src/App.jsx`

**Riga 642**: Lettura preferenze utente
```javascript
const userDocRef = doc(db, 'users', uid);
// ← Usa db da firebase.js

const snapshot = await retryFirestoreOperation(async () => {
  return await getDoc(userDocRef);
  // ← Operazione Firestore usando db
});
```

**Riga 694**: Query collezione chat
```javascript
const chatsQuery = query(
  collection(db, 'chats'),        // ← Usa db da firebase.js
  where('userId', '==', uid),
  orderBy('updatedAt', 'desc')
);
```

**Riga 699**: Listener real-time chat
```javascript
chatsListenerRef.current = onSnapshot(
  chatsQuery,                    // ← Query creata con db
  (snapshot) => { /* ... */ },
  (err) => { /* ... */ }
);
```

**Riga 791**: Scrittura preferenze utente
```javascript
const userDocRef = doc(db, 'users', user.uid);
// ← Usa db da firebase.js

retryFirestoreOperation(async () => {
  return await setDoc(
    userDocRef,
    { preferences: { /* ... */ } },
    { merge: true }
  );
  // ← Operazione Firestore usando db
});
```

**Riga 863**: Creazione nuova chat
```javascript
const chatRef = await retryFirestoreOperation(async () => {
  return await addDoc(collection(db, 'chats'), chatPayload);
  // ← Usa db da firebase.js per creare documento
});
```

**Riga 1004**: Riferimento documento chat
```javascript
const chatRef = doc(db, 'chats', chatId);
// ← Usa db da firebase.js
```

**Riga 1053**: Salvataggio messaggio utente
```javascript
await retryFirestoreOperation(async () => {
  return await setDoc(
    chatRef,                     // ← Riferimento creato con db
    {
      userId: user.uid,
      title: title || 'Nuova chat',
      messages: serializeMessagesForStorage(updatedMessages),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  // ← Operazione Firestore usando db
});
```

**Riga 1180**: Salvataggio messaggi finali
```javascript
await retryFirestoreOperation(async () => {
  return await setDoc(
    chatRef,                     // ← Riferimento creato con db
    {
      messages: serializeMessagesForStorage(finalMessages),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  // ← Operazione Firestore usando db
});
```

**Righe 665, 671, 738, 811, 890, 1078, 1203**: Accesso configurazione per logging
```javascript
db.app.options?.projectId      // ← Accede a projectId dalla configurazione
db.app.options?.apiKey          // ← Accede a apiKey dalla configurazione
db.app.options?.authDomain       // ← Accede a authDomain dalla configurazione
```

---

## 📦 5. UTILIZZO STORAGE (Firebase Storage)

### File: `src/App.jsx`

**Riga 262**: Funzione upload immagini
```javascript
const uploadAttachmentsToStorage = async (attachments, userId, onStatusChange) => {
  // ...
  
  const storagePath = `uploads/${userId}/${Date.now()}-${index}-${randomId()}.${extension}`;
  const storageRef = ref(storage, storagePath);
  // ← Usa storage da firebase.js
  
  await uploadBytes(storageRef, file, {
    contentType: mimeType,
  });
  // ← Operazione Storage usando storage
  
  const url = await getDownloadURL(storageRef);
  // ← Operazione Storage usando storage
};
```

---

## 🔍 6. UTILIZZO IN DIAGNOSTICA

### File: `src/utils/firestoreDiagnostics.js`

**Riga 10**: Import db
```javascript
import { db } from '../firebase.js';
```

**Riga 20**: Accesso projectId per diagnostica
```javascript
projectId: db.app.options?.projectId,
// ← Accede a projectId dalla configurazione
```

**Riga 28**: Test read
```javascript
const testReadRef = doc(db, '_diagnostics', 'connection-test');
// ← Usa db da firebase.js
await getDoc(testReadRef);
```

**Riga 32**: Test write
```javascript
const testWriteRef = doc(db, '_diagnostics', 'connection-test-write');
// ← Usa db da firebase.js
await setDoc(testWriteRef, { /* ... */ }, { merge: true });
```

**Righe 71, 77, 82, 89, 104**: Operazioni network/persistence
```javascript
await disableNetwork(db);              // ← Usa db
await clearIndexedDbPersistence(db);   // ← Usa db
await enableIndexedDbPersistence(db);  // ← Usa db
await enableNetwork(db);                // ← Usa db
```

**Righe 119-121**: Accesso stato
```javascript
projectId: db.app.options?.projectId,  // ← Accede a projectId
appName: db.app.name,                  // ← Accede a nome app
```

---

## 📊 7. UTILIZZO IN LOGGING/DEBUG

### File: `src/App.jsx`

**Riga 514**: Log project ID
```javascript
db.app.options?.projectId || 'N/D'
// ← Accede a projectId dalla configurazione per logging
```

**Riga 542**: Test connessione all'avvio
```javascript
const connectionStatus = await checkFirestoreConnection();
// ← Usa funzione diagnostica che usa db
```

---

## 📝 8. RIEPILOGO UTILIZZI

### Variabili d'ambiente lette:
1. `VITE_FIREBASE_API_KEY` → `firebaseConfig.apiKey`
2. `VITE_FIREBASE_AUTH_DOMAIN` → `firebaseConfig.authDomain`
3. `VITE_FIREBASE_PROJECT_ID` → `firebaseConfig.projectId`
4. `VITE_FIREBASE_STORAGE_BUCKET` → `firebaseConfig.storageBucket`
5. `VITE_FIREBASE_MESSAGING_SENDER_ID` → `firebaseConfig.messagingSenderId`
6. `VITE_FIREBASE_APP_ID` → `firebaseConfig.appId`
7. `VITE_FIREBASE_MEASUREMENT_ID` → `firebaseConfig.measurementId` (opzionale)

### Istanze Firebase esportate:
- `auth` → usata in: App.jsx (autenticazione)
- `db` → usata in: App.jsx (Firestore), firestoreDiagnostics.js
- `storage` → usata in: App.jsx (upload immagini)
- `app` → esportata ma non usata direttamente (solo per diagnostica)

### Operazioni Firestore:
- `getDoc()` → 2 usi (preferenze utente, test diagnostica)
- `setDoc()` → 3 usi (preferenze, messaggi utente, messaggi finali)
- `addDoc()` → 1 uso (creazione chat)
- `onSnapshot()` → 1 uso (listener chat real-time)
- `collection()` → 2 usi (query chat, creazione chat)
- `doc()` → 5 usi (riferimenti documenti)
- `query()` → 1 uso (query chat)
- `where()` → 1 uso (filtro userId)
- `orderBy()` → 1 uso (ordinamento chat)

### Operazioni Storage:
- `ref()` → 1 uso (riferimento file)
- `uploadBytes()` → 1 uso (upload file)
- `getDownloadURL()` → 1 uso (URL pubblico)

### Operazioni Auth:
- `onAuthStateChanged()` → 1 uso (listener stato)
- `createUserWithEmailAndPassword()` → 1 uso (registrazione)
- `signInWithEmailAndPassword()` → 1 uso (login email)
- `signInWithPopup()` → 1 uso (login Google)
- `signOut()` → 1 uso (logout)

---

## ✅ CONCLUSIONE

**Tutte le variabili Firebase vengono lette SOLO da:**
- `src/firebase.js` righe 14-20

**Tutte le istanze Firebase vengono create SOLO in:**
- `src/firebase.js` righe 50-52

**Tutte le operazioni Firebase usano le istanze esportate da:**
- `src/firebase.js` → `auth`, `db`, `storage`

**Nessun file inizializza Firebase direttamente** - tutto passa attraverso `firebase.js`

