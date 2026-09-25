import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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
  FieldPath,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteField,
  getDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB6YnDipCzWs8F4kx3heSOQr14oPqTMyxc",
  authDomain: "syncspace-c6f5e.firebaseapp.com",
  projectId: "syncspace-c6f5e",
  storageBucket: "syncspace-c6f5e.firebasestorage.app",
  messagingSenderId: "361908939854",
  appId: "1:361908939854:web:073a6a1f6adcadbbd2e71f",
  measurementId: "G-E3MGQ2FRQT",
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

// Reusable Google Sign-In Helper (Popup with Redirect Fallback)
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
    if (!errorMsg.includes("popup-closed-by-user")) {
      console.warn("Google Auth warning:", err);
    }

    // If popup fails, attempt redirect fallback
    if (typeof window !== "undefined" && (errorMsg.includes("popup-blocked") || errorMsg.includes("unauthorized-domain") || errorMsg.includes("auth/internal-error"))) {
      try {
        await signInWithRedirect(auth, googleProvider);
        return { user: null, error: null };
      } catch (redirectErr) {
        console.warn("Google Auth redirect warning:", redirectErr);
      }
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
  if (typeof window !== "undefined") {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          const profile = {
            name: result.user.displayName || result.user.email?.split("@")[0] || "User",
            email: result.user.email || "",
            photoURL: result.user.photoURL || "",
            uid: result.user.uid,
          };
          localStorage.setItem("syncspace_current_user", JSON.stringify(profile));
          callback(profile);
        }
      })
      .catch(() => {});
  }

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
  const normalizedCode = code.toUpperCase();
  const key = `${normalizedCode}:${roomId}`;
  if (registeredRoomCodes.has(key)) return;
  registeredRoomCodes.add(key);
  try {
    await setDoc(doc(db, "codes", normalizedCode), { roomId, createdAt: Date.now() }, { merge: true });
  } catch {
    registeredRoomCodes.delete(key);
    // catch permission or network errors silently
  }
}

export async function signOutUser() {
  await signOut(auth);
  if (typeof window !== "undefined") localStorage.removeItem("syncspace_current_user");
}

const registeredRoomCodes = new Set<string>();

export async function resolveRoomCode(input: string): Promise<string> {
  const cleanInput = input.trim();
  const roomPathMatch = cleanInput.match(/\/room\/([^/?#]+)/i);
  if (roomPathMatch?.[1]) {
    return decodeURIComponent(roomPathMatch[1]);
  }
  if (cleanInput.endsWith("-room")) {
    return cleanInput;
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

  throw new Error("Room code was not found. Ask the host for a current invitation link or code.");
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

export interface MqttRelayMessage {
  type?: "USER_PRESENCE" | "USER_LEFT" | "CHAT_MESSAGE" | "MEDIA_SELECTED" | "MEDIA_SYNC" | "WEBRTC_SIGNAL";
  senderClientId?: string;
  signal?: FirestoreWebRTCSignal;
  member?: { id?: string; name?: string; isHost?: boolean; online?: boolean; lastSeen?: number };
  user?: string;
  text?: string;
  id?: string;
  time?: string;
  mediaUrl?: string;
  state?: number;
  currentTime?: number;
  timestamp?: number;
  updatedBy?: string;
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
  callback: (data: FirestoreRoomData) => void,
  onError?: () => void
) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    return onSnapshot(
      roomRef,
      (snapshot) => {
        const data = snapshot.data();
        if (data) {
          const members = normalizeMembers(data);
          console.info("[SyncSpace room snapshot]", { roomId, memberIds: members.map((member) => member.id) });
          callback({
            hostId: data.hostId,
            hostName: data.hostName,
            members,
            messages: normalizeMessages(data),
            mediaUrl: data.mediaUrl,
            mediaType: data.mediaType,
            mediaTitle: data.mediaTitle,
            playback: data.playback,
            webrtcSignals: normalizeWebRTCSignals(data),
          });
        }
      },
      (error) => {
        const firestoreError = error as Error & { code?: string };
        console.error("[SyncSpace Firestore error]", {
          roomId,
          code: firestoreError.code || "unknown",
          message: firestoreError.message,
        });
        onError?.();
      }
    );
  } catch {
    console.error("[SyncSpace Firestore error]", {
      roomId,
      code: "unknown",
      message: "Unable to create Firestore room listener",
    });
    onError?.();
    return () => {};
  }
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
}

export function getOrCreateStableUser(): UserProfile {
  if (typeof window === "undefined") {
    return { uid: "ssr-user", name: "Guest", email: "guest@syncspace.app" };
  }

  const authenticatedUser = auth.currentUser;
  if (authenticatedUser) {
    const profile: UserProfile = {
      uid: authenticatedUser.uid,
      name: authenticatedUser.displayName || authenticatedUser.email?.split("@")[0] || "User",
      email: authenticatedUser.email || "",
      photoURL: authenticatedUser.photoURL || "",
    };
    localStorage.setItem("syncspace_current_user", JSON.stringify(profile));
    return profile;
  }

  const saved = localStorage.getItem("syncspace_current_user");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && (parsed.uid || parsed.email || parsed.name)) {
        if (!parsed.uid) throw new Error("Guest profile needs a stable session identity");
        const rawUid = String(parsed.uid).trim();
        const uid = /^[A-Za-z0-9_-]+$/.test(rawUid)
          ? rawUid
          : rawUid.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        const name = parsed.name || "User";
        const email = parsed.email || `${uid}@syncspace.app`;
        const profile: UserProfile = { uid, name, email, photoURL: parsed.photoURL || "" };
        localStorage.setItem("syncspace_current_user", JSON.stringify(profile));
        return profile;
      }
    } catch {
      // ignore
    }
  }

  let sessionUid = sessionStorage.getItem("syncspace_session_user_id");
  if (!sessionUid) {
    sessionUid = `guest_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    sessionStorage.setItem("syncspace_session_user_id", sessionUid);
  }

  let savedProfile: Record<string, unknown> = {};
  try {
    savedProfile = JSON.parse(localStorage.getItem("syncspace_current_user") || "{}");
  } catch {
    // ignore invalid saved profile
  }
  const guestName = typeof savedProfile.name === "string" && savedProfile.name
    ? savedProfile.name
    : `Guest ${sessionUid.slice(-4)}`;
  const guestProfile: UserProfile = {
    uid: sessionUid,
    name: guestName,
    email: typeof savedProfile.email === "string" && savedProfile.email
      ? savedProfile.email
      : `${sessionUid}@syncspace.app`,
    photoURL: typeof savedProfile.photoURL === "string" ? savedProfile.photoURL : "",
  };

  localStorage.setItem("syncspace_current_user", JSON.stringify(guestProfile));
  return guestProfile;
}

const lastHeartbeatTimeMap = new Map<string, number>();
const heartbeatInFlightMap = new Map<string, Promise<boolean>>();
const lastMaintenanceTimeMap = new Map<string, number>();
const roomMaintenanceInFlightMap = new Map<string, Promise<void>>();
const MEMBER_STALE_AFTER_MS = 180000;
const ROOM_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;

export function heartbeatMemberFirestore(roomId: string, userId: string, name: string, isHost: boolean, previousUserId?: string | null): Promise<boolean> {
  const memberId = userId || name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  const key = `${roomId}:${memberId}`;
  const now = Date.now();
  const lastTime = lastHeartbeatTimeMap.get(key) || 0;
  if (!previousUserId && now - lastTime < 30000) return Promise.resolve(true);

  const inFlight = heartbeatInFlightMap.get(key);
  if (inFlight) return inFlight;

  const operation = (async () => {
    try {
      const roomRef = doc(db, "rooms", roomId);
      const member: FirestoreMemberPresence = { id: memberId, name, isHost, lastSeen: now };
      console.info("[SyncSpace heartbeat]", {
        url: typeof window === "undefined" ? "server" : window.location.href,
        roomId,
        userId: memberId,
        name,
      });

      // Merge only this member's map entry. Independent users never replace
      // the full membersById map or contend on a transaction read version.
      await setDoc(roomRef, {
        ...(isHost ? { hostId: memberId, hostName: name } : {}),
        membersById: { [memberId]: member },
      }, { merge: true });

      lastHeartbeatTimeMap.set(key, now);
      if (previousUserId && previousUserId !== memberId) {
        await leaveMemberFirestore(roomId, previousUserId);
      }
      void cleanupRoomPresence(roomId, now).then(() => cleanupExpiredWebRTCSignals(roomId, now));
      return true;
    } catch (error) {
      const firestoreError = error as Error & { code?: string };
      console.warn("[SyncSpace heartbeat] write failed", {
        roomId,
        userId: memberId,
        code: firestoreError.code || "unknown",
        message: firestoreError.message,
      });
      return false;
    } finally {
      heartbeatInFlightMap.delete(key);
    }
  })();

  heartbeatInFlightMap.set(key, operation);
  return operation;
}

async function cleanupRoomPresence(roomId: string, now = Date.now()) {
  const lastTime = lastMaintenanceTimeMap.get(roomId) || 0;
  if (now - lastTime < ROOM_MAINTENANCE_INTERVAL_MS) return;
  const inFlight = roomMaintenanceInFlightMap.get(roomId);
  if (inFlight) return inFlight;

  const operation = (async () => {
    try {
      const roomRef = doc(db, "rooms", roomId);
      const snapshot = await getDoc(roomRef);
      if (!snapshot.exists()) return;
      const members = snapshot.data().membersById as Record<string, FirestoreMemberPresence> | undefined;
      if (!members) return;

      const staleIds = Object.entries(members)
        .filter(([, member]) => now - Number(member.lastSeen || 0) > MEMBER_STALE_AFTER_MS)
        .map(([memberId]) => memberId);
      if (staleIds.length > 0) {
        for (const memberId of staleIds) {
          await updateDoc(roomRef, new FieldPath("membersById", memberId), deleteField());
        }
      }
      lastMaintenanceTimeMap.set(roomId, now);
    } catch (error) {
      const firestoreError = error as Error & { code?: string };
      console.warn("Firestore stale-member cleanup failed:", {
        roomId,
        code: firestoreError.code || "unknown",
        message: firestoreError.message,
      });
    } finally {
      roomMaintenanceInFlightMap.delete(roomId);
    }
  })();

  roomMaintenanceInFlightMap.set(roomId, operation);
  return operation;
}

const lastSignalCleanupTimeMap = new Map<string, number>();
const signalCleanupInFlightMap = new Map<string, Promise<void>>();

async function cleanupExpiredWebRTCSignals(roomId: string, now = Date.now()) {
  const lastTime = lastSignalCleanupTimeMap.get(roomId) || 0;
  if (now - lastTime < ROOM_MAINTENANCE_INTERVAL_MS) return;
  const inFlight = signalCleanupInFlightMap.get(roomId);
  if (inFlight) return inFlight;

  const operation = (async () => {
  try {
    const roomRef = doc(db, "rooms", roomId);
    const snapshot = await getDoc(roomRef);
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    const signals = data.webrtcSignalsById && typeof data.webrtcSignalsById === "object"
      ? data.webrtcSignalsById as Record<string, FirestoreWebRTCSignal>
      : {};
    const expiredSignalIds = Object.entries(signals)
      .filter(([, signal]) => now - Number(signal.createdAt || 0) > 120000)
      .map(([signalId]) => signalId);
    if (expiredSignalIds.length > 0) {
      for (const signalId of expiredSignalIds) {
        await updateDoc(roomRef, new FieldPath("webrtcSignalsById", signalId), deleteField());
      }
    }
    lastSignalCleanupTimeMap.set(roomId, now);
  } catch (error) {
    const firestoreError = error as Error & { code?: string };
    console.warn("Firestore WebRTC signal cleanup failed:", {
      roomId,
      code: firestoreError.code || "unknown",
      message: firestoreError.message,
    });
  } finally {
    signalCleanupInFlightMap.delete(roomId);
  }
  })();
  signalCleanupInFlightMap.set(roomId, operation);
  return operation;
}

function firestoreSafeSignalKey(signalId: string) {
  const bytes = new TextEncoder().encode(signalId);
  return `signal_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function leaveMemberFirestore(roomId: string, userId: string) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, new FieldPath("membersById", userId), deleteField());
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

function encodeMqttLength(length: number): number[] {
  const bytes: number[] = [];
  let x = length;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) {
      encodedByte |= 0x80;
    }
    bytes.push(encodedByte);
  } while (x > 0);
  return bytes;
}

export class MqttWebSocketRelay {
  private ws: WebSocket | null = null;
  private roomId: string;
  private clientId: string;
  private onMessageCallback: (payload: MqttRelayMessage) => void;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private isClosed = false;
  private mqttReady = false;
  private packetId = 0;

  constructor(roomId: string, clientId: string, onMessage: (payload: MqttRelayMessage) => void) {
    this.roomId = roomId;
    this.clientId = `${(clientId || "client").slice(-28)}_${Math.random().toString(36).slice(2, 8)}`;
    this.onMessageCallback = onMessage;
    this.connect();
  }

  public isConnected(): boolean {
    return this.mqttReady && Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  private connect() {
    if (this.isClosed || typeof window === "undefined") return;
    try {
      const url = "wss://broker.emqx.io:8084/mqtt";
      const ws = new WebSocket(url, ["mqtt"]);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      this.mqttReady = false;

      ws.onopen = () => {
        this.connectTimer = setTimeout(() => {
          if (this.ws === ws && !this.mqttReady) ws.close();
        }, 8000);
        const clientIdBytes = new TextEncoder().encode(this.clientId);
        const connHeader = new Uint8Array([
          0x10,
          ...encodeMqttLength(12 + clientIdBytes.length),
          0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
          0x04, // MQTT 3.1.1
          0x02, // Clean Session
          0x00, 0x3c, // Keepalive 60s
          (clientIdBytes.length >> 8) & 0xff, clientIdBytes.length & 0xff,
          ...clientIdBytes
        ]);
        ws.send(connHeader);

      };

      ws.onmessage = (event) => {
        try {
          const buf = new Uint8Array(event.data as ArrayBuffer);
          if (buf.length < 2) return;
          const packetType = buf[0] & 0xf0;
          let idx = 1;
          let multiplier = 1;
          let remainingLength = 0;
          let digit = 0;
          do {
            digit = buf[idx++];
            remainingLength += (digit & 0x7f) * multiplier;
            multiplier *= 128;
          } while ((digit & 0x80) !== 0 && idx < buf.length);
          if (idx + remainingLength > buf.length) return;

          if (packetType === 0x20) {
            if (remainingLength < 2 || buf[idx + 1] !== 0) {
              ws.close();
              return;
            }
            const topicBytes = new TextEncoder().encode(`syncspace/room/${this.roomId}`);
            const packetId = ++this.packetId;
            ws.send(new Uint8Array([
              0x82,
              ...encodeMqttLength(5 + topicBytes.length),
              (packetId >> 8) & 0xff, packetId & 0xff,
              (topicBytes.length >> 8) & 0xff, topicBytes.length & 0xff,
              ...topicBytes,
              0x00,
            ]));
            return;
          }

          if (packetType === 0x90) {
            if (remainingLength < 3 || buf.subarray(idx + 2, idx + remainingLength).some((code) => code === 0x80)) {
              ws.close();
              return;
            }
            this.mqttReady = true;
            if (this.connectTimer) clearTimeout(this.connectTimer);
            flushPendingGlobalSignals(this.roomId);
            this.pingTimer = setInterval(() => {
              if (this.mqttReady && this.ws === ws && ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([0xc0, 0x00]));
            }, 30000);
            return;
          }

          if (packetType === 0x30 && this.mqttReady) {
            const topicLen = (buf[idx] << 8) | buf[idx + 1];
            idx += 2 + topicLen;
            const payloadBytes = buf.subarray(idx);
            const text = new TextDecoder().decode(payloadBytes);
            const json = JSON.parse(text) as MqttRelayMessage;

            // Filter out self-published messages
            if (json && json.senderClientId !== this.clientId) {
              if (json.type === "WEBRTC_SIGNAL" && json.signal) {
                notifyGlobalSignal(this.roomId, json.signal);
              }
              this.onMessageCallback(json);
            }
          }
        } catch {
          // ignore parse error
        }
      };

      ws.onclose = () => {
        this.mqttReady = false;
        if (this.connectTimer) clearTimeout(this.connectTimer);
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (!this.isClosed) {
          this.reconnectTimer = setTimeout(() => this.connect(), 2000);
        }
      };

      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    } catch {
      // ignore
    }
  }

  public publish(payload: Record<string, unknown>): boolean {
    if (!this.isConnected() || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      const fullPayload = { ...payload, senderClientId: this.clientId };
      const topicBytes = new TextEncoder().encode(`syncspace/room/${this.roomId}`);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(fullPayload));
      const remLen = 2 + topicBytes.length + payloadBytes.length;

      const packet = new Uint8Array([
        0x30,
        ...encodeMqttLength(remLen),
        (topicBytes.length >> 8) & 0xff, topicBytes.length & 0xff,
        ...topicBytes,
        ...payloadBytes
      ]);
      this.ws.send(packet);
      return true;
    } catch {
      return false;
    }
  }

  public close() {
    this.isClosed = true;
    this.mqttReady = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

export const activeGlobalRelays = new Map<string, MqttWebSocketRelay>();
const pendingGlobalSignals = new Map<string, FirestoreWebRTCSignal[]>();

function flushPendingGlobalSignals(roomId: string) {
  const relay = activeGlobalRelays.get(roomId);
  const queued = pendingGlobalSignals.get(roomId);
  if (!relay?.isConnected() || !queued?.length) return;

  const now = Date.now();
  const pending = queued.filter((signal) => now - signal.createdAt <= 60000);
  while (pending.length > 0 && relay.publish({ type: "WEBRTC_SIGNAL", signal: pending[0] })) {
    pending.shift();
  }

  if (pending.length > 0) pendingGlobalSignals.set(roomId, pending);
  else pendingGlobalSignals.delete(roomId);
}

type GlobalSignalCallback = (signal: FirestoreWebRTCSignal) => void;
const globalSignalListeners = new Map<string, Set<GlobalSignalCallback>>();

export function subscribeToGlobalSignals(roomId: string, callback: GlobalSignalCallback) {
  if (!globalSignalListeners.has(roomId)) {
    globalSignalListeners.set(roomId, new Set());
  }
  globalSignalListeners.get(roomId)!.add(callback);

  return () => {
    const listeners = globalSignalListeners.get(roomId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) globalSignalListeners.delete(roomId);
    }
  };
}

export function notifyGlobalSignal(roomId: string, signal: FirestoreWebRTCSignal) {
  const listeners = globalSignalListeners.get(roomId);
  if (listeners) {
    listeners.forEach((cb) => cb(signal));
  }
}

export async function sendWebRTCSignalFirestore(
  roomId: string,
  signal: Omit<FirestoreWebRTCSignal, "id" | "createdAt"> & { id?: string; createdAt?: number }
) {
  const now = signal.createdAt || Date.now();
  const signalId = signal.id || `rtc-${signal.from}-${signal.to}-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const fullSignal: FirestoreWebRTCSignal = {
    id: signalId,
    from: signal.from,
    to: signal.to,
    type: signal.type,
    payload: signal.payload,
    createdAt: now,
  };

  // 1. Broadcast via local browser channel for zero-latency same-browser tabs
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    try {
      const channel = new BroadcastChannel(`syncspace_webrtc_signals_${roomId}`);
      channel.postMessage({ type: "WEBRTC_SIGNAL", signal: fullSignal });
      channel.close();
    } catch {
      // ignore
    }
  }

  // 2. Broadcast via global MQTT WebSocket relay across devices/computers
  const activeRelay = activeGlobalRelays.get(roomId);
  let relaySent = false;
  if (activeRelay) {
    relaySent = activeRelay.publish({ type: "WEBRTC_SIGNAL", signal: fullSignal });
  }

  // Persist only when a ready relay could not accept the message.
  if (!relaySent) {
    const queued = pendingGlobalSignals.get(roomId) || [];
    queued.push(fullSignal);
    pendingGlobalSignals.set(roomId, queued.slice(-100));
    try {
      const roomRef = doc(db, "rooms", roomId);
      await setDoc(
        roomRef,
        {
          webrtcSignalsById: {
          [firestoreSafeSignalKey(signalId)]: fullSignal,
          },
          updatedAt: now,
        },
        { merge: true }
      );
    } catch (error) {
      console.warn("Firestore WebRTC signal fallback active (Quota limit or network delay):", error);
    }
  }
}
export { app, auth, db, googleProvider, analytics, signOut };
















