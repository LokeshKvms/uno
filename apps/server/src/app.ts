import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Server as SocketServer, type Socket } from "socket.io";
import { ZodError } from "zod";
import {
  type ClientToServer,
  type JoinResult,
  type RoomPreview,
  type ServerToClient,
  type SessionInfo,
  chatSchema,
  commandSchema,
  createRoomSchema,
  firstIssue,
  profileSchema,
  reactionSchema,
  roomCodeSchema,
  REACTIONS,
} from "@uno/protocol";
import { UserError } from "./errors.ts";
import { sessionId as newSessionId } from "./ids.ts";
import { RoomManager } from "./manager.ts";
import { type Room, ackError } from "./room.ts";
import type { RoomStore } from "./store.ts";

export const SESSION_COOKIE = "uno_sid";

export interface ServerOptions {
  store: RoomStore;
  sessionSecret: string;
  isProd?: boolean;
  webDist?: string;
  allowedOrigins?: string[];
  logger?: boolean;
  tickMs?: number;
}

type IoSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, { sessionId: string; code: string }>;

export async function buildServer(options: ServerOptions) {
  const app = Fastify({
    logger: options.logger ? { level: "info" } : false,
    trustProxy: true,
    bodyLimit: 16 * 1024,
  });

  await app.register(fastifyCookie, { secret: options.sessionSecret });
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        mediaSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: options.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(fastifyRateLimit, {
    max: 120,
    timeWindow: "1 minute",
    allowList: (req) => !req.url.startsWith("/api/"),
  });

  const io = new SocketServer<ClientToServer, ServerToClient, Record<string, never>, { sessionId: string; code: string }>(app.server, {
    serveClient: false,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: undefined,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin) return callback(null, true);
      const host = req.headers["x-forwarded-host"] ?? req.headers.host;
      try {
        const ok = new URL(origin).host === host || (options.allowedOrigins ?? []).includes(origin);
        callback(ok ? null : "Origin not allowed", ok);
      } catch {
        callback("Bad origin", false);
      }
    },
  });

  const sockets = new Map<string, IoSocket>();
  const socketKey = (code: string, session: string) => `${code}:${session}`;

  const broadcast = (room: Room) => {
    for (const session of room.sessions()) {
      const socket = sockets.get(socketKey(room.code, session));
      if (!socket) continue;
      const snapshot = room.snapshotFor(session);
      if (snapshot) socket.emit("snapshot", snapshot);
    }
  };

  const manager = new RoomManager({
    store: options.store,
    tickMs: options.tickMs,
    onChange: broadcast,
    onRemoved: (room, session, reason) => {
      const socket = sockets.get(socketKey(room.code, session));
      if (socket) {
        socket.emit("removed", reason);
        sockets.delete(socketKey(room.code, session));
        socket.disconnect(true);
      }
    },
  });

  const readSession = (cookieHeader: string | undefined): string | null => {
    if (!cookieHeader) return null;
    const raw = app.parseCookie(cookieHeader)[SESSION_COOKIE];
    if (!raw) return null;
    const unsigned = app.unsignCookie(raw);
    return unsigned.valid && unsigned.value ? unsigned.value : null;
  };

  const ensureSession = (req: FastifyRequest, reply: FastifyReply): string => {
    const existing = readSession(req.headers.cookie);
    if (existing) return existing;
    const id = newSessionId();
    reply.setCookie(SESSION_COOKIE, id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: options.isProd ?? false,
      signed: true,
      maxAge: 60 * 60 * 24 * 60,
    });
    return id;
  };

  const parse = <T>(schema: { parse: (v: unknown) => T }, value: unknown): T => {
    try {
      return schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) throw new UserError(firstIssue(error));
      throw error;
    }
  };

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof UserError) return reply.status(error.status).send({ error: error.message });
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({ error: "Too many requests. Take a breath and try again." });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "Something went wrong on our side. Please try again." });
  });

  app.get("/healthz", async () => ({ ok: true, rooms: manager.count(), time: Date.now() }));

  app.post("/api/session", async (req, reply): Promise<SessionInfo> => {
    const session = ensureSession(req, reply);
    const room = manager.roomOf(session);
    const member = room?.member(session);
    const who = member ? (member.type === "seat" ? member.seat : member.spectator) : null;
    return { room: room?.code ?? null, name: who?.name ?? "", avatar: who?.avatar ?? 0 };
  });

  app.post("/api/rooms", async (req, reply) => {
    const session = ensureSession(req, reply);
    const input = parse(createRoomSchema, req.body);
    const room = manager.create(session, { name: input.name, avatar: input.avatar }, input.bots);
    return reply.status(201).send({ code: room.code, role: "player" } satisfies JoinResult);
  });

  app.post<{ Params: { code: string } }>("/api/rooms/:code/join", async (req, reply): Promise<JoinResult> => {
    const session = ensureSession(req, reply);
    const code = parse(roomCodeSchema, req.params.code);
    const input = parse(profileSchema, req.body);
    const { room, role } = manager.join(code, session, input);
    return { code: room.code, role };
  });

  app.get<{ Params: { code: string } }>("/api/rooms/:code", async (req): Promise<RoomPreview> => {
    const code = parse(roomCodeSchema, req.params.code);
    const room = manager.get(code);
    if (!room) throw new UserError("We couldn't find that room. Check the code, or create a new room.", 404);
    const host = room.data.seats.find((s) => s.id === room.data.hostId);
    return {
      code: room.code,
      status: room.data.status,
      hostName: host?.name ?? "",
      players: room.data.seats.length,
      seatsOpen: Math.max(0, 10 - room.data.seats.length),
    };
  });

  const webDist = options.webDist;
  if (webDist && existsSync(resolve(webDist, "index.html"))) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      setHeaders: (res, path) => {
        if (path.includes(`${"assets"}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else res.setHeader("Cache-Control", "no-cache");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/") && !req.url.startsWith("/socket.io")) {
        return reply.type("text/html").header("Cache-Control", "no-cache").sendFile("index.html");
      }
      return reply.status(404).send({ error: "Not found." });
    });
  }

  io.use((socket, next) => {
    const session = readSession(socket.handshake.headers.cookie);
    if (!session) return next(new Error("Your session expired. Refresh the page to rejoin."));
    const code = String(socket.handshake.auth?.code ?? "").toUpperCase();
    const room = manager.get(code);
    if (!room) return next(new Error("This room has closed. Start a new one from the home page."));
    if (!room.member(session)) return next(new Error("You're not at this table. Join with the room code."));
    socket.data.sessionId = session;
    socket.data.code = code;
    next();
  });

  io.on("connection", (socket: IoSocket) => {
    const { sessionId: session, code } = socket.data;
    const key = socketKey(code, session);
    const previous = sockets.get(key);
    if (previous && previous.id !== socket.id) {
      previous.emit("replaced");
      previous.disconnect(true);
    }
    sockets.set(key, socket);

    const room = manager.get(code);
    if (!room) {
      socket.disconnect(true);
      return;
    }
    room.connect(session);
    socket.emit("chatHistory", room.data.chat);
    manager.changed(room);

    const recent = new Set<string>();

    socket.on("command", (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const current = manager.get(code);
      if (!current) return reply({ ok: false, error: "This room has closed." });
      const parsed = commandSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: firstIssue(parsed.error) });
      if (recent.has(parsed.data.id)) return reply({ ok: true });
      try {
        current.handle(session, parsed.data.action);
        recent.add(parsed.data.id);
        if (recent.size > 64) recent.delete(recent.values().next().value!);
        reply({ ok: true });
        manager.changed(current);
        if (parsed.data.action.type === "leave") {
          manager.forget(session, current);
          sockets.delete(key);
          socket.disconnect(true);
        }
      } catch (error) {
        reply(ackError(error));
        socket.emit("snapshot", current.snapshotFor(session)!);
      }
    });

    socket.on("chat", (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const current = manager.get(code);
      if (!current) return reply({ ok: false, error: "This room has closed." });
      const parsed = chatSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: "Messages can be up to 240 characters." });
      try {
        const message = current.chat(session, parsed.data.text);
        reply({ ok: true });
        emitToRoom(current, "chat", message);
        manager.changed(current);
      } catch (error) {
        reply(ackError(error));
      }
    });

    socket.on("reaction", (payload) => {
      const current = manager.get(code);
      const parsed = reactionSchema.safeParse(payload);
      if (!current || !parsed.success) return;
      const member = current.member(session);
      if (!member) return;
      const fromId = member.type === "seat" ? member.seat.id : member.spectator.id;
      try {
        if (parsed.data.kind === "quick") {
          const message = current.quickChat(session, parsed.data.index);
          emitToRoom(current, "chat", message);
          manager.changed(current);
        } else if (parsed.data.index < REACTIONS.length) {
          emitToRoom(current, "reaction", { fromId, kind: "emoji", index: parsed.data.index });
        }
      } catch {}
    });

    socket.on("sync", () => {
      const current = manager.get(code);
      const snapshot = current?.snapshotFor(session);
      if (snapshot) socket.emit("snapshot", snapshot);
    });

    socket.on("disconnect", () => {
      if (sockets.get(key) !== socket) return;
      sockets.delete(key);
      const current = manager.get(code);
      if (!current) return;
      current.disconnect(session);
      manager.changed(current);
    });
  });

  function emitToRoom<E extends "chat" | "reaction">(room: Room, event: E, payload: Parameters<ServerToClient[E]>[0]) {
    for (const session of room.sessions()) {
      const socket = sockets.get(socketKey(room.code, session));
      socket?.emit(event, ...([payload] as Parameters<ServerToClient[E]>));
    }
  }

  return { app, io, manager };
}
