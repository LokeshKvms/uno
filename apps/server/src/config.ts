import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function findWebDist(): string {
  const candidates = [process.env.WEB_DIST, resolve(here, "../../web/dist"), resolve(process.cwd(), "apps/web/dist")].filter((p): p is string => !!p);
  return candidates.find((p) => existsSync(resolve(p, "index.html"))) ?? candidates[0]!;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  isProd: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/uno.db",
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-secret-change-me-please-0123456789",
  webDist: findWebDist(),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

if (config.isProd && !process.env.SESSION_SECRET) {
  console.warn("[uno] SESSION_SECRET is not set; sessions will not survive a secret change. Set it in production.");
}
