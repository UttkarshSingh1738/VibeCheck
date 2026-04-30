"use client";

import { useEffect, useRef } from "react";

/**
 * One-shot document navigation: localhost → 127.0.0.1 so Auth.js cookies stay on Spotify's redirect host.
 * Runs only for App Router pages (layout-mounted). Does not touch `/api/*` paths — avoids fighting Auth routes.
 * Middleware must NOT host-swap `/api/auth/*` or `_next/*` (parallel sub-requests ping-pong hosts).
 */
export function DevHostRedirect() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined") return;
    if (window.location.hostname !== "localhost") return;
    if (window.location.pathname.startsWith("/api")) return;

    done.current = true;
    const port = window.location.port || "3000";
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`http://127.0.0.1:${port}${path}`);
  }, []);

  return null;
}
