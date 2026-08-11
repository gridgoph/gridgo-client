import Constants from "expo-constants";
import { Platform } from "react-native";

import { adaptProductCategories, type ProductCategory } from "@/lib/productCategories";
import type { DevicePlatform } from "@/lib/push";

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
 * Signup accepts `personal` as an input alias; the API stores `individual`.
 */
export type AccountType = "individual" | "business" | "organization";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string;
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

/** The two halves of the digital payment. */
export type InstallmentCode = "downpayment" | "balance";

export type PaymentInstallment = {
  /** Null until a supplier accepts and the exact money exists. */
  amountMinor: number | null;
  method: string;
  /** `not_submitted | pending_confirmation | confirmed | legacy_confirmed`. */
  status: string;
  reference: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
};

export type OrderPayments = Record<InstallmentCode, PaymentInstallment>;

/**
 * Supplier fulfilment milestone as the client is allowed to see it.
 *
 * The server's role projection withholds `amountMinor` — these are shares of
 * the supplier's earnings, not of what the client pays.
 */
export type PayoutMilestone = {
  /** `printing | packaging_qc | delivered | retention`. */
  code: string;
  sharePercent: number;
  /** `pending_pof | pof_attached | released`. */
  status: string;
  pofFileIds: string[];
};

/**
 * The estimate shown before a supplier is assigned. Commission-inclusive and
 * client-safe; delivery is not in it, because no supplier location exists yet.
 */
export type PriceRange = {
  subtotalMinMinor: number;
  subtotalMaxMinor: number;
  /** `pending_supplier_assignment | final`. */
  deliveryFeeStatus: string;
};

/**
 * One print job as the client is allowed to see it.
 *
 * Money is subtotal, delivery and total only. The supplier's price and
 * GRIDGO's commission are withheld by the server's role projection — a field
 * for either of them here would be a misreading of the contract.
 */
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
  /** Product price plus GRIDGO's margin. Null until a supplier accepts. */
  subtotalMinor: number | null;
  /** Distance band fee. Null until the supplier's shop is known. */
  deliveryFeeMinor: number | null;
  /** Subtotal + delivery. Null until a supplier accepts. */
  totalMinor: number | null;
  downpaymentMinor: number | null;
  balanceMinor: number | null;
  /** Supplier shop → delivery address, once both are known. */
  deliveryDistanceMeters?: number | null;
  priceRange?: PriceRange | null;
  payments?: OrderPayments;
  payoutMilestones?: PayoutMilestone[];
  paymentMethod: string | null;
  paymentStatus: string;
  /** When the client was told a supplier accepted. Payment is gated on it. */
  assignmentNotifiedAt?: string | null;
  issueWindowOpenedAt?: string | null;
  issueWindowExpiresAt?: string | null;
  promisedDate: string | null;
  /** Display string only — never file identity. See docs/STORAGE_API.md. */
  artworkName: string | null;
  /** Stored artwork ids, newest last. Empty is valid. */
  artworkFileIds?: string[];
  /** Supplier shop, once a supplier is assigned. */
  pickup?: OrderPoint | null;
  /** Delivery destination. */
  dropoff?: OrderPoint | null;
  payoutHold?: boolean;
  createdAt: string;
  updatedAt: string;
  timeline: { at: string; state: string; by: string; note: string; fileId?: string }[];
};

/** Platform-wide operational settings. The issue window is one of them. */
export type PlatformSettings = {
  issueWindowHours: number;
  deliveryFeeBands: { maxDistanceMeters: number | null; feeMinor: number }[];
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

/**
 * Legacy address zone — a named part of Davao, and nothing more.
 * Delivery is priced by distance band now; a zone carries no fee.
 */
export type Zone = {
  id: string;
  code: string;
  name: string;
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
  /** e.g. `supplier_assignment_final_price`. Absent on older records. */
  type?: string;
  /** Present when the update is about one job, so the row can open it. */
  orderId?: string;
  title: string;
  body: string;
  read: boolean;
  at: string;
};

/** The update that tells a client a supplier accepted, and what it will cost. */
export const ASSIGNMENT_NOTIFICATION_TYPE = "supplier_assignment_final_price";

/**
 * A phone registered to receive push.
 *
 * The raw token is never returned by any route: `tokenTail` is its last eight
 * characters, which is enough to recognise a registration in a support
 * conversation and not enough to send to it.
 */
export type Device = {
  id: string;
  userId: string;
  platform: DevicePlatform;
  tokenTail: string;
  createdAt: string;
  updatedAt: string;
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
  /** When true, order starts as `submitted` rather than `draft`. */
  submit?: boolean;
};

/** Everything `POST /auth/signup` needs for a client account. */
export type ClientSignupInput = {
  email: string;
  password: string;
  name: string;
  phone: string;
  accountType: AccountType;
  /** Required by the API for business and organization accounts. */
  orgName?: string;
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

/**
 * Create a client account. Clients are the only role that signs up in this
 * binary — supplier and rider accounts are created in their own apps and wait
 * on Operations approval, so this never offers to make one.
 */
export async function signupClient(
  input: ClientSignupInput,
): Promise<{ token: string; user: User }> {
  const result = await request<{ token: string; user: User }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ role: "client", ...input }),
  });
  setToken(result.token);
  return result;
}

/**
 * Sign out, and stop this phone receiving the account's push in the same call.
 *
 * The device token goes with the sign-out rather than through
 * `POST /devices/unregister` for a sequencing reason the contract is explicit
 * about: after logout the bearer token is invalid, so a phone that signs out
 * first can no longer authenticate an unregister and would keep showing the
 * previous person's orders on its lock screen. Sending no token stays valid and
 * behaves exactly as it did before push existed.
 *
 * `deviceUnregistered` is `false` — with a `200` and a completed sign-out — when
 * no token was sent, the session had already expired, or the token now belongs
 * to somebody else. None of those is a failure worth showing anyone.
 */
export async function logout(deviceToken?: string | null): Promise<void> {
  try {
    await request("/auth/logout", {
      method: "POST",
      body: JSON.stringify(deviceToken ? { deviceToken } : {}),
    });
  } finally {
    setToken(null);
  }
}

/**
 * Register this installation's FCM token against the signed-in account.
 *
 * Idempotent and cheap by design, so it is called on every launch and on every
 * token refresh: re-registering the same token under the same account updates
 * the one record, and registering a token held by another account **moves** it,
 * which is what a shared handset or a sign-out/sign-in on one phone produces.
 * `201` means the token was new, `200` that it was updated or moved — both are
 * success, so only the body is read.
 */
export async function registerDevice(
  token: string,
  platform: DevicePlatform,
): Promise<{ device: Device; created: boolean; reassigned: boolean }> {
  return request<{ device: Device; created: boolean; reassigned: boolean }>("/devices", {
    method: "POST",
    body: JSON.stringify({ token, platform }),
  });
}

/** The caller's own registrations, always — there is no route to anyone else's. */
export async function listDevices(): Promise<Device[]> {
  const result = await request<{ devices: Device[] }>("/devices");
  return result.devices;
}

/**
 * Drop one registration.
 *
 * Prefer passing the token to {@link logout}. This exists for the case where
 * the session is still valid and only push is being turned off. A token
 * registered to a different account returns `404`, exactly as an unregistered
 * one does, so that asking cannot answer "is this token someone else's?".
 */
export async function unregisterDevice(token: string): Promise<void> {
  await request("/devices/unregister", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
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

/**
 * The browsable product tree — the four customer-facing categories and their
 * subcategories, normalised.
 *
 * Falls back to the bundled transcription of the captain's chart when this
 * deployment's `/taxonomy` does not publish the tree yet. See
 * `lib/productCategories.ts`.
 */
export async function getProductCategories(): Promise<ProductCategory[]> {
  return adaptProductCategories(await getTaxonomy());
}

/** Named parts of Davao, used to locate an address. Fees are not zone-based. */
export async function listZones(): Promise<Zone[]> {
  const result = await request<{ zones: Zone[] }>("/zones");
  return result.zones;
}

/** Platform-wide settings. The issue window's length lives here, not in code. */
export async function getSettings(): Promise<PlatformSettings> {
  const result = await request<{ settings: PlatformSettings }>("/settings");
  return result.settings;
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
 * Send the reference for one half of the digital payment.
 *
 * The money does not move through GRIDGO: the client pays by QR and hands over
 * the reference, and Operations confirms it by hand. So a `200` here means
 * "submitted for checking", never "paid". Refused with
 * `assignment_notification_required` until the client has been told the final
 * price — payment can never be asked for before that.
 */
export async function submitPayment(
  orderId: string,
  installment: InstallmentCode,
  reference: string,
): Promise<Order> {
  const result = await request<{ order: Order }>(
    `/orders/${orderId}/payments/${installment}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ method: "qr_manual", reference }),
    },
  );
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

export async function health(): Promise<{ ok: boolean }> {
  return request("/health");
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
