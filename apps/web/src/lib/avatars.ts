export const AVATAR_TONES = ["#8d6e63", "#6d8a96", "#8a7fa8", "#7f9a6f", "#a77d6a", "#6f8f86", "#9a8a5e", "#86718d"];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1]![0] : (parts[0]?.[1] ?? "");
  return (first + (second ?? "")).toUpperCase();
}
