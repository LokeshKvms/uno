export const AVATAR_TONES = ["#896b60", "#5d757f", "#756c8f", "#637857", "#8e6a5a", "#5c776f", "#7e714d", "#7f6b86"];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1]![0] : (parts[0]?.[1] ?? "");
  return (first + (second ?? "")).toUpperCase();
}
