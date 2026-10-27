/**
 * Client portal API access (P2.6).
 *
 * Two flavours, one surface:
 *
 * - `apiServer*` runs in server components / route handlers and calls the API
 *   service directly, forwarding the incoming `mkus_portal` cookie. Server-side
 *   fetches never go through the Next rewrite (that path is for browsers).
 * - `apiClient*` runs in the browser against the same-origin `/api/*` prefix
 *   that `next.config.mjs` rewrites to the API, so the host-only session cookie
 *   stays first-party. Mutations attach the `x-csrf-token` double-submit header
 *   read from the non-HttpOnly `mkus_csrf` cookie (set at magic-link verify).
 *
 * Both return a discriminated `ApiResult` so pages handle 401/403/404
 * explicitly instead of throwing through the render tree.
 */

export const PORTAL_SESSION_COOKIE = "mkus_portal";
export const PORTAL_CSRF_COOKIE = "mkus_csrf";

/** Contract `Problem` shape (03-api-contract.yaml): stable `code` vocabulary. */
export interface ApiProblem {
  status: number;
  code: string;
  title?: string;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; problem: ApiProblem };

export interface ActorContext {
  actorId: string;
  role: string | null;
  locale: string;
  contactId: string | null;
  permissions: string[];
}

export interface ApplicationItem {
  id: string;
  serialNumber: string;
  status: string;
  filingMethod: string;
  filingDate: string | null;
  deadlineAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TimelineEvent {
  type: "ORDER" | "CONVERSATION" | "DOCUMENT";
  id: string;
  contactId: string;
  applicationId: string | null;
  createdAt: string;
  summary: string | null;
}

export interface DocumentRecord {
  id: string;
  contactId: string;
  applicationId: string | null;
  currentVersion: number;
  filename: string;
}

export interface DownloadTicket {
  url: string;
  expiresAt: string;
}

export interface UploadTicket {
  documentId: string;
  uploadUrl: string;
  expiresAt: string;
  method: "PUT";
  headers: { "Content-Length": string; "Content-Type": string };
  maxSizeBytes: number;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsPage extends Page<NotificationItem> {
  unreadCount: number;
}

export interface MagicLinkVerifyResult {
  contactId: string;
  displayName: string;
  csrfToken: string;
  expiresAt: string;
}

/** Server-side base URL; never exposed to the browser bundle. */
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

async function parseProblem(response: Response): Promise<ApiProblem> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    return {
      status: response.status,
      code: typeof body.code === "string" ? body.code : "UNKNOWN",
      ...(typeof body.title === "string" ? { title: body.title } : {}),
    };
  } catch {
    return { status: response.status, code: "UNKNOWN" };
  }
}

async function toResult<T>(response: Response): Promise<ApiResult<T>> {
  if (!response.ok) {
    return { ok: false, status: response.status, problem: await parseProblem(response) };
  }
  if (response.status === 204) {
    return { ok: true, status: response.status, data: undefined as T };
  }
  return { ok: true, status: response.status, data: (await response.json()) as T };
}

/**
 * Server-side GET with the portal session cookie forwarded. `cookieHeader` is
 * the raw `Cookie` header value built by the caller from `next/headers` — this
 * module stays free of Next imports so it runs unchanged under jest.
 */
export async function apiServerGet<T>(path: string, cookieHeader: string): Promise<ApiResult<T>> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "GET",
    headers: { cookie: cookieHeader, accept: "application/json" },
    cache: "no-store",
  });
  return toResult<T>(response);
}

/** Browser-side call through the same-origin `/api/*` rewrite. */
export async function apiClient<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCookie(PORTAL_CSRF_COOKIE);
    if (csrf !== null) headers["x-csrf-token"] = csrf;
  }
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return toResult<T>(response);
}

/** Read a non-HttpOnly cookie by name in the browser; `null` when absent. */
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}
