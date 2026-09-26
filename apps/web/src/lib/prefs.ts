function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export const prefs = {
  name: () => read("uno.name") ?? "",
  setName: (v: string) => write("uno.name", v),
  avatar: () => Number(read("uno.avatar") ?? Math.floor(Math.random() * 8)) % 8,
  setAvatar: (v: number) => write("uno.avatar", String(v)),
  sound: () => read("uno.sound") !== "off",
  setSound: (on: boolean) => write("uno.sound", on ? "on" : "off"),
  volume: () => Math.min(1, Math.max(0, Number(read("uno.volume") ?? 0.7))),
  setVolume: (v: number) => write("uno.volume", String(v)),
  sort: () => (read("uno.sort") === "number" ? "number" : read("uno.sort") === "none" ? "none" : "color") as SortMode,
  setSort: (v: SortMode) => write("uno.sort", v),
  panel: () => (read("uno.panel") as PanelTab | null) ?? "chat",
  setPanel: (v: PanelTab) => write("uno.panel", v),
};

export type SortMode = "color" | "number" | "none";
export type PanelTab = "chat" | "log" | "score";
