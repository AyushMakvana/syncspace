"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, UserPlus, Video as VideoIcon, VideoOff } from "lucide-react";

import {
  FirestoreWebRTCSignal,
  sendWebRTCSignalFirestore,
  subscribeToRoomFirestore,
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

const rawTurnUrl = process.env.NEXT_PUBLIC_TURN_URL?.trim();
const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
const turnUrl = rawTurnUrl
  ? /^(turn|turns):/i.test(rawTurnUrl)
    ? rawTurnUrl
    : `turn:${rawTurnUrl}`
  : "";

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    ...(turnUrl && turnUsername && turnCredential
      ? [{
          urls: turnUrl,
          username: turnUsername,
          credential: turnCredential,
        }]
      : []),
  ],
  iceTransportPolicy: turnUrl ? "relay" : "all",
};

function getUserId(user: { name: string; email: string; uid?: string }) {
  return (user.uid || user.email || user.name || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function VideoTile({ participant }: { participant: ParticipantMedia }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      const nextVideoStream = participant.cameraOn && participant.stream
        ? new MediaStream(participant.stream.getVideoTracks())
        : null;
      if (videoRef.current.srcObject !== nextVideoStream) {
        videoRef.current.srcObject = nextVideoStream;
      }
      videoRef.current.play().catch(() => {
        // Browser will retry playback after metadata is available.
      });
    }
    if (audioRef.current) {
      const nextAudioStream = participant.stream
        ? new MediaStream(participant.stream.getAudioTracks())
        : null;
      if (audioRef.current.srcObject !== nextAudioStream) {
        audioRef.current.srcObject = nextAudioStream;
      }
    }
  }, [participant.cameraOn, participant.stream]);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border border-violet-400/55 bg-[#111025]">
      {!participant.isLocal && participant.stream && (
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      )}

      {participant.cameraOn && participant.stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(event) => event.currentTarget.play().catch(() => {})}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <div className="text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-xl bg-violet-600 text-sm font-black text-white">
              {(participant.name || "U").charAt(0).toUpperCase()}
            </div>
            <p className="mt-2 max-w-[140px] truncate text-[11px] font-medium text-white/80">
              {participant.name}{participant.isLocal ? " (you)" : ""}
            </p>
            {!participant.cameraOn && (
              <p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-white/45">
                <VideoOff className="size-3" />
                cam off
              </p>
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
        <span className={`size-1.5 rounded-full ${participant.audioLevel > 0.12 ? "bg-emerald-300" : "bg-white/35"}`} />
        <span className="truncate">{participant.name}{participant.isLocal ? " (you)" : ""}</span>
      </div>
    </div>
  );
}

export default function WebRTCRoomPanel({ roomId, currentUser, members }: WebRTCRoomPanelProps) {
  const activeUserId = useMemo(() => getUserId(currentUser), [currentUser]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [remoteMedia, setRemoteMedia] = useState<Record<string, ParticipantMedia>>({});
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [localSpeakingAt, setLocalSpeakingAt] = useState(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const ignoredOffersRef = useRef<Set<string>>(new Set());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteMediaRef = useRef<Record<string, ParticipantMedia>>({});
  const mountedAtRef = useRef(0);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) map.set(member.id, member.name);
    return map;
  }, [members]);

  useEffect(() => {
    remoteMediaRef.current = remoteMedia;
  }, [remoteMedia]);

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  const sendSignal = useCallback((to: string, type: FirestoreWebRTCSignal["type"], payload: SignalPayload) => {
    if (!activeUserId || !to || to === activeUserId) return;
    sendWebRTCSignalFirestore(roomId, { from: activeUserId, to, type, payload });
  }, [activeUserId, roomId]);

  const createPeer = useCallback((remoteId: string) => {
    const existingPeer = peersRef.current.get(remoteId);
    if (existingPeer) return existingPeer;

    const peer = new RTCPeerConnection(rtcConfig);
    peersRef.current.set(remoteId, peer);

    localStreamRef.current?.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current as MediaStream);
    });

    if (!localStreamRef.current?.getVideoTracks().length) {
      peer.addTransceiver("video", { direction: "recvonly" });
    }
    if (!localStreamRef.current?.getAudioTracks().length) {
      peer.addTransceiver("audio", { direction: "recvonly" });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(remoteId, "candidate", event.candidate.toJSON());
      }
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      const hasVideo = stream.getVideoTracks().some((track) => track.enabled);
      const hasAudio = stream.getAudioTracks().some((track) => track.enabled);
      stream.getVideoTracks().forEach((track) => {
        track.onmute = () => {
          setRemoteMedia((prev) => ({
            ...prev,
            [remoteId]: {
              id: remoteId,
              name: prev[remoteId]?.name || memberNameById.get(remoteId) || "Member",
              stream: prev[remoteId]?.stream || stream,
              cameraOn: false,
              micOn: Boolean(prev[remoteId]?.micOn),
              audioLevel: prev[remoteId]?.audioLevel || 0,
              speakingAt: prev[remoteId]?.speakingAt || 0,
            },
          }));
        };
        track.onended = track.onmute;
      });
      setRemoteMedia((prev) => ({
        ...prev,
        [remoteId]: {
          id: remoteId,
          name: memberNameById.get(remoteId) || "Member",
          stream,
          cameraOn: Boolean(prev[remoteId]?.cameraOn || hasVideo),
          micOn: Boolean(prev[remoteId]?.micOn || hasAudio),
          audioLevel: prev[remoteId]?.audioLevel || 0,
          speakingAt: prev[remoteId]?.speakingAt || 0,
        },
      }));
    };

    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        peer.close();
        peersRef.current.delete(remoteId);
      }
    };

    return peer;
  }, [memberNameById, sendSignal]);

  const makeOffer = useCallback(async (remoteId: string, iceRestart = false) => {
    const peer = createPeer(remoteId);
    if (makingOfferRef.current.has(remoteId)) return;
    if (peer.signalingState !== "stable") return;

    try {
      makingOfferRef.current.add(remoteId);
      const offer = await peer.createOffer({ iceRestart });
      await peer.setLocalDescription(offer);
      if (peer.localDescription) sendSignal(remoteId, "offer", peer.localDescription.toJSON());
    } catch (error) {
      console.error("WebRTC offer failed", error);
    } finally {
      makingOfferRef.current.delete(remoteId);
    }
  }, [createPeer, sendSignal]);

  const publishLocalTracks = useCallback((stream: MediaStream) => {
    let needsOffer = false;
    const videoTrack = stream.getVideoTracks()[0] || null;
    const audioTrack = stream.getAudioTracks()[0] || null;

    peersRef.current.forEach((peer) => {
      const videoTransceiver = peer.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === "video");
      const audioTransceiver = peer.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === "audio");
      const videoSender = peer.getSenders().find((sender) => sender.track?.kind === "video") || videoTransceiver?.sender;
      const audioSender = peer.getSenders().find((sender) => sender.track?.kind === "audio") || audioTransceiver?.sender;

      if (videoSender) {
        videoSender.replaceTrack(videoTrack);
        if (videoTransceiver) {
          videoTransceiver.direction = videoTrack ? "sendrecv" : "recvonly";
          needsOffer = true;
        }
      } else if (videoTrack) {
        peer.addTrack(videoTrack, stream);
        needsOffer = true;
      }

      if (audioSender) {
        audioSender.replaceTrack(audioTrack);
        if (audioTransceiver) {
          audioTransceiver.direction = audioTrack ? "sendrecv" : "recvonly";
          needsOffer = true;
        }
      } else if (audioTrack) {
        peer.addTrack(audioTrack, stream);
        needsOffer = true;
      }
    });

    return needsOffer;
  }, []);

  const requestMedia = useCallback(async (nextCameraOn: boolean, nextMicOn: boolean) => {
    try {
      setPermissionError("");
      const currentStream = localStreamRef.current;
      let videoTrack = currentStream?.getVideoTracks()[0] || null;
      let audioTrack = currentStream?.getAudioTracks()[0] || null;

      if (!nextCameraOn && videoTrack) {
        videoTrack.enabled = false;
        videoTrack.stop();
        videoTrack = null;
      }

      if (!nextMicOn && audioTrack) {
        audioTrack.enabled = false;
        audioTrack.stop();
        audioTrack = null;
        setLocalAudioLevel(0);
      }

      const needsVideo = nextCameraOn && (!videoTrack || videoTrack.readyState === "ended");
      const needsAudio = nextMicOn && (!audioTrack || audioTrack.readyState === "ended");

      if (needsVideo || needsAudio) {
        const freshStream = await navigator.mediaDevices.getUserMedia({
          video: needsVideo,
          audio: needsAudio,
        });
        videoTrack = videoTrack || freshStream.getVideoTracks()[0] || null;
        audioTrack = audioTrack || freshStream.getAudioTracks()[0] || null;
      }

      const nextTracks = [videoTrack, audioTrack].filter((track): track is MediaStreamTrack => Boolean(track));
      const nextStream = nextTracks.length > 0 ? new MediaStream(nextTracks) : null;

      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setIsCameraOn(nextCameraOn);
      setIsMicOn(nextMicOn);
      sendSignal("*", "media-status", {
        cameraOn: nextCameraOn,
        micOn: nextMicOn,
        audioLevel: 0,
        speakingAt: Date.now(),
      });

      const needsOffer = nextStream ? publishLocalTracks(nextStream) : publishLocalTracks(new MediaStream());
      if (needsOffer) {
        await Promise.all(Array.from(peersRef.current.keys()).map((remoteId) => makeOffer(remoteId)));
      }
    } catch (error) {
      console.error("Camera or microphone permission failed", error);
      setPermissionError("Camera or microphone permission was blocked.");
    }
  }, [makeOffer, publishLocalTracks, sendSignal]);

  const handleCameraToggle = () => {
    requestMedia(!isCameraOn, isMicOn);
  };

  const handleMicToggle = () => {
    requestMedia(isCameraOn, !isMicOn);
  };

  useEffect(() => {
    const remoteIds = members.map((member) => member.id).filter((id) => id && id !== activeUserId);
    for (const remoteId of remoteIds) {
      createPeer(remoteId);
      if (activeUserId && activeUserId < remoteId) {
        makeOffer(remoteId);
      }
    }

    peersRef.current.forEach((peer, remoteId) => {
      if (!remoteIds.includes(remoteId)) {
        peer.close();
        peersRef.current.delete(remoteId);
        setRemoteMedia((prev) => {
          const next = { ...prev };
          delete next[remoteId];
          return next;
        });
      }
    });
  }, [activeUserId, createPeer, makeOffer, members]);

  useEffect(() => {
    if (!activeUserId) return;

    const unsubscribe = subscribeToRoomFirestore(roomId, (data) => {
      const signals = data.webrtcSignals || [];
      signals.forEach(async (signal) => {
        if (signal.createdAt < mountedAtRef.current - 1000) return;
        if (processedSignalsRef.current.has(signal.id)) return;
        if (signal.from === activeUserId) return;
        if (signal.to !== activeUserId && signal.to !== "*") return;

        processedSignalsRef.current.add(signal.id);

        if (signal.type === "media-status") {
          const payload = signal.payload as { cameraOn?: boolean; micOn?: boolean; audioLevel?: number; speakingAt?: number };
          setRemoteMedia((prev) => ({
            ...prev,
            [signal.from]: {
              id: signal.from,
              name: memberNameById.get(signal.from) || "Member",
              stream: prev[signal.from]?.stream || null,
              cameraOn: Boolean(payload.cameraOn),
              micOn: Boolean(payload.micOn),
              audioLevel: Number(payload.audioLevel || 0),
              speakingAt: Number(payload.speakingAt || 0),
            },
          }));
          if (payload.cameraOn && !remoteMediaRef.current[signal.from]?.stream) {
            window.setTimeout(() => makeOffer(signal.from), 250);
          }
          return;
        }

        const peer = createPeer(signal.from);
        const isPolitePeer = activeUserId > signal.from;

        try {
          if (signal.type === "offer") {
            const offerCollision = makingOfferRef.current.has(signal.from) || peer.signalingState !== "stable";
            if (offerCollision && !isPolitePeer) {
              ignoredOffersRef.current.add(signal.from);
              return;
            }

            ignoredOffersRef.current.delete(signal.from);
            if (offerCollision) {
              await peer.setLocalDescription({ type: "rollback" });
            }
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            const pendingCandidates = pendingCandidatesRef.current.get(signal.from) || [];
            pendingCandidatesRef.current.delete(signal.from);
            await Promise.all(pendingCandidates.map((candidate) => peer.addIceCandidate(candidate)));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            if (peer.localDescription) sendSignal(signal.from, "answer", peer.localDescription.toJSON());
          } else if (signal.type === "answer") {
            if (peer.signalingState === "have-local-offer") {
              await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
              const pendingCandidates = pendingCandidatesRef.current.get(signal.from) || [];
              pendingCandidatesRef.current.delete(signal.from);
              await Promise.all(pendingCandidates.map((candidate) => peer.addIceCandidate(candidate)));
            }
          } else if (signal.type === "candidate") {
            const candidate = signal.payload as RTCIceCandidateInit;
            if (ignoredOffersRef.current.has(signal.from)) return;
            if (peer.remoteDescription) {
              await peer.addIceCandidate(candidate);
            } else {
              const pending = pendingCandidatesRef.current.get(signal.from) || [];
              pending.push(candidate);
              pendingCandidatesRef.current.set(signal.from, pending);
            }
          }
        } catch (error) {
          console.error("WebRTC signal handling failed", error);
        }
      });
    });

    return () => unsubscribe();
  }, [activeUserId, createPeer, makeOffer, memberNameById, roomId, sendSignal]);

  useEffect(() => {
    if (!activeUserId) return;

    const publishStatus = () => {
      sendSignal("*", "media-status", {
        cameraOn: isCameraOn,
        micOn: isMicOn,
        audioLevel: localAudioLevel,
        speakingAt: localSpeakingAt,
      });
    };

    publishStatus();
    const intervalId = window.setInterval(publishStatus, 1500);
    return () => window.clearInterval(intervalId);
  }, [activeUserId, isCameraOn, isMicOn, localAudioLevel, localSpeakingAt, sendSignal]);

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

      members.forEach((member) => {
        if (member.id !== activeUserId) {
          sendSignal(member.id, "media-status", {
            cameraOn: isCameraOn,
            micOn: isMicOn,
            audioLevel: average,
            speakingAt,
          });
        }
      });
    }, 500);

    return () => {
      window.clearInterval(intervalId);
      source.disconnect();
      audioContext.close();
    };
  }, [activeUserId, isCameraOn, isMicOn, localSpeakingAt, localStream, members, sendSignal]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      members.forEach((member) => {
        if (member.id === activeUserId) return;
        const remote = remoteMediaRef.current[member.id];
        if (remote?.cameraOn && !remote.stream) {
          makeOffer(member.id, true);
        }
      });
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [activeUserId, makeOffer, members]);

  useEffect(() => {
    const peers = peersRef.current;
    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peers.forEach((peer) => peer.close());
      peers.clear();
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

    const memberParticipants = members.map((member) => {
      if (member.id === activeUserId) return localParticipant;

      const remote = remoteMedia[member.id];
      return {
        id: member.id,
        name: member.name,
        stream: remote?.stream || null,
        cameraOn: Boolean(remote?.cameraOn),
        micOn: Boolean(remote?.micOn),
        audioLevel: remote?.audioLevel || 0,
        speakingAt: remote?.speakingAt || 0,
      };
    });

    const hasLocalMember = memberParticipants.some((participant) => participant.id === localParticipant.id);
    const stableParticipants = hasLocalMember ? memberParticipants : [localParticipant, ...memberParticipants];

    return stableParticipants
      .sort((a, b) => {
        if (b.speakingAt !== a.speakingAt) return b.speakingAt - a.speakingAt;
        if (b.audioLevel !== a.audioLevel) return b.audioLevel - a.audioLevel;
        return Number(Boolean(b.cameraOn)) - Number(Boolean(a.cameraOn));
      })
      .slice(0, 3);
  }, [activeUserId, currentUser.name, isCameraOn, isMicOn, localAudioLevel, localSpeakingAt, localStream, members, remoteMedia]);

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
          <VideoTile key={participant.id} participant={participant} />
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
