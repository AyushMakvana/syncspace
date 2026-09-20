import type { Metadata } from "next";
import "./globals.css";
import "lenis/dist/lenis.css";
import { LenisProvider } from "@/components/lenis-provider";

export const metadata: Metadata = {
  title: "SyncSpace",
  description: "Real-time watch party rooms for synchronized YouTube, chat, and friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <LenisProvider />
        {children}
      </body>
    </html>
  );
}

