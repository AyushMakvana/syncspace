import NextLink from "next/link";
import {
  Gamepad2,
  GitBranch,
  Globe2,
  Link as LinkIcon,
  Mail,
  MessageCircle,
  Mic,
  MonitorUp,
  Music2,
  Play,
  Radio,
  ShieldCheck,
  Smile,
  Sparkles,
  Upload,
  Users,
  Video,
  Zap,
} from "lucide-react";

import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass";
import SplashCursor from "@/components/SplashCursor";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

const navItems = ["Home", "Features", "Rooms", "Team"];

const featureLogos = [
  "YouTube",
  "Upload",
  "HLS",
  "Voice",
  "Chat",
  "Reactions",
  "Private",
  "Public",
  "Redis",
  "WebRTC",
];

const vibeModes = ["Chill", "Action", "Study", "Party"];

const team = [
  "Hardik Mahida",
  "Ayush Makvana",
  "Mahavir Makwana",
  "Manav Makwana",
  "Sujal Maurya",
];

function SectionCard({
  children,
  className = "",
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <LiquidGlassCard
      draggable={false}
      shadowIntensity="xs"
      glowIntensity="none"
      borderRadius="18px"
      className={`scroll-mt-24 overflow-hidden border border-white/18 bg-white/8 text-white ${className}`}
    >
      {children}
    </LiquidGlassCard>
  );
}

function RoomPreview() {
  return (
    <div className="relative h-44 overflow-hidden rounded-xl border border-white/15 bg-[#16042e]/70 shadow-2xl sm:h-52 lg:h-54">
      <div className="flex h-7 items-center gap-2 border-b border-white/10 bg-black/35 px-3 text-[10px] font-semibold text-white/75">
        <span className="grid size-4 place-items-center rounded-full bg-yellow-300 text-[9px] text-[#220038]">S</span>
        <span>syncspace room</span>
        <span className="ml-auto rounded-full bg-fuchsia-400/20 px-2 py-0.5 text-fuchsia-100">Live</span>
      </div>
      <div className="grid h-[calc(100%-1.75rem)] grid-cols-[1fr_84px]">
        <div className="relative flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(255,238,82,0.2),transparent_28%),linear-gradient(135deg,#1d063d,#070311)]">
          <div className="absolute inset-x-5 top-5 h-24 rounded-lg border border-white/15 bg-black/35 shadow-[0_0_35px_rgba(217,70,239,0.35)]" />
          <div className="relative grid size-15 place-items-center rounded-full bg-yellow-300 text-[#240035] shadow-[0_0_28px_rgba(253,224,71,0.45)]">
            <Play className="ml-0.5 size-6 fill-current" />
          </div>
          <div className="absolute bottom-4 flex gap-2">
            {["A", "M", "S"].map((item) => (
              <span key={item} className="grid size-8 place-items-center rounded-full border-2 border-violet-400 bg-cyan-300 text-xs font-black text-[#190025]">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-l border-white/10 bg-black/25 p-2">
          <div className="rounded-lg bg-white/10 p-1.5 text-[9px] leading-tight text-white/80">Invite friends</div>
          <div className="rounded-lg bg-white/10 p-1.5 text-[9px] leading-tight text-white/80">Chat synced to 01:05</div>
          <div className="mt-auto flex gap-1">
            <Mic className="size-5 rounded bg-white/10 p-1" />
            <Video className="size-5 rounded bg-white/10 p-1" />
            <Smile className="size-5 rounded bg-white/10 p-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="relative min-h-svh overflow-x-hidden bg-black text-white">
      <div className="fixed inset-0 z-0 bg-black">
        <SplashCursor
          SIM_RESOLUTION={64}
          DYE_RESOLUTION={512}
          PRESSURE_ITERATIONS={8}
          DENSITY_DISSIPATION={3.5}
          VELOCITY_DISSIPATION={2}
          PRESSURE={0.1}
          CURL={3}
          SPLAT_RADIUS={0.2}
          SPLAT_FORCE={6000}
          COLOR_UPDATE_SPEED={10}
          BACK_COLOR={{ r: 0, g: 0, b: 0 }}
          TRANSPARENT={false}
          RAINBOW_MODE
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[72rem] flex-col gap-14 px-5 py-5 sm:px-8 lg:gap-20">
        <SectionCard className="sticky top-3 z-50 px-5 py-3">
          <nav className="flex items-center justify-between gap-4">
            <a href="#home" className="flex items-center gap-2 text-sm font-black tracking-wide text-yellow-200">
              <span className="grid size-8 place-items-center rounded-full border border-white/20 bg-violet-500/35">
                <Sparkles className="size-4 fill-yellow-200 text-yellow-200" />
              </span>
              SyncSpace
            </a>
            <div className="hidden items-center gap-8 text-xs font-semibold text-white/80 md:flex">
              {navItems.map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`} className="transition hover:text-yellow-200">
                  {item}
                </a>
              ))}
            </div>
            <NextLink href="/welcome">
              <LiquidButton variant="gold" size="lg" className="bg-yellow-300/95 px-7 font-black shadow-[0_0_24px_rgba(253,224,71,0.22)]">
                Launch
              </LiquidButton>
            </NextLink>
          </nav>
        </SectionCard>

        <section id="home" className="grid min-h-[calc(100svh-8rem)] scroll-mt-24 items-center gap-5 pt-0 lg:-translate-y-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionCard className="p-7 sm:p-7 lg:p-7">
            <p className="mb-3 inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-100">
              Watch party rooms
            </p>
            <h1 className="max-w-xl text-[3.25rem] font-black leading-[1.02] text-white sm:text-6xl lg:text-[4.35rem]">
              Watch Parties Made <span className="text-yellow-200">Easy</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/78">
              SyncSpace is a browser-based room where friends watch videos together, talk, chat, react, and stay perfectly in sync from one invite link.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <NextLink href="/welcome">
                <LiquidButton variant="gold" size="xl" className="bg-yellow-300/95 px-8 font-black shadow-[0_0_28px_rgba(253,224,71,0.25)]">
                  Launch SyncSpace
                </LiquidButton>
              </NextLink>
              <LiquidButton size="xl" className="border border-white/25 bg-white/10 px-8 font-bold text-white shadow-[0_0_22px_rgba(255,255,255,0.08)]">
                Explore Rooms
              </LiquidButton>
            </div>
          </SectionCard>
          <SectionCard className="p-3 sm:p-4">
            <RoomPreview />
          </SectionCard>
        </section>

        <section id="features" className="grid items-center gap-6 lg:grid-cols-2">
          <SectionCard className="p-4">
            <RoomPreview />
          </SectionCard>
          <SectionCard className="p-7 sm:p-7">
            <h2 className="text-2xl font-black sm:text-3xl">What is SyncSpace?</h2>
            <p className="mt-3 text-sm leading-6 text-white/75">
              SyncSpace is a free watch party platform for movie nights, game streams, music sessions, study rooms, and virtual hangouts. It brings synchronized video, live chat, emoji reactions, and voice or video calls into one shared room.
            </p>
          </SectionCard>
        </section>

        <section className="grid items-center gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionCard className="p-4">
            <div className="grid h-52 grid-cols-3 gap-2.5 rounded-xl bg-black/25 p-3">
              {[Play, MessageCircle, Users, Upload, LinkIcon, Smile].map((Icon, index) => (
                <div key={index} className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 text-center text-[11px] font-bold text-white/80">
                  <Icon className="size-6 text-yellow-200" />
                  {index === 0 && "Video"}
                  {index === 1 && "Chat"}
                  {index === 2 && "Friends"}
                  {index === 3 && "Upload"}
                  {index === 4 && "Link"}
                  {index === 5 && "React"}
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard className="p-7 sm:p-7">
            <h2 className="text-3xl font-black leading-tight sm:text-4xl">
              Videos, games, <span className="text-yellow-200">music,</span> and more. All in one place.
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/75">
              Host virtual movie nights with YouTube, uploaded videos, HLS streams, music, and online content. No juggling between Discord, WhatsApp, and separate video tabs.
            </p>
          </SectionCard>
        </section>

        <section className="grid items-center gap-6 lg:grid-cols-2">
          <SectionCard className="p-7 sm:p-7">
            <h2 className="text-2xl font-black sm:text-3xl">Free and Easy</h2>
            <p className="mt-3 text-sm leading-6 text-white/75">
              No downloads, no browser extension, and no paid streaming subscription required for the platform itself. Create a room, share a link, and let friends join from the browser.
            </p>
          </SectionCard>
          <SectionCard className="p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {featureLogos.map((item) => (
                <span key={item} className="rounded-full border border-white/15 bg-white/12 px-3 py-2 text-center text-xs font-black text-white/82">
                  {item}
                </span>
              ))}
            </div>
          </SectionCard>
        </section>

        <section className="grid items-center gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionCard className="p-6">
            <div className="relative h-48 rounded-xl border border-white/10 bg-black/35 p-6">
              <div className="absolute left-6 top-6 grid size-18 place-items-center rounded-2xl bg-white/10">
                <MonitorUp className="size-9 text-cyan-200" />
              </div>
              {["Screenshare", "Upload File", "URL"].map((item, index) => (
                <div key={item} className="absolute right-6 flex items-center gap-2 rounded-full border border-white/15 bg-violet-500/35 px-3 py-2 text-xs font-bold" style={{ top: 28 + index * 50 }}>
                  {index === 0 && <MonitorUp className="size-5" />}
                  {index === 1 && <Upload className="size-5" />}
                  {index === 2 && <LinkIcon className="size-5" />}
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard className="p-7 sm:p-7">
            <h2 className="text-2xl font-black sm:text-3xl">Versatile</h2>
            <p className="mt-3 text-sm leading-6 text-white/75">
              Shared browsing, screen sharing, link sharing, file upload, and native room controls are built in. Why juggle multiple apps when everything happens in one SyncSpace room?
            </p>
          </SectionCard>
        </section>

        <section id="rooms" className="grid scroll-mt-24 items-center gap-6 lg:grid-cols-2">
          <SectionCard className="p-7 sm:p-7">
            <h2 className="text-2xl font-black sm:text-3xl">Make it your own</h2>
            <p className="mt-3 text-sm leading-6 text-white/75">
              Rooms can be customized with moods, names, privacy, themes, and host controls. SyncSpace adds a Dynamic Vibe System that shifts the room atmosphere around the content you are watching.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {vibeModes.map((mode) => (
                <span key={mode} className="rounded-full bg-yellow-300/90 px-3 py-1 text-xs font-black text-[#230036]">
                  {mode}
                </span>
              ))}
            </div>
          </SectionCard>
          <SectionCard className="p-4">
            <RoomPreview />
          </SectionCard>
        </section>

        <SectionCard className="p-7 sm:p-7">
          <h2 className="text-center text-2xl font-black sm:text-3xl">
            Watch, play, chat, <span className="text-yellow-200">create.</span>
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: Radio, title: "Synchronized", text: "Play, pause, and seek actions are reflected for everyone in the room." },
              { icon: MessageCircle, title: "Chat Live", text: "Messages and reactions stay beside the video instead of another app." },
              { icon: ShieldCheck, title: "Room Control", text: "Public or private rooms with host controls, locks, and invite links." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-white/12 bg-white/9 p-5 text-center">
                <Icon className="mx-auto size-8 text-yellow-200" />
                <h3 className="mt-4 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/70">{text}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard className="p-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">Powered by</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {["Next.js", "React", "Tailwind", "Socket.io", "WebRTC", "Supabase", "Redis"].map((item) => (
              <span key={item} className="rounded-md bg-white/85 px-4 py-2 text-xs font-black text-[#260040]">
                {item}
              </span>
            ))}
          </div>
        </SectionCard>

        <SectionCard className="p-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">Highlights</p>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              { icon: Zap, label: "200ms sync target" },
              { icon: Globe2, label: "Public rooms" },
              { icon: Gamepad2, label: "Game nights" },
              { icon: Music2, label: "Music sessions" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="rounded-xl bg-white/10 p-4 text-sm font-bold text-white/80">
                <Icon className="mx-auto mb-3 size-6 text-cyan-200" />
                {label}
              </div>
            ))}
          </div>
        </SectionCard>

        <section id="team">
          <SectionCard className="p-7 sm:p-7">
            <h2 className="text-center text-3xl font-black">Team</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {team.map((member, index) => (
                <div key={member} className="rounded-2xl border border-white/10 bg-white/10 p-5 text-center">
                  <div className="mx-auto grid size-16 place-items-center rounded-full border-2 border-yellow-200 bg-[linear-gradient(135deg,#22d3ee,#f0abfc,#fde047)] text-xl font-black text-[#21002f]">
                    {member.split(" ").map((part) => part[0]).join("")}
                  </div>
                  <h3 className="mt-4 text-sm font-black">{member}</h3>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Developer {index + 1}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </section>

        <section id="contact" className="scroll-mt-24">
          <SectionCard className="p-7 text-center sm:p-7">
            <h2 className="text-2xl font-black sm:text-3xl">Contact</h2>
            <div className="mt-6 flex flex-col items-center gap-3 text-sm text-white/76">
              <p className="inline-flex items-center gap-2"><Mail className="size-4 text-yellow-200" /> 24dce062@charusat.edu.in</p>
              <p className="inline-flex items-center gap-2"><GitBranch className="size-4 text-yellow-200" /> SyncSpace project repository</p>
              <p>CHARUSAT SGP 5th Semester Project</p>
            </div>
          </SectionCard>
        </section>

        <footer className="pb-10 text-center text-xs text-white/45">
          <div className="flex flex-wrap justify-center gap-5">
            <a href="#home">Home</a>
            <a href="#features">Features</a>
            <a href="#team">Team</a>
            <a href="#contact">Contact</a>
          </div>
          <p className="mt-5">SyncSpace - Real-time collaborative watch party platform</p>
        </footer>
      </div>
    </main>
  );
}
