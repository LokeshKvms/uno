import type { ChatMessage, ReactionBroadcast, RoomAction, RoomSnapshot, LogEntry, Ack } from "@uno/protocol";
import { type Socket, io } from "socket.io-client";
import { create } from "zustand";
import { api } from "./api.ts";
import { prefs } from "./prefs.ts";
import { play, vibrate } from "./sound.ts";

export type Route = { name: "home" } | { name: "room"; code: string };
export type Conn = "idle" | "connecting" | "online" | "offline" | "replaced";

export interface Toast {
  id: number;
  text: string;
}
export interface FloatingReaction {
  id: number;
  fromId: string;
  index: number;
}

interface State {
  route: Route;
  booting: boolean;
  waking: boolean;
  me: { name: string; avatar: number };
  code: string | null;
  snap: RoomSnapshot | null;
  fresh: LogEntry[];
  freshKey: number;
  chat: ChatMessage[];
  unread: number;
  panelOpen: boolean;
  conn: Conn;
  busy: boolean;
  toasts: Toast[];
  reactions: FloatingReaction[];
  clockOffset: number;
}

interface Actions {
  boot(): Promise<void>;
  navigate(route: Route, replace?: boolean): void;
  setMe(name: string, avatar: number): void;
  enterRoom(code: string): void;
  exitRoom(): void;
  send(action: RoomAction): Promise<boolean>;
  say(text: string): Promise<boolean>;
  react(kind: "emoji" | "quick", index: number): void;
  takeOver(): void;
  toast(text: string): void;
  dismissToast(id: number): void;
  setPanelOpen(open: boolean): void;
  markChatRead(): void;
}

let socket: Socket | null = null;
let toastSeq = 0;
let reactionSeq = 0;
let lastLogId = 0;

export function routeFromPath(path: string): Route {
  const m = path.match(/^\/room\/([A-Za-z0-9]{6})\/?$/);
  if (m) return { name: "room", code: m[1]!.toUpperCase() };
  return { name: "home" };
}

function pathFor(route: Route): string {
  if (route.name === "room") return `/room/${route.code}`;
  return "/";
}

export const useStore = create<State & Actions>((set, get) => ({
  route: routeFromPath(location.pathname),
  booting: true,
  waking: false,
  me: { name: prefs.name(), avatar: prefs.avatar() },
  code: null,
  snap: null,
  fresh: [],
  freshKey: 0,
  chat: [],
  unread: 0,
  panelOpen: false,
  conn: "idle",
  busy: false,
  toasts: [],
  reactions: [],
  clockOffset: 0,

  async boot() {
    const slow = setTimeout(() => set({ waking: true }), 1500);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const session = await api.session();
          const route = get().route;
          if (session.room) {
            if (session.name && !get().me.name) get().setMe(session.name, session.avatar);
            if (route.name !== "room" || route.code === session.room) {
              get().navigate({ name: "room", code: session.room }, true);
              get().enterRoom(session.room);
            }
          }
          break;
        } catch (error) {
          if (attempt >= 20) throw error;
          await new Promise((r) => setTimeout(r, Math.min(4000, 800 + attempt * 400)));
        }
      }
    } catch (error) {
      get().toast((error as Error).message);
    } finally {
      clearTimeout(slow);
      set({ booting: false, waking: false });
    }
  },

  navigate(route, replace = false) {
    const path = pathFor(route);
    if (location.pathname !== path) {
      if (replace) history.replaceState({}, "", path);
      else history.pushState({}, "", path);
    }
    set({ route });
  },

  setMe(name, avatar) {
    prefs.setName(name);
    prefs.setAvatar(avatar);
    set({ me: { name, avatar } });
  },

  enterRoom(code) {
    if (get().code === code && socket) return;
    socket?.disconnect();
    lastLogId = 0;
    set({ code, snap: null, chat: [], unread: 0, conn: "connecting", fresh: [], freshKey: 0 });
    const s = io({
      auth: { code },
      withCredentials: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
      timeout: 15000,
    });
    socket = s;

    s.on("connect", () => set({ conn: "online" }));
    s.on("disconnect", (reason) => {
      if (get().conn === "replaced") return;
      set({ conn: "offline" });
      if (reason === "io server disconnect" && get().code === code && get().conn !== "replaced") {
        setTimeout(() => {
          if (socket === s && get().conn === "offline") s.connect();
        }, 1500);
      }
    });
    s.on("connect_error", (err) => {
      const message = err.message || "";
      if (/not at this table|has closed/i.test(message)) {
        s.disconnect();
        socket = null;
        set({ code: null, snap: null, conn: "idle" });
        const route = get().route;
        if (!(route.name === "room" && route.code === code && /not at this table/i.test(message))) {
          get().toast(message);
          get().navigate({ name: "home" }, true);
        } else {
          set({ conn: "idle" });
        }
        return;
      }
      set({ conn: "offline" });
    });
    s.on("snapshot", (snap: RoomSnapshot) => {
      const prev = get().snap;
      if (prev && snap.revision < prev.revision && snap.code === prev.code) return;
      const first = lastLogId === 0;
      const fresh = first ? [] : snap.log.filter((e) => e.id > lastLogId);
      lastLogId = snap.log.at(-1)?.id ?? lastLogId;
      set({
        snap,
        clockOffset: snap.serverTime - Date.now(),
        fresh,
        freshKey: fresh.length ? get().freshKey + 1 : get().freshKey,
      });
      if (!document.hidden) soundsFor(fresh, snap);
    });
    s.on("chatHistory", (chat: ChatMessage[]) => set({ chat }));
    s.on("chat", (m: ChatMessage) => {
      const mine = m.fromId === get().snap?.selfId;
      set((st) => ({ chat: [...st.chat.slice(-199), m], unread: st.panelOpen || mine ? st.unread : st.unread + 1 }));
      if (!mine) play("chat");
    });
    s.on("reaction", (r: ReactionBroadcast) => {
      if (r.kind !== "emoji") return;
      const id = ++reactionSeq;
      set((st) => ({ reactions: [...st.reactions, { id, fromId: r.fromId, index: r.index }] }));
      setTimeout(() => set((st) => ({ reactions: st.reactions.filter((x) => x.id !== id) })), 2400);
    });
    s.on("replaced", () => {
      set({ conn: "replaced" });
      s.disconnect();
    });
    s.on("removed", (reason: string) => {
      s.disconnect();
      socket = null;
      get().toast(reason);
      set({ code: null, snap: null, conn: "idle" });
      get().navigate({ name: "home" }, true);
    });

    const resync = () => {
      if (!document.hidden && s.connected) s.emit("sync");
    };
    document.addEventListener("visibilitychange", resync);
    (s as Socket & { _cleanup?: () => void })._cleanup = () => document.removeEventListener("visibilitychange", resync);
  },

  exitRoom() {
    const s = socket as (Socket & { _cleanup?: () => void }) | null;
    s?._cleanup?.();
    s?.disconnect();
    socket = null;
    lastLogId = 0;
    set({ code: null, snap: null, chat: [], unread: 0, conn: "idle", fresh: [] });
  },

  async send(action) {
    const s = socket;
    if (!s || !s.connected) {
      get().toast("Reconnecting to your table. Try again in a moment.");
      return false;
    }
    set({ busy: true });
    const command = { id: crypto.randomUUID(), action };
    try {
      let ack: Ack | undefined;
      for (let attempt = 0; attempt < 2 && !ack; attempt++) {
        try {
          ack = (await s.timeout(5000).emitWithAck("command", command)) as Ack;
        } catch {}
      }
      if (!ack) {
        get().toast("The connection hiccuped. Your table will catch up in a second.");
        s.emit("sync");
        return false;
      }
      if (!ack.ok) {
        get().toast(ack.error);
        play("error");
        return false;
      }
      return true;
    } finally {
      set({ busy: false });
    }
  },

  async say(text) {
    const s = socket;
    if (!s?.connected) return false;
    try {
      const ack = (await s.timeout(5000).emitWithAck("chat", { text })) as Ack;
      if (!ack.ok) get().toast(ack.error);
      return ack.ok;
    } catch {
      get().toast("Message not sent. Check your connection.");
      return false;
    }
  },

  react(kind, index) {
    socket?.emit("reaction", { kind, index });
  },

  takeOver() {
    const code = get().code;
    if (!code) return;
    socket?.disconnect();
    socket = null;
    set({ code: null });
    get().enterRoom(code);
  },

  toast(text) {
    const id = ++toastSeq;
    set((st) => ({ toasts: [...st.toasts.filter((t) => t.text !== text).slice(-2), { id, text }] }));
    setTimeout(() => get().dismissToast(id), 5000);
  },

  dismissToast(id) {
    set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) }));
  },

  setPanelOpen(open) {
    set((st) => ({ panelOpen: open, unread: open ? 0 : st.unread }));
  },

  markChatRead() {
    set({ unread: 0 });
  },
}));

window.addEventListener("popstate", () => {
  const route = routeFromPath(location.pathname);
  useStore.setState({ route });
});

function soundsFor(fresh: LogEntry[], snap: RoomSnapshot) {
  let delay = 0;
  const self = snap.selfId;
  for (const entry of fresh) {
    if (entry.kind === "room") {
      if (entry.type === "joined") play("join", delay);
      if (entry.type === "left" || entry.type === "removed") play("leave", delay);
      continue;
    }
    const e = entry.event;
    switch (e.type) {
      case "roundStart":
        play("shuffle", delay);
        for (let i = 0; i < 7; i++) play("deal", delay + 480 + i * 70);
        delay += 960;
        break;
      case "play":
        play("card", delay);
        if (e.card.color === "wild") play("wild", delay + 80);
        delay += 120;
        break;
      case "draw":
        if (e.count === 0) break;
        play(e.reason === "draw" || e.reason === "timeout" ? "draw" : "penalty", delay);
        delay += 100;
        break;
      case "skip":
        play("skip", delay);
        break;
      case "reverse":
        play("reverse", delay);
        break;
      case "uno":
        play("uno", delay);
        break;
      case "caught":
        play("caught", delay);
        break;
      case "reshuffle":
        play("shuffle", delay);
        break;
      case "turn":
        if (e.playerId === self) {
          play("turn", delay + 150);
          vibrate(30);
        }
        break;
      case "matchOver":
      case "roundOver":
        if (e.type === "roundOver") play(e.winnerId === self ? "win" : "lose", delay + 200);
        break;
    }
  }
}

export function serverNow(): number {
  return Date.now() + useStore.getState().clockOffset;
}
