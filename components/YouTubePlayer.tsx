"use client";

import React, { useEffect, useRef, useCallback } from "react";

interface YouTubePlayerProps {
  videoId: string;
  isHost?: boolean;
  onStateSync?: (state: number, currentTime: number) => void;
  syncState?: { state: number; currentTime: number; timestamp: number; updatedBy?: string } | null;
  clientId?: string;
}

interface YTPlayerInstance {
  destroy: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  isMuted: () => boolean;
  getPlayerState: () => number;
}

interface YTPlayerEvent {
  target: YTPlayerInstance;
  data: number;
}

declare global {
  interface Window {
    YT: {
      Player: new (element: HTMLElement, config: object) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function YouTubePlayer({ videoId, onStateSync, syncState, clientId }: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const isSyncingRef = useRef(false);
  const lastStateRef = useRef(-1);
  const lastObservedRef = useRef({ time: 0, at: 0, state: -1 });
  const lastSentAtRef = useRef(0);
  const lastAppliedSyncRef = useRef(0);
  const syncStateRef = useRef<typeof syncState>(syncState);

  const parseVideoId = useCallback((rawId: string) => {
    if (!rawId) return "";
    if (rawId.length === 11 && !rawId.includes("/")) return rawId;
    const match = rawId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    return match ? match[1] : rawId;
  }, []);

  const activeVideoId = parseVideoId(videoId);

  const applySyncedPlayback = useCallback((
    player: YTPlayerInstance,
    roomSync: NonNullable<typeof syncState>
  ) => {
    const elapsed = roomSync.state === 1 ? Math.max(0, (Date.now() - roomSync.timestamp) / 1000) : 0;
    const targetTime = roomSync.currentTime + elapsed;
    const localTime = typeof player.getCurrentTime === "function" ? player.getCurrentTime() : 0;
    const drift = Math.abs(localTime - targetTime);

    // Only force seek if playback time has drifted by more than 3.5 seconds
    if (drift > 3.5) {
      player.seekTo(targetTime, true);
    }

    if (roomSync.state === 1) {
      const currentState = typeof player.getPlayerState === "function" ? player.getPlayerState() : -1;
      // Only trigger play if not already playing or buffering
      if (currentState !== 1 && currentState !== 3) {
        if (typeof player.unMute === "function") player.unMute();
        if (typeof player.setVolume === "function") player.setVolume(100);
        player.playVideo();
      }
    } else if (roomSync.state === 2) {
      player.pauseVideo();
    }

    lastAppliedSyncRef.current = roomSync.timestamp;
    lastStateRef.current = roomSync.state;
    lastObservedRef.current = { time: targetTime, at: Date.now(), state: roomSync.state };
  }, []);

  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const initPlayer = () => {
      if (!containerRef.current || !activeVideoId) return;

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
      }

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: activeVideoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: YTPlayerEvent) => {
            const initialSync = syncStateRef.current;
            if (initialSync) {
              applySyncedPlayback(event.target, initialSync);
            } else {
              event.target.playVideo();
            }
          },
          onStateChange: (event: YTPlayerEvent) => {
            if (isSyncingRef.current) return;
            const currentState = event.data;
            const currentTime = event.target.getCurrentTime ? event.target.getCurrentTime() : 0;

            if (currentState === 1 || currentState === 2) {
              lastObservedRef.current = { time: currentTime, at: Date.now(), state: currentState };
              if (lastStateRef.current !== currentState) {
                lastStateRef.current = currentState;
                lastSentAtRef.current = Date.now();
                onStateSync?.(currentState, currentTime);
              }
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    }

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [activeVideoId, applySyncedPlayback, onStateSync]);

  // Periodic check for local user seek or state change
  useEffect(() => {
    if (!onStateSync) return;

    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || isSyncingRef.current || typeof player.getCurrentTime !== "function") return;

      const state = player.getPlayerState();
      if (state !== 1 && state !== 2) return;

      const now = Date.now();
      const currentTime = player.getCurrentTime();
      const previous = lastObservedRef.current;
      const expectedTime = previous.state === 1 ? previous.time + (now - previous.at) / 1000 : previous.time;
      const didManualSeek = Math.abs(currentTime - expectedTime) > 3.0;
      const isPlaybackOwner = !syncStateRef.current?.updatedBy || syncStateRef.current.updatedBy === clientId;
      const shouldHeartbeat = isPlaybackOwner && state === 1 && now - lastSentAtRef.current > 15000;
      const stateChanged = lastStateRef.current !== state;

      if (didManualSeek || shouldHeartbeat || stateChanged) {
        lastStateRef.current = state;
        lastObservedRef.current = { time: currentTime, at: now, state };
        lastSentAtRef.current = now;
        onStateSync(state, currentTime);
      } else {
        lastObservedRef.current = { time: currentTime, at: now, state };
      }
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [clientId, onStateSync]);

  // Apply incoming sync state updates
  useEffect(() => {
    if (!syncState || !playerRef.current || typeof playerRef.current.getCurrentTime !== "function") return;
    if (syncState.timestamp <= lastAppliedSyncRef.current) return;

    const player = playerRef.current;
    isSyncingRef.current = true;
    applySyncedPlayback(player, syncState);

    window.setTimeout(() => {
      isSyncingRef.current = false;
    }, 600);
  }, [applySyncedPlayback, syncState]);

  // Periodic passive drift check without continuous seeks
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      const roomSync = syncStateRef.current;
      if (!player || !roomSync || isSyncingRef.current || typeof player.getCurrentTime !== "function") return;
      if (roomSync.state !== 1 || roomSync.updatedBy === clientId) return;

      const elapsed = Math.max(0, (Date.now() - roomSync.timestamp) / 1000);
      const targetTime = roomSync.currentTime + elapsed;
      const localTime = player.getCurrentTime();
      const drift = Math.abs(localTime - targetTime);

      // Only adjust if drift exceeds 3.5 seconds or player stopped unexpectedly
      if (drift > 3.5 || (player.getPlayerState() !== 1 && player.getPlayerState() !== 3)) {
        isSyncingRef.current = true;
        if (drift > 3.5) player.seekTo(targetTime, true);
        if (player.getPlayerState() !== 1) {
          if (typeof player.unMute === "function") player.unMute();
          if (typeof player.setVolume === "function") player.setVolume(100);
          player.playVideo();
        }
        lastStateRef.current = 1;
        lastObservedRef.current = { time: targetTime, at: Date.now(), state: 1 };

        window.setTimeout(() => {
          isSyncingRef.current = false;
        }, 600);
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [clientId]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
