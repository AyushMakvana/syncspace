"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Sparkles,
  UserPlus,
  MessageSquare,
  Users,
  Copy,
  Check,
  X,
  Play,
  Film,
  Send,
  Smile,
  ImageIcon,
  Maximize2,
  Bell,
  ChevronDown,
  Settings,
  User,
  LogOut,
  Mail,
  Lock,
  ChevronLeft,
  Pin,
} from "lucide-react";

import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import YouTubePlayer from "@/components/YouTubePlayer";
import YouTubeSearchModal from "@/components/YouTubeSearchModal";
import WebRTCRoomPanel from "@/components/WebRTCRoomPanel";
import {
  signInWithGooglePopup,
  signInWithEmail,
  signUpWithEmail,
  subscribeToAuth,
  registerRoomCode,
  subscribeToRoomFirestore,
  heartbeatMemberFirestore,
  leaveMemberFirestore,
  sendChatMessageFirestore,
  updateRoomMediaFirestore,
  updateRoomPlaybackFirestore,
} from "@/lib/firebase";

interface ChatMessage {
  id: string;
  sender: string;
  avatar?: string;
  text: string;
  time: string;
  createdAt?: number;
  isSelf: boolean;
}

interface RoomMember {
  id: string;
  name: string;
  isHost: boolean;
  online: boolean;
}

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = (params?.roomId as string) || "ayushmakvan-room";

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Auth Modal State for Unauthenticated Direct Links (Safe SSR initialization)
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authModalStep, setAuthModalStep] = useState<"initial" | "login" | "signup">("initial");
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState<string>("");
  const [authName, setAuthName] = useState<string>("");

  // Derive Host Name deterministically
  const rawHost = roomId.replace("-room", "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const hostName = rawHost ? rawHost.charAt(0).toUpperCase() + rawHost.slice(1) : "Ayush";

  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; uid?: string; photoURL?: string }>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("syncspace_current_user");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.name) return parsed;
        } catch {
          // ignore
        }
      }
    }
    return { name: "", email: "" };
  });

  useEffect(() => {
    if (typeof window !== "undefined" && !currentUser.name) {
      const saved = localStorage.getItem("syncspace_current_user");
      if (!saved) {
        setTimeout(() => setShowAuthModal(true), 0);
      }
    }

    const unsubscribe = subscribeToAuth((userProfile) => {
      if (userProfile && userProfile.email) {
        setCurrentUser(userProfile);
        setShowAuthModal(false);
      }
    });
    return () => unsubscribe();
  }, [currentUser.name]);

  const hostStorageKey = `syncspace_host_${roomId}`;
  const [members, setMembers] = useState<RoomMember[]>(() => {
    return [
      {
        id: `initial-host-${hostName}`,
        name: hostName || "Ayush",
        isHost: true,
        online: true,
      },
    ];
  });

  // Unique Room Code (Includes Host Slug for Global Resolution across Browsers)
  const uniqueCode = `${rawHost.toUpperCase()}-${Math.abs(
    roomId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 9000 + 1000
  )}`;

  // Room Title
  const roomTitle = `${hostName}'s room`;

  // Controls state
  const [activeTab, setActiveTab] = useState<"chat" | "members">("chat");

  // Modals state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isMediaOpen, setIsMediaOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Media Player State
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string>("");
  const [mediaTitle, setMediaTitle] = useState<string>("");
  const [youtubeSyncState, setYoutubeSyncState] = useState<{
    state: number;
    currentTime: number;
    timestamp: number;
    updatedBy?: string;
  } | null>(null);
  const lastPlaybackTimestampRef = useRef(0);

  const handleYouTubeStateSync = useCallback((state: number, currentTime: number) => {
    const activeUserId = (currentUser.uid || currentUser.email || currentUser.name || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "");
    if (!activeUserId) return;

    const timestamp = Date.now();
    lastPlaybackTimestampRef.current = timestamp;
    setYoutubeSyncState({ state, currentTime, timestamp, updatedBy: activeUserId });

    updateRoomPlaybackFirestore(roomId, {
      state,
      currentTime,
      updatedBy: activeUserId,
      updatedAt: timestamp,
    });

    if (channelRef.current) {
      channelRef.current.postMessage({
        type: "MEDIA_SYNC",
        state,
        currentTime,
        timestamp,
        updatedBy: activeUserId,
      });
    }
  }, [currentUser.email, currentUser.name, currentUser.uid, roomId]);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);



  const userInitial = React.useMemo(() => {
    if (currentUser.name && currentUser.name.trim()) {
      return currentUser.name.trim().charAt(0).toUpperCase();
    }
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("syncspace_current_user");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.name && parsed.name.trim()) {
            return parsed.name.trim().charAt(0).toUpperCase();
          }
        }
      } catch {
        // ignore
      }
    }
    return hostName ? hostName.charAt(0).toUpperCase() : "A";
  }, [currentUser.name, hostName]);

  const getActiveUserId = useCallback(() => {
    const savedId = currentUser.uid || currentUser.email || currentUser.name || "";
    return savedId.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  }, [currentUser.email, currentUser.name, currentUser.uid]);
  // Explicit Leave Room Handler
  const handleLeaveRoom = () => {
    const activeUserId = getActiveUserId();

    if (typeof window !== "undefined" && activeUserId) {
      localStorage.setItem(`syncspace_left_${roomId}`, `${activeUserId}_${Date.now()}`);

      try {
        if (channelRef.current) {
          channelRef.current.postMessage({ type: "USER_LEFT", user: activeUserId });
        }
      } catch {
        // ignore
      }

      leaveMemberFirestore(roomId, activeUserId);
    }

    setShowSettingsMenu(false);
    setShowProfileMenu(false);
    router.push("/welcome");
  };
  // Real-time Room Members & Live Chat Synchronization (Hybrid Engine: Local + BroadcastChannel + Firestore)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const chatKey = `syncspace_chat_messages_${roomId}`;

    // Register room code globally
    registerRoomCode(uniqueCode, roomId);
    registerRoomCode(rawHost, roomId);
    if (currentUser.name) {
      registerRoomCode(currentUser.name, roomId);
    }
    localStorage.setItem(`syncspace_code_${uniqueCode}`, roomId);
    localStorage.setItem(`syncspace_code_${rawHost.toUpperCase()}`, roomId);

    // Sync Chat Messages from shared localStorage history
    const syncChatMessages = () => {
      try {
        const rawChat = localStorage.getItem(chatKey);
        if (rawChat) {
          const chatList: { id: string; sender: string; text: string; time: string }[] = JSON.parse(rawChat);
          const activeName = currentUser.name || "";
          const formattedMsgs = chatList.map((msg) => ({
            ...msg,
            isSelf: msg.sender.toLowerCase().trim() === activeName.toLowerCase().trim(),
          }));

          setMessages(formattedMsgs.slice(-80));
        } else {
          setMessages([]);
        }
      } catch {
        // ignore
      }
    };

    const syncRoomMembers = () => {
      const activeName = currentUser.name?.trim();
      const activeUserId = getActiveUserId();
      if (!activeName || !activeUserId) return;

      const normActive = activeName.toLowerCase();
      const savedHost = localStorage.getItem(hostStorageKey) || "";
      const isHost = savedHost.toLowerCase().trim() === normActive;

      // Firestore is the shared presence source. Avoid setting `members` from
      // localStorage here, because each browser only knows about itself and that
      // makes the avatar row flicker between local and remote snapshots.
      heartbeatMemberFirestore(roomId, activeUserId, activeName, isHost);
    };
    // Immediate initial sync
    syncRoomMembers();
    syncChatMessages();

    // Fast 1.5s ticker
    const intervalId = setInterval(syncRoomMembers, 1500);

    // Subscribe to Firestore Realtime Room updates
    const unsubscribeFirestore = subscribeToRoomFirestore(roomId, (data) => {
      if (data.members && Array.isArray(data.members)) {
        const now = Date.now();
        const activeHostId = data.hostId || "";
        const activeMembers = data.members.filter((m) => now - m.lastSeen < 8000);
        if (activeMembers.length > 0) {
          const seen = new Set<string>();
          const dedup: RoomMember[] = [];
          for (const m of activeMembers) {
            const key = m.name.toLowerCase().trim();
            if (!seen.has(key)) {
              seen.add(key);
              dedup.push({
                id: m.id || `member-${m.name.toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, "")}`,
                name: m.name,
                isHost: activeHostId ? m.id === activeHostId : Boolean(m.isHost),
                online: true,
              });
            }
          }
          const sorted = dedup.sort((a, b) => {
            if (a.isHost && !b.isHost) return -1;
            if (!a.isHost && b.isHost) return 1;
            return a.name.localeCompare(b.name);
          });
          if (sorted.length > 0) {
            setMembers((prev) => {
              if (
                prev.length === sorted.length &&
                prev.every((p, idx) => p.id === sorted[idx]?.id && p.name === sorted[idx]?.name && p.isHost === sorted[idx]?.isHost)
              ) {
                return prev;
              }
              return sorted;
            });
          }
        }
      }

      if (data.messages && Array.isArray(data.messages)) {
        const activeName = currentUser.name || "";
        const formattedMsgs = data.messages.map((msg) => ({
          ...msg,
          isSelf: msg.sender.toLowerCase().trim() === activeName.toLowerCase().trim(),
        })).slice(-80);
        setMessages((prev) => {
          if (
            prev.length === formattedMsgs.length &&
            prev.every((p, idx) =>
              p.id === formattedMsgs[idx]?.id &&
              p.text === formattedMsgs[idx]?.text &&
              p.sender === formattedMsgs[idx]?.sender &&
              p.isSelf === formattedMsgs[idx]?.isSelf
            )
          ) {
            return prev;
          }
          return formattedMsgs;
        });
      }

      if (typeof data.mediaUrl === "string") {
        setSelectedMediaUrl((prev) => (prev === data.mediaUrl ? prev : data.mediaUrl || ""));
        setMediaTitle(typeof data.mediaTitle === "string" ? data.mediaTitle : "");
      }

      if (data.playback && data.playback.updatedAt > lastPlaybackTimestampRef.current) {
        lastPlaybackTimestampRef.current = data.playback.updatedAt;
        setYoutubeSyncState({
          state: data.playback.state,
          currentTime: data.playback.currentTime,
          timestamp: data.playback.updatedAt,
          updatedBy: data.playback.updatedBy,
        });
      }
    });

    const handleUnload = () => {
      const activeUserId = getActiveUserId();
      if (!activeUserId) return;
      leaveMemberFirestore(roomId, activeUserId);
    };
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === `syncspace_left_${roomId}`) {
        syncRoomMembers();
      } else if (e.key === chatKey) {
        syncChatMessages();
      }
    };
    window.addEventListener("storage", handleStorage);

    try {
      const channel = new BroadcastChannel(`syncspace_room_channel_${roomId}`);
      // eslint-disable-next-line react-hooks/immutability
      channelRef.current = channel;
      channel.onmessage = (event) => {
        const { type, mediaUrl, state, currentTime, timestamp, updatedBy } = event.data;
        if (type === "USER_JOINED" || type === "USER_LEFT") {
          syncRoomMembers();
        } else if (type === "CHAT_MESSAGE") {
          syncChatMessages();
        } else if (type === "MEDIA_SELECTED") {
          setSelectedMediaUrl(mediaUrl);
        } else if (type === "MEDIA_SYNC") {
          if (timestamp > lastPlaybackTimestampRef.current) {
            lastPlaybackTimestampRef.current = timestamp;
            setYoutubeSyncState({ state, currentTime, timestamp, updatedBy });
          }
        }
      };

      return () => {
        clearInterval(intervalId);
        unsubscribeFirestore();
        window.removeEventListener("beforeunload", handleUnload);
        window.removeEventListener("pagehide", handleUnload);
        window.removeEventListener("storage", handleStorage);
        channel.close();
      };
    } catch {
      return () => {
        clearInterval(intervalId);
        unsubscribeFirestore();
        window.removeEventListener("beforeunload", handleUnload);
        window.removeEventListener("pagehide", handleUnload);
        window.removeEventListener("storage", handleStorage);
      };
    }
  }, [roomId, rawHost, uniqueCode, currentUser.name, hostName, hostStorageKey, getActiveUserId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Copy Link handler
  const handleCopyLink = () => {
    const fullUrl = typeof window !== "undefined" ? window.location.href : `https://syncspace.app/room/${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Copy Unique Code handler
  const handleCopyCode = () => {
    navigator.clipboard.writeText(uniqueCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Chat submit handler
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const msgText = inputMessage.trim();
    const senderName = currentUser.name?.trim();
    if (!senderName) {
      setShowAuthModal(true);
      return;
    }
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const messageTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newMessage: ChatMessage = {
      id: messageId,
      sender: senderName,
      text: msgText,
      time: messageTime,
      isSelf: true,
    };

    setMessages((prev) => [...prev, newMessage].slice(-80));
    setInputMessage("");

    const chatMsgObj = {
      id: messageId,
      sender: senderName,
      text: msgText,
      time: messageTime,
    };

    // Publish to Firestore for cross-browser live delivery
    sendChatMessageFirestore(roomId, chatMsgObj);

    // Save to shared localStorage chat history
    try {
      const chatKey = `syncspace_chat_messages_${roomId}`;
      const raw = localStorage.getItem(chatKey);
      const list: { id: string; sender: string; text: string; time: string }[] = raw ? JSON.parse(raw) : [];
      list.push(chatMsgObj);
      localStorage.setItem(chatKey, JSON.stringify(list.slice(-50)));
    } catch {
      // ignore
    }

    // Broadcast message signal to all active room members across tabs/windows
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: "CHAT_MESSAGE",
        user: currentUser.name,
        text: msgText,
      });
    }
  };



  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-black text-white">
      {/* Static Room Background */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_0%,rgba(88,28,135,0.28),transparent_42%),#000]" />

      {/* Main Room Container Layer */}
      <div className="relative z-10 flex h-svh flex-col">
        {/* Top Room Navigation Bar */}
        <header className="relative z-50 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-black/40 px-4 backdrop-blur-md">
          {/* Left: Brand Logo */}
          <div className="flex items-center gap-3">
            <Link
              href="/welcome"
              className="flex items-center gap-2 text-sm font-black tracking-wide text-yellow-200 transition hover:opacity-80"
            >
              <span className="grid size-8 place-items-center rounded-full border border-white/20 bg-violet-500/35">
                <Sparkles className="size-4 fill-yellow-200 text-yellow-200" />
              </span>
              <span className="hidden sm:inline">SyncSpace</span>
            </Link>

            <button className="rounded-full bg-white/10 p-1.5 text-white/70 transition hover:bg-white/20 hover:text-white">
              <Bell className="size-4" />
            </button>
          </div>

          {/* Center: Room Title Badge with Inline Profile Pic (Clickable to toggle profile menu) */}
          <button
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="group outline-none"
          >
            <LiquidGlassCard
              draggable={false}
              shadowIntensity="xs"
              glowIntensity="none"
              borderRadius="999px"
              className="border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-md transition hover:bg-white/20"
            >
              <div className="flex h-8 items-center gap-2.5 px-3.5 text-xs font-bold">
                <div className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full border border-yellow-200/80 bg-gradient-to-tr from-cyan-400 to-indigo-700 text-[10px] font-black text-white shadow-sm">
                  {userInitial}
                </div>
                <span className="truncate max-w-[150px] sm:max-w-[240px] font-extrabold text-white leading-none">
                  {roomTitle}
                </span>
                <span className="relative flex size-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-white/60 transition group-hover:text-white" />
              </div>
            </LiquidGlassCard>
          </button>

          {/* Right: User Profile & Actions */}
          <div className="flex items-center gap-2.5">
            <LiquidButton
              onClick={() => setIsInviteOpen(true)}
              variant="gold"
              size="lg"
              className="hidden bg-yellow-300/95 px-4 text-xs font-black text-[#220038] shadow-[0_0_18px_rgba(253,224,71,0.18)] sm:inline-flex"
            >
              <UserPlus className="mr-1.5 size-4" />
              Invite friends
            </LiquidButton>

            {/* Settings Logo Trigger & Dropdown Menu (Matches User Screenshot) */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfileMenu(false);
                  setShowSettingsMenu((prev) => !prev);
                }}
                className="rounded-full bg-white/10 p-2 text-white/70 transition hover:bg-white/20 hover:text-white"
                title="Room Settings Menu"
              >
                <Settings className="size-4" />
              </button>

              {/* Settings Dropdown Popover (Matches Screenshot) */}
              {showSettingsMenu && (
                <>
                  <div
                    className="fixed inset-0 z-[998] bg-transparent"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSettingsMenu(false);
                    }}
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-11 z-[999] w-48 overflow-hidden rounded-2xl border border-purple-500/35 bg-[#18052b]/95 p-2 text-white shadow-[0_12px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowSettingsMenu(false);
                          setIsInviteOpen(true);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
                      >
                        <Settings className="size-4 text-white" />
                        <span>Room settings</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setNotificationsEnabled((prev) => !prev);
                          alert(
                            !notificationsEnabled
                              ? "Notifications enabled for this room"
                              : "Notifications muted"
                          );
                          setShowSettingsMenu(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
                      >
                        <Bell className="size-4 text-white" />
                        <span>Notifications</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsPinned((prev) => !prev);
                          alert(
                            !isPinned
                              ? "Room pinned to quick access!"
                              : "Room unpinned"
                          );
                          setShowSettingsMenu(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
                      >
                        <Pin className="size-4 text-white" />
                        <span>{isPinned ? "Unpin room" : "Pin room"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleLeaveRoom}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-white transition hover:bg-red-500/20 hover:text-red-300"
                      >
                        <LogOut className="size-4 text-white" />
                        <span>Leave room</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Profile Avatar Trigger Button */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettingsMenu(false);
                  setShowProfileMenu((prev) => !prev);
                }}
                className="grid size-8 place-items-center overflow-hidden rounded-full border border-yellow-300/80 bg-gradient-to-tr from-cyan-400 via-blue-600 to-indigo-900 text-xs font-black text-white shadow-[0_0_12px_rgba(253,224,71,0.3)] transition hover:scale-105"
              >
                <span suppressHydrationWarning>
                  {userInitial}
                </span>
              </button>

              {/* White Transparent Liquid Glass Profile Dropdown Menu */}
              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-[998] bg-transparent"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowProfileMenu(false);
                    }}
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-11 z-[999] w-56 overflow-hidden rounded-2xl border border-white/20 bg-[#16052b]/95 p-3 text-white shadow-[0_12px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="flex items-center gap-2.5 border-b border-white/15 pb-2.5 px-1 text-left">
                      <div className="grid size-8 shrink-0 place-items-center rounded-full border border-yellow-300/80 bg-gradient-to-tr from-cyan-400 via-blue-600 to-indigo-900 text-xs font-black text-white shadow-sm">
                        <span suppressHydrationWarning>
                          {userInitial}
                        </span>
                      </div>
                      <div className="overflow-hidden">
                        <p className="truncate text-xs font-black text-yellow-200" suppressHydrationWarning>
                          {currentUser.name || hostName}
                        </p>
                        <p className="truncate text-[10px] text-white/60" suppressHydrationWarning>
                          {currentUser.email || ""}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          setIsInviteOpen(true);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/15 hover:text-white"
                      >
                        <User className="size-4 text-white" />
                        <span>Account</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          setIsInviteOpen(true);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/15 hover:text-white"
                      >
                        <Settings className="size-4 text-white" />
                        <span>Settings</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            localStorage.removeItem("syncspace_current_user");
                          }
                          setShowProfileMenu(false);
                          router.push("/welcome");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-red-500/25 hover:text-red-300"
                      >
                        <LogOut className="size-4 text-white" />
                        <span>Log out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen();
                } else {
                  document.exitFullscreen();
                }
              }}
              className="rounded-full bg-white/10 p-2 text-white/70 transition hover:bg-white/20 hover:text-white"
            >
              <Maximize2 className="size-4" />
            </button>
          </div>
        </header>

        {/* Main Content Area (Theater Stage + Sidebar) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Stage (Theater) */}
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-4 sm:p-6">
            {/* Watch Screen Frame */}
            <div className="relative flex w-full max-w-4xl flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-b from-purple-950/40 via-black/80 to-black/90 shadow-2xl backdrop-blur-xl">
              {selectedMediaUrl ? (
                <div className="relative h-full w-full bg-black">
                  <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs font-bold text-white/85 backdrop-blur-md">
                    <span className="truncate">{mediaTitle || "Shared media"}</span>
                    <button type="button" onClick={() => setIsMediaOpen(true)} className="shrink-0 text-yellow-200 hover:text-yellow-100">Change</button>
                  </div>
                  {selectedMediaUrl.includes("youtube.com") || selectedMediaUrl.includes("youtu.be") || selectedMediaUrl.length === 11 ? (
                    <YouTubePlayer
                      videoId={selectedMediaUrl}
                      onStateSync={handleYouTubeStateSync}
                      syncState={youtubeSyncState}
                      clientId={getActiveUserId()}
                    />
                  ) : (
                    <video
                      src={selectedMediaUrl}
                      controls
                      autoPlay
                      className="h-full w-full object-contain"
                    />
                  )}
                </div>
              ) : (
                /* Empty Screen State with Select Media Button */
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <div className="mb-4 grid size-16 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-lg backdrop-blur-md">
                    <Film className="size-8 text-yellow-200" />
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    No Media Currently Playing
                  </h3>
                  <p className="mt-1.5 max-w-sm text-xs text-white/60">
                    Paste any video link, YouTube URL, or share your screen with friends in real-time.
                  </p>

                  <LiquidButton
                    onClick={() => setIsMediaOpen(true)}
                    variant="gold"
                    size="xl"
                    className="mt-6 bg-yellow-300/95 px-8 font-black text-[#220038] shadow-[0_0_28px_rgba(253,224,71,0.3)]"
                  >
                    <Play className="mr-2 size-4 fill-[#220038]" />
                    Select Media
                  </LiquidButton>
                </div>
              )}
            </div>
          </div>

          {/* Right Control Sidebar */}
          <aside className="flex min-h-0 w-80 shrink-0 flex-col border-l border-white/10 bg-black/50 backdrop-blur-xl">
            <WebRTCRoomPanel
              roomId={roomId}
              currentUser={currentUser}
              members={members}
            />

            {/* Sidebar Tab Navigation */}
            <div className="flex border-b border-white/10 bg-white/5 px-2">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex flex-1 items-center justify-center gap-2 py-3 text-xs font-bold transition border-b-2 ${
                  activeTab === "chat"
                    ? "border-yellow-300 text-yellow-200"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                <MessageSquare className="size-4" />
                <span>Chat</span>
              </button>

              <button
                onClick={() => setActiveTab("members")}
                className={`flex flex-1 items-center justify-center gap-2 py-3 text-xs font-bold transition border-b-2 ${
                  activeTab === "members"
                    ? "border-yellow-300 text-yellow-200"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                <Users className="size-4" />
                <span>Members ({members.length})</span>
              </button>
            </div>

            {/* Tab Body Content */}
            {activeTab === "chat" ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                {/* Chat Message History Container with Functional Scroll Buttons & Wheel Scroll */}
                <div className="relative flex min-h-0 flex-1">
                  <div
                    ref={chatContainerRef}
                    tabIndex={0}
                    onWheel={(e) => {
                      e.stopPropagation();
                      if (chatContainerRef.current) {
                        chatContainerRef.current.scrollTop += e.deltaY;
                      }
                    }}
                    className="h-full w-full space-y-3 overflow-y-auto overscroll-contain pr-5 outline-none focus:outline-none"
                    style={{ touchAction: "pan-y", pointerEvents: "auto" }}
                  >
                    {messages.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center p-4 text-center text-white/40">
                        <MessageSquare className="mb-2 size-8 text-white/20" />
                        <p className="text-xs font-semibold">No messages yet in this room.</p>
                        <p className="mt-0.5 text-[10px] text-white/30">Start the conversation!</p>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            msg.isSelf ? "items-end" : "items-start"
                          }`}
                        >
                          <div className="flex items-baseline gap-2 mb-1 px-1">
                            <span className="text-[11px] font-bold text-yellow-200/90">
                              {msg.sender}
                            </span>
                            <span className="text-[9px] text-white/40">
                              {msg.time}
                            </span>
                          </div>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-md ${
                              msg.isSelf
                                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-tr-none"
                                : "bg-white/10 text-white/90 rounded-tl-none border border-white/10"
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                </div>

                {/* Chat Input Field */}
                <form
                  onSubmit={handleSendMessage}
                  className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3"
                >
                  <div className="relative flex flex-1 items-center rounded-2xl border border-white/15 bg-black/60 px-3 py-2 text-xs shadow-inner focus-within:border-yellow-300/80">
                    <input
                      type="text"
                      placeholder="Aa"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      className="w-full bg-transparent text-white placeholder-white/40 outline-none"
                    />
                    <div className="flex items-center gap-1.5 text-white/50">
                      <button type="button" className="hover:text-white">
                        <ImageIcon className="size-4" />
                      </button>
                      <button type="button" className="hover:text-white">
                        <Smile className="size-4" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="grid size-9 place-items-center rounded-xl border border-yellow-300/60 bg-yellow-300/90 text-[#220038] shadow-md hover:bg-yellow-200 transition"
                  >
                    <Send className="size-4" />
                  </button>
                </form>
              </div>
            ) : (
              /* Members List */
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
                {[...members]
                  .sort((a, b) => {
                    if (a.isHost && !b.isHost) return -1;
                    if (!a.isHost && b.isHost) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 p-3">
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 place-items-center rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-600 text-xs font-black text-white">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">
                          {member.name}{" "}
                          {member.isHost ? (
                            <span className="text-[10px] text-yellow-200">(Host)</span>
                          ) : (
                            <span className="text-[10px] text-cyan-200">(Member)</span>
                          )}
                        </p>
                        <p className="text-[10px] text-emerald-400">Online</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Invite Friends Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <LiquidGlassCard
            draggable={false}
            shadowIntensity="xs"
            glowIntensity="none"
            borderRadius="24px"
            className="relative w-full max-w-md overflow-hidden border border-white/18 bg-white/8 p-7 text-white shadow-2xl backdrop-blur-xl"
          >
            {/* Close Button */}
            <button
              onClick={() => setIsInviteOpen(false)}
              className="absolute right-5 top-5 rounded-full bg-white/10 p-1.5 text-white/70 transition hover:bg-white/20 hover:text-white"
            >
              <X className="size-5" />
            </button>

            <div className="text-center">
              <h2 className="text-2xl font-black text-white">Invite to Room</h2>
              <p className="mt-1 text-xs font-medium text-white/70">
                Share this link or unique code with friends to invite them
              </p>
            </div>

            {/* Direct Join Link Section */}
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-white/80">
                  Direct Room Link
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-black/60 p-2 pl-3">
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== "undefined" ? window.location.href : `https://syncspace.app/room/${roomId}`}
                    className="w-full truncate bg-transparent text-xs text-white/90 outline-none"
                  />
                  <LiquidButton
                    onClick={handleCopyLink}
                    variant="gold"
                    size="lg"
                    className="bg-yellow-300/95 px-4 text-xs font-black text-[#220038] shadow-md"
                  >
                    {copiedLink ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}
                    {copiedLink ? "Copied!" : "Copy"}
                  </LiquidButton>
                </div>
              </div>

              {/* Unique Room Code Section */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-yellow-200">
                  Unique Room Code
                </label>
                <div className="flex items-center justify-between rounded-xl border border-yellow-300/40 bg-yellow-400/10 p-3">
                  <span className="font-mono text-sm font-black tracking-widest text-yellow-200">
                    {uniqueCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 text-xs font-bold text-white/80 transition hover:text-yellow-200"
                  >
                    {copiedCode ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    <span>{copiedCode ? "Copied!" : "Copy Code"}</span>
                  </button>
                </div>
              </div>

              <p className="text-center text-[11px] text-white/50">
                ℹ️ Paste the link in any messaging app or enter the code on the Welcome page.
              </p>

              {/* AI Companion Invite Option */}
              <div className="border-t border-white/10 pt-4">
                <button
                  onClick={() => {
                    const aiMsg: ChatMessage = {
                      id: `ai-msg-${messages.length + 1}`,
                      sender: "Kosminaut (AI Companion)",
                      text: "Hello! I am your AI watch party assistant. Ask me anything or request movie recommendations!",
                      time: "Just now",
                      isSelf: false,
                    };
                    setMessages((prev) => [...prev, aiMsg]);
                    setIsInviteOpen(false);
                  }}
                  className="w-full rounded-2xl border border-purple-400/30 bg-purple-500/15 py-2.5 text-xs font-bold text-purple-200 transition hover:bg-purple-500/25"
                >
                  Invite <span className="text-yellow-200 font-extrabold">Kosminaut</span>, the AI companion
                </button>
              </div>
            </div>
          </LiquidGlassCard>
        </div>
      )}

      {/* Select Media & YouTube Search Modal */}
      <YouTubeSearchModal
        isOpen={isMediaOpen}
        onClose={() => setIsMediaOpen(false)}
        onSelectVideo={(videoId, fullUrl, title) => {
          const selectedTitle = title || "YouTube video";
          setSelectedMediaUrl(fullUrl);
          setMediaTitle(selectedTitle);
          const timestamp = Date.now();
          lastPlaybackTimestampRef.current = timestamp;
          setYoutubeSyncState({ state: 1, currentTime: 0, timestamp, updatedBy: getActiveUserId() });
          updateRoomMediaFirestore(roomId, {
            url: fullUrl,
            type: videoId ? "youtube" : "direct",
            title: selectedTitle,
            selectedBy: getActiveUserId(),
          });
          if (channelRef.current) {
            channelRef.current.postMessage({ type: "MEDIA_SELECTED", mediaUrl: fullUrl });
          }
        }}      />

      {/* Join Room Auth Modal for Unauthenticated Direct Links */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <LiquidGlassCard
            draggable={false}
            shadowIntensity="xs"
            glowIntensity="none"
            borderRadius="24px"
            className="relative w-full max-w-md overflow-hidden border border-white/18 bg-white/8 p-7 text-white shadow-2xl backdrop-blur-xl"
          >
            {/* Step 1: Initial Options (Continue with Google / Continue with Email) */}
            {authModalStep === "initial" && (
              <>
                <div className="text-center">
                  <h2 className="text-2xl font-black text-white">Join Room</h2>
                  <p className="mt-1 text-xs font-medium text-white/70">
                    You were invited to join <span className="font-bold text-yellow-200">{roomTitle}</span>
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-white/60">
                    Please log in or sign up to join the watch party with your friends.
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <LiquidButton
                    onClick={async () => {
                      const { user, error } = await signInWithGooglePopup();
                      if (user) {
                        setCurrentUser(user);
                        setShowAuthModal(false);
                      } else if (error) {
                        console.error("Firebase Google Auth Error:", error);
                      }
                    }}
                    size="xl"
                    className="w-full border border-white/25 bg-white/95 text-xs font-bold text-black shadow-md hover:bg-white"
                  >
                    <svg className="size-5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.27v3.15C3.25 21.3 7.31 24 12 24z" />
                      <path fill="#FBBC05" d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.39l4.01-3.15z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.61l4.01 3.15c.95-2.85 3.6-4.96 6.72-4.96z" />
                    </svg>
                    <span>Continue with Google</span>
                  </LiquidButton>

                  <LiquidButton
                    onClick={() => setAuthModalStep("login")}
                    size="xl"
                    className="w-full border border-white/25 bg-white/10 text-xs font-bold text-white shadow-md hover:bg-white/20"
                  >
                    <Mail className="size-5 shrink-0 text-yellow-200" />
                    <span>Continue with Email</span>
                  </LiquidButton>
                </div>
              </>
            )}

            {/* Step 2: Email Login Form */}
            {authModalStep === "login" && (
              <>
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <button
                    onClick={() => setAuthModalStep("initial")}
                    className="flex items-center gap-1 text-xs font-bold text-white/80 transition hover:text-white"
                  >
                    <ChevronLeft className="size-4" /> Back
                  </button>
                  <h3 className="text-sm font-extrabold text-white">Email Login</h3>
                  <div className="w-5" />
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const email = authEmail.includes("@") ? authEmail : `${authEmail}@syncspace.app`;
                    const { user, error } = await signInWithEmail(email, authPassword);
                    if (user) {
                      setCurrentUser(user);
                      setShowAuthModal(false);
                    } else if (error) {
                      alert(error || "Invalid credentials. If you are new, click Sign Up below.");
                    }
                  }}
                  className="mt-6 flex flex-col gap-4"
                >
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 size-4 text-white/50" />
                    <input
                      type="text"
                      required
                      placeholder="Username or Email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/40 py-3 pl-10 pr-4 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                    />
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 size-4 text-white/50" />
                    <input
                      type="password"
                      required
                      placeholder="Password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/40 py-3 pl-10 pr-4 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                    />
                  </div>

                  <LiquidButton
                    type="submit"
                    variant="gold"
                    size="xl"
                    className="mt-2 w-full justify-center bg-yellow-300/95 font-black text-[#220038] shadow-[0_0_24px_rgba(253,224,71,0.25)]"
                  >
                    Log in & Join Room
                  </LiquidButton>
                </form>

                <div className="mt-6 text-center text-xs text-white/70">
                  Don&apos;t have an account?{" "}
                  <button
                    onClick={() => setAuthModalStep("signup")}
                    className="font-bold text-yellow-200 hover:underline"
                  >
                    Click here to Sign up!
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Sign Up Form */}
            {authModalStep === "signup" && (
              <>
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <button
                    onClick={() => setAuthModalStep("login")}
                    className="flex items-center gap-1 text-xs font-bold text-white/80 transition hover:text-white"
                  >
                    <ChevronLeft className="size-4" /> Back to Login
                  </button>
                  <h3 className="text-sm font-extrabold text-white">Sign up</h3>
                  <div className="w-5" />
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (authPassword !== authConfirmPassword) {
                      alert("Passwords do not match!");
                      return;
                    }
                    const name = authName || "New User";
                    const { user, error } = await signUpWithEmail(authEmail, authPassword, name);
                    if (user) {
                      setCurrentUser(user);
                      setShowAuthModal(false);
                    } else if (error) {
                      alert(error || "Sign up error. Please check your details.");
                    }
                  }}
                  className="mt-5 flex flex-col gap-3"
                >
                  <input
                    type="text"
                    required
                    placeholder="Username"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                  />

                  <input
                    type="email"
                    required
                    placeholder="Email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                  />

                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                  />

                  <input
                    type="password"
                    required
                    placeholder="Repeat Password"
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                  />

                  <LiquidButton
                    type="submit"
                    variant="gold"
                    size="xl"
                    className="mt-2 w-full justify-center bg-yellow-300/95 font-black text-[#220038] shadow-[0_0_24px_rgba(253,224,71,0.25)]"
                  >
                    Sign up & Join Room
                  </LiquidButton>
                </form>

                <div className="mt-6 text-center text-xs text-white/70">
                  Already have an account?{" "}
                  <button
                    onClick={() => setAuthModalStep("login")}
                    className="font-bold text-yellow-200 hover:underline"
                  >
                    Click here to Log in!
                  </button>
                </div>
              </>
            )}

            <div className="mt-6 text-center text-xs text-white/50">
              <a href="#" className="hover:underline">
                Terms & Conditions
              </a>{" "}
              •{" "}
              <a href="#" className="hover:underline">
                Privacy Policy
              </a>
            </div>
          </LiquidGlassCard>
        </div>
      )}
    </main>
  );
}






















