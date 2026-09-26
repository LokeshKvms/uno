export function seatAngles(count: number): number[] {
  if (count <= 1) return [90];
  const others = count - 1;
  if (others === 1) return [90, 270];
  const start = others <= 3 ? 180 : 162;
  const end = others <= 3 ? 360 : 378;
  const step = (end - start) / (others - 1);
  return [90, ...Array.from({ length: others }, (_, i) => start + i * step)];
}

export function onEllipse(angle: number, rx = 50, ry = 50): { left: number; top: number } {
  const rad = (angle * Math.PI) / 180;
  return { left: 50 + Math.cos(rad) * rx, top: 50 + Math.sin(rad) * ry };
}

export function travelTo(current: number, target: number, direction: 1 | -1): number {
  const norm = ((target % 360) + 360) % 360;
  const base = current - (((current % 360) + 360) % 360);
  let next = base + norm;
  if (direction === 1) {
    while (next <= current + 0.5) next += 360;
    while (next - current > 360) next -= 360;
  } else {
    while (next >= current - 0.5) next -= 360;
    while (current - next > 360) next += 360;
  }
  return next;
}

export function rotateToViewer<T extends { id: string }>(seats: T[], viewerId: string | null): T[] {
  const i = seats.findIndex((s) => s.id === viewerId);
  if (i <= 0) return seats;
  return [...seats.slice(i), ...seats.slice(0, i)];
}
