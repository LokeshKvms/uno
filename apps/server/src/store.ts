import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { RoomData } from "./room.ts";

export interface RoomStore {
  loadAll(): Promise<RoomData[]>;
  save(room: RoomData): Promise<void>;
  delete(code: string): Promise<void>;
  close(): Promise<void>;
}

export class MemoryStore implements RoomStore {
  readonly rooms = new Map<string, string>();
  async loadAll() {
    return [...this.rooms.values()].map((s) => JSON.parse(s) as RoomData);
  }
  async save(room: RoomData) {
    this.rooms.set(room.code, JSON.stringify(room));
  }
  async delete(code: string) {
    this.rooms.delete(code);
  }
  async close() {}
}

export class LibsqlStore implements RoomStore {
  private constructor(private readonly db: Client) {}

  static async open(url: string, authToken?: string): Promise<LibsqlStore> {
    if (url.startsWith("file:")) {
      mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
    }
    const db = createClient({ url, authToken });
    await db.execute("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)");
    return new LibsqlStore(db);
  }

  async loadAll(): Promise<RoomData[]> {
    const result = await this.db.execute("SELECT data FROM rooms");
    const rooms: RoomData[] = [];
    for (const row of result.rows) {
      try {
        rooms.push(JSON.parse(String(row.data)) as RoomData);
      } catch {}
    }
    return rooms;
  }

  async save(room: RoomData): Promise<void> {
    await this.db.execute({
      sql: "INSERT INTO rooms (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
      args: [room.code, JSON.stringify(room), Date.now()],
    });
  }

  async delete(code: string): Promise<void> {
    await this.db.execute({ sql: "DELETE FROM rooms WHERE code = ?", args: [code] });
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
