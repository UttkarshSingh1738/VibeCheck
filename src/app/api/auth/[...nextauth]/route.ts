import { handlers } from "@/lib/auth";

/** Do not rewrite `req.url` here — Auth.js CSRF binds to the real request host; changing origin breaks POST sign-in. Use `NEXTAUTH_URL`, `redirectProxyUrl` in auth.ts, and open http://127.0.0.1:3000 (or DevHostRedirect from localhost). */
export const { GET, POST } = handlers;
