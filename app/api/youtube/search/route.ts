import { NextResponse } from "next/server";

interface YouTubeVideoResult {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";

  if (!query.trim()) {
    return NextResponse.json({ items: [], error: null });
  }

  const apiKey = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

  // 1. Try Official YouTube Data API v3 if API key is provided
  if (apiKey) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=12&q=${encodeURIComponent(
          query.trim()
        )}&type=video&key=${apiKey}`
      );
      const data = await res.json();

      if (data.items && Array.isArray(data.items)) {
        const formatted: YouTubeVideoResult[] = data.items
          .filter((item: { id?: { videoId?: string } }) => item.id && item.id.videoId)
          .map((item: {
            id: { videoId: string };
            snippet: {
              title: string;
              channelTitle: string;
              thumbnails: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
            };
          }) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumbnail:
              item.snippet.thumbnails.high?.url ||
              item.snippet.thumbnails.medium?.url ||
              item.snippet.thumbnails.default?.url ||
              `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`,
          }));

        return NextResponse.json({ items: formatted, source: "official-api", error: null });
      }

      if (data.error && data.error.message) {
        console.warn("YouTube Data API Error:", data.error.message);
      }
    } catch (err) {
      console.error("YouTube Official API fetch error:", err);
    }
  }

  // 2. Public Fallback Engine for Real Query Search Results (when no API key configured)
  try {
    const fallbackRes = await fetch(
      `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query.trim())}&filter=all`
    );
    if (fallbackRes.ok) {
      const data = await fallbackRes.json();
      const itemsList = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      const videoItems = itemsList
        .filter((item: { url?: string; title?: string }) => item.url && item.url.includes("/watch?v=") && item.title)
        .slice(0, 10)
        .map((item: { url: string; title: string; uploaderName?: string; thumbnail?: string }) => {
          const vId = item.url.split("/watch?v=")[1]?.split("&")[0] || "";
          return {
            id: vId,
            title: item.title,
            channel: item.uploaderName || "YouTube",
            thumbnail: item.thumbnail || `https://img.youtube.com/vi/${vId}/hqdefault.jpg`,
          };
        })
        .filter((item: { id: string }) => Boolean(item.id));

      if (videoItems.length > 0) {
        return NextResponse.json({ items: videoItems, source: "public-search", error: null });
      }
    }
  } catch {
    // ignore fallback error
  }

  // 3. Alternative Public Invidious API Fallback
  try {
    const invidiousRes = await fetch(
      `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(query.trim())}&type=video`
    );
    if (invidiousRes.ok) {
      const data = await invidiousRes.json();
      if (Array.isArray(data)) {
        const videoItems: YouTubeVideoResult[] = data
          .slice(0, 10)
          .map((item: { videoId: string; title: string; author?: string; videoThumbnails?: { url: string }[] }) => ({
            id: item.videoId,
            title: item.title,
            channel: item.author || "YouTube Channel",
            thumbnail: item.videoThumbnails?.[0]?.url || `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`,
          }))
          .filter((item) => Boolean(item.id && item.title));

        if (videoItems.length > 0) {
          return NextResponse.json({ items: videoItems, source: "invidious-api", error: null });
        }
      }
    }
  } catch {
    // ignore
  }

  // 4. Return helpful error if no key and search failed
  return NextResponse.json({
    items: [],
    source: "none",
    error: apiKey ? "Unable to fetch search results from YouTube API." : "No YOUTUBE_API_KEY configured in .env.local and public fallback search unavailable.",
  });
}
