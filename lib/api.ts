import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * GRIDGO demo API client.
 *
 * Points at the local `gridgo-api` server. Replace this module's base URL and
 * auth storage later when Clerk / Supabase land — keep call sites stable.
 */

export type Role = "client" | "supplier" | "rider" | "ops_admin" | "super_admin";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgName?: string;
  supplierName?: string;
};

export type Order = {
  id: string;
  clientId: string;
  supplierId: string | null;
  riderId: string | null;
  state: string;
  productId: string;
  title: string;
  quantity: number;
  size: string;
  material: string;
  deadline: string | null;
  address: string;
  zone: string;
  totalMinor: number;
  deliveryFeeMinor: number;
  paymentMethod: string | null;
  paymentStatus: string;
  codEligible: boolean;
  promisedDate: string | null;
  artworkName: string | null;
  createdAt: string;
  updatedAt: string;
  timeline: { at: string; state: string; by: string; note: string }[];
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  at: string;
};

export type CatalogProduct = {
  id: string;
  name: string;
  family: string;
  basePriceMinor: number;
  unit: string;
};

export type CreateOrderInput = {
  productId: string;
  title?: string;
  quantity: number;
  size: string;
  material: string;
  deadline: string | null;
  address: string;
  zone?: string;
  artworkName?: string | null;
  deliveryFeeMinor?: number;
  /** When true, order starts as `submitted` rather than `draft`. */
  submit?: boolean;
};

export type CreditBalance = {
  clientId: string;
  balanceMinor: number;
  ledger: {
    id: string;
    type: string;
    amountMinor: number;
    balanceAfterMinor: number;
    reason: string;
    at: string;
    actorId: string;
  }[];
};

let tokenMemory: string | null = null;

const DEFAULT_API_PORT = "8787";

/** Inputs for {@link resolveApiBase} — pure so unit tests can cover every branch. */
export type ResolveApiBaseInput = {
  /** Explicit override from EXPO_PUBLIC_API_URL. */
  envUrl?: string | null;
  /** EXPO_PUBLIC_API_PORT; defaults to 8787 when empty. */
  envPort?: string | null;
  /**
   * Dev-server host string from expo-constants (e.g. `192.168.1.55:8081`).
   * Hostname is extracted; the bundler's port is dropped.
   */
  hostUri?: string | null;
  platformOS: typeof Platform.OS | string;
};

/**
 * Resolve the demo API origin.
 *
 * Precedence:
 * 1. Non-empty `envUrl` (trailing slash stripped)
 * 2. Hostname from Expo dev-server `hostUri` + `apiPort`
 * 3. If that hostname is loopback and platform is Android → `10.0.2.2` (emulator)
 * 4. `http://127.0.0.1:<apiPort>`
 */
export function resolveApiBase({
  envUrl,
  envPort,
  hostUri,
  platformOS,
}: ResolveApiBaseInput): string {
  const trimmedUrl = envUrl?.trim().replace(/\/$/, "");
  if (trimmedUrl) return trimmedUrl;

  const port = envPort?.trim() || DEFAULT_API_PORT;
  const hostname = hostnameFromHostUri(hostUri);

  if (hostname) {
    if (isLoopbackHost(hostname) && platformOS === "android") {
      return `http://10.0.2.2:${port}`;
    }
    return `http://${hostname}:${port}`;
  }

  return `http://127.0.0.1:${port}`;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Take host:port or a full URL and return just the hostname. */
export function hostnameFromHostUri(hostUri?: string | null): string | null {
  if (!hostUri) return null;
  const raw = hostUri.trim();
  if (!raw) return null;

  try {
    const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const { hostname } = new URL(withProto);
    return hostname || null;
  } catch {
    // hostUri without a parseable URL shape — best-effort host:port split
    const hostPart = raw.split("/")[0] ?? "";
    if (hostPart.startsWith("[")) {
      const end = hostPart.indexOf("]");
      if (end > 0) return hostPart.slice(1, end) || null;
    }
    const host = hostPart.split(":")[0];
    return host || null;
  }
}

/**
 * Collect the Expo dev-server host from whichever Constants field is populated
 * (Expo Go, dev client, classic vs modern manifest).
 */
function readExpoDevHostUri(): string | null {
  type LooseManifest = {
    debuggerHost?: string;
    hostUri?: string;
    extra?: {
      expoClient?: { hostUri?: string };
      expoGo?: { debuggerHost?: string };
    };
  };

  const classic = Constants.manifest as LooseManifest | null | undefined;
  const modern = Constants.manifest2 as LooseManifest | null | undefined;
  const expoGo = Constants.expoGoConfig as { debuggerHost?: string } | null | undefined;

  const candidates: Array<string | null | undefined> = [
    Constants.expoConfig?.hostUri,
    modern?.extra?.expoClient?.hostUri,
    modern?.extra?.expoGo?.debuggerHost,
    expoGo?.debuggerHost,
    classic?.debuggerHost,
    classic?.hostUri,
    Constants.platform?.hostUri,
  ];

  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function getApiBase(): string {
  return resolveApiBase({
    envUrl: process.env.EXPO_PUBLIC_API_URL,
    envPort: process.env.EXPO_PUBLIC_API_PORT,
    hostUri: readExpoDevHostUri(),
    platformOS: Platform.OS,
  });
}

/** True when fetch failed before an HTTP response (API process down / wrong host). */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    error.name === "TypeError" ||
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("load failed")
  );
}

export function setToken(token: string | null): void {
  tokenMemory = token;
}

export function getToken(): string | null {
  return tokenMemory;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : `HTTP ${status}`,
    );
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (tokenMemory) headers.Authorization = `Bearer ${tokenMemory}`;

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const result = await request<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await request("/auth/logout", { method: "POST" });
  } finally {
    setToken(null);
  }
}

export async function me(): Promise<User> {
  const result = await request<{ user: User }>("/auth/me");
  return result.user;
}

export async function listCatalog(): Promise<CatalogProduct[]> {
  const result = await request<{ catalog: CatalogProduct[] }>("/catalog");
  return result.catalog;
}

export async function listOrders(): Promise<Order[]> {
  const result = await request<{ orders: Order[] }>("/orders");
  return result.orders;
}

export async function getOrder(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}`);
  return result.order;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const result = await request<{ order: Order }>("/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.order;
}

/**
 * Authorize Pilot Credits for an order in `awaiting_payment`.
 * Throws ApiError 402 with `{ error, needMinor, balanceMinor }` when short.
 */
export async function authorizeCredits(
  orderId: string,
): Promise<{ order: Order; balanceMinor: number }> {
  return request("/credits/authorize", {
    method: "POST",
    body: JSON.stringify({ orderId }),
  });
}

export async function listJobs(): Promise<Order[]> {
  const result = await request<{ jobs: Order[] }>("/jobs");
  return result.jobs;
}

export async function listOffers(): Promise<Order[]> {
  const result = await request<{ offers: Order[] }>("/dispatch/offers");
  return result.offers;
}

export async function acceptOffer(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/dispatch/${orderId}/accept`, {
    method: "POST",
    body: "{}",
  });
  return result.order;
}

export async function transitionOrder(
  orderId: string,
  state: string,
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}/transition`, {
    method: "POST",
    body: JSON.stringify({ state, ...extra }),
  });
  return result.order;
}

export async function listNotifications(): Promise<Notification[]> {
  const result = await request<{ notifications: Notification[] }>("/notifications");
  return result.notifications;
}

export async function creditBalance(): Promise<CreditBalance> {
  return request("/credits/balance");
}

export async function health(): Promise<{ ok: boolean }> {
  return request("/health");
}

export async function requestProof(
  orderId: string,
  kind: string,
  extra: Record<string, unknown> = {},
): Promise<{ order: Order }> {
  return request(`/dispatch/${orderId}/proof`, {
    method: "POST",
    body: JSON.stringify({ kind, otp: "1234", photoName: "demo.jpg", ...extra }),
  });
}

/** Format PHP minor units (centavos) for display. */
export function formatPhp(minor: number): string {
  return `₱${(minor / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
