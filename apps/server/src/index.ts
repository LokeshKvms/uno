import { buildServer } from "./app.ts";
import { config } from "./config.ts";
import { LibsqlStore } from "./store.ts";

const store = await LibsqlStore.open(config.databaseUrl, config.databaseAuthToken);
const { app, io, manager } = await buildServer({
  store,
  sessionSecret: config.sessionSecret,
  isProd: config.isProd,
  webDist: config.webDist,
  allowedOrigins: config.allowedOrigins,
  logger: true,
});

const restored = await manager.load();
manager.start();
await app.listen({ port: config.port, host: config.host });
app.log.info(`UNO server ready on :${config.port} (${restored} saved room(s) restored)`);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal} received, saving rooms`);
  await manager.stop();
  io.close();
  await app.close();
  await store.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
