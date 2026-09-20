import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteField,
  getDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD-2dNCPlAOXvJTBIvKzQvnntwU7k6-jq8",
  authDomain: "syncspace-e14ab.firebaseapp.com",
  projectId: "syncspace-e14ab",
  storageBucket: "syncspace-e14ab.firebasestorage.app",
  messagingSenderId: "1017766123091",
  appId: "1:1017766123091:web:9070d7c249986837e958a6",
  measurementId: "G-G3HTQ90G4P",
};

// Initialize Firebase (SSR safe)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Use in-memory local cache to prevent IndexedDB "Database is closing/hidden" runtime errors on page reload & tab switch
const db = typeof window !== "undefined"
  ? initializeFirestore(app, { localCache: memoryLocalCache() })
  : getFirestore(app);

const googleProvider = new GoogleAuthProvider();

// Initialize Analytics conditionally (only in browser)
let analytics = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

// Reusable Google Sign-In Popup Helper
export async function signInWithGooglePopup() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const profile = {
      name: user.displayName || user.email?.split("@")[0] || "User",
      email: user.email || "",
      photoURL: user.photoURL || "",
      uid: user.uid,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("syncspace_current_user", JSON.stringify(profile));
    }
    return { user: profile, error: null };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Google sign-in error";
    console.error("Google Auth Error details:", err);
    if (typeof window !== "undefined" && errorMsg.includes("unauthorized-domain")) {
      alert(
        "Firebase Domain Error:\n\n" +
        "Please add '" + window.location.hostname + "' to Authorized Domains in:\n" +
        "Firebase Console -> Authentication -> Settings -> Authorized domains"
      );
    }
    return { user: null, error: errorMsg };
  }
}

// Reusable Email/Password Sign Up Helper
export async function signUpWithEmail(email: string, pass: string, name: string) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (cred.user && name) {
      await updateProfile(cred.user, { displayName: name });
    }
    const profile = {
      name: name || cred.user.displayName || email.split("@")[0],
      email: cred.user.email || email,
      uid: cred.user.uid,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("syncspace_current_user", JSON.stringify(profile));
    }
    return { user: profile, error: null };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Sign up error";
    return { user: null, error: errorMsg };
  }
}

// Reusable Email/Password Sign In Helper
export async function signInWithEmail(email: string, pass: string) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const profile = {
      name: cred.user.displayName || email.split("@")[0],
      email: cred.user.email || email,
      uid: cred.user.uid,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("syncspace_current_user", JSON.stringify(profile));
    }
    return { user: profile, error: null };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Sign in error";
    return { user: null, error: errorMsg };
  }
}

// Subscribe to Firebase Auth state changes
export function subscribeToAuth(callback: (user: { name: string; email: string; uid?: string } | null) => void) {
  return onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
    if (fbUser) {
      const profile = {
        name: fbUser.displayName || fbUser.email?.split("@")[0] || "User",
        email: fbUser.email || "",
        photoURL: fbUser.photoURL || "",
        uid: fbUser.uid,
      };
      if (typeof window !== "undefined") {
        localStorage.setItem("syncspace_current_user", JSON.stringify(profile));
      }
      callback(profile);
    } else {
      callback(null);
    }
  });
}

// Real-time Room Sync via Firestore across ALL Browsers & Devices
export async function registerRoomCode(code: string, roomId: string) {
  try {
    await setDoc(doc(db, "codes", code.toUpperCase()), { roomId, createdAt: Date.now() }, { merge: true });
  } catch {
    // catch permission or network errors silently
  }
}

export async function resolveRoomCode(input: string): Promise<string> {
  const cleanInput = input.trim();
  if (cleanInput.includes("/room/")) {
    return cleanInput.split("/room/")[1].split("?")[0].split("#")[0];
  }
  if (cleanInput.endsWith("-room")) {
    return cleanInput.toLowerCase();
  }

  // Lookup in Firestore
  try {
    const docRef = doc(db, "codes", cleanInput.toUpperCase());
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data().roomId) {
      return snap.data().roomId;
    }
  } catch {
    // ignore
  }

  // If input contains hyphen e.g. AYUSHMAKVANA-2779
  if (cleanInput.includes("-")) {
    const prefix = cleanInput.split("-")[0].toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
    if (prefix) return `${prefix}-room`;
  }

  // Fallback: treat as username or room slug
  const slug = cleanInput.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
  return slug ? `${slug}-room` : cleanInput;
}

interface FirestoreMemberPresence {
  id?: string;
  name: string;
  isHost: boolean;
  lastSeen: number;
}

interface FirestorePlaybackState {
  state: number;
  currentTime: number;
  updatedAt: number;
  updatedBy?: string;
}

interface FirestoreChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  createdAt?: number;
}

export interface FirestoreWebRTCSignal {
  id: string;
  from: string;
  to: string;
  type: "offer" | "answer" | "candidate" | "media-status";
  payload: unknown;
  createdAt: number;
}

export interface FirestoreRoomData {
  hostId?: string;
  hostName?: string;
  members?: FirestoreMemberPresence[];
  messages?: FirestoreChatMessage[];
  mediaUrl?: string;
  mediaType?: "youtube" | "direct";
  mediaTitle?: string;
  playback?: FirestorePlaybackState;
  webrtcSignals?: FirestoreWebRTCSignal[];
}

function normalizeMembers(data: Record<string, unknown>): FirestoreMemberPresence[] {
  const legacyMembers = Array.isArray(data.members)
    ? (data.members as FirestoreMemberPresence[])
    : [];
  const memberMapData = data.membersById && typeof data.membersById === "object"
    ? (data.membersById as Record<string, FirestoreMemberPresence>)
    : {};

  const mappedMembers = Object.entries(memberMapData).map(([id, member]) => ({
    ...member,
    id,
  }));

  if (mappedMembers.length > 0) return mappedMembers;

  return legacyMembers.map((member) => ({
    ...member,
    id: member.id || member.name.toLowerCase().trim(),
  }));
}

function normalizeMessages(data: Record<string, unknown>): FirestoreChatMessage[] {
  const legacyMessages = Array.isArray(data.messages)
    ? (data.messages as FirestoreChatMessage[])
    : [];
  const messageMapData = data.messagesById && typeof data.messagesById === "object"
    ? (data.messagesById as Record<string, FirestoreChatMessage>)
    : {};

  const messageMap = new Map<string, FirestoreChatMessage>();
  const mappedMessages = Object.entries(messageMapData);
  const sourceMessages = mappedMessages.length > 0
    ? mappedMessages.map(([id, message]) => ({ ...message, id: message.id || id }))
    : legacyMessages;

  for (const message of sourceMessages) {
    messageMap.set(message.id, message);
  }

  return Array.from(messageMap.values()).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

function normalizeWebRTCSignals(data: Record<string, unknown>): FirestoreWebRTCSignal[] {
  const signalMapData = data.webrtcSignalsById && typeof data.webrtcSignalsById === "object"
    ? (data.webrtcSignalsById as Record<string, FirestoreWebRTCSignal>)
    : {};
  const cutoff = Date.now() - 120000;

  return Object.entries(signalMapData)
    .map(([id, signal]) => ({ ...signal, id: signal.id || id }))
    .filter((signal) => Number(signal.createdAt || 0) > cutoff)
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}
export function subscribeToRoomFirestore(
  roomId: string,
  callback: (data: FirestoreRoomData) => void
) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    return onSnapshot(
      roomRef,
      (snapshot) => {
        const data = snapshot.data();
        if (data) {
          callback({
            hostId: data.hostId,
            hostName: data.hostName,
            members: normalizeMembers(data),
            messages: normalizeMessages(data),
            mediaUrl: data.mediaUrl,
            mediaType: data.mediaType,
            mediaTitle: data.mediaTitle,
            playback: data.playback,
            webrtcSignals: normalizeWebRTCSignals(data),
          });
        }
      },
      () => {
        // Silently handle permission/offline error
      }
    );
  } catch {
    return () => {};
  }
}

export async function heartbeatMemberFirestore(roomId: string, userId: string, name: string, isHost: boolean) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    const now = Date.now();
    const memberId = userId || name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    const member = {
      id: memberId,
      name,
      isHost,
      lastSeen: now,
    };

    await setDoc(
      roomRef,
      {
        ...(isHost ? { hostId: memberId, hostName: name } : {}),
        membersById: {
          [memberId]: member,
        },
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Firestore member heartbeat failed", error);
  }
}
export async function leaveMemberFirestore(roomId: string, userId: string) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, {
      [`membersById.${userId}`]: deleteField(),
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Firestore member leave failed", error);
  }
}
export async function sendChatMessageFirestore(roomId: string, message: { id: string; sender: string; text: string; time: string; createdAt?: number }) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    const createdAt = message.createdAt || Date.now();

    await setDoc(
      roomRef,
      {
        messagesById: {
          [message.id]: { ...message, createdAt },
        },
        updatedAt: createdAt,
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Firestore chat send failed", error);
  }
}
export async function updateRoomMediaFirestore(
  roomId: string,
  media: { url: string; type: "youtube" | "direct"; title?: string; selectedBy?: string }
) {
  try {
    const now = Date.now();
    const roomRef = doc(db, "rooms", roomId);
    await setDoc(
      roomRef,
      {
        mediaUrl: media.url,
        mediaType: media.type,
        mediaTitle: media.title || "",
        playback: {
          state: 1,
          currentTime: 0,
          updatedAt: now,
          updatedBy: media.selectedBy || "",
        },
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Firestore media update failed", error);
  }
}

export async function updateRoomPlaybackFirestore(
  roomId: string,
  playback: { state: number; currentTime: number; updatedBy?: string; updatedAt?: number }
) {
  try {
    const now = playback.updatedAt || Date.now();
    const roomRef = doc(db, "rooms", roomId);
    await setDoc(
      roomRef,
      {
        playback: {
          state: playback.state,
          currentTime: playback.currentTime,
          updatedAt: now,
          updatedBy: playback.updatedBy || "",
        },
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Firestore playback sync failed", error);
  }
}

export async function sendWebRTCSignalFirestore(
  roomId: string,
  signal: Omit<FirestoreWebRTCSignal, "id" | "createdAt"> & { id?: string; createdAt?: number }
) {
  try {
    const now = signal.createdAt || Date.now();
    const signalId = signal.id || `rtc-${signal.from}-${signal.to}-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const roomRef = doc(db, "rooms", roomId);

    await setDoc(
      roomRef,
      {
        webrtcSignalsById: {
          [signalId]: {
            id: signalId,
            from: signal.from,
            to: signal.to,
            type: signal.type,
            payload: signal.payload,
            createdAt: now,
          },
        },
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Firestore WebRTC signal send failed", error);
  }
}
export { app, auth, db, googleProvider, analytics, signOut };
















