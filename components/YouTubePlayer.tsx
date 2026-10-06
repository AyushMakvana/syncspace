"use client";

import React, { memo, useCallback, useEffect, useRef } from "react";

type PlaybackCommand = "play" | "pause" | "seek";

export interface PlaybackState {
  isPlaying: boolean;
  position: number;
  updatedAtMs: number;
  updatedBy: string;
  commandId: string;
  version: number;
}

interface YouTubePlayerProps {
  videoId: string;
  onPlaybackCommand?: (command: PlaybackCommand, currentTime: number) => void;
  playbackState?: PlaybackState | null;
}

interface YTPlayerInstance {
  destroy: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute?: () => void;
  unMute?: () => void;
  getPlayerState: () => number;
  loadVideoById: (videoId: string | { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (videoId: string | { videoId: string; startSeconds?: number }) => void;
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

const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const SEEK_DETECTION_SECONDS = 0.5;
const DRIFT_CHECK_MS = 4000;
const DRIFT_SEEK_SECONDS = 2.5;
const DRIFT_CORRECTION_COOLDOWN_MS = 5000;

function parseVideoId(rawId: string) {
  if (!rawId) return "";
  if (rawId.length === 11 && !rawId.includes("/")) return rawId;
  const match = rawId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match ? match[1] : rawId;
}

function isReadyPlayer(player: YTPlayerInstance | null): player is YTPlayerInstance {
  return Boolean(
    player &&
    typeof player.getPlayerState === "function" &&
    typeof player.getCurrentTime === "function" &&
    typeof player.seekTo === "function" &&
    typeof player.playVideo === "function" &&
    typeof player.pauseVideo === "function"
  );
}

function YouTubePlayer({ videoId, onPlaybackCommand, playbackState }: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const isReadyRef = useRef(false);
  const isApplyingRemoteRef = useRef(false);
  const waitingForBufferExitRef = useRef(false);
  const activeVideoIdRef = useRef(parseVideoId(videoId));
  const onPlaybackCommandRef = useRef(onPlaybackCommand);
  const playbackStateRef = useRef<PlaybackState | null>(playbackState);
  const lastKnownRef = useRef({ time: 0, at: 0, state: -1 });
  const lastAppliedVersionRef = useRef(0);
  const lastCorrectionAtRef = useRef(0);
  const autoplayTimerRef = useRef<number | null>(null);
  const unmuteTimerRef = useRef<number | null>(null);

  const clearAutoplayTimers = useCallback(() => {
    if (autoplayTimerRef.current) {
      window.clearTimeout(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }
    if (unmuteTimerRef.current) {
      window.clearTimeout(unmuteTimerRef.current);
      unmuteTimerRef.current = null;
    }
  }, []);

  const forceAutoplay = useCallback((player: YTPlayerInstance) => {
    if (!isReadyPlayer(player)) return;
    if (typeof player.mute === "function") player.mute();
    player.playVideo();

    if (unmuteTimerRef.current) window.clearTimeout(unmuteTimerRef.current);
    unmuteTimerRef.current = window.setTimeout(() => {
      const readyPlayer = playerRef.current;
      if (isReadyPlayer(readyPlayer) && typeof readyPlayer.unMute === "function") {
        readyPlayer.unMute();
      }
    }, 500);
  }, []);

  const applyPlaybackState = useCallback((player: YTPlayerInstance, incoming: PlaybackState, force = false) => {
    if (!isReadyPlayer(player)) return;
    if (!force && incoming.version <= lastAppliedVersionRef.current) return;

    const currentPlayerState = player.getPlayerState();
    if (waitingForBufferExitRef.current) {
      if (currentPlayerState === YT_BUFFERING) return;
      waitingForBufferExitRef.current = false;
    }

    const targetTime = incoming.isPlaying
      ? incoming.position + Math.max(0, (Date.now() - incoming.updatedAtMs) / 1000)
      : incoming.position;
    const currentTime = player.getCurrentTime();
    const shouldSeek = Math.abs(currentTime - targetTime) > 0.35;

    isApplyingRemoteRef.current = true;

    if (shouldSeek) {
      player.seekTo(targetTime, true);
      waitingForBufferExitRef.current = true;
    }

    if (incoming.isPlaying && currentPlayerState !== YT_PLAYING) {
      player.playVideo();
    } else if (!incoming.isPlaying && currentPlayerState !== YT_PAUSED) {
      player.pauseVideo();
    }

    lastAppliedVersionRef.current = incoming.version;
    lastKnownRef.current = {
      time: targetTime,
      at: Date.now(),
      state: incoming.isPlaying ? YT_PLAYING : YT_PAUSED,
    };

    window.setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 250);
  }, []);

  useEffect(() => {
    onPlaybackCommandRef.current = onPlaybackCommand;
  }, [onPlaybackCommand]);

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    activeVideoIdRef.current = parseVideoId(videoId);
    const player = playerRef.current;
    if (!isReadyPlayer(player) || !isReadyRef.current || !activeVideoIdRef.current) return;

    const savedState = playbackStateRef.current;
    const startSeconds = savedState
      ? savedState.isPlaying
        ? savedState.position + Math.max(0, (Date.now() - savedState.updatedAtMs) / 1000)
        : savedState.position
      : 0;

    isApplyingRemoteRef.current = true;
    if (typeof player.loadVideoById === "function") {
      player.loadVideoById({ videoId: activeVideoIdRef.current, startSeconds });
    }
    if (autoplayTimerRef.current) window.clearTimeout(autoplayTimerRef.current);
    autoplayTimerRef.current = window.setTimeout(() => {
      const readyPlayer = playerRef.current;
      if (!isReadyPlayer(readyPlayer)) return;
      isApplyingRemoteRef.current = true;
      forceAutoplay(readyPlayer);
      const latestState = playbackStateRef.current;
      if (latestState) applyPlaybackState(readyPlayer, latestState, true);
      window.setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 300);
    }, 300);
    window.setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 250);
  }, [applyPlaybackState, forceAutoplay, videoId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const initPlayer = () => {
      if (!containerRef.current || !activeVideoIdRef.current || isReadyPlayer(playerRef.current)) return;

      new window.YT.Player(containerRef.current, {
        videoId: activeVideoIdRef.current,
        playerVars: {
          autoplay: 1,
          mute: 0,
          controls: 1,
          enablejsapi: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: YTPlayerEvent) => {
            if (!isReadyPlayer(event.target)) return;
            if (cancelled) {
              if (typeof event.target.destroy === "function") event.target.destroy();
              return;
            }
            playerRef.current = event.target;
            isReadyRef.current = true;
            forceAutoplay(event.target);
            const savedState = playbackStateRef.current;
            if (savedState) {
              applyPlaybackState(event.target, savedState);
            }
          },
          onStateChange: (event: YTPlayerEvent) => {
            if (isApplyingRemoteRef.current) return;
            if (!isReadyPlayer(event.target)) return;

            const state = event.data;
            if (state === YT_BUFFERING) return;
            if (state !== YT_PLAYING && state !== YT_PAUSED) return;

            if (waitingForBufferExitRef.current) {
              waitingForBufferExitRef.current = false;
            }

            const now = Date.now();
            const currentTime = event.target.getCurrentTime();
            const previous = lastKnownRef.current;
            const expectedTime = previous.state === YT_PLAYING
              ? previous.time + (now - previous.at) / 1000
              : previous.time;
            const didSeek = Math.abs(currentTime - expectedTime) > SEEK_DETECTION_SECONDS;

            lastKnownRef.current = { time: currentTime, at: now, state };

            if (didSeek) {
              event.target.seekTo(currentTime, true);
              onPlaybackCommandRef.current?.("seek", currentTime);
              return;
            }

            onPlaybackCommandRef.current?.(state === YT_PLAYING ? "play" : "pause", currentTime);
          },
        },
      });
    };

    if (window.YT?.Player) {
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
      cancelled = true;
      clearAutoplayTimers();
      if (isReadyPlayer(playerRef.current) && typeof playerRef.current.destroy === "function") {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore stale iframe cleanup failures
        }
      }
      playerRef.current = null;
      isReadyRef.current = false;
    };
  }, [applyPlaybackState, clearAutoplayTimers, forceAutoplay]);

  useEffect(() => {
    const player = playerRef.current;
    if (!playbackState || !isReadyPlayer(player) || !isReadyRef.current) return;
    applyPlaybackState(player, playbackState);
  }, [applyPlaybackState, playbackState]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      const state = playbackStateRef.current;
      if (!isReadyPlayer(player) || !state?.isPlaying || isApplyingRemoteRef.current) return;

      const playerState = player.getPlayerState();
      if (playerState === YT_BUFFERING) return;

      const now = Date.now();
      if (now - lastCorrectionAtRef.current < DRIFT_CORRECTION_COOLDOWN_MS) return;

      const correctedTime = state.position + Math.max(0, (now - state.updatedAtMs) / 1000);
      const drift = Math.abs(player.getCurrentTime() - correctedTime);
      if (drift > DRIFT_SEEK_SECONDS) {
        lastCorrectionAtRef.current = now;
        player.seekTo(correctedTime, true);
      }
    }, DRIFT_CHECK_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={containerRef} className="h-full w-full min-h-[360px]" style={{ width: "100%", height: "100%", minHeight: "360px" }} />
    </div>
  );
}

export default memo(YouTubePlayer);
