import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
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
import Login from './components/Login.jsx';
import Chat from './components/Chat.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { auth, db } from './firebase.js';

const DEFAULT_SETTINGS = {
  model: 'gemini-1.5-flash',
  temperature: 0.8,
  topP: 0.9,
  instructions: '',
};

function App() {
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const chatsListenerRef = useRef(null);
  const streamingTimerRef = useRef(null);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [chats, activeChatId]
  );

  const resetStreaming = useCallback(() => {
    if (streamingTimerRef.current) {
      clearInterval(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
    setStreamingText('');
  }, []);

  const simulateStreaming = useCallback(
    (text) =>
      new Promise((resolve) => {
        resetStreaming();

        if (!text) {
          resolve();
          return;
        }

        let index = 0;
        const chunk = Math.max(1, Math.round(text.length / 60));

        streamingTimerRef.current = setInterval(() => {
          index = Math.min(text.length, index + chunk);
          setStreamingText(text.slice(0, index));

          if (index >= text.length) {
            if (streamingTimerRef.current) {
              clearInterval(streamingTimerRef.current);
              streamingTimerRef.current = null;
            }
            resolve();
          }
        }, 25);
      }),
    [resetStreaming]
  );

  useEffect(
    () => () => {
      if (streamingTimerRef.current) {
        clearInterval(streamingTimerRef.current);
      }
      chatsListenerRef.current?.();
    },
    []
  );

  const loadUserPreferences = useCallback(async (uid) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const snapshot = await getDoc(userDocRef);

      if (snapshot.exists()) {
        const data = snapshot.data();
        const preferences = data?.preferences ?? {};
        setSettings((prev) => ({
          ...prev,
          ...DEFAULT_SETTINGS,
          ...preferences,
        }));
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (err) {
      console.error('Impossibile caricare le preferenze utente', err);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setIsSettingsLoaded(true);
    }
  }, []);

  const subscribeToChats = useCallback((uid) => {
    chatsListenerRef.current?.();

    const chatsQuery = query(
      collection(db, 'chats'),
      where('userId', '==', uid),
      orderBy('updatedAt', 'desc')
    );

    chatsListenerRef.current = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const nextChats = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const messages = Array.isArray(data?.messages)
            ? data.messages.map((message) => ({
                role: message?.role ?? 'user',
                content: message?.content ?? '',
                timestamp: message?.timestamp ?? Date.now(),
              }))
            : [];

          return {
            id: docSnap.id,
            title: data?.title ?? 'Nuova chat',
            messages,
            updatedAt: data?.updatedAt?.toMillis?.() ?? Date.now(),
          };
        });

        setChats(nextChats);
        setActiveChatId((prev) => {
          if (prev && nextChats.some((chat) => chat.id === prev)) {
            return prev;
          }
          return nextChats[0]?.id ?? null;
        });
      },
      (err) => {
        console.error('Errore nel recupero delle chat', err);
      }
    );
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setError('');

      if (currentUser) {
        loadUserPreferences(currentUser.uid);
        subscribeToChats(currentUser.uid);
      } else {
        chatsListenerRef.current?.();
        setChats([]);
        setActiveChatId(null);
        setSettings(DEFAULT_SETTINGS);
        setIsSettingsLoaded(false);
      }
    });

    return unsubscribe;
  }, [loadUserPreferences, subscribeToChats]);

  useEffect(() => {
    if (!user || !isSettingsLoaded) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      const userDocRef = doc(db, 'users', user.uid);
      setDoc(
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
      ).catch((err) => {
        console.error('Impossibile salvare le preferenze', err);
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, [settings, user, isSettingsLoaded]);

  const handleEmailAuth = useCallback(async (email, password, mode) => {
    setIsAuthenticating(true);
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    resetStreaming();
  }, [resetStreaming]);

  const ensureChatExists = useCallback(
    async (currentChatId, initialTitle) => {
      if (!user) return null;

      if (currentChatId) {
        return currentChatId;
      }

      const chatTitle =
        initialTitle?.trim()?.slice(0, 60) || 'Nuova chat';

      const chatPayload = {
        userId: user.uid,
        title: chatTitle,
        messages: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const chatRef = await addDoc(collection(db, 'chats'), chatPayload);
      const newChat = {
        id: chatRef.id,
        title: chatTitle,
        messages: [],
        updatedAt: Date.now(),
      };

      setChats((prev) => [newChat, ...prev.filter((chat) => chat.id !== chatRef.id)]);

      return chatRef.id;
    },
    [user]
  );

  const handleUpdateSettings = useCallback((partialSettings) => {
    setSettings((prev) => ({
      ...prev,
      ...partialSettings,
    }));
  }, []);

  const handleSelectChat = useCallback((chatId) => {
    setActiveChatId(chatId);
    resetStreaming();
    setError('');
  }, [resetStreaming]);

  const handleStartNewChat = useCallback(async () => {
    resetStreaming();
    setError('');
    const newChatId = await ensureChatExists(null, 'Nuova chat');
    if (newChatId) {
      setActiveChatId(newChatId);
    }
  }, [ensureChatExists, resetStreaming]);

  const handleSendMessage = useCallback(
    async (rawContent) => {
      if (!user) {
        throw new Error('Devi essere autenticato per inviare messaggi.');
      }

      const content = rawContent.trim();
      if (!content) return;

      setError('');
      setIsGenerating(true);

      try {
        const chatId = await ensureChatExists(activeChatId, content);

        if (!chatId) {
          throw new Error('Impossibile creare la chat.');
        }

        setActiveChatId(chatId);

        const chatRef = doc(db, 'chats', chatId);
        const existingChat =
          chats.find((chat) => chat.id === chatId) ?? {
            id: chatId,
            title: content.slice(0, 40),
            messages: [],
          };

        const title =
          existingChat.title && existingChat.title !== 'Nuova chat'
            ? existingChat.title
            : content.slice(0, 60);

        const userMessage = {
          role: 'user',
          content,
          timestamp: Date.now(),
        };

        const updatedMessages = [...(existingChat.messages ?? []), userMessage];

        setChats((prevChats) => {
          const others = prevChats.filter((chatItem) => chatItem.id !== chatId);
          return [
            {
              id: chatId,
              title: title || 'Nuova chat',
              messages: updatedMessages,
              updatedAt: Date.now(),
            },
            ...others,
          ];
        });

        await setDoc(
          chatRef,
          {
            userId: user.uid,
            title: title || 'Nuova chat',
            messages: updatedMessages,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        const payloadMessages = [
          ...(settings.instructions
            ? [{ role: 'system', text: settings.instructions }]
            : []),
          ...updatedMessages.map((message) => ({
            role: message.role,
            text: message.content,
          })),
        ];

        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: settings.model,
            messages: payloadMessages,
            temperature: settings.temperature,
            top_p: settings.topP,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? `Request failed with ${response.status}`);
        }

        const payload = await response.json();
        const rawText = payload?.text ?? '';
        await simulateStreaming(rawText);

        const assistantMessage = {
          role: 'assistant',
          content: rawText || 'Nessuna risposta dal modello.',
          timestamp: Date.now(),
        };

        const finalMessages = [...updatedMessages, assistantMessage];

        setChats((prevChats) => {
          const others = prevChats.filter((chatItem) => chatItem.id !== chatId);
          return [
            {
              id: chatId,
              title: title || 'Nuova chat',
              messages: finalMessages,
              updatedAt: Date.now(),
            },
            ...others,
          ];
        });

        await setDoc(
          chatRef,
          {
            messages: finalMessages,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        resetStreaming();
      } catch (err) {
        console.error('Errore durante l\'invio del messaggio', err);
        setError(err?.message ?? 'Invio messaggio fallito.');
        resetStreaming();
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [user, activeChatId, ensureChatExists, chats, settings, simulateStreaming, resetStreaming]
  );

  if (!user) {
    return (
      <Login
        onEmailAuth={handleEmailAuth}
        onGoogleSignIn={handleGoogleSignIn}
        isLoading={isAuthenticating}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Gemini Chat Workspace</h1>
            <p className="text-sm text-slate-500">
              Connesso come{' '}
              <span className="font-semibold text-slate-700">
                {user.displayName || user.email}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleStartNewChat}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600"
            >
              Nuova chat
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr_300px]">
        <aside className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex lg:flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Le tue chat</h2>
            <span className="text-xs font-medium text-slate-400">
              {chats.length}
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {chats.length === 0 ? (
              <p className="text-xs text-slate-400">Nessuna chat ancora. Creane una nuova!</p>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => handleSelectChat(chat.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    chat.id === activeChatId
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <p className="font-medium">{chat.title || 'Nuova chat'}</p>
                  <p className="line-clamp-2 text-xs text-slate-400">
                    {chat.messages?.[chat.messages.length - 1]?.content ||
                      'Ancora nessun messaggio'}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="lg:col-span-1">
          <Chat
            chat={activeChat}
            onSendMessage={handleSendMessage}
            onStartNewChat={handleStartNewChat}
            isGenerating={isGenerating}
            streamingText={streamingText}
            error={error}
          />
        </div>

        <SettingsPanel
          settings={settings}
          onUpdate={handleUpdateSettings}
          disabled={isGenerating}
        />
      </main>
    </div>
  );
}

export default App;

