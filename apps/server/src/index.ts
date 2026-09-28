import { buildServer } from "./app.ts";
import { config } from "./config.ts";
import { LibsqlStore } from "./store.ts";

async function withRetry<T>(label: string, task: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.error(`[uno] ${label} failed (attempt ${attempt} of ${attempts}), retrying`, error);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
}

const store = await withRetry("opening the database", () => LibsqlStore.open(config.databaseUrl, config.databaseAuthToken));
const { app, io, manager } = await buildServer({
  store,
  sessionSecret: config.sessionSecret,
  isProd: config.isProd,
  webDist: config.webDist,
  allowedOrigins: config.allowedOrigins,
  logger: true,
});

const restored = await withRetry("loading saved rooms", () => manager.load());
manager.start();
await app.listen({ port: config.port, host: config.host });
app.log.info(`UNO server ready on :${config.port} (${restored} saved room(s) restored)`);

let stopping = false;
async function shutdown(signal: string, code = 0) {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal} received, saving rooms`);
  try {
    io.close();
    await manager.stop();
    await app.close().catch(() => {});
    await store.close();
  } catch (error) {
    console.error("[uno] shutdown failed", error);
    code = 1;
  }
  process.exit(code);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (error) => console.error("[uno] unhandled rejection", error));
process.on("uncaughtException", (error) => {
  console.error("[uno] uncaught exception", error);
  void shutdown("uncaughtException", 1);
});
