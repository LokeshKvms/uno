import {
  type BotLevel,
  type GameAction,
  type GameEvent,
  type GameState,
  type Mode,
  type Rng,
  actorId,
  applyAction,
  botWantsToCatch,
  chooseBotAction,
  createGame,
  randomSeed,
  redactEvent,
  startNextRound,
  timeoutAction,
  viewFor,
} from "@uno/engine";
import {
  AVATAR_COUNT,
  type Ack,
  type ChatMessage,
  type DeadlineKind,
  type LogEntry,
  MAX_SEATS,
  MAX_SPECTATORS,
  QUICK_CHAT,
  type RoomAction,
  type RoomEventType,
  type RoomSnapshot,
  type SeatControl,
  TIMING,
} from "@uno/protocol";
import { UserError } from "./errors.ts";
import { between, shortId } from "./ids.ts";

export interface Seat {
  id: string;
  sessionId: string | null;
  ownerSessionId: string | null;
  name: string;
  avatar: number;
  kind: "human" | "bot";
  botLevel: BotLevel;
  control: SeatControl;
  connected: boolean;
  ready: boolean;
  away: boolean;
  left: boolean;
  timeouts: number;
  disconnectedAt: number | null;
}

export interface Spectator {
  id: string;
  sessionId: string;
  name: string;
  avatar: number;
  connected: boolean;
}

export interface RoomData {
  version: 1;
  code: string;
  createdAt: number;
  lastHumanAt: number;
  everConnected?: boolean;
  hostId: string;
  mode: Mode;
  status: "lobby" | "playing";
  seats: Seat[];
  spectators: Spectator[];
  game: GameState | null;
  revision: number;
  log: LogEntry[];
  logSeq: number;
  chat: ChatMessage[];
  chatSeq: number;
  deadline: number;
  deadlineKind: DeadlineKind;
  turnKey: string | null;
  botDueAt: number;
  side: { key: string; actorId: string; action: GameAction; dueAt: number } | null;
  suspendedAt: number | null;
  botRng: Rng;
}

export type Member = { type: "seat"; seat: Seat } | { type: "spectator"; spectator: Spectator };

export interface Profile {
  name: string;
  avatar: number;
}

const BOT_NAMES = ["Ada", "Bruno", "Cleo", "Dex", "Esme", "Finn", "Gus", "Hana", "Iggy", "Juno", "Kit", "Lola", "Milo", "Nell", "Otis", "Pia"];
const LOG_LIMIT = 80;
const LOG_SENT = 40;
const CHAT_LIMIT = 100;

export interface RoomHooks {
  onRemoved?(sessionId: string, reason: string): void;
}

export class Room {
  private readonly chatTimes = new Map<string, number[]>();

  constructor(
    public data: RoomData,
    private readonly hooks: RoomHooks = {},
  ) {}

  static create(code: string, sessionId: string, host: Profile, now = Date.now()): Room {
    const seat = humanSeat(sessionId, host);
    seat.ready = true;
    const data: RoomData = {
      version: 1,
      code,
      createdAt: now,
      lastHumanAt: now,
      hostId: seat.id,
      mode: "single",
      status: "lobby",
      seats: [seat],
      spectators: [],
      game: null,
      revision: 1,
      log: [],
      logSeq: 0,
      chat: [],
      chatSeq: 0,
      deadline: 0,
      deadlineKind: null,
      turnKey: null,
      botDueAt: 0,
      side: null,
      suspendedAt: null,
      botRng: { state: randomSeed() },
    };
    return new Room(data);
  }

  get code() {
    return this.data.code;
  }

  setHooks(hooks: RoomHooks) {
    Object.assign(this.hooks, hooks);
  }

  member(sessionId: string): Member | null {
    const seat = this.data.seats.find((s) => s.sessionId === sessionId);
    if (seat) return { type: "seat", seat };
    const spectator = this.data.spectators.find((s) => s.sessionId === sessionId);
    if (spectator) return { type: "spectator", spectator };
    return null;
  }

  sessions(): string[] {
    return [...this.data.seats.map((s) => s.sessionId).filter((s): s is string => !!s), ...this.data.spectators.map((s) => s.sessionId)];
  }

  hasConnectedHumans(): boolean {
    return this.data.seats.some((s) => s.sessionId && s.connected) || this.data.spectators.some((s) => s.connected);
  }

  private hasConnectedPlayers(): boolean {
    return this.data.seats.some((s) => s.sessionId && s.connected);
  }

  join(sessionId: string, profile: Profile, now = Date.now()): "player" | "spectator" {
    const existing = this.member(sessionId);
    if (existing) return existing.type === "seat" ? "player" : "spectator";

    const d = this.data;
    const owned = d.seats.find((s) => s.ownerSessionId === sessionId && s.left);
    if (owned && d.status === "playing") {
      owned.sessionId = sessionId;
      owned.left = false;
      owned.control = "human";
      owned.away = false;
      owned.timeouts = 0;
      owned.connected = false;
      owned.disconnectedAt = now;
      this.logRoom("reclaimed", owned.id, owned.name, now);
      this.afterControlChange(now);
      this.bump();
      return "player";
    }

    const name = this.uniqueName(profile.name);
    if (d.status === "lobby" && d.seats.length < MAX_SEATS) {
      const seat = humanSeat(sessionId, { name, avatar: profile.avatar });
      d.seats.push(seat);
      this.logRoom("joined", seat.id, seat.name, now);
      if (!this.hostSeat()) d.hostId = seat.id;
      this.bump();
      return "player";
    }
    if (d.spectators.length >= MAX_SPECTATORS) {
      throw new UserError("This table is full. Ask the host to open a new room.");
    }
    const spectator: Spectator = { id: shortId("s"), sessionId, name, avatar: profile.avatar, connected: false };
    d.spectators.push(spectator);
    this.logRoom("watching", spectator.id, spectator.name, now);
    this.bump();
    return "spectator";
  }

  connect(sessionId: string, now = Date.now()): void {
    const m = this.member(sessionId);
    if (!m) return;
    if (m.type === "spectator") {
      m.spectator.connected = true;
    } else {
      const seat = m.seat;
      const wasAway = !seat.connected && seat.disconnectedAt !== null && this.data.status === "playing";
      seat.connected = true;
      seat.disconnectedAt = null;
      if (seat.control === "autopilot" && !seat.away) seat.control = "human";
      if (wasAway) this.logRoom("reconnected", seat.id, seat.name, now);
      this.afterControlChange(now);
    }
    this.data.lastHumanAt = now;
    this.data.everConnected = true;
    this.bump();
  }

  disconnect(sessionId: string, now = Date.now()): void {
    const m = this.member(sessionId);
    if (!m) return;
    if (m.type === "spectator") {
      m.spectator.connected = false;
    } else {
      m.seat.connected = false;
      m.seat.disconnectedAt = now;
      if (this.data.status === "playing") this.logRoom("disconnected", m.seat.id, m.seat.name, now);
      this.afterControlChange(now);
    }
    this.bump();
  }

  handle(sessionId: string, action: RoomAction, now = Date.now()): void {
    const m = this.member(sessionId);
    if (!m) throw new UserError("You are no longer at this table.", 403);
    const d = this.data;

    if (m.type === "spectator") {
      if (action.type === "leave") {
        d.spectators = d.spectators.filter((s) => s !== m.spectator);
        this.bump();
        return;
      }
      if (action.type === "takeSeat") {
        if (d.status !== "lobby") throw new UserError("You can take a seat when the next game starts.");
        if (d.seats.length >= MAX_SEATS) throw new UserError("All ten seats are taken.");
        d.spectators = d.spectators.filter((s) => s !== m.spectator);
        const seat = humanSeat(sessionId, { name: m.spectator.name, avatar: m.spectator.avatar });
        seat.connected = m.spectator.connected;
        d.seats.push(seat);
        this.logRoom("joined", seat.id, seat.name, now);
        if (!this.hostSeat()) d.hostId = seat.id;
        this.bump();
        return;
      }
      throw new UserError("Spectators can watch and chat. You'll get a seat in the next game.");
    }

    const seat = m.seat;
    const isHost = d.hostId === seat.id;
    const requireHost = () => {
      if (!isHost) throw new UserError("Only the host can do that.");
    };
    const requireLobby = () => {
      if (d.status !== "lobby") throw new UserError("That can only be changed in the lobby.");
    };

    switch (action.type) {
      case "ready":
        requireLobby();
        seat.ready = action.ready || isHost;
        break;
      case "settings":
        requireLobby();
        requireHost();
        d.mode = action.mode;
        break;
      case "addBot": {
        requireLobby();
        requireHost();
        if (d.seats.length >= MAX_SEATS) throw new UserError("All ten seats are taken.");
        const used = new Set(d.seats.map((s) => s.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? this.uniqueName("Bot");
        d.seats.push({
          id: shortId("b"),
          sessionId: null,
          ownerSessionId: null,
          name,
          avatar: between(0, AVATAR_COUNT),
          kind: "bot",
          botLevel: action.level,
          control: "bot",
          connected: true,
          ready: true,
          away: false,
          left: false,
          timeouts: 0,
          disconnectedAt: null,
        });
        break;
      }
      case "removeSeat": {
        requireLobby();
        requireHost();
        const target = d.seats.find((s) => s.id === action.seatId);
        if (!target) throw new UserError("That seat is already empty.");
        if (target.id === seat.id) throw new UserError("Use Leave to leave the room.");
        d.seats = d.seats.filter((s) => s !== target);
        if (target.sessionId) {
          this.logRoom("removed", target.id, target.name, now);
          this.hooks.onRemoved?.(target.sessionId, "The host removed you from the table.");
        }
        break;
      }
      case "start": {
        requireLobby();
        requireHost();
        if (d.seats.length < 2) throw new UserError("You need at least two players. Invite a friend or add a bot.");
        const waiting = d.seats.filter((s) => s.kind === "human" && !s.ready && s.id !== d.hostId);
        if (waiting.length) {
          throw new UserError(`Waiting for ${waiting.map((s) => s.name).join(", ")} to be ready.`);
        }
        const { state, events } = createGame({
          players: d.seats.map((s) => ({ id: s.id, name: s.name })),
          mode: d.mode,
          seed: randomSeed(),
        });
        for (const s of d.seats) {
          s.timeouts = 0;
          s.away = false;
          s.ownerSessionId = s.sessionId;
        }
        d.status = "playing";
        d.game = state;
        d.turnKey = null;
        this.pushGameEvents(events, now);
        this.afterGameChange(now);
        break;
      }
      case "nextRound":
        requireHost();
        this.beginNextRound(now);
        break;
      case "toLobby":
        requireHost();
        if (d.status !== "playing" || d.game?.phase !== "matchOver") {
          throw new UserError("Finish the game before heading back to the lobby.");
        }
        this.returnToLobby(now);
        break;
      case "leave":
        this.leave(seat, now);
        break;
      case "back":
        seat.away = false;
        seat.timeouts = 0;
        if (seat.control === "autopilot") seat.control = "human";
        this.logRoom("back", seat.id, seat.name, now);
        this.afterControlChange(now);
        break;
      case "takeSeat":
        throw new UserError("You already have a seat.");
      default:
        this.handleGameAction(seat, action, now);
        return;
    }
    this.bump();
  }

  private handleGameAction(seat: Seat, action: GameAction, now: number): void {
    const d = this.data;
    if (d.status !== "playing" || !d.game) throw new UserError("The game hasn't started yet.");
    if (seat.control === "autopilot" && action.type !== "catch" && action.type !== "callUno") {
      seat.control = "human";
      seat.away = false;
      this.logRoom("back", seat.id, seat.name, now);
    }
    const acting = actorId(d.game) === seat.id;
    const error = this.applyGame(seat.id, action, now);
    if (error) throw new UserError(error);
    if (acting) seat.timeouts = 0;
    this.bump();
  }

  private applyGame(seatId: string, action: GameAction, now: number): string | null {
    const d = this.data;
    if (!d.game) return "The game hasn't started yet.";
    const result = applyAction(d.game, seatId, action);
    if (!result.ok) return result.error;
    d.game = result.state;
    this.pushGameEvents(result.events, now);
    this.afterGameChange(now);
    return null;
  }

  private leave(seat: Seat, now: number): void {
    const d = this.data;
    if (d.status === "lobby") {
      d.seats = d.seats.filter((s) => s !== seat);
      this.logRoom("left", seat.id, seat.name, now);
    } else {
      seat.sessionId = null;
      seat.left = true;
      seat.control = "bot";
      seat.connected = false;
      seat.away = false;
      seat.ready = false;
      this.logRoom("botTookOver", seat.id, seat.name, now);
      this.afterControlChange(now);
    }
    if (d.hostId === seat.id) this.transferHost(now);
  }

  private transferHost(now: number): void {
    const d = this.data;
    const candidates = d.seats.filter((s) => s.kind === "human" && s.sessionId && !s.left);
    const next = candidates.find((s) => s.connected) ?? candidates[0];
    d.hostId = next?.id ?? "";
    if (next) {
      next.ready = true;
      this.logRoom("hostChanged", next.id, next.name, now);
    }
  }

  private hostSeat(): Seat | undefined {
    return this.data.seats.find((s) => s.id === this.data.hostId && s.sessionId && !s.left);
  }

  private beginNextRound(now: number): void {
    const d = this.data;
    if (!d.game || d.game.phase !== "roundOver") throw new UserError("The round is still being played.");
    const r = startNextRound(d.game);
    if (!r.ok) throw new UserError(r.error);
    d.game = r.state;
    this.pushGameEvents(r.events, now);
    this.afterGameChange(now);
  }

  private returnToLobby(now: number): void {
    const d = this.data;
    d.status = "lobby";
    d.game = null;
    d.deadline = 0;
    d.deadlineKind = null;
    d.turnKey = null;
    d.side = null;
    d.botDueAt = 0;
    d.seats = d.seats.filter((s) => !s.left);
    for (const s of d.seats) {
      s.ownerSessionId = null;
      s.away = false;
      s.timeouts = 0;
      if (s.kind === "human") {
        s.control = "human";
        s.ready = s.id === d.hostId;
      }
    }
    while (d.spectators.length && d.seats.length < MAX_SEATS) {
      const spec = d.spectators.shift()!;
      const seat = humanSeat(spec.sessionId, { name: spec.name, avatar: spec.avatar });
      seat.connected = spec.connected;
      d.seats.push(seat);
      this.logRoom("joined", seat.id, seat.name, now);
    }
    if (!this.hostSeat()) this.transferHost(now);
  }

  tick(now = Date.now()): boolean {
    const d = this.data;
    if (this.hasConnectedHumans()) d.lastHumanAt = now;
    if (d.status !== "playing" || !d.game) return false;

    if (!this.hasConnectedPlayers()) {
      if (d.suspendedAt === null) {
        d.suspendedAt = now;
        this.bump();
        return true;
      }
      return false;
    }
    let changed = false;
    if (d.suspendedAt !== null) {
      const shift = now - d.suspendedAt;
      if (d.deadline) d.deadline += shift;
      if (d.botDueAt) d.botDueAt += shift;
      if (d.side) d.side.dueAt += shift;
      for (const s of d.seats) if (s.disconnectedAt !== null) s.disconnectedAt += shift;
      d.suspendedAt = null;
      changed = true;
    }

    for (const s of d.seats) {
      if (s.kind === "human" && s.control === "human" && !s.connected && s.disconnectedAt !== null) {
        if (now - s.disconnectedAt >= TIMING.graceMs) {
          s.control = "autopilot";
          this.logRoom("botTookOver", s.id, s.name, now);
          this.afterControlChange(now);
          changed = true;
        }
      }
    }

    const game = d.game;
    if (game.phase === "roundOver") {
      if (d.deadline && now >= d.deadline) {
        this.beginNextRound(now);
        changed = true;
      }
      if (changed) this.bump();
      return changed;
    }
    if (game.phase === "matchOver") {
      if (changed) this.bump();
      return changed;
    }

    if (d.side && now >= d.side.dueAt) {
      const side = d.side;
      d.side = null;
      if (game.lastCall && `${game.lastCall.playerId}:${game.turnSerial}` === side.key) {
        this.applyGame(side.actorId, side.action, now);
        this.bump();
        return true;
      }
    }

    const actor = actorId(game);
    const seat = d.seats.find((s) => s.id === actor);
    if (!seat) return changed;

    if (seat.control !== "human") {
      if (now >= d.botDueAt) {
        this.playBotTurn(seat, now);
        changed = true;
      }
    } else if (d.deadline && now >= d.deadline) {
      if (!seat.connected) {
        this.playBotTurn(seat, now);
      } else {
        const action = timeoutAction(game);
        if (action) this.applyGame(seat.id, action, now);
        seat.timeouts += 1;
        if (seat.timeouts >= TIMING.awayAfterTimeouts) {
          seat.away = true;
          seat.control = "autopilot";
          this.logRoom("away", seat.id, seat.name, now);
          this.afterControlChange(now);
        }
      }
      changed = true;
    }
    if (changed) this.bump();
    return changed;
  }

  private playBotTurn(seat: Seat, now: number): void {
    const game = this.data.game!;
    const level = seat.kind === "bot" ? seat.botLevel : "normal";
    const action = chooseBotAction(game, seat.id, level, this.data.botRng) ?? timeoutAction(game);
    if (!action) return;
    const error = this.applyGame(seat.id, action, now);
    if (error) {
      const fallback = timeoutAction(this.data.game!);
      if (fallback) this.applyGame(seat.id, fallback, now);
    }
  }

  private afterGameChange(now: number): void {
    const d = this.data;
    const game = d.game;
    if (!game) return;
    const key = `${game.round}:${game.turnSerial}:${game.phase}`;
    if (key !== d.turnKey) {
      d.turnKey = key;
      switch (game.phase) {
        case "turn":
          d.deadline = now + TIMING.turnMs;
          d.deadlineKind = "turn";
          break;
        case "drawn":
          d.deadline = now + TIMING.drawnMs;
          d.deadlineKind = "turn";
          break;
        case "challenge":
          d.deadline = now + TIMING.challengeMs;
          d.deadlineKind = "challenge";
          break;
        case "chooseColor":
          d.deadline = now + TIMING.colorMs;
          d.deadlineKind = "color";
          break;
        case "roundOver":
          d.deadline = now + TIMING.nextRoundMs;
          d.deadlineKind = "nextRound";
          break;
        case "matchOver":
          d.deadline = 0;
          d.deadlineKind = null;
          break;
      }
      d.botDueAt = now + (game.phase === "drawn" ? between(600, 1000) : between(900, 1700));
    }
    this.afterControlChange(now);
    this.planSideAction(now);
  }

  private afterControlChange(now: number): void {
    const d = this.data;
    const game = d.game;
    if (!game || d.status !== "playing") return;
    const seat = d.seats.find((s) => s.id === actorId(game));
    if (!seat) return;
    if (seat.control !== "human") {
      if (!d.botDueAt || d.botDueAt < now) d.botDueAt = now + between(700, 1300);
    } else if (!seat.connected && d.deadline) {
      d.deadline = Math.min(d.deadline, now + TIMING.disconnectedTurnMs);
    }
  }

  private planSideAction(now: number): void {
    const d = this.data;
    const game = d.game!;
    if (!game.lastCall) {
      d.side = null;
      return;
    }
    const key = `${game.lastCall.playerId}:${game.turnSerial}`;
    if (d.side?.key === key) return;
    const target = d.seats.find((s) => s.id === game.lastCall!.playerId);
    if (!target) return;
    d.botDueAt = Math.max(d.botDueAt, now + TIMING.catchWindowMs);
    if (target.control !== "human") {
      d.side = { key, actorId: target.id, action: { type: "callUno" }, dueAt: now + between(1800, 2700) };
      return;
    }
    const catcher = d.seats.find((s) => s.id !== target.id && s.control !== "human" && botWantsToCatch(s.kind === "bot" ? s.botLevel : "normal", d.botRng));
    d.side = catcher ? { key, actorId: catcher.id, action: { type: "catch", targetId: target.id }, dueAt: now + between(1500, 2600) } : null;
  }

  chat(sessionId: string, text: string, quick = false, now = Date.now()): ChatMessage {
    const m = this.member(sessionId);
    if (!m) throw new UserError("You are no longer at this table.", 403);
    const times = (this.chatTimes.get(sessionId) ?? []).filter((t) => now - t < 5000);
    if (times.length >= 5) throw new UserError("Slow down a little. Try again in a few seconds.");
    times.push(now);
    this.chatTimes.set(sessionId, times);
    const who = m.type === "seat" ? m.seat : m.spectator;
    const message: ChatMessage = {
      id: ++this.data.chatSeq,
      at: now,
      fromId: who.id,
      name: who.name,
      avatar: who.avatar,
      text,
      quick,
    };
    this.data.chat.push(message);
    if (this.data.chat.length > CHAT_LIMIT) this.data.chat.splice(0, this.data.chat.length - CHAT_LIMIT);
    return message;
  }

  quickChat(sessionId: string, index: number, now = Date.now()): ChatMessage {
    const text = QUICK_CHAT[index];
    if (!text) throw new UserError("Unknown message.");
    return this.chat(sessionId, text, true, now);
  }

  snapshotFor(sessionId: string, now = Date.now()): RoomSnapshot | null {
    const m = this.member(sessionId);
    if (!m) return null;
    const d = this.data;
    const selfId = m.type === "seat" ? m.seat.id : m.spectator.id;
    const viewerSeat = m.type === "seat" ? m.seat.id : null;
    return {
      code: d.code,
      revision: d.revision,
      serverTime: now,
      selfId,
      role: m.type === "seat" ? "player" : "spectator",
      hostId: d.hostId,
      mode: d.mode,
      status: d.status,
      seats: d.seats.map((s) => ({
        id: s.id,
        name: s.name,
        avatar: s.avatar,
        kind: s.kind,
        botLevel: s.botLevel,
        control: s.control,
        connected: s.kind === "bot" ? true : s.connected,
        ready: s.ready || s.kind === "bot",
        away: s.away,
        left: s.left,
      })),
      spectators: d.spectators.map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, connected: s.connected })),
      game: d.game ? viewFor(d.game, viewerSeat) : null,
      deadline: d.suspendedAt ? 0 : d.deadline,
      deadlineKind: d.deadlineKind,
      suspended: d.suspendedAt !== null,
      log: d.log.slice(-LOG_SENT).map((entry) => (entry.kind === "game" ? { ...entry, event: redactEvent(entry.event, viewerSeat) } : entry)),
    };
  }

  private bump(): void {
    this.data.revision += 1;
  }

  private pushGameEvents(events: GameEvent[], now: number): void {
    for (const event of events) {
      this.data.log.push({ id: ++this.data.logSeq, at: now, kind: "game", event });
    }
    this.trimLog();
  }

  private logRoom(type: RoomEventType, seatId: string, name: string, now: number): void {
    this.data.log.push({ id: ++this.data.logSeq, at: now, kind: "room", type, seatId, name });
    this.trimLog();
  }

  private trimLog(): void {
    if (this.data.log.length > LOG_LIMIT) this.data.log.splice(0, this.data.log.length - LOG_LIMIT);
  }

  private uniqueName(name: string): string {
    const taken = new Set([...this.data.seats, ...this.data.spectators].map((s) => s.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) {
      const candidate = `${name.slice(0, 17)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }
}

function humanSeat(sessionId: string, profile: Profile): Seat {
  return {
    id: shortId("h"),
    sessionId,
    ownerSessionId: null,
    name: profile.name,
    avatar: profile.avatar,
    kind: "human",
    botLevel: "normal",
    control: "human",
    connected: false,
    ready: false,
    away: false,
    left: false,
    timeouts: 0,
    disconnectedAt: null,
  };
}

export function ackError(error: unknown): Ack {
  if (error instanceof UserError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: "Something went wrong on our side. Please try again." };
}
