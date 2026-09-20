"use client";

import React, { useEffect, useRef, useCallback } from "react";

interface YouTubePlayerProps {
  videoId: string;
  isHost?: boolean;
  onStateSync?: (state: number, currentTime: number) => void;
  syncState?: { state: number; currentTime: number; timestamp: number } | null;
}

interface YTPlayerInstance {
  destroy: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
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

export default function YouTubePlayer({
  videoId,
  onStateSync,
  syncState,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const isSyncingRef = useRef<boolean>(false);
  const lastStateRef = useRef<number>(-1);

  // Helper to extract clean YouTube Video ID
  const parseVideoId = useCallback((rawId: string) => {
    if (!rawId) return "";
    if (rawId.length === 11 && !rawId.includes("/")) return rawId;
    const match = rawId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    return match ? match[1] : rawId;
  }, []);

  const activeVideoId = parseVideoId(videoId);

  // Load YouTube IFrame API Script if not present
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initPlayer = () => {
      if (!containerRef.current || !activeVideoId) return;

      // Clean old player instance
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
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: YTPlayerEvent) => {
            event.target.playVideo();
          },
          onStateChange: (event: YTPlayerEvent) => {
            if (isSyncingRef.current) return;
            const currentState = event.data; // 1: PLAYING, 2: PAUSED
            const currentTime = event.target.getCurrentTime ? event.target.getCurrentTime() : 0;

            if (currentState === 1 || currentState === 2) {
              if (lastStateRef.current !== currentState) {
                lastStateRef.current = currentState;
                if (onStateSync) {
                  onStateSync(currentState, currentTime);
                }
              }
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

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
  }, [activeVideoId, onStateSync]);

  // Synchronize playback timestamp & state when remote sync event arrives
  useEffect(() => {
    if (!syncState || !playerRef.current || typeof playerRef.current.getCurrentTime !== "function") {
      return;
    }

    const { state, currentTime } = syncState;
    const localTime = playerRef.current.getCurrentTime();
    const timeDiff = Math.abs(localTime - currentTime);

    isSyncingRef.current = true;

    // Seek if timestamp drift is greater than 1.5 seconds
    if (timeDiff > 1.5) {
      playerRef.current.seekTo(currentTime, true);
    }

    // Synchronize Play/Pause state
    if (state === 1 && playerRef.current.getPlayerState() !== 1) {
      playerRef.current.playVideo();
    } else if (state === 2 && playerRef.current.getPlayerState() !== 2) {
      playerRef.current.pauseVideo();
    }

    setTimeout(() => {
      isSyncingRef.current = false;
    }, 500);
  }, [syncState]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
