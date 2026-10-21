const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export type AIStatus = {
  available: boolean;
  model: string;
  model_installed: boolean;
  models: string[];
  message: string;
};
export type Activity = {
  id: number;
  created_at: string;
  action: string;
  summary: string;
  undoable: boolean;
};
export type Rule = { id: number; name: string; extensions: string[]; folder: string };
export type Move = { source: string; destination: string };
export type Preview = {
  preview_id: string;
  root: string;
  fingerprint: string;
  moves: Move[];
  count: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Could not reach LazyFlow. Check that the backend is running.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Something went wrong. Please try again.");
  }
  return payload as T;
}

export const api = {
  health: () => request<{ status: string; ai: AIStatus; offline_tools: string[] }>("/api/health"),
  activity: () => request<Activity[]>("/api/activity"),
  rules: () => request<Rule[]>("/api/rules"),
  preview: (root: string, mode: string, custom?: Record<string, string>) =>
    request<Preview>("/api/organizer/preview", {
      method: "POST",
      body: JSON.stringify({ root, mode, custom }),
    }),
  confirm: (preview_id: string) =>
    request<{ moved: number; activity_id: number | null }>("/api/organizer/confirm", {
      method: "POST",
      body: JSON.stringify({ preview_id }),
    }),
  undo: (id: number) =>
    request<{ restored: number }>(`/api/organizer/undo/${id}`, { method: "POST" }),
  summarize: (text: string) =>
    request<{ summary: string; source: string }>("/api/summarize", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  digest: (text: string) =>
    request<{ summary: string; tasks: string[]; source: string }>("/api/digest", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  focus: () => request<{ title: string; routine: string }>("/api/focus"),
  chat: (text: string) =>
    request<{ reply: string }>("/api/chat", { method: "POST", body: JSON.stringify({ text }) }),
  addRule: (rule: { name: string; extensions: string[]; folder: string }) =>
    request<Rule>("/api/rules", { method: "POST", body: JSON.stringify(rule) }),
  deleteRule: (id: number) =>
    request<{ deleted: boolean }>(`/api/rules/${id}`, { method: "DELETE" }),
};
