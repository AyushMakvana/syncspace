"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff } from "lucide-react";

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

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function getUserId(user: { name: string; email: string; uid?: string }) {
  return (user.uid || user.email || user.name || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function VideoTile({ participant }: { participant: ParticipantMedia }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
    if (audioRef.current && audioRef.current.srcObject !== participant.stream) {
      audioRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

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
          muted={participant.isLocal}
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

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) map.set(member.id, member.name);
    return map;
  }, [members]);

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

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(remoteId, "candidate", event.candidate.toJSON());
      }
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      setRemoteMedia((prev) => ({
        ...prev,
        [remoteId]: {
          id: remoteId,
          name: memberNameById.get(remoteId) || "Member",
          stream,
          cameraOn: prev[remoteId]?.cameraOn ?? stream.getVideoTracks().some((track) => track.enabled),
          micOn: prev[remoteId]?.micOn ?? stream.getAudioTracks().some((track) => track.enabled),
          audioLevel: prev[remoteId]?.audioLevel || 0,
          speakingAt: prev[remoteId]?.speakingAt || 0,
        },
      }));
    };

    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        peersRef.current.delete(remoteId);
      }
    };

    return peer;
  }, [memberNameById, sendSignal]);

  const makeOffer = useCallback(async (remoteId: string) => {
    const peer = createPeer(remoteId);
    if (makingOfferRef.current.has(remoteId)) return;

    try {
      makingOfferRef.current.add(remoteId);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (peer.localDescription) sendSignal(remoteId, "offer", peer.localDescription.toJSON());
    } catch (error) {
      console.error("WebRTC offer failed", error);
    } finally {
      makingOfferRef.current.delete(remoteId);
    }
  }, [createPeer, sendSignal]);

  const requestMedia = useCallback(async (nextCameraOn: boolean, nextMicOn: boolean) => {
    if (!nextCameraOn && !nextMicOn) {
      localStreamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = false;
        track.stop();
      });
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
        track.stop();
      });
      setLocalStream(null);
      localStreamRef.current = null;
      setIsCameraOn(false);
      setIsMicOn(false);
      setLocalAudioLevel(0);
      sendSignal("*", "media-status", { cameraOn: false, micOn: false, audioLevel: 0, speakingAt: 0 });
      return;
    }

    try {
      setPermissionError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: nextCameraOn,
        audio: nextMicOn,
      });

      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOn(nextCameraOn);
      setIsMicOn(nextMicOn);
      sendSignal("*", "media-status", {
        cameraOn: nextCameraOn,
        micOn: nextMicOn,
        audioLevel: 0,
        speakingAt: Date.now(),
      });

      peersRef.current.forEach((peer) => {
        peer.getSenders().forEach((sender) => peer.removeTrack(sender));
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      });

      await Promise.all(Array.from(peersRef.current.keys()).map((remoteId) => makeOffer(remoteId)));
    } catch (error) {
      console.error("Camera or microphone permission failed", error);
      setPermissionError("Camera or microphone permission was blocked.");
    }
  }, [makeOffer, sendSignal]);

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
          return;
        }

        const peer = createPeer(signal.from);

        try {
          if (signal.type === "offer") {
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            if (peer.localDescription) sendSignal(signal.from, "answer", peer.localDescription.toJSON());
          } else if (signal.type === "answer") {
            if (!peer.currentRemoteDescription) {
              await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            }
          } else if (signal.type === "candidate") {
            await peer.addIceCandidate(signal.payload as RTCIceCandidateInit);
          }
        } catch (error) {
          console.error("WebRTC signal handling failed", error);
        }
      });
    });

    return () => unsubscribe();
  }, [activeUserId, createPeer, memberNameById, roomId, sendSignal]);

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
    const all = [localParticipant, ...Object.values(remoteMedia)];
    return all
      .sort((a, b) => {
        if (b.speakingAt !== a.speakingAt) return b.speakingAt - a.speakingAt;
        if (b.audioLevel !== a.audioLevel) return b.audioLevel - a.audioLevel;
        return Number(Boolean(b.cameraOn)) - Number(Boolean(a.cameraOn));
      })
      .slice(0, 2);
  }, [activeUserId, currentUser.name, isCameraOn, isMicOn, localAudioLevel, localSpeakingAt, localStream, remoteMedia]);

  return (
    <section className="flex h-1/2 min-h-0 flex-col border-b border-white/10 bg-black/35 p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
          Members ({members.length})
        </p>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/45">
          Live
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-2">
        {visibleParticipants.map((participant) => (
          <VideoTile key={participant.id} participant={participant} />
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
