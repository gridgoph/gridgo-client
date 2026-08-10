import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * GRIDGO demo API client.
 *
 * Points at the local `gridgo-api` server. Replace this module's base URL and
 * auth storage later when Clerk / Supabase land — keep call sites stable.
 */

export type Role = "client" | "supplier" | "rider" | "ops_admin" | "super_admin";

/**
 * Client account kind for branding. Authoritative from login /auth/me —
 * never infer business from `orgName` (profile edits would flicker identity).
 */
export type AccountType = "individual" | "business";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Present for clients; missing/legacy consumers treat as individual. */
  accountType?: AccountType;
  orgName?: string;
  supplierName?: string;
};

/** A map point on an order. Absent until the platform knows one. */
export type OrderPoint = {
  lat: number;
  lng: number;
  label?: string | null;
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
  /** Optional finish from the platform taxonomy. */
  finish?: string | null;
  deadline: string | null;
  address: string;
  zone: string;
  totalMinor: number;
  deliveryFeeMinor: number;
  paymentMethod: string | null;
  paymentStatus: string;
  codEligible: boolean;
  promisedDate: string | null;
  /** Display string only — never file identity. See docs/STORAGE_API.md. */
  artworkName: string | null;
  /** Stored artwork ids, newest last. Empty is valid. */
  artworkFileIds?: string[];
  /** Supplier print proofs attached to this order. */
  proofFileIds?: string[];
  /** Supplier shop, once a supplier is assigned. */
  pickup?: OrderPoint | null;
  /** Delivery destination. */
  dropoff?: OrderPoint | null;
  payoutHold?: boolean;
  createdAt: string;
  updatedAt: string;
  timeline: { at: string; state: string; by: string; note: string; fileId?: string }[];
};

/** Platform-defined categories, materials and finishes. */
export type TaxonomyPayload = {
  categories: {
    id: string;
    code: string;
    name: string;
    productFamilyIds: string[];
    active: boolean;
  }[];
  materials: { id: string; code: string; name: string; categoryCodes: string[]; active: boolean }[];
  finishes: { id: string; code: string; name: string; categoryCodes: string[]; active: boolean }[];
};

export type Zone = {
  id: string;
  code: string;
  name: string;
  deliveryFeeMinor: number;
  active: boolean;
};

/** Public file record from the storage API. `objectKey` is never returned. */
export type StoredFile = {
  fileId: string;
  purpose: string;
  originalFilename: string;
  declaredContentType: string | null;
  detectedContentType: string;
  size: number;
  ownerId: string;
  state: string;
  createdAt: string;
  readyAt: string | null;
  references: { type: string; id: string; field: string }[];
};

/** Newest rider position for an order, or null when none has been shared. */
export type LocationPing = {
  id: string;
  orderId: string;
  riderId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
};

export type Issue = {
  id: string;
  orderId: string;
  clientId: string;
  description: string;
  kind: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
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
  finish?: string;
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

/** Fired when a request with a bearer token receives 401 — session must clear. */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Register a listener for mid-session unauthorized responses.
 * Returns an unsubscribe function. Used by the session store so the routing
 * guard — not call sites — handles navigation after token invalidation.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    listener();
  }
}

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
  if (!res.ok) {
    // Only clear when we actually sent a bearer token. Login 401 (wrong password)
    // has no token and must not touch session state.
    if (res.status === 401 && tokenMemory) {
      setToken(null);
      notifyUnauthorized();
    }
    throw new ApiError(res.status, data);
  }
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

/** Categories, materials and finishes the platform defines. */
export async function getTaxonomy(): Promise<TaxonomyPayload> {
  const result = await request<{ taxonomy: TaxonomyPayload }>("/taxonomy");
  return result.taxonomy;
}

/** Delivery zones with their authoritative delivery fees. */
export async function listZones(): Promise<Zone[]> {
  const result = await request<{ zones: Zone[] }>("/zones");
  return result.zones;
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

// ---------------------------------------------------------------------------
// Files — see docs/STORAGE_API.md in gridgo-api for the authoritative contract
// ---------------------------------------------------------------------------

export type UploadAsset = {
  /** Local file URI from the picker. Never read into memory. */
  uri: string;
  name: string;
  /** Picker MIME. iOS often reports a generic type; the server decides. */
  mimeType?: string | null;
};

export type UploadHandle = {
  /** Resolves only when the server returns `201` with a ready file record. */
  done: Promise<StoredFile>;
  /** Abandon the transfer (client left the screen, or chose another file). */
  cancel: () => void;
};

/**
 * Stream one file to `POST /files`.
 *
 * XMLHttpRequest rather than fetch for two reasons: it reports upload
 * progress, and React Native's implementation streams the multipart file part
 * straight from the URI. Reading a 200 MB artwork into a JS string or base64
 * would put a mid-range Android device out of memory.
 *
 * `onProgress` reaching 1 means the bytes left the phone — not that the file
 * is stored. Only the resolved {@link StoredFile} proves that.
 */
export function uploadFile(
  asset: UploadAsset,
  purpose: string,
  onProgress?: (fraction: number | null) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();

  const done = new Promise<StoredFile>((resolve, reject) => {
    const form = new FormData();
    form.append("purpose", purpose);
    // React Native's FormData takes this shape for a file part and streams it.
    form.append("file", {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || "application/octet-stream",
    } as unknown as Blob);

    xhr.open("POST", `${getApiBase()}/files`);
    xhr.responseType = "text";
    xhr.setRequestHeader("Accept", "application/json");
    if (tokenMemory) xhr.setRequestHeader("Authorization", `Bearer ${tokenMemory}`);
    // Content-Type is left unset on purpose: the platform supplies the
    // multipart boundary, and overriding it corrupts the request body.

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event: ProgressEvent) => {
        onProgress(event.lengthComputable && event.total > 0 ? event.loaded / event.total : null);
      };
    }

    xhr.onload = () => {
      let data: unknown = null;
      const text = typeof xhr.response === "string" ? xhr.response : "";
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (xhr.status === 201) {
        const file = (data as { file?: StoredFile } | null)?.file;
        if (file?.fileId) {
          resolve(file);
          return;
        }
        // A 201 without an id is not success; never invent one.
        reject(new ApiError(xhr.status, { error: "file_metadata_invalid" }));
        return;
      }
      if (xhr.status === 401 && tokenMemory) {
        setToken(null);
        notifyUnauthorized();
      }
      reject(new ApiError(xhr.status, data));
    };

    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Upload timeout"));
    xhr.onabort = () => reject(new ApiError(0, { error: "upload_cancelled" }));

    xhr.send(form);
  });

  return { done, cancel: () => xhr.abort() };
}

/** Bind a ready file to an order. Returns the file and the updated order. */
export async function attachFileToOrder(
  fileId: string,
  orderId: string,
): Promise<{ file: StoredFile; order: Order }> {
  return request(`/files/${fileId}/attach`, {
    method: "POST",
    body: JSON.stringify({ orderId }),
  });
}

/**
 * Short-lived signed URL for reading a stored file.
 * Never persist it — it is a capability, not identity. Ask again when it expires.
 */
export async function getFileDownloadUrl(
  fileId: string,
): Promise<{ fileId: string; url: string; expiresAt: string; expiresInSeconds: number }> {
  return request(`/files/${fileId}/download-url`);
}

export async function getFile(fileId: string): Promise<StoredFile> {
  const result = await request<{ file: StoredFile }>(`/files/${fileId}`);
  return result.file;
}

// ---------------------------------------------------------------------------
// Tracking and issues
// ---------------------------------------------------------------------------

/** Newest rider position for an order. `null` means none has been shared. */
export async function getRiderLocation(orderId: string): Promise<LocationPing | null> {
  const result = await request<{ ping: LocationPing | null }>(`/dispatch/${orderId}/location`);
  return result.ping;
}

/** Report a material issue while the order's issue window is open. */
export async function reportIssue(
  orderId: string,
  input: { kind: string; description: string },
): Promise<{ issue: Issue }> {
  return request(`/orders/${orderId}/issues`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listIssues(orderId?: string): Promise<Issue[]> {
  const suffix = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
  const result = await request<{ issues: Issue[] }>(`/issues${suffix}`);
  return result.issues;
}

/** Format PHP minor units (centavos) for display. */
export function formatPhp(minor: number): string {
  return `₱${(minor / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
