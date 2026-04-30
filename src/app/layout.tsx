import type { Metadata } from "next";
import "./globals.css";
import { DevHostRedirect } from "@/components/DevHostRedirect";

export const metadata: Metadata = {
  title: "VibeCheck — whose music taste is actually better?",
  description: "Battle playlists. AI scores. Friends vote. One winner."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <DevHostRedirect />
        <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
