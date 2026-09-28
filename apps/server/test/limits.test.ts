import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { tokenBucket } from "../src/limiter.ts";
import { MemoryStore } from "../src/store.ts";
import { Player, type TestServer, startServer } from "./harness.ts";

let server: TestServer | null = null;
const players: Player[] = [];

afterEach(async () => {
  for (const p of players.splice(0)) p.disconnect();
  await server?.close();
  server = null;
});

async function createRoom(headers: Record<string, string> = {}) {
  const res = await fetch(`${server!.base}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ name: "Sam" }),
  });
  return res.status;
}

describe("token bucket", () => {
  it("allows a burst, then refills over time", () => {
    let now = 0;
    const allow = tokenBucket(2, 3, () => now);
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
    now = 500;
    expect([allow(), allow()]).toEqual([true, false]);
  });
});

describe("abuse limits", () => {
  it("limits room creation per client and ignores spoofed forwarding headers", async () => {
    server = await startServer(new MemoryStore(), { roomsPerMinute: 3 });
    for (let i = 0; i < 3; i++) expect(await createRoom({ "x-forwarded-for": `10.0.0.${i}` })).toBe(201);
    expect(await createRoom({ "x-forwarded-for": "10.0.0.99" })).toBe(429);
  });

  it("keys the limit on the address set by the edge proxy", async () => {
    server = await startServer(new MemoryStore(), { roomsPerMinute: 1 });
    expect(await createRoom({ "cf-connecting-ip": "203.0.113.1" })).toBe(201);
    expect(await createRoom({ "cf-connecting-ip": "203.0.113.1" })).toBe(429);
    expect(await createRoom({ "cf-connecting-ip": "203.0.113.2" })).toBe(201);
  });

  it("refuses new rooms when the server is full", async () => {
    server = await startServer(new MemoryStore(), { maxRooms: 2 });
    expect(await createRoom()).toBe(201);
    expect(await createRoom()).toBe(201);
    const res = await fetch(`${server.base}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Sam" }),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/busy/);
  });

  it("slows down a socket that floods commands", async () => {
    server = await startServer();
    const host = new Player(server.base, "Host");
    players.push(host);
    const code = await host.create();
    await host.connect(code);
    const acks = await Promise.all(
      Array.from({ length: 40 }, () => host.socket!.timeout(4000).emitWithAck("command", { id: randomUUID(), action: { type: "ready", ready: true } })),
    );
    const slowed = acks.filter((a) => !a.ok && /Slow down/.test(a.error));
    expect(slowed.length).toBeGreaterThan(0);
    expect(acks.filter((a) => a.ok).length).toBeGreaterThanOrEqual(30);
  });
});
