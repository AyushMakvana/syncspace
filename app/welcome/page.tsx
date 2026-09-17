"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  X,
  ChevronLeft,
  Mail,
  Lock,
  User,
  Globe,
  LogOut,
  Compass,
  Settings,
} from "lucide-react";

import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass";
import SplashCursor from "@/components/SplashCursor";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { signInWithGooglePopup, signInWithEmail, signUpWithEmail, resolveRoomCode } from "@/lib/firebase";

type ModalState = "none" | "create-room" | "join-room" | "login" | "signup";

export default function WelcomePage() {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<ModalState>("none");

  // Temporary Login / User Profile State
  const [userProfile, setUserProfile] = useState<{
    name: string;
    email: string;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    const savedUser = localStorage.getItem("syncspace_current_user");
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => userProfile !== null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Form states
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [dobMonth, setDobMonth] = useState("Month");
  const [dobDay, setDobDay] = useState("Day");
  const [dobYear, setDobYear] = useState("Year");

  const [joinRoomCode, setJoinRoomCode] = useState("");

  const closeModal = () => setActiveModal("none");

  // Helper to create and enter user room
  const enterRoom = (userName?: string) => {
    const rawName = userName || userProfile?.name || loginIdentifier.split("@")[0] || "ayushmakvan";
    const slug = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Generate fresh room ID for new room creation to guarantee clean chat
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const roomSlug = `${slug || "ayushmakvan"}-${randomId}-room`;

    if (typeof window !== "undefined") {
      localStorage.setItem("syncspace_current_user", JSON.stringify({ name: rawName, email: userProfile?.email || `${slug}@syncspace.app` }));
      localStorage.setItem(`syncspace_host_${roomSlug}`, rawName);
      // Ensure new room starts with fresh chat history
      localStorage.removeItem(`syncspace_chat_messages_${roomSlug}`);
    }

    router.push(`/room/${roomSlug}`);
  };

  // Click handler for Create Room button
  const handleCreateRoomClick = () => {
    if (isLoggedIn) {
      enterRoom();
    } else {
      setActiveModal("create-room");
    }
  };

  // Real Firebase Email/Password login handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = loginIdentifier.includes("@") ? loginIdentifier : `${loginIdentifier}@syncspace.app`;
    const { user, error } = await signInWithEmail(email, loginPassword);
    if (user) {
      setUserProfile(user);
      setIsLoggedIn(true);
      closeModal();
      enterRoom(user.name);
    } else if (error) {
      // If user doesn't exist yet, auto create / sign up with provided credentials
      const fallbackName = loginIdentifier.split("@")[0];
      const { user: newUser, error: signUpErr } = await signUpWithEmail(email, loginPassword, fallbackName);
      if (newUser) {
        setUserProfile(newUser);
        setIsLoggedIn(true);
        closeModal();
        enterRoom(newUser.name);
      } else {
        alert(signUpErr || "Authentication error. Please check your credentials.");
      }
    }
  };

  // Real Firebase Email/Password sign up handler
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signUpPassword !== signUpConfirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    const name = signUpName || "New User";
    const { user, error } = await signUpWithEmail(signUpEmail, signUpPassword, name);
    if (user) {
      setUserProfile(user);
      setIsLoggedIn(true);
      closeModal();
      enterRoom(user.name);
    } else if (error) {
      alert(error || "Sign up error. Please check your credentials.");
    }
  };



  // Real Firebase Google Login Handler
  const handleGoogleLogin = async () => {
    const { user, error } = await signInWithGooglePopup();
    if (user) {
      setUserProfile(user);
      setIsLoggedIn(true);
      closeModal();
      enterRoom(user.name);
    } else if (error) {
      console.error("Firebase Google Auth Error:", error);
    }
  };

  // Log out function
  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserProfile(null);
    setShowProfileMenu(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem("syncspace_current_user");
    }
  };

  // Join Room Submit Handler (Resolves Code or URL directly across any browser)
  const handleJoinRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = joinRoomCode.trim();
    if (!rawInput) {
      alert("Please enter a room code or link!");
      return;
    }

    if (!isLoggedIn) {
      setActiveModal("create-room");
      return;
    }

    const targetRoom = await resolveRoomCode(rawInput);

    closeModal();
    router.push(`/room/${targetRoom}`);
  };

  return (
    <main className="relative min-h-svh overflow-x-hidden bg-black text-white">
      {/* Interactive WebGL SplashCursor Background */}
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

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-[72rem] flex-col justify-between px-5 py-5 sm:px-8">
        {/* Header Bar */}
        <LiquidGlassCard
          draggable={false}
          shadowIntensity="xs"
          glowIntensity="none"
          borderRadius="18px"
          className="sticky top-3 z-40 border border-white/18 bg-white/8 px-5 py-3 text-white backdrop-blur-md"
        >
          <header className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-black tracking-wide text-yellow-200"
            >
              <span className="grid size-8 place-items-center rounded-full border border-white/20 bg-violet-500/35">
                <Sparkles className="size-4 fill-yellow-200 text-yellow-200" />
              </span>
              SyncSpace
            </Link>

            {/* Auth Buttons vs Logged-In Profile Avatar */}
            {!isLoggedIn ? (
              <div className="flex items-center gap-3">
                <LiquidButton
                  onClick={() => setActiveModal("login")}
                  size="lg"
                  className="border border-white/20 bg-white/10 text-xs font-bold text-white shadow-md hover:bg-white/20"
                >
                  Log in
                </LiquidButton>
                <LiquidButton
                  onClick={() => setActiveModal("signup")}
                  variant="gold"
                  size="lg"
                  className="bg-yellow-300/95 text-xs font-black text-[#240035] shadow-[0_0_24px_rgba(253,224,71,0.22)]"
                >
                  Sign up
                </LiquidButton>
              </div>
            ) : (
              <div className="relative">
                {/* Profile Logo Avatar */}
                <button
                  onClick={() => setShowProfileMenu((prev) => !prev)}
                  className="group relative flex items-center justify-center p-0.5 transition hover:scale-105"
                >
                  <div className="grid size-10 place-items-center overflow-hidden rounded-full border-2 border-yellow-200/80 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-400 via-blue-600 to-indigo-900 shadow-[0_0_16px_rgba(253,224,71,0.35)]">
                    <span className="text-base font-black text-white drop-shadow-md">
                      {userProfile?.name?.charAt(0).toUpperCase() || "A"}
                    </span>
                  </div>
                </button>

                {/* Profile Dropdown Menu matching screenshot */}
                {showProfileMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-[998]"
                      onClick={() => setShowProfileMenu(false)}
                    />
                    <div className="absolute right-0 top-13 z-[999] w-52 overflow-hidden rounded-2xl border border-white/20 bg-white/12 p-2.5 text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center gap-2.5 border-b border-white/15 p-2">
                        <div className="grid size-7 shrink-0 place-items-center rounded-full border border-yellow-300/80 bg-gradient-to-tr from-cyan-400 via-blue-600 to-indigo-900 text-xs font-black text-white shadow-sm">
                          {userProfile?.name?.charAt(0).toUpperCase() || "A"}
                        </div>
                        <div className="overflow-hidden">
                          <p className="truncate text-xs font-black text-yellow-200">
                            {userProfile?.name}
                          </p>
                          <p className="truncate text-[10px] text-white/60">
                            {userProfile?.email}
                          </p>
                        </div>
                      </div>

                      <div className="mt-1.5 space-y-1">
                        <button
                          onClick={() => setShowProfileMenu(false)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/15 hover:text-white"
                        >
                          <User className="size-4 text-white" />
                          <span>Account</span>
                        </button>

                        <button
                          onClick={() => setShowProfileMenu(false)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/15 hover:text-white"
                        >
                          <Settings className="size-4 text-white" />
                          <span>Settings</span>
                        </button>

                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-red-500/25 hover:text-red-300"
                        >
                          <LogOut className="size-4 text-white" />
                          <span>Log out</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </header>
        </LiquidGlassCard>

        {/* Central Welcome Hero */}
        <div className="my-auto flex flex-col items-center justify-center text-center">
          {/* Logo Badge Icon */}
          <div className="mb-6 grid size-20 place-items-center rounded-full border border-white/20 bg-white/10 shadow-[0_0_40px_rgba(253,224,71,0.25)] backdrop-blur-md">
            <Globe className="size-10 text-yellow-200" />
          </div>

          <h1 className="text-3xl font-black text-white sm:text-5xl">
            Welcome to SyncSpace
          </h1>
          <p className="mt-3 max-w-md text-sm font-medium text-white/75 sm:text-base">
            The place to hang out with friends and colleagues.
          </p>

          {/* Action Buttons: Create Room & Join Room (Side-by-Side Horizontal Row) */}
          <div className="mt-8 flex flex-row flex-wrap items-center justify-center gap-4">
            {/* Click here to create a room */}
            <LiquidButton
              onClick={handleCreateRoomClick}
              variant="gold"
              size="xxl"
              className="bg-yellow-300/95 px-9 text-sm font-black text-[#240035] shadow-[0_0_35px_rgba(253,224,71,0.35)] sm:text-base"
            >
              Click here to create a room
            </LiquidButton>

            {/* Join a room button (Available with or without login) */}
            <LiquidButton
              onClick={() => setActiveModal("join-room")}
              size="xxl"
              className="border border-white/25 bg-white/10 px-9 text-sm font-bold text-white shadow-[0_0_24px_rgba(255,255,255,0.1)] hover:bg-white/20 sm:text-base"
            >
              <Compass className="mr-2 size-5 text-cyan-200" />
              Join a room
            </LiquidButton>
          </div>

          {/* Secondary Lobby Section */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <span className="text-xs font-medium text-white/60">
              No friends online?
            </span>
            <LiquidButton
              size="lg"
              className="border border-white/20 bg-white/10 px-6 text-xs font-bold text-white shadow-md hover:bg-white/20"
            >
              Explore lobby
            </LiquidButton>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-4 text-center text-xs text-white/45">
          <div className="flex justify-center gap-6">
            <a href="#" className="transition hover:text-white/80">
              Terms & Conditions
            </a>
            <a href="#" className="transition hover:text-white/80">
              Privacy Policy
            </a>
          </div>
        </footer>
      </div>

      {/* Modal Dialog Backdrop */}
      {activeModal !== "none" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          {/* Create Room Modal */}
          {activeModal === "create-room" && (
            <LiquidGlassCard
              draggable={false}
              shadowIntensity="xs"
              glowIntensity="none"
              borderRadius="24px"
              className="relative w-full max-w-md overflow-hidden border border-white/18 bg-white/8 p-7 text-white shadow-2xl backdrop-blur-xl"
            >
              {/* Close Button */}
              <button
                onClick={closeModal}
                className="absolute right-5 top-5 rounded-full bg-white/10 p-1.5 text-white/70 transition hover:bg-white/20 hover:text-white"
              >
                <X className="size-5" />
              </button>

              <div className="text-center">
                <h2 className="text-2xl font-black text-white">Create Room</h2>
                <p className="mt-1 text-xs font-medium text-white/70">
                  Set up your room and invite friends
                </p>
                <p className="mt-4 text-xs leading-relaxed text-white/60">
                  Creating a room requires an account. But don&apos;t worry,{" "}
                  <span className="font-bold text-yellow-200">it&apos;s free</span>,
                  and your friends can join your room without signing up.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col gap-3">
                <LiquidButton
                  onClick={handleGoogleLogin}
                  size="xl"
                  className="w-full border border-white/25 bg-white/95 text-xs font-bold text-black shadow-md hover:bg-white"
                >
                  <svg className="size-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.27v3.15C3.25 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.39l4.01-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.61l4.01 3.15c.95-2.85 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </LiquidButton>

                <LiquidButton
                  onClick={() => setActiveModal("login")}
                  size="xl"
                  className="w-full border border-white/25 bg-white/10 text-xs font-bold text-white shadow-md hover:bg-white/20"
                >
                  <Mail className="size-5 shrink-0 text-yellow-200" />
                  <span>Continue with Email</span>
                </LiquidButton>
              </div>

              <div className="mt-6 text-center text-xs text-white/50">
                <a href="#" className="hover:underline">
                  Terms & Conditions
                </a>{" "}
                •{" "}
                <a href="#" className="hover:underline">
                  Privacy Policy
                </a>
              </div>
            </LiquidGlassCard>
          )}

          {/* Join Room Modal */}
          {activeModal === "join-room" && (
            <LiquidGlassCard
              draggable={false}
              shadowIntensity="xs"
              glowIntensity="none"
              borderRadius="24px"
              className="relative w-full max-w-md overflow-hidden border border-white/18 bg-white/8 p-7 text-white shadow-2xl backdrop-blur-xl"
            >
              {/* Close Button */}
              <button
                onClick={closeModal}
                className="absolute right-5 top-5 rounded-full bg-white/10 p-1.5 text-white/70 transition hover:bg-white/20 hover:text-white"
              >
                <X className="size-5" />
              </button>

              <div className="text-center">
                <h2 className="text-2xl font-black text-white">Join a Room</h2>
                <p className="mt-1 text-xs font-medium text-white/70">
                  Enter the Room Code or Invite Link below to join your friends
                </p>
              </div>

              <form onSubmit={handleJoinRoomSubmit} className="mt-6 flex flex-col gap-4">
                <div className="relative">
                  <Compass className="absolute left-3.5 top-3.5 size-4 text-cyan-200" />
                  <input
                    type="text"
                    required
                    placeholder="Enter Room Code (e.g. SYNC-7892) or Full Link"
                    value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/40 py-3 pl-10 pr-4 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                  />
                </div>

                <LiquidButton
                  type="submit"
                  variant="gold"
                  size="xl"
                  className="w-full justify-center bg-yellow-300/95 font-black text-[#220038] shadow-[0_0_24px_rgba(253,224,71,0.25)]"
                >
                  Join Room
                </LiquidButton>
              </form>

              <div className="mt-6 text-center text-[11px] text-white/40">
                <a href="#" className="hover:underline">
                  Terms & Conditions
                </a>{" "}
                •{" "}
                <a href="#" className="hover:underline">
                  Privacy Policy
                </a>
              </div>
            </LiquidGlassCard>
          )}

          {/* Login Modal */}
          {activeModal === "login" && (
            <LiquidGlassCard
              draggable={false}
              shadowIntensity="xs"
              glowIntensity="none"
              borderRadius="24px"
              className="relative w-full max-w-md overflow-hidden border border-white/18 bg-white/8 p-7 text-white shadow-2xl backdrop-blur-xl"
            >
              {/* Header Navigation */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <button
                  onClick={() => setActiveModal("create-room")}
                  className="flex items-center gap-1 text-xs font-bold text-white/80 transition hover:text-white"
                >
                  <ChevronLeft className="size-4" /> Continue
                </button>
                <h3 className="text-sm font-extrabold text-white">
                  Email Continue
                </h3>
                <button
                  onClick={closeModal}
                  className="rounded-full bg-white/10 p-1 text-white/70 transition hover:bg-white/20 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Login Inputs */}
              <form onSubmit={handleLoginSubmit} className="mt-6 flex flex-col gap-4">
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 size-4 text-white/50" />
                  <input
                    type="text"
                    required
                    placeholder="Username or Email"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/40 py-3 pl-10 pr-4 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 size-4 text-white/50" />
                  <input
                    type="password"
                    required
                    placeholder="Password (any password works)"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/40 py-3 pl-10 pr-4 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                  />
                </div>

                <div className="text-left">
                  <a
                    href="#"
                    className="text-[11px] text-white/60 hover:text-yellow-200"
                  >
                    Forgot your password?
                  </a>
                </div>

                <LiquidButton
                  type="submit"
                  variant="gold"
                  size="xl"
                  className="mt-2 w-full justify-center bg-yellow-300/95 font-black text-[#220038] shadow-[0_0_24px_rgba(253,224,71,0.25)]"
                >
                  Log in & Create Room
                </LiquidButton>
              </form>

              {/* Footer Switch to Signup */}
              <div className="mt-6 text-center text-xs text-white/70">
                Dont have an account?{" "}
                <button
                  onClick={() => setActiveModal("signup")}
                  className="font-bold text-yellow-200 hover:underline"
                >
                  Click here to Sign up!
                </button>
              </div>

              <div className="mt-5 text-center text-[11px] text-white/40">
                <a href="#" className="hover:underline">
                  Terms & Conditions
                </a>{" "}
                •{" "}
                <a href="#" className="hover:underline">
                  Privacy Policy
                </a>
              </div>
            </LiquidGlassCard>
          )}

          {/* Sign Up Modal */}
          {activeModal === "signup" && (
            <LiquidGlassCard
              draggable={false}
              shadowIntensity="xs"
              glowIntensity="none"
              borderRadius="24px"
              className="relative w-full max-w-md overflow-hidden border border-white/18 bg-white/8 p-7 text-white shadow-2xl backdrop-blur-xl"
            >
              {/* Header Navigation */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <button
                  onClick={() => setActiveModal("login")}
                  className="flex items-center gap-1 text-xs font-bold text-white/80 transition hover:text-white"
                >
                  <ChevronLeft className="size-4" /> Continue
                </button>
                <h3 className="text-sm font-extrabold text-white">Sign up</h3>
                <button
                  onClick={closeModal}
                  className="rounded-full bg-white/10 p-1 text-white/70 transition hover:bg-white/20 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Sign Up Inputs */}
              <form onSubmit={handleSignUpSubmit} className="mt-5 flex flex-col gap-3">
                <input
                  type="text"
                  required
                  placeholder="Username"
                  value={signUpName}
                  onChange={(e) => setSignUpName(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                />

                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                />

                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                />

                <input
                  type="password"
                  required
                  placeholder="Password Repeat"
                  value={signUpConfirmPassword}
                  onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-xs text-white placeholder-white/40 shadow-inner outline-none transition focus:border-yellow-200 focus:ring-1 focus:ring-yellow-200"
                />

                {/* Date of Birth Selectors */}
                <div className="mt-1">
                  <label className="block text-[11px] font-semibold text-white/70">
                    Date of birth
                  </label>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <select
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                      className="rounded-xl border border-white/15 bg-black/50 px-2 py-2 text-xs text-white outline-none focus:border-yellow-200"
                    >
                      <option value="Month">Month</option>
                      {[
                        "Jan",
                        "Feb",
                        "Mar",
                        "Apr",
                        "May",
                        "Jun",
                        "Jul",
                        "Aug",
                        "Sep",
                        "Oct",
                        "Nov",
                        "Dec",
                      ].map((m) => (
                        <option key={m} value={m} className="bg-neutral-900">
                          {m}
                        </option>
                      ))}
                    </select>

                    <select
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                      className="rounded-xl border border-white/15 bg-black/50 px-2 py-2 text-xs text-white outline-none focus:border-yellow-200"
                    >
                      <option value="Day">Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d} className="bg-neutral-900">
                          {d}
                        </option>
                      ))}
                    </select>

                    <select
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      className="rounded-xl border border-white/15 bg-black/50 px-2 py-2 text-xs text-white outline-none focus:border-yellow-200"
                    >
                      <option value="Year">Year</option>
                      {Array.from({ length: 50 }, (_, i) => 2010 - i).map(
                        (y) => (
                          <option key={y} value={y} className="bg-neutral-900">
                            {y}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>

                <LiquidButton
                  type="submit"
                  variant="gold"
                  size="xl"
                  className="mt-3 w-full justify-center bg-yellow-300/95 font-black text-[#220038] shadow-[0_0_24px_rgba(253,224,71,0.25)]"
                >
                  Sign up & Create Room
                </LiquidButton>
              </form>

              {/* Footer Switch to Login */}
              <div className="mt-5 text-center text-xs text-white/70">
                Already have an account?{" "}
                <button
                  onClick={() => setActiveModal("login")}
                  className="font-bold text-yellow-200 hover:underline"
                >
                  Click here to Log in!
                </button>
              </div>

              <div className="mt-4 text-center text-[11px] text-white/40">
                <a href="#" className="hover:underline">
                  Terms & Conditions
                </a>{" "}
                •{" "}
                <a href="#" className="hover:underline">
                  Privacy Policy
                </a>
              </div>
            </LiquidGlassCard>
          )}
        </div>
      )}
    </main>
  );
}
