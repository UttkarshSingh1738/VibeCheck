import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { supabaseAdmin } from "./supabase";

const SPOTIFY_SCOPES = [
  "user-read-email",
  "playlist-read-private",
  "playlist-read-collaborative"
].join(" ");

const canonicalSiteUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
if (process.env.NODE_ENV === "production" && canonicalSiteUrl) {
  try {
    const u = new URL(canonicalSiteUrl);
    if (
      u.hostname === "127.0.0.1" ||
      u.hostname === "localhost" ||
      u.hostname === "[::1]"
    ) {
      console.error(
        "[auth] NEXTAUTH_URL / AUTH_URL must be your public HTTPS origin in production (e.g. https://yourdomain.com). " +
          "If it stays on 127.0.0.1, Spotify redirects the browser there after login — not your deployed app."
      );
    }
  } catch {
    /* ignore invalid URL */
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      // Do not use redirectProxyUrl: it enables OAuth `state` + redirect-proxy flows that break
      // when hosts mix. Use NEXTAUTH_URL=http://127.0.0.1:3000, `next dev -H 127.0.0.1`, DevHostRedirect.
      // Must include `url` — passing only `params` replaces the default string `authorization`
      // and breaks OAuth (Auth.js then tries `issuer` discovery, which Spotify has no `issuer` for).
      authorization: {
        url: "https://accounts.spotify.com/authorize",
        params: { scope: SPOTIFY_SCOPES }
      }
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      if (profile && (profile as any).id) {
        token.spotifyId = (profile as any).id;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).spotifyId = token.spotifyId;
      return session;
    },
    async signIn({ profile }) {
      // Upsert the user row on sign-in so we always have a UUID to FK against.
      const sp = profile as any;
      if (!sp?.id) return true;
      try {
        await supabaseAdmin()
          .from("users")
          .upsert(
            {
              spotify_id: sp.id,
              display_name: sp.display_name ?? sp.name ?? null,
              email: sp.email ?? null,
              avatar_url: sp.images?.[0]?.url ?? null
            },
            { onConflict: "spotify_id" }
          );
      } catch (err) {
        console.warn("user upsert failed", err);
      }
      return true;
    }
  }
});

// Helper: load the DB user row (with UUID) for the current session.
export async function getCurrentDbUser() {
  const session = await auth();
  const spotifyId = (session as any)?.spotifyId as string | undefined;
  if (!spotifyId) return null;
  const { data } = await supabaseAdmin()
    .from("users")
    .select("*")
    .eq("spotify_id", spotifyId)
    .maybeSingle();
  return data ?? null;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await auth();
  return ((session as any)?.accessToken as string | undefined) ?? null;
}
