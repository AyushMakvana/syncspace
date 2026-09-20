"use client";

import React, { useState } from "react";
import { Search, X, Play, Globe } from "lucide-react";
import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

interface YouTubeVideoItem {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
}

interface YouTubeApiItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      high?: { url: string };
      default?: { url: string };
    };
  };
}

const SAMPLE_YOUTUBE_VIDEOS: YouTubeVideoItem[] = [
  {
    id: "LembwKOiWBY",
    title: "Interstellar 10th Anniversary Cinematic Trailer 4K",
    channel: "Warner Bros. Pictures",
    thumbnail: "https://img.youtube.com/vi/LembwKOiWBY/hqdefault.jpg",
  },
  {
    id: "b9EkMc79ZSU",
    title: "Cyberpunk 2077 — Official Synthwave Music Stream",
    channel: "CD PROJEKT RED",
    thumbnail: "https://img.youtube.com/vi/b9EkMc79ZSU/hqdefault.jpg",
  },
  {
    id: "jfKfPfyJRdk",
    title: "Lofi Hip Hop Radio — Beats to Relax/Study to",
    channel: "Lofi Girl",
    thumbnail: "https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg",
  },
  {
    id: "dQw4w9WgXcQ",
    title: "Rick Astley — Never Gonna Give You Up (Official Music Video)",
    channel: "Rick Astley",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  },
  {
    id: "tom6c-S5XM4",
    title: "Dune: Part Two — Official Main Trailer 4K",
    channel: "Warner Bros. Pictures",
    thumbnail: "https://img.youtube.com/vi/tom6c-S5XM4/hqdefault.jpg",
  },
  {
    id: "8g18jFHCLXk",
    title: "Daft Punk — Tron Legacy Full OST Mix",
    channel: "Disney Music",
    thumbnail: "https://img.youtube.com/vi/8g18jFHCLXk/hqdefault.jpg",
  },
];

interface YouTubeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVideo: (videoId: string, fullUrl: string, title?: string) => void;
}

export default function YouTubeSearchModal({
  isOpen,
  onClose,
  onSelectVideo,
}: YouTubeSearchModalProps) {
  const [activeTab, setActiveTab] = useState<"menu" | "youtube" | "url">("menu");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<YouTubeVideoItem[]>(SAMPLE_YOUTUBE_VIDEOS);
  const [isSearching, setIsSearching] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState("");

  if (!isOpen) return null;

  // Search YouTube Data API v3 or filter fallback videos
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

    if (apiKey) {
      setIsSearching(true);
      try {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=8&q=${encodeURIComponent(
            searchQuery.trim()
          )}&type=video&key=${apiKey}`
        );
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          const formatted: YouTubeVideoItem[] = data.items.map((item: YouTubeApiItem) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || "",
          }));
          setSearchResults(formatted);
        }
      } catch (err) {
        console.error("YouTube Data API Search error:", err);
      } finally {
        setIsSearching(false);
      }
    } else {
      // Local fallback filter search
      const q = searchQuery.toLowerCase().trim();
      const filtered = SAMPLE_YOUTUBE_VIDEOS.filter(
        (v) => v.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q)
      );
      setSearchResults(filtered.length > 0 ? filtered : SAMPLE_YOUTUBE_VIDEOS);
    }
  };

  // Extract Video ID from URL
  const extractVideoId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    return match ? match[1] : url.trim();
  };

  const handleCustomUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrlInput.trim()) return;
    const vId = extractVideoId(customUrlInput);
    onSelectVideo(vId, `https://www.youtube.com/watch?v=${vId}`, "Custom YouTube video");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <LiquidGlassCard
        draggable={false}
        shadowIntensity="xs"
        glowIntensity="none"
        borderRadius="24px"
        className="relative w-full max-w-5xl overflow-hidden border border-white/20 bg-[#120424]/95 p-6 text-white shadow-2xl backdrop-blur-2xl"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white/70 transition hover:bg-white/20 hover:text-white"
        >
          <X className="size-5" />
        </button>

        {/* Modal Navigation Tabs */}
        {activeTab === "menu" ? (
          <div>
            <div className="text-center">
              <h2 className="text-2xl font-black text-white">Select Media</h2>
              <p className="mt-1 text-xs font-medium text-white/70">
                Choose a platform or paste a video link to watch in sync with friends
              </p>
            </div>

            {/* Platform Selection Cards (Matches User Screenshot 3) */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* YouTube Option Card (Exact white card with YouTube Logo from Screenshot 3) */}
              <button
                type="button"
                onClick={() => setActiveTab("youtube")}
                className="group flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-white p-6 shadow-xl transition hover:shadow-2xl"
              >
                {/* YouTube Red Play Logo Container */}
                <div className="flex items-center justify-center gap-2">
                  <div className="grid h-10 w-14 place-items-center rounded-xl bg-red-600 shadow-md transition group-hover:bg-red-500">
                    <Play className="size-6 fill-white text-white ml-0.5" />
                  </div>
                  <span className="text-2xl font-black tracking-tighter text-black font-sans">
                    YouTube
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold text-gray-700">
                  Search & Watch YouTube Videos in Sync
                </p>
              </button>

              {/* Custom Direct URL Option Card */}
              <button
                type="button"
                onClick={() => setActiveTab("url")}
                className="group flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-purple-900/60 to-indigo-900/60 p-6 shadow-xl transition hover:border-yellow-300/60"
              >
                <div className="mb-2 grid size-12 place-items-center rounded-2xl border border-yellow-300/40 bg-yellow-400/20 text-yellow-300 shadow-md">
                  <Globe className="size-6" />
                </div>
                <span className="text-base font-black text-white">Paste Direct Video URL</span>
                <p className="mt-1 text-center text-xs font-medium text-white/60">
                  Paste YouTube link, MP4 URL, or Shorts
                </p>
              </button>
            </div>
          </div>
        ) : activeTab === "youtube" ? (
          <div>
            {/* Header & Back Button */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("menu")}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white transition hover:bg-white/20"
                >
                  ← Back
                </button>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span className="grid h-6 w-8 place-items-center rounded bg-red-600">
                    <Play className="size-3.5 fill-white text-white" />
                  </span>
                  YouTube Data Search
                </h3>
              </div>
            </div>

            {/* YouTube Search Input */}
            <form onSubmit={handleSearchSubmit} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3.5 size-4 text-white/50" />
                <input
                  type="text"
                  placeholder="Search YouTube videos, movie trailers, music..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-black/60 py-3 pl-10 pr-4 text-xs text-white placeholder-white/40 outline-none focus:border-yellow-300"
                />
              </div>
              <LiquidButton
                variant="gold"
                size="lg"
                type="submit"
                className="bg-yellow-300 px-5 text-xs font-black text-black"
              >
                {isSearching ? "Searching..." : "Search"}
              </LiquidButton>
            </form>

            {/* Results Grid with Mouse Wheel Scroll */}
            <div
              onWheel={(e) => {
                e.stopPropagation();
                e.currentTarget.scrollTop += e.deltaY;
              }}
              className="mt-4 grid max-h-[520px] grid-cols-1 gap-4 overflow-y-auto pr-2 md:grid-cols-2"
            >
              {searchResults.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectVideo(item.id, `https://www.youtube.com/watch?v=${item.id}`, item.title);
                    onClose();
                  }}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0f] transition hover:border-yellow-300/60 hover:bg-white/10"
                >
                  <div className="flex flex-col overflow-hidden">
                    <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="h-full w-full object-cover transition"
                      />
                      <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                        <Play className="size-6 fill-white text-white" />
                      </div>
                    </div>
                    <div className="overflow-hidden p-3">
                      <p className="truncate text-xs font-bold text-white group-hover:text-yellow-200">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-white/50">
                        {item.channel}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mx-3 mb-3 shrink-0 rounded-lg border border-yellow-300/50 bg-yellow-300/90 px-3 py-1.5 text-[11px] font-black text-black transition group-hover:bg-yellow-200"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Direct URL Input Tab */
          <div>
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <button
                type="button"
                onClick={() => setActiveTab("menu")}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white transition hover:bg-white/20"
              >
                ← Back
              </button>
              <h3 className="text-lg font-black text-white">Paste Direct Video Link</h3>
            </div>

            <form onSubmit={handleCustomUrlSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold text-white/80">
                  YouTube Video or Shorts URL
                </label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-3.5 size-4 text-yellow-300" />
                  <input
                    type="url"
                    required
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-black/60 py-3 pl-10 pr-4 text-xs text-white placeholder-white/40 outline-none focus:border-yellow-300"
                  />
                </div>
              </div>

              <LiquidButton
                variant="gold"
                size="xl"
                type="submit"
                className="w-full bg-yellow-300 font-black text-black shadow-lg"
              >
                Play Synchronized Video
              </LiquidButton>
            </form>
          </div>
        )}
      </LiquidGlassCard>
    </div>
  );
}

