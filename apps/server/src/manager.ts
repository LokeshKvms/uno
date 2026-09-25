import type { Profile } from "./room.ts";
import { Room, type RoomData } from "./room.ts";
import type { RoomStore } from "./store.ts";
import { UserError } from "./errors.ts";
import { roomCode } from "./ids.ts";
import type { BotLevel } from "@uno/engine";

const LOBBY_IDLE_MS = 2 * 60 * 60 * 1000;
const GAME_IDLE_MS = 30 * 60 * 1000;

export interface ManagerOptions {
  store: RoomStore;
  onChange: (room: Room) => void;
  onRemoved?: (room: Room, sessionId: string, reason: string) => void;
  tickMs?: number;
  saveDelayMs?: number;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly sessionRoom = new Map<string, string>();
  private readonly dirty = new Map<string, NodeJS.Timeout>();
  private ticker: NodeJS.Timeout | null = null;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly options: ManagerOptions) {}

  async load(): Promise<number> {
    const saved = await this.options.store.loadAll();
    const now = Date.now();
    for (const data of saved) {
      const room = this.adopt(data);
      for (const s of room.data.seats) {
        if (s.connected && s.kind === "human") {
          s.connected = false;
          s.disconnectedAt = now;
        }
      }
      for (const s of room.data.spectators) s.connected = false;
    }
    return saved.length;
  }

  start(): void {
    const tickMs = this.options.tickMs ?? 250;
    this.ticker = setInterval(() => this.tickAll(), tickMs);
    this.sweeper = setInterval(() => void this.sweep(), 60_000);
  }

  async stop(): Promise<void> {
    if (this.ticker) clearInterval(this.ticker);
    if (this.sweeper) clearInterval(this.sweeper);
    await this.flush();
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  count(): number {
    return this.rooms.size;
  }

  roomOf(sessionId: string): Room | undefined {
    const code = this.sessionRoom.get(sessionId);
    const room = code ? this.rooms.get(code) : undefined;
    if (room && room.member(sessionId)) return room;
    if (code) this.sessionRoom.delete(sessionId);
    return undefined;
  }

  create(sessionId: string, profile: Profile, bots?: { count: number; level: BotLevel }): Room {
    this.leaveCurrent(sessionId);
    let code = roomCode();
    while (this.rooms.has(code)) code = roomCode();
    const room = Room.create(code, sessionId, profile);
    this.adopt(room.data, room);
    if (bots) {
      for (let i = 0; i < bots.count; i++) room.handle(sessionId, { type: "addBot", level: bots.level });
    }
    this.sessionRoom.set(sessionId, code);
    this.changed(room);
    return room;
  }

  join(code: string, sessionId: string, profile: Profile): { room: Room; role: "player" | "spectator" } {
    const room = this.get(code);
    if (!room) throw new UserError("We couldn't find that room. Check the code, or create a new room.", 404);
    if (this.sessionRoom.get(sessionId) !== room.code) this.leaveCurrent(sessionId);
    const role = room.join(sessionId, profile);
    this.sessionRoom.set(sessionId, room.code);
    this.changed(room);
    return { room, role };
  }

  forget(sessionId: string, room: Room): void {
    if (!room.member(sessionId)) this.sessionRoom.delete(sessionId);
    this.cleanupIfEmpty(room);
  }

  changed(room: Room): void {
    this.options.onChange(room);
    this.scheduleSave(room);
  }

  async flush(): Promise<void> {
    const pending = [...this.dirty.keys()];
    for (const code of pending) {
      clearTimeout(this.dirty.get(code));
      this.dirty.delete(code);
      const room = this.rooms.get(code);
      if (room) await this.options.store.save(room.data);
    }
  }

  private adopt(data: RoomData, existing?: Room): Room {
    const room = existing ?? new Room(data);
    room.setHooks({
      onRemoved: (sessionId, reason) => {
        this.sessionRoom.delete(sessionId);
        this.options.onRemoved?.(room, sessionId, reason);
      },
    });
    this.rooms.set(room.code, room);
    for (const s of room.sessions()) this.sessionRoom.set(s, room.code);
    return room;
  }

  private leaveCurrent(sessionId: string): void {
    const current = this.roomOf(sessionId);
    if (!current) return;
    try {
      current.handle(sessionId, { type: "leave" });
    } catch {}
    this.sessionRoom.delete(sessionId);
    this.changed(current);
    this.cleanupIfEmpty(current);
  }

  private cleanupIfEmpty(room: Room): void {
    const humans = room.data.seats.some((s) => s.sessionId) || room.data.spectators.length > 0;
    if (!humans) void this.remove(room.code);
  }

  private tickAll(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      try {
        if (room.tick(now)) this.changed(room);
      } catch (error) {
        console.error(`[uno] tick failed for room ${room.code}`, error);
      }
    }
  }

  private scheduleSave(room: Room): void {
    if (this.dirty.has(room.code)) return;
    const delay = this.options.saveDelayMs ?? 300;
    this.dirty.set(
      room.code,
      setTimeout(() => {
        this.dirty.delete(room.code);
        if (!this.rooms.has(room.code)) return;
        this.options.store.save(room.data).catch((error) => console.error(`[uno] save failed for ${room.code}`, error));
      }, delay),
    );
  }

  private async sweep(now = Date.now()): Promise<void> {
    for (const room of [...this.rooms.values()]) {
      const idle = now - room.data.lastHumanAt;
      const limit = room.data.status === "lobby" ? LOBBY_IDLE_MS : GAME_IDLE_MS;
      if (!room.hasConnectedHumans() && idle > limit) await this.remove(room.code);
    }
  }

  private async remove(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    for (const s of room.sessions()) if (this.sessionRoom.get(s) === code) this.sessionRoom.delete(s);
    clearTimeout(this.dirty.get(code));
    this.dirty.delete(code);
    await this.options.store.delete(code).catch((error) => console.error(`[uno] delete failed for ${code}`, error));
  }
}
