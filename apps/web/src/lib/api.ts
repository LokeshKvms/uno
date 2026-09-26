import type { JoinResult, RoomPreview, SessionInfo } from "@uno/protocol";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError("Can't reach the table right now. Check your connection and try again.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? "Something went wrong. Please try again.", res.status);
  return body as T;
}

export const api = {
  session: () => request<SessionInfo>("/api/session", { method: "POST", body: "{}" }),
  createRoom: (name: string, avatar: number, bots?: { count: number; level: "easy" | "normal" | "hard" }) =>
    request<JoinResult>("/api/rooms", { method: "POST", body: JSON.stringify({ name, avatar, bots }) }),
  joinRoom: (code: string, name: string, avatar: number) =>
    request<JoinResult>(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ name, avatar }),
    }),
  preview: (code: string) => request<RoomPreview>(`/api/rooms/${encodeURIComponent(code)}`),
};
