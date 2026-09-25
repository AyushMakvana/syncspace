"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, UserPlus, Video as VideoIcon, VideoOff } from "lucide-react";

import {
  FirestoreWebRTCSignal,
  sendWebRTCSignalFirestore,
  subscribeToGlobalSignals,
} from "@/lib/firebase";

interface RoomMember {
  id: string;
  name: string;
  isHost: boolean;
  online: boolean;
}

interface WebRTCRoomPanelProps {
  roomId: string;
  currentUser: { name: string; email: string; uid?: string };
  members: RoomMember[];
  firestoreSignals: FirestoreWebRTCSignal[];
}

interface ParticipantMedia {
  id: string;
  name: string;
  stream: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
  audioLevel: number;
  speakingAt: number;
  isLocal?: boolean;
}

type SignalPayload =
  | RTCSessionDescriptionInit
  | RTCIceCandidateInit
  | { cameraOn?: boolean; micOn?: boolean; audioLevel?: number; speakingAt?: number };

const configuredTurnUrls = (process.env.NEXT_PUBLIC_TURN_URLS || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    ...(configuredTurnUrls.length > 0 && turnUsername && turnCredential
      ? [{ urls: configuredTurnUrls, username: turnUsername, credential: turnCredential }]
      : []),
  ],
  iceTransportPolicy: "all",
};

function getUserId(user: { name: string; email: string; uid?: string }) {
  return (user.uid || user.email || user.name || "").trim();
}

function normalizeIdentity(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
}

function VideoTile({
  participant,
  localUserId,
  isLocalStream,
  registerVideoElement,
}: {
  participant: ParticipantMedia;
  localUserId: string;
  isLocalStream: boolean;
  registerVideoElement: (participantId: string, element: HTMLVideoElement | null, expectedElement?: HTMLVideoElement) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackGenerationRef = useRef(0);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    registerVideoElement(participant.id, videoEl);
    return () => registerVideoElement(participant.id, null, videoEl);
  }, [participant.id, registerVideoElement]);

  useEffect(() => {
    const videoEl = videoRef.current;
    const expectedStream = participant.stream;
    const generation = ++playbackGenerationRef.current;
    if (!videoEl) return;

    if (!expectedStream || !participant.cameraOn) {
      videoEl.pause();
      if (videoEl.srcObject !== null) videoEl.srcObject = null;
      return;
    }

    if (!participant.isLocal && isLocalStream) {
      console.error("[WebRTC] Local stream was about to be attached to a remote tile", {
        localUserId,
        remoteUserId: participant.id,
        streamId: expectedStream.id,
      });
      return;
    }

    if (videoEl.srcObject !== expectedStream) videoEl.srcObject = expectedStream;
    console.info("[WebRTC DOM]", {
      localUserId,
      tileUserId: participant.id,
      streamId: expectedStream.id,
      isLocal: Boolean(participant.isLocal),
      elementConnected: videoEl.isConnected,
      trackKinds: expectedStream.getTracks().map((track) => track.kind),
    });

    let active = true;
    const playExpectedStream = async () => {
      if (!active || !videoEl.isConnected || videoEl.srcObject !== expectedStream) return;
      console.info("[WebRTC play]", { localUserId, remoteUserId: participant.isLocal ? undefined : participant.id, streamId: expectedStream.id });
      try {
        await videoEl.play();
      } catch (error) {
        if (!active || generation !== playbackGenerationRef.current || !videoEl.isConnected || videoEl.srcObject !== expectedStream) return;
        console.warn(`[WebRTC] Remote playback is waiting for user interaction (${participant.id}):`, error);
      }
    };

    void playExpectedStream();
    return () => {
      active = false;
      if (playbackGenerationRef.current === generation) playbackGenerationRef.current += 1;
    };
  }, [isLocalStream, localUserId, participant.cameraOn, participant.id, participant.isLocal, participant.stream]);

  const hasLiveTrack = Boolean(
    participant.stream &&
      participant.stream.getVideoTracks().some((t) => t.readyState === "live" && !t.muted)
  );

  const showVideoLayer = Boolean(participant.cameraOn && hasLiveTrack);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border border-violet-400/55 bg-[#111025]">
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={participant.isLocal}
        onLoadedMetadata={(event) => {
          const videoEl = event.currentTarget;
          const expectedStream = participant.stream;
          if (!expectedStream || !videoEl.isConnected || videoEl.srcObject !== expectedStream) return;
          void videoEl.play().catch((error: unknown) => {
            if (!videoEl.isConnected || videoEl.srcObject !== expectedStream) return;
            if (!participant.isLocal) console.warn(`[WebRTC] Remote playback failed for ${participant.id}:`, error);
          });
        }}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          showVideoLayer ? "opacity-100 z-10" : "opacity-0 pointer-events-none z-0"
        } ${participant.isLocal ? "-scale-x-100" : ""}`}
      />

      {/* Fallback Overlay for when camera is turned off or stream is initializing */}
      {!showVideoLayer && (
        <div className="absolute inset-0 z-10 grid h-full w-full place-items-center bg-[#111025] select-none">
          <div className="text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-xl bg-violet-600 text-sm font-black text-white shadow-lg shadow-violet-500/25">
              {(participant.name || "U").charAt(0).toUpperCase()}
            </div>
            <p className="mt-2 max-w-[140px] truncate text-[11px] font-semibold text-white/90">
              {participant.name}{participant.isLocal ? " (you)" : ""}
            </p>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-[10px] font-medium">
              {participant.cameraOn ? (
                <>
                  <VideoIcon className="size-3 text-emerald-400 animate-pulse" />
                  <span className="text-emerald-300">cam starting...</span>
                </>
              ) : (
                <>
                  <VideoOff className="size-3 text-rose-400" />
                  <span className="text-rose-300/80">cam off</span>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Participant Badge & Active Audio Level Indicator */}
      <div className="absolute bottom-2 left-2 z-20 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/80 px-2 py-1 text-[10px] font-bold text-white shadow backdrop-blur border border-white/10">
        <span className={`size-1.5 rounded-full ${participant.audioLevel > 0.12 ? "bg-emerald-300 animate-pulse" : "bg-white/35"}`} />
        <span className="truncate">{participant.name}{participant.isLocal ? " (you)" : ""}</span>
        <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-white/20 shrink-0">
          <span title={participant.cameraOn ? "Camera On" : "Camera Off"}>
            {participant.cameraOn ? (
              <VideoIcon className="size-3 text-emerald-400" />
            ) : (
              <VideoOff className="size-3 text-rose-400" />
            )}
          </span>
          <span title={participant.micOn ? "Mic On" : "Mic Off"}>
            {participant.micOn ? (
              <Mic className="size-3 text-emerald-400" />
            ) : (
              <MicOff className="size-3 text-rose-400/80" />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function WebRTCRoomPanel({ roomId, currentUser, members, firestoreSignals }: WebRTCRoomPanelProps) {
  const activeUserId = useMemo(() => getUserId(currentUser), [currentUser]);
  const localIdentityKeys = useMemo(() => {
    return new Set(
      [currentUser.uid, currentUser.email, currentUser.name, activeUserId]
        .filter((value): value is string => Boolean(value))
        .map(normalizeIdentity)
        .filter(Boolean)
    );
  }, [activeUserId, currentUser.email, currentUser.name, currentUser.uid]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [remoteMedia, setRemoteMedia] = useState<Record<string, ParticipantMedia>>({});
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [localSpeakingAt, setLocalSpeakingAt] = useState(0);
  const [peerRevision, setPeerRevision] = useState(0);
  const [mediaMembers, setMediaMembers] = useState<RoomMember[]>(members);

  const localStreamRef = useRef<MediaStream | null>(null);
  const isCameraOnRef = useRef(isCameraOn);
  const isMicOnRef = useRef(isMicOn);
  const mediaRequestRef = useRef(0);

  useEffect(() => {
    isCameraOnRef.current = isCameraOn;
    isMicOnRef.current = isMicOn;
  }, [isCameraOn, isMicOn]);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const membersRef = useRef<Map<string, string>>(new Map());
  const mountedAtRef = useRef(0);
  const signalHandlerRef = useRef<(signal: FirestoreWebRTCSignal) => void>(() => {});
  const localAudioLevelRef = useRef(0);
  const localSpeakingAtRef = useRef(0);
  const lastMediaRecoveryAtRef = useRef<Map<string, number>>(new Map());
  const currentMemberIdsRef = useRef<Set<string>>(new Set());
  const peerCleanupTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const mediaMembersRef = useRef<Map<string, RoomMember>>(new Map());
  const memberRetentionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const registerVideoElement = useCallback((participantId: string, element: HTMLVideoElement | null, expectedElement?: HTMLVideoElement) => {
    if (element) videoElementsRef.current.set(participantId, element);
    else if (!expectedElement || videoElementsRef.current.get(participantId) === expectedElement) {
      videoElementsRef.current.delete(participantId);
    }
  }, []);

  const unlockRemotePlayback = useCallback(() => {
    for (const [participantId, video] of videoElementsRef.current) {
      if (participantId === activeUserId || video.muted || !video.isConnected || !video.srcObject) continue;
      void video.play().catch((error: unknown) => {
        if (!video.isConnected || !video.srcObject) return;
        console.warn(`[WebRTC] Remote playback could not start for ${participantId}:`, error);
      });
    }
  }, [activeUserId]);

  useEffect(() => {
    localAudioLevelRef.current = localAudioLevel;
    localSpeakingAtRef.current = localSpeakingAt;
  }, [localAudioLevel, localSpeakingAt]);

  useEffect(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.id, m.name);
    membersRef.current = map;
    currentMemberIdsRef.current = new Set(members.map((member) => member.id));

    for (const member of members) {
      mediaMembersRef.current.set(member.id, member);
      const retentionTimer = memberRetentionTimersRef.current.get(member.id);
      if (retentionTimer) {
        clearTimeout(retentionTimer);
        memberRetentionTimersRef.current.delete(member.id);
      }
    }

    for (const memberId of mediaMembersRef.current.keys()) {
      if (currentMemberIdsRef.current.has(memberId) || memberRetentionTimersRef.current.has(memberId)) continue;
      const retentionTimer = setTimeout(() => {
        memberRetentionTimersRef.current.delete(memberId);
        if (currentMemberIdsRef.current.has(memberId)) return;
        mediaMembersRef.current.delete(memberId);
        setMediaMembers(Array.from(mediaMembersRef.current.values()));
      }, 8000);
      memberRetentionTimersRef.current.set(memberId, retentionTimer);
    }

    setMediaMembers(Array.from(mediaMembersRef.current.values()));
  }, [members]);

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  const sendSignal = useCallback((to: string, type: FirestoreWebRTCSignal["type"], payload: SignalPayload) => {
    if (!activeUserId || !to || to === activeUserId) return;
    console.info("[WebRTC] Signal sent", { roomId, localUserId: activeUserId, remoteUserId: to, signalType: type });
    sendWebRTCSignalFirestore(roomId, { from: activeUserId, to, type, payload });
  }, [activeUserId, roomId]);

  const flushPendingCandidates = useCallback(async (remoteId: string, peer: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(remoteId) || [];
    if (pending.length === 0) return;
    pendingCandidatesRef.current.delete(remoteId);
    for (const candidate of pending) {
      try {
        if (peer.remoteDescription && peer.remoteDescription.type) {
          await peer.addIceCandidate(candidate);
        }
      } catch (err) {
        console.warn(`[WebRTC] ICE candidate add error for ${remoteId}:`, err);
      }
    }
  }, []);

  const createPeer = useCallback((remoteId: string) => {
    const existingPeer = peersRef.current.get(remoteId);
    if (existingPeer) return existingPeer;

    if (remoteId === activeUserId) {
      throw new Error(`[WebRTC] Refusing self-peer connection for room ${roomId}, user ${activeUserId}`);
    }

    console.log(`[WebRTC] Creating RTCPeerConnection for room=${roomId}, local=${activeUserId}, remote=${remoteId}`);
    const peer = new RTCPeerConnection(rtcConfig);
    peersRef.current.set(remoteId, peer);

    // Keep the audio/video m-line order identical on every client. Adding
    // whichever local track happens to be enabled first can otherwise create
    // audio/video transceivers in different orders on the two peers.
    const videoTransceiver = peer.addTransceiver("video", { direction: "sendrecv" });
    const audioTransceiver = peer.addTransceiver("audio", { direction: "sendrecv" });

    for (const track of localStreamRef.current?.getTracks() || []) {
      const sender = track.kind === "video" ? videoTransceiver.sender : audioTransceiver.sender;
      void sender.replaceTrack(track).catch((error) => {
        console.warn(`[WebRTC] Initial ${track.kind} track attachment failed for ${remoteId}:`, error);
      });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.info("[WebRTC] ICE candidate", {
          roomId,
          localUserId: activeUserId,
          remoteUserId: remoteId,
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
        });
        sendSignal(remoteId, "candidate", event.candidate.toJSON());
      }
    };
    peer.onicecandidateerror = (event) => {
      console.warn("[WebRTC] ICE candidate gathering error", {
        roomId,
        localUserId: activeUserId,
        remoteUserId: remoteId,
        url: event.url,
        errorCode: event.errorCode,
        errorText: event.errorText,
      });
    };

    peer.ontrack = (event) => {
      console.info("[WebRTC ontrack]", {
        roomId,
        localUserId: activeUserId,
        remoteUserId: remoteId,
        kind: event.track.kind,
        streamId: event.streams[0]?.id,
        peerState: peer.connectionState,
        iceState: peer.iceConnectionState,
      });
      let stream = remoteStreamsRef.current.get(remoteId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreamsRef.current.set(remoteId, stream);
      }

      if (stream === localStreamRef.current) {
        console.error(`[WebRTC] Rejected local MediaStream as remote media for ${remoteId}`);
        remoteStreamsRef.current.delete(remoteId);
        return;
      }

      // Keep one stable stream object for this peer even when audio and video
      // arrive in separate ontrack events or a sender replaces a track.
      const staleTracks = stream.getTracks().filter((t) => t.kind === event.track.kind && t.id !== event.track.id);
      staleTracks.forEach((t) => {
        console.log(`[WebRTC] Removing stale ${t.kind} track ${t.id} from remote stream for ${remoteId}`);
        stream!.removeTrack(t);
      });

      if (!stream.getTracks().some((t) => t.id === event.track.id)) {
        stream.addTrack(event.track);
      }
      console.info("[WebRTC remote tracks]", {
        remoteUserId: remoteId,
        streamId: stream.id,
        videoTracks: stream.getVideoTracks().map((track) => ({ id: track.id, readyState: track.readyState, muted: track.muted })),
        audioTracks: stream.getAudioTracks().map((track) => ({ id: track.id, readyState: track.readyState, muted: track.muted })),
      });

      const updatedStream = new MediaStream(stream.getTracks());
      remoteStreamsRef.current.set(remoteId, updatedStream);

      const videoEl = videoElementsRef.current.get(remoteId);
      if (videoEl && videoEl.srcObject !== updatedStream) {
        videoEl.srcObject = updatedStream;
        void videoEl.play().catch(() => {});
      }

      const updateRemoteState = () => {
        setRemoteMedia((prev) => {
          const currentTracksStream = remoteStreamsRef.current.get(remoteId) || updatedStream;
          const hasVideo = currentTracksStream.getVideoTracks().some((t) => t.readyState === "live" && !t.muted);
          const hasAudio = currentTracksStream.getAudioTracks().some((t) => t.readyState === "live" && !t.muted);
          const previous = prev[remoteId];
          return {
            ...prev,
            [remoteId]: {
              id: remoteId,
              name: membersRef.current.get(remoteId) || previous?.name || "Member",
              stream: new MediaStream(currentTracksStream.getTracks()),
              cameraOn: typeof previous?.cameraOn === "boolean" ? (previous.cameraOn || hasVideo) : hasVideo,
              micOn: typeof previous?.micOn === "boolean" ? (previous.micOn || hasAudio) : hasAudio,
              audioLevel: previous?.audioLevel || 0,
              speakingAt: previous?.speakingAt || 0,
            },
          };
        });
      };

      updateRemoteState();

      event.track.onunmute = () => {
        console.log(`[WebRTC] Remote track unmuted from ${remoteId}: ${event.track.kind}`);
        updateRemoteState();
      };

      event.track.onmute = () => {
        console.log(`[WebRTC] Remote track muted from ${remoteId}: ${event.track.kind}`);
        updateRemoteState();
      };

      event.track.onended = () => {
        console.log(`[WebRTC] Remote track ended from ${remoteId}: ${event.track.kind}`);
        const currentStream = remoteStreamsRef.current.get(remoteId);
        if (currentStream?.getTracks().some((track) => track.id === event.track.id)) {
          currentStream.removeTrack(event.track);
          remoteStreamsRef.current.set(remoteId, new MediaStream(currentStream.getTracks()));
        }
        updateRemoteState();
      };
    };

    peer.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer connection state room=${roomId} local=${activeUserId} remote=${remoteId}: ${peer.connectionState}`);
      if (peer.connectionState === "connected") {
        sendSignal(remoteId, "media-status", {
          cameraOn: isCameraOnRef.current,
          micOn: isMicOnRef.current,
          audioLevel: localAudioLevelRef.current,
          speakingAt: localSpeakingAtRef.current,
        });
      }
      if (peer.connectionState === "failed" || peer.connectionState === "closed") {
        if (peersRef.current.get(remoteId) !== peer) return;
        console.warn(`[WebRTC] Peer connection ended for ${remoteId}, state: ${peer.connectionState}`);
        peer.close();
        peersRef.current.delete(remoteId);
        remoteStreamsRef.current.delete(remoteId);
        setRemoteMedia((prev) => {
          const next = { ...prev };
          delete next[remoteId];
          return next;
        });
        if (peer.connectionState === "failed") setPeerRevision((revision) => revision + 1);
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state room=${roomId} local=${activeUserId} remote=${remoteId}: ${peer.iceConnectionState}`);
    };

    return peer;
  }, [activeUserId, roomId, sendSignal]);

  const makeOffer = useCallback(async (remoteId: string, iceRestart = false) => {
    const peer = createPeer(remoteId);
    if (makingOfferRef.current.get(remoteId)) {
      console.log(`[WebRTC] Offer creation in progress for ${remoteId}, skipping`);
      return;
    }
    if (peer.signalingState !== "stable") {
      console.log(`[WebRTC] Peer signaling state for ${remoteId} is '${peer.signalingState}', will retry when stable`);
      const onStable = () => {
        if (peer.signalingState === "stable") {
          peer.removeEventListener("signalingstatechange", onStable);
          void makeOffer(remoteId, iceRestart);
        }
      };
      peer.addEventListener("signalingstatechange", onStable);
      return;
    }

    try {
      makingOfferRef.current.set(remoteId, true);
      console.log(`[WebRTC] Creating offer for ${remoteId} (iceRestart=${iceRestart})`);
      const localTracks = localStreamRef.current?.getTracks() || [];
      await Promise.all(peer.getTransceivers().map((transceiver) => {
        transceiver.direction = "sendrecv";
        const track = localTracks.find((candidate) => candidate.kind === transceiver.receiver.track.kind) || null;
        return transceiver.sender.replaceTrack(track);
      }));
      const offer = await peer.createOffer({ iceRestart });
      if (peersRef.current.get(remoteId) !== peer || peer.connectionState === "closed" || peer.signalingState !== "stable") return;
      await peer.setLocalDescription(offer);
      if (peersRef.current.get(remoteId) === peer && peer.localDescription) {
        console.log(`[WebRTC] Sending offer to ${remoteId}`);
        sendSignal(remoteId, "offer", peer.localDescription.toJSON());
        sendSignal(remoteId, "media-status", {
          cameraOn: isCameraOnRef.current,
          micOn: isMicOnRef.current,
          audioLevel: localAudioLevelRef.current,
          speakingAt: localSpeakingAtRef.current,
        });
      }
    } catch (error) {
      console.warn(`[WebRTC] Error during makeOffer for ${remoteId}:`, error);
    } finally {
      makingOfferRef.current.set(remoteId, false);
    }
  }, [createPeer, sendSignal]);

  const getSender = (peer: RTCPeerConnection, kind: "video" | "audio"): RTCRtpSender | null => {
    const transceiver = peer.getTransceivers().find((t) => t.receiver.track.kind === kind);
    if (transceiver?.sender) return transceiver.sender;
    return peer.getSenders().find((s) => s.track?.kind === kind) || null;
  };

  const requestMedia = useCallback(async (nextCameraOn: boolean, nextMicOn: boolean) => {
    const requestId = ++mediaRequestRef.current;
    try {
      setPermissionError("");
      const currentStream = localStreamRef.current;
      let videoTrack = currentStream?.getVideoTracks()[0] || null;
      let audioTrack = currentStream?.getAudioTracks()[0] || null;

      if (!nextCameraOn && videoTrack) {
        console.log("[WebRTC] Disabling local video track");
        videoTrack.enabled = false;
      }

      if (!nextMicOn && audioTrack) {
        console.log("[WebRTC] Disabling local audio track");
        audioTrack.enabled = false;
        setLocalAudioLevel(0);
      }

      const needsVideo = nextCameraOn && (!videoTrack || videoTrack.readyState === "ended" || !videoTrack.enabled);
      const needsAudio = nextMicOn && (!audioTrack || audioTrack.readyState === "ended" || !audioTrack.enabled);

      if (needsVideo || needsAudio) {
        console.log(`[WebRTC] Requesting getUserMedia (video: ${needsVideo}, audio: ${needsAudio})`);
        const freshStream = await navigator.mediaDevices.getUserMedia({
          video: needsVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } } : false,
          audio: needsAudio
            ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : false,
        });
        if (requestId !== mediaRequestRef.current) {
          freshStream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (needsVideo) videoTrack = freshStream.getVideoTracks()[0] || null;
        if (needsAudio) audioTrack = freshStream.getAudioTracks()[0] || null;
      }

      if (videoTrack) videoTrack.enabled = nextCameraOn;
      if (audioTrack) audioTrack.enabled = nextMicOn;

      const nextTracks = [videoTrack, audioTrack].filter((track): track is MediaStreamTrack => Boolean(track));
      const nextStream = nextTracks.length > 0 ? new MediaStream(nextTracks) : null;
      const previousTracks = currentStream?.getTracks() || [];

      localStreamRef.current = nextStream;

      const senderUpdates: Promise<void>[] = [];
      peersRef.current.forEach((peer, remoteId) => {
        peer.getTransceivers().forEach((transceiver) => {
          transceiver.direction = "sendrecv";
          const track = nextTracks.find((t) => t.kind === transceiver.receiver.track.kind) || null;
          senderUpdates.push(
            transceiver.sender.replaceTrack(track).catch((err) => {
              console.warn(`[WebRTC] replaceTrack error for ${remoteId}:`, err);
            })
          );
        });

        // Send media status signal over relay
        sendSignal(remoteId, "media-status", {
          cameraOn: nextCameraOn,
          micOn: nextMicOn,
          audioLevel: 0,
          speakingAt: Date.now(),
        });
      });

      await Promise.all(senderUpdates);
      if (requestId !== mediaRequestRef.current) return;
      for (const track of previousTracks) {
        if (!nextTracks.some((nextTrack) => nextTrack.id === track.id)) track.stop();
      }
      setLocalStream(nextStream);
      setIsCameraOn(nextCameraOn);
      setIsMicOn(nextMicOn);

      // Re-offer to all peers so both sides receive updated tracks
      for (const remoteId of peersRef.current.keys()) {
        void makeOffer(remoteId);
      }

      sendSignal("*", "media-status", {
        cameraOn: nextCameraOn,
        micOn: nextMicOn,
        audioLevel: 0,
        speakingAt: Date.now(),
      });
    } catch (error) {
      console.error("[WebRTC] Camera or microphone permission failed", error);
      setPermissionError("Camera or microphone permission was blocked.");
    }
  }, [activeUserId, makeOffer, sendSignal]);

  const handleCameraToggle = () => {
    unlockRemotePlayback();
    requestMedia(!isCameraOn, isMicOn);
  };

  const handleMicToggle = () => {
    unlockRemotePlayback();
    requestMedia(isCameraOn, !isMicOn);
  };

  useEffect(() => {
    if (!activeUserId) return;

    const remoteIds = members
      .filter((member) => {
        const idKey = normalizeIdentity(member.id);
        const nameKey = normalizeIdentity(member.name);
        return idKey && !localIdentityKeys.has(idKey) && !localIdentityKeys.has(nameKey);
      })
      .map((member) => member.id);

    for (const remoteId of remoteIds) {
      if (!peersRef.current.has(remoteId)) {
        console.log(`[WebRTC] Initializing peer connection for member ${remoteId}`);
        createPeer(remoteId);
        if (activeUserId < remoteId) {
          makeOffer(remoteId);
        }
      }
    }
  }, [activeUserId, createPeer, localIdentityKeys, makeOffer, members, peerRevision]);

  useEffect(() => {
    const currentRemoteIds = new Set(
      members
        .filter((member) => {
          const idKey = normalizeIdentity(member.id);
          const nameKey = normalizeIdentity(member.name);
          return idKey && !localIdentityKeys.has(idKey) && !localIdentityKeys.has(nameKey);
        })
        .map((member) => member.id)
    );

    for (const remoteId of currentRemoteIds) {
      const cleanupTimer = peerCleanupTimersRef.current.get(remoteId);
      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
        peerCleanupTimersRef.current.delete(remoteId);
      }
    }

    for (const [remoteId, peer] of peersRef.current) {
      if (currentRemoteIds.has(remoteId)) continue;
      if (peerCleanupTimersRef.current.has(remoteId)) continue;
      const cleanupTimer = setTimeout(() => {
        peerCleanupTimersRef.current.delete(remoteId);
        if (currentMemberIdsRef.current.has(remoteId) || peersRef.current.get(remoteId) !== peer) return;

        console.info("[WebRTC peer cleanup]", { localUserId: activeUserId, remoteUserId: remoteId });
        peer.close();
        peersRef.current.delete(remoteId);
        remoteStreamsRef.current.delete(remoteId);
        pendingCandidatesRef.current.delete(remoteId);
        if (makingOfferRef.current.has(remoteId)) makingOfferRef.current.delete(remoteId);
        setRemoteMedia((prev) => {
          if (!prev[remoteId]) return prev;
          const next = { ...prev };
          delete next[remoteId];
          return next;
        });
      }, 8000);
      peerCleanupTimersRef.current.set(remoteId, cleanupTimer);
    }
  }, [activeUserId, localIdentityKeys, members]);

  useEffect(() => {
    if (!activeUserId) return;

    let active = true;
    const processedSignals = processedSignalsRef.current;
    const handleSingleSignal = async (signal: FirestoreWebRTCSignal) => {
      if (!active || !signal?.id || !signal.from || !signal.to || signal.createdAt < Date.now() - 60000) return;
      if (processedSignalsRef.current.has(signal.id)) return;
      if (signal.from === activeUserId) return;
      if (signal.to !== activeUserId && !(signal.to === "*" && signal.type === "media-status")) return;

      console.info("[WebRTC] Signal received", {
        roomId,
        localUserId: activeUserId,
        remoteUserId: signal.from,
        signalType: signal.type,
        to: signal.to,
      });

      processedSignalsRef.current.add(signal.id);

      if (signal.type === "media-status") {
        const payload = signal.payload as { cameraOn?: boolean; micOn?: boolean; audioLevel?: number; speakingAt?: number };
        const stream = remoteStreamsRef.current.get(signal.from) || null;
        const hasLiveVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live" && !track.muted));
        const hasLiveAudio = Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live" && !track.muted));
        setRemoteMedia((prev) => {
          const currentStream = remoteStreamsRef.current.get(signal.from) || prev[signal.from]?.stream || null;
          return {
            ...prev,
            [signal.from]: {
              id: signal.from,
              name: membersRef.current.get(signal.from) || prev[signal.from]?.name || "Member",
              stream: currentStream ? new MediaStream(currentStream.getTracks()) : null,
              cameraOn: typeof payload.cameraOn === "boolean" ? payload.cameraOn : hasLiveVideo,
              micOn: typeof payload.micOn === "boolean" ? payload.micOn : hasLiveAudio,
              audioLevel: Number(payload.audioLevel || 0),
              speakingAt: Number(payload.speakingAt || 0),
            },
          };
        });

        const mediaTrackMissing = (payload.cameraOn === true && !hasLiveVideo) ||
          (payload.micOn === true && !hasLiveAudio);
        const now = Date.now();
        const lastRecoveryAt = lastMediaRecoveryAtRef.current.get(signal.from) || 0;
        const peer = peersRef.current.get(signal.from);
        if (
          mediaTrackMissing && peer?.signalingState === "stable" &&
          now - lastRecoveryAt >= 4000
        ) {
          lastMediaRecoveryAtRef.current.set(signal.from, now);
          console.warn("[WebRTC] Remote media is enabled but its track is missing; renegotiating with offer", {
            roomId,
            localUserId: activeUserId,
            remoteUserId: signal.from,
            missingVideo: payload.cameraOn === true && !hasLiveVideo,
            missingAudio: payload.micOn === true && !hasLiveAudio,
          });
          void makeOffer(signal.from, false);
        }
        return;
      }

      const peer = createPeer(signal.from);

      try {
        if (signal.type === "offer") {
          console.log(`[WebRTC] Received offer signal from ${signal.from}`);
          
          const isPolite = activeUserId > signal.from;
          const isMakingOffer = Boolean(makingOfferRef.current.get(signal.from));
          const offerCollision = isMakingOffer || peer.signalingState !== "stable";

          if (offerCollision) {
            if (!isPolite) {
              console.warn(`[WebRTC] Impolite peer ignoring colliding offer from ${signal.from}`);
              return;
            }
            console.log(`[WebRTC] Polite peer rolling back colliding offer for ${signal.from}`);
            await peer.setLocalDescription({ type: "rollback" });
          }

          await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
          if (!active || peersRef.current.get(signal.from) !== peer) return;
          console.log(`[WebRTC] Set remote description (offer) from ${signal.from}`);

          await flushPendingCandidates(signal.from, peer);
          const localTracks = localStreamRef.current?.getTracks() || [];
          await Promise.all(peer.getTransceivers().map((transceiver) => {
            transceiver.direction = "sendrecv";
            const track = localTracks.find((candidate) => candidate.kind === transceiver.receiver.track.kind) || null;
            return transceiver.sender.replaceTrack(track);
          }));

          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          if (active && peersRef.current.get(signal.from) === peer && peer.localDescription) {
            console.log(`[WebRTC] Sending answer signal to ${signal.from}`);
            sendSignal(signal.from, "answer", peer.localDescription.toJSON());
            sendSignal(signal.from, "media-status", {
              cameraOn: isCameraOnRef.current,
              micOn: isMicOnRef.current,
              audioLevel: localAudioLevelRef.current,
              speakingAt: localSpeakingAtRef.current,
            });
          }
        } else if (signal.type === "answer") {
          console.log(`[WebRTC] Received answer signal from ${signal.from}`);
          if (peer.signalingState === "have-local-offer") {
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            if (!active || peersRef.current.get(signal.from) !== peer) return;
            console.log(`[WebRTC] Set remote description (answer) from ${signal.from}`);

            await flushPendingCandidates(signal.from, peer);
            sendSignal(signal.from, "media-status", {
              cameraOn: isCameraOnRef.current,
              micOn: isMicOnRef.current,
              audioLevel: localAudioLevelRef.current,
              speakingAt: localSpeakingAtRef.current,
            });
          }
        } else if (signal.type === "candidate") {
          const candidate = signal.payload as RTCIceCandidateInit;
          if (peer.remoteDescription && peer.remoteDescription.type) {
            console.log(`[WebRTC] ICE candidate received from ${signal.from}`);
            await peer.addIceCandidate(candidate).catch((err) => console.warn(`[WebRTC] ICE candidate add error`, err));
          } else {
            console.log(`[WebRTC] Queueing ICE candidate from ${signal.from} (remoteDescription not set yet)`);
            const pending = pendingCandidatesRef.current.get(signal.from) || [];
            pending.push(candidate);
            pendingCandidatesRef.current.set(signal.from, pending);
          }
        }
      } catch (error) {
        console.warn("[WebRTC] Signal handling error:", error);
      }
    };

    // 2. Subscribe to local BroadcastChannel signals for instant delivery
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(`syncspace_webrtc_signals_${roomId}`);
      channel.onmessage = (event) => {
        if (event.data?.type === "WEBRTC_SIGNAL" && event.data.signal) {
          handleSingleSignal(event.data.signal as FirestoreWebRTCSignal);
        }
      };
    } catch {
      // ignore
    }

    // 3. Subscribe to global WebSocket signals across different devices
    const unsubscribeGlobal = subscribeToGlobalSignals(roomId, (signal) => {
      handleSingleSignal(signal);
    });
    signalHandlerRef.current = handleSingleSignal;

    return () => {
      active = false;
      channel?.close();
      unsubscribeGlobal();
      processedSignals.clear();
      signalHandlerRef.current = () => {};
    };
  }, [activeUserId, createPeer, flushPendingCandidates, makeOffer, roomId, sendSignal]);

  useEffect(() => {
    for (const signal of firestoreSignals) signalHandlerRef.current(signal);
  }, [firestoreSignals]);

  useEffect(() => {
    if (!activeUserId) return;

    const publishStatus = () => {
      sendSignal("*", "media-status", {
        cameraOn: isCameraOn,
        micOn: isMicOn,
        audioLevel: localAudioLevelRef.current,
        speakingAt: localSpeakingAtRef.current,
      });
    };

    publishStatus();
    const intervalId = window.setInterval(publishStatus, 15000);
    return () => window.clearInterval(intervalId);
  }, [activeUserId, isCameraOn, isMicOn, sendSignal]);

  useEffect(() => {
    if (!localStream || !isMicOn) {
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.fftSize = 512;
    source.connect(analyser);

    const intervalId = window.setInterval(() => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length / 255;
      const speakingAt = average > 0.11 ? Date.now() : localSpeakingAt;
      setLocalAudioLevel(average);
      if (average > 0.11) setLocalSpeakingAt(speakingAt);
    }, 600);

    return () => {
      window.clearInterval(intervalId);
      source.disconnect();
      audioContext.close();
    };
  }, [isMicOn, localSpeakingAt, localStream]);

  useEffect(() => {
    const peers = peersRef.current;
    const remoteStreams = remoteStreamsRef.current;
    const makingOffers = makingOfferRef.current;
    const pendingCandidates = pendingCandidatesRef.current;
    const videoElements = videoElementsRef.current;
    const peerCleanupTimers = peerCleanupTimersRef.current;
    const memberRetentionTimers = memberRetentionTimersRef.current;
    return () => {
      console.log("[WebRTC] Unmounting WebRTCRoomPanel, cleaning up local tracks & peers");
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      peers.forEach((peer) => peer.close());
      peers.clear();
      remoteStreams.clear();
      makingOffers.clear();
      pendingCandidates.clear();
      videoElements.clear();
      peerCleanupTimers.forEach((timer) => clearTimeout(timer));
      peerCleanupTimers.clear();
      memberRetentionTimers.forEach((timer) => clearTimeout(timer));
      memberRetentionTimers.clear();
    };
  }, []);

  const visibleParticipants = useMemo(() => {
    const localParticipant: ParticipantMedia = {
      id: activeUserId || "local",
      name: currentUser.name || "You",
      stream: localStream,
      cameraOn: isCameraOn,
      micOn: isMicOn,
      audioLevel: localAudioLevel,
      speakingAt: localSpeakingAt,
      isLocal: true,
    };

    const seenIds = new Set<string>([localParticipant.id]);
    const remoteParticipants = mediaMembers
      .filter((member) => {
        const idKey = normalizeIdentity(member.id);
        const nameKey = normalizeIdentity(member.name);
        return idKey && !localIdentityKeys.has(idKey) && !localIdentityKeys.has(nameKey);
      })
      .map((member) => {
        const remote = remoteMedia[member.id];
        const currentStream = remote?.stream || remoteStreamsRef.current.get(member.id) || null;
        const hasLiveVideoTrack = Boolean(currentStream?.getVideoTracks().some((t) => t.readyState === "live" && !t.muted));
        const hasLiveAudioTrack = Boolean(currentStream?.getAudioTracks().some((t) => t.readyState === "live" && !t.muted));

        return {
          id: member.id,
          name: member.name,
          stream: currentStream,
          cameraOn: typeof remote?.cameraOn === "boolean" ? remote.cameraOn : hasLiveVideoTrack,
          micOn: typeof remote?.micOn === "boolean" ? remote.micOn : hasLiveAudioTrack,
          audioLevel: remote?.audioLevel || 0,
          speakingAt: remote?.speakingAt || 0,
        };
      })
      .filter((participant) => {
        if (seenIds.has(participant.id)) return false;
        seenIds.add(participant.id);
        return true;
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    return [localParticipant, ...remoteParticipants].slice(0, 3);
  }, [
    activeUserId,
    currentUser.name,
    isCameraOn,
    isMicOn,
    localAudioLevel,
    localSpeakingAt,
    localIdentityKeys,
    localStream,
    mediaMembers,
    remoteMedia,
  ]);

  const emptySlots = Math.max(0, 3 - visibleParticipants.length);

  return (
    <section className="flex h-full min-h-0 flex-col bg-black/35 p-3">
      <div className="mb-2 shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
          Members ({members.length})
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-3 gap-2">
        {visibleParticipants.map((participant) => (
          <VideoTile
            key={participant.id}
            participant={participant}
            localUserId={activeUserId}
            isLocalStream={Boolean(participant.stream && participant.stream === localStream)}
            registerVideoElement={registerVideoElement}
          />
        ))}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <div
            key={`waiting-${index}`}
            className="grid min-h-0 place-items-center rounded-lg border border-white/15 bg-white/[0.03] text-center"
          >
            <div className="text-white/25">
              <UserPlus className="mx-auto mb-2 size-5" />
              <p className="text-[10px] font-semibold">waiting for others</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCameraToggle}
          className={`flex items-center justify-center gap-2 rounded-md border py-2 text-[11px] font-bold transition ${
            isCameraOn
              ? "border-emerald-400/45 bg-emerald-500/15 text-emerald-200"
              : "border-white/15 bg-white/8 text-red-300 hover:bg-white/15"
          }`}
        >
          {isCameraOn ? <VideoIcon className="size-3.5" /> : <VideoOff className="size-3.5" />}
          <span>{isCameraOn ? "Cam On" : "Cam Off"}</span>
        </button>

        <button
          type="button"
          onClick={handleMicToggle}
          className={`flex items-center justify-center gap-2 rounded-md border py-2 text-[11px] font-bold transition ${
            isMicOn
              ? "border-emerald-400/45 bg-emerald-500/15 text-emerald-200"
              : "border-white/15 bg-white/8 text-red-300 hover:bg-white/15"
          }`}
        >
          {isMicOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
          <span>{isMicOn ? "Mic On" : "Mic Off"}</span>
        </button>
      </div>

      {permissionError && (
        <p className="mt-2 text-[10px] font-semibold text-red-300">{permissionError}</p>
      )}
    </section>
  );
}
