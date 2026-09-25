# SyncSpace 🎬✨

**SyncSpace** is a modern, real-time social watch party application built for synchronized video playback, live chat, and multi-party WebRTC video calls with friends.

---

## 🌟 Key Features

- 🎥 **Synchronized YouTube & Video Player**: Real-time video playback synchronization across all room members (play, pause, seek, time-sync) powered by YouTube Data API v3 and Cloud Firestore.
- 🔍 **Embedded YouTube Search & Video Picker**: Integrated search modal within the watch party room allowing users to search videos and start synchronized playback instantly.
- 📹 **WebRTC Video Calls & Camera Grid**: Multi-party WebRTC peer-to-peer audio/video streaming featuring active speaker detection, audio level visualization, and camera controls.
- 💬 **Real-time Live Chat**: Instant messaging in every watch party room powered by Cloud Firestore `onSnapshot` listeners and `BroadcastChannel` cross-tab synchronization.
- 👥 **Room Presence & Member Management**: Heartbeat-based presence engine (`lastSeen`), host badge sorting, direct invite links, and room codes.
- 🔑 **Authentication**: Seamless Firebase Auth with Google OAuth (popup and redirect fallbacks) and Email/Password sign up & login.
- 🎨 **Futuristic UI**: Rich dark glassmorphic design system featuring liquid weather glass cards, vibrant neon gradients, smooth micro-animations, and responsive layout.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Turbopack)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons & Animations**: [Lucide React](https://lucide.dev/), Motion
- **Backend & Realtime Data**: [Firebase Cloud Firestore](https://firebase.google.com/docs/firestore), [Firebase Auth](https://firebase.google.com/docs/auth)
- **Media & Streaming**: YouTube Data API v3, WebRTC (`RTCPeerConnection`)

---

## 📁 Project Structure

```text
syncspace/
├── app/
│   ├── api/
│   │   └── youtube/
│   │       └── search/          # YouTube Data API v3 search proxy route
│   ├── room/
│   │   └── [roomId]/
│   │       └── page.tsx         # Watch Party Room (Media, Chat, WebRTC)
│   ├── welcome/
│   │   └── page.tsx             # Room Creation & Joining Portal
│   ├── globals.css              # Glassmorphic utilities & design system
│   ├── layout.tsx               # Root Layout
│   └── page.tsx                 # Landing Page
├── components/
│   ├── ui/
│   │   ├── liquid-glass-button.tsx
│   │   └── liquid-weather-glass.tsx
│   ├── WebRTCRoomPanel.tsx      # WebRTC Video & Audio Panel
│   ├── YouTubePlayer.tsx        # Synchronized YouTube Player Engine
│   └── YouTubeSearchModal.tsx   # YouTube Search & Video Selector Modal
├── lib/
│   └── firebase.ts              # Firebase Client SDK & Firestore Sync Helpers
└── public/                      # Static assets & icons
```

---

## ⚙️ Environment Setup

Create a `.env.local` file in the root directory:

```env
# Optional: YouTube Data API v3 Key for production YouTube search API
YOUTUBE_API_KEY=your_youtube_api_key_here
```

---

## 🏃 Local Development

1. **Clone the repository and install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```

3. **Open the app**:
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Production Deployment (Vercel & Firebase)

### 1. Firebase Authorized Domains
To enable Google Sign-In and Firestore realtime sync on production:
1. Go to **Firebase Console** -> **Authentication** -> **Settings** -> **Authorized domains**.
2. Click **Add domain** and enter your production domain (e.g., `syncspace-watchparty.vercel.app`).

### 2. Google Cloud OAuth Redirect URIs
1. Go to **Google Cloud Console** -> **Credentials** -> **OAuth 2.0 Client IDs**.
2. Under **Authorized JavaScript origins**, add:
   ```text
   https://syncspace-watchparty.vercel.app
   ```
3. Under **Authorized redirect URIs**, add:
   ```text
   https://syncspace-e14ab.firebaseapp.com/__/auth/handler
   ```

---

## 📄 Scripts

- `npm run dev`: Starts the Next.js development server.
- `npm run build`: Builds the production bundle.
- `npm run start`: Starts the production server.
- `npm run lint`: Runs ESLint checks.

---

Made with ❤️ by the SyncSpace Team.
