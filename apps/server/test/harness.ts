import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Ack, ChatMessage, RoomAction, RoomSnapshot } from "@uno/protocol";
import { type Socket, io } from "socket.io-client";
import { type ServerOptions, buildServer } from "../src/app.ts";
import { MemoryStore, type RoomStore } from "../src/store.ts";

export async function startServer(store: RoomStore = new MemoryStore(), options: Partial<ServerOptions> = {}) {
  const built = await buildServer({ store, sessionSecret: "test-secret-0123456789abcdef", tickMs: 40, ...options });
  await built.manager.load();
  built.manager.start();
  await built.app.listen({ port: 0, host: "127.0.0.1" });
  const port = (built.app.server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  return {
    ...built,
    store,
    base,
    async close() {
      await built.manager.stop();
      built.io.close();
      await built.app.close().catch(() => {});
    },
  };
}

export type TestServer = Awaited<ReturnType<typeof startServer>>;

export class Player {
  cookie = "";
  socket: Socket | null = null;
  snap: RoomSnapshot | null = null;
  chat: ChatMessage[] = [];
  replaced = false;
  removed: string | null = null;
  private waiters: ((s: RoomSnapshot) => void)[] = [];

  constructor(
    readonly base: string,
    readonly name: string,
  ) {}

  async api<T = Record<string, unknown>>(path: string, body?: unknown, method = "POST"): Promise<{ status: number; json: T }> {
    const res = await fetch(this.base + path, {
      method,
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) this.cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: (await res.json()) as T };
  }

  async create(extra: Record<string, unknown> = {}): Promise<string> {
    await this.api("/api/session");
    const r = await this.api<{ code: string }>("/api/rooms", { name: this.name, avatar: 1, ...extra });
    if (r.status !== 201) throw new Error(JSON.stringify(r.json));
    return r.json.code;
  }

  async join(code: string) {
    await this.api("/api/session");
    return this.api<{ code: string; role: string; error?: string }>(`/api/rooms/${code}/join`, { name: this.name, avatar: 2 });
  }

  connect(code: string): Promise<RoomSnapshot> {
    const socket = io(this.base, {
      auth: { code },
      extraHeaders: { cookie: this.cookie, origin: this.base },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    this.socket = socket;
    socket.on("snapshot", (s: RoomSnapshot) => {
      this.snap = s;
      this.waiters.splice(0).forEach((w) => w(s));
    });
    socket.on("chat", (m: ChatMessage) => this.chat.push(m));
    socket.on("chatHistory", (m: ChatMessage[]) => (this.chat = [...m]));
    socket.on("replaced", () => (this.replaced = true));
    socket.on("removed", (reason: string) => (this.removed = reason));
    return new Promise((resolve, reject) => {
      socket.once("connect_error", (e) => reject(e));
      this.waiters.push(resolve);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  cmd(action: RoomAction, id: string = randomUUID()): Promise<Ack> {
    return this.socket!.timeout(4000).emitWithAck("command", { id, action });
  }

  say(text: string): Promise<Ack> {
    return this.socket!.timeout(4000).emitWithAck("chat", { text });
  }

  async until(predicate: (s: RoomSnapshot) => boolean, timeoutMs = 8000): Promise<RoomSnapshot> {
    if (this.snap && predicate(this.snap)) return this.snap;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = await new Promise<RoomSnapshot | null>((resolve) => {
        const t = setTimeout(() => resolve(null), 200);
        this.waiters.push((snap) => {
          clearTimeout(t);
          resolve(snap);
        });
      });
      const current = s ?? this.snap;
      if (current && predicate(current)) return current;
    }
    throw new Error(`timed out waiting on ${this.name}; last phase ${this.snap?.game?.phase} status ${this.snap?.status}`);
  }

  async autoMove(): Promise<boolean> {
    const s = this.snap;
    const g = s?.game;
    if (!s || !g || g.currentId !== s.selfId) return false;
    if (g.phase === "chooseColor") await this.cmd({ type: "chooseColor", color: "red" });
    else if (g.phase === "challenge") await this.cmd({ type: "challenge", challenge: false });
    else if (g.playableIds.length) {
      const card = g.hand.find((c) => c.id === g.playableIds[0])!;
      await this.cmd({
        type: "play",
        cardId: card.id,
        callUno: g.hand.length === 2,
        ...(card.color === "wild" ? { color: "blue" as const } : {}),
      });
    } else if (g.canPass) await this.cmd({ type: "pass" });
    else if (g.canDraw) await this.cmd({ type: "draw" });
    return true;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
