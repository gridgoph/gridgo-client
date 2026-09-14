import { withRequestDeadline } from "@/lib/requestDeadline";
import { liveGeneration, assertLiveGeneration } from "@/lib/live";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
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
  /**
   * What the account was at when it was read. Sent back on a correction so a
   * change Operations made in the meantime is refused rather than overwritten.
   * Absent from deployments whose `/me` does not version yet.
   */
  version?: number;
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
  /** Whether this order has already been rated, so a client is asked once. */
  rated?: boolean;
  clientId: string;
  supplierId: string | null;
  riderId: string | null;
  state: string;
  productId: string;
  title: string;
  quantity: number;
  /** Catalog unit for {@link describeQuantity}, when the order has no productId. */
  unit?: string;
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
  /**
   * Whether the client collects this order or has it delivered.
   *
   * Collecting means the GRIDGO Office counter, not the shop that printed it —
   * a rider still carries the job there. So the whole travel half of the
   * vocabulary changes: nothing is ever "out for delivery" to a client who is
   * coming to fetch it themselves.
   */
  fulfillmentMode?: FulfilmentMode | null;
  /** Supplier shop, once a supplier is assigned. Where the client collects. */
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
  /**
   * GRIDGO's own charge, in basis points of the items subtotal. Never a
   * constant in the app: Operations changes it without a release, and a stale
   * copy here would disagree with what the client is billed.
   */
  serviceFeeRateBps: number;
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
/**
 * What the file said about itself, read by GRIDGO when it was uploaded.
 *
 * Every field is advisory. A scan at 96 DPI and the same scan at 300 DPI are
 * the same pixels and different pieces of paper, so the client may overrule
 * any of it — this fills a field in, it does not decide one.
 *
 * Absent entirely when the file said nothing readable, which is a real and
 * common answer: a PNG with no declared density has a pixel size and no
 * physical one.
 */
export type DetectedArtwork = {
  kind: "pdf" | "raster";
  /** Pages in a PDF; 1 for an image; null when the file would not say. */
  pageCount: number | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
  dpi: number | null;
  /** Always "mm" when a physical size was read at all. */
  measureUnit: "mm" | null;
  /** Thousandths of a millimetre, so no float carries a measurement. */
  widthMilli: number | null;
  heightMilli: number | null;
  /** "A4", "Letter" — null when the size matches no name GRIDGO knows. */
  pageSize: string | null;
  orientation: "portrait" | "landscape" | "square" | null;
};

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
  /** Present only when the bytes carried something worth reading. */
  detected?: DetectedArtwork;
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
  /** Job title from the list payload — not a hydrated order. */
  orderTitle?: string;
  /** Job state from the list payload, enough for the stage rail. */
  orderState?: string;
  /** Collect vs door — from the live job, so a pickup is never drawn as a delivery. */
  fulfillmentMode?: FulfilmentMode | null;
  /**
   * True when a collected job is on the counter but the remaining balance is
   * still unpaid. Absent on deliveries and on collect jobs that are released.
   */
  collectHold?: boolean;
  title: string;
  body: string;
  /** Broadcast picture. Public HTTPS link or `/public/announcement-images/<fileId>`. */
  imageUrl?: string | null;
  read: boolean;
  at: string;
};

export type NotificationList = {
  notifications: Notification[];
  snapshot: string | null;
};

/** Recent window for the inbox. The API clamps higher values. */
export const NOTIFICATION_LIST_LIMIT = 40;
/** Hung list reads become an error, not an endless skeleton. */
export const NOTIFICATIONS_TIMEOUT_MS = 8_000;

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
/**
 * `force` asks the identity provider to mint a new token rather than answer
 * from its cache. Only {@link request} sets it, and only after a `401` on a
 * token it had already sent — every other read stays on the cheap path.
 */
type TokenProvider = (options?: { force?: boolean }) => Promise<string | null>;
let tokenProvider: TokenProvider | null = null;

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
  /**
   * False on an Android emulator (loopback is 10.0.2.2). True on a physical
   * phone: USB reverse maps the phone's own 127.0.0.1 to this machine.
   */
  isDevice?: boolean | null;
};

/**
 * Resolve the demo API origin.
 *
 * Precedence:
 * 1. Non-empty `envUrl` (trailing slash stripped)
 * 2. Hostname from Expo dev-server `hostUri` + `apiPort`
 * 3. If that hostname is loopback and platform is Android:
 *    emulator → `10.0.2.2`; physical USB phone → `127.0.0.1` (adb reverse)
 * 4. `http://127.0.0.1:<apiPort>`
 */
export function resolveApiBase({
  envUrl,
  envPort,
  hostUri,
  platformOS,
  isDevice,
}: ResolveApiBaseInput): string {
  const trimmedUrl = envUrl?.trim().replace(/\/$/, "");
  if (trimmedUrl) return trimmedUrl;

  const port = envPort?.trim() || DEFAULT_API_PORT;
  const hostname = hostnameFromHostUri(hostUri);

  if (hostname) {
    if (isLoopbackHost(hostname) && platformOS === "android") {
      // 10.0.2.2 is only the emulator's path to the host. A USB phone with
      // adb reverse has GRIDGO on its own loopback; 10.0.2.2 never answers,
      // and Sign In sits on "Checking…" until the fetch dies.
      if (isDevice === false) return `http://10.0.2.2:${port}`;
      return `http://127.0.0.1:${port}`;
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
    isDevice: Constants.isDevice,
  });
}

/** In-app picture URL. Hosted broadcast paths resolve against this app's API. */
export function notificationImageUrl(imageUrl?: string | null): string | null {
  const value = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (!value) return null;
  if (value.startsWith("/")) return `${getApiBase().replace(/\/$/, "")}${value}`;
  return value;
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
    msg.includes("load failed") ||
    msg.includes("aborted") ||
    error.name === "AbortError"
  );
}

export function setToken(token: string | null): void {
  tokenMemory = token;
}

/**
 * Supply the current identity token without persisting it in app state.
 * Clerk refreshes this value, so every request resolves it just in time.
 */
export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export async function getAuthToken(force = false): Promise<string | null> {
  return (await resolveToken(force)).token;
}

export function getToken(): string | null {
  return tokenMemory;
}

type ResolvedToken = {
  token: string | null;
  source: "legacy" | "provider" | null;
};

async function resolveToken(force = false): Promise<ResolvedToken> {
  if (tokenMemory) return { token: tokenMemory, source: "legacy" };
  const token = (await tokenProvider?.({ force })) ?? null;
  return { token, source: token ? "provider" : null };
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

export type RequestOptions = {
  /**
   * Skip the mid-session 401 handler. Used to probe `/auth/me` before
   * `POST /auth/clerk/activate` — that first 401 means "unmapped", not "sign out".
   */
  ignoreUnauthorized?: boolean;
};

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
  /**
   * Set once by the `401` retry below, after asking the identity provider for
   * a freshly minted token. It is only ever true on the second attempt, so a
   * request can cost at most one extra round trip.
   */
  forceFreshToken = false,
): Promise<T> {
  return withRequestDeadline(init.signal, async (signal) => {
  const generation = liveGeneration();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (signal.aborted) throw new Error("Request cancelled");
  const auth = await resolveToken(forceFreshToken);
  if (signal.aborted) throw new Error("Request cancelled");
  assertLiveGeneration(generation);
  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
    if (path !== "/auth/clerk/activate") headers["X-GRIDGO-Role"] = "client";
  }

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers, signal });
  const text = await res.text();
  if (signal.aborted) throw new Error("Request cancelled");
  assertLiveGeneration(generation);
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
    if (res.status === 401 && auth.token && !options.ignoreUnauthorized) {
      // The one place a forced token mint is worth its round trip: the bearer
      // we sent came from the identity provider's cache and the API refused
      // it. Ask for a new one and try once. `ignoreUnauthorized` is excluded
      // deliberately — that 401 is the unmapped-identity probe before
      // activate, where a fresher token changes nothing.
      if (auth.source === "provider" && !forceFreshToken) {
        return request<T>(path, { ...init, signal }, options, true);
      }
      if (auth.source === "legacy") setToken(null);
      notifyUnauthorized();
    }
    throw new ApiError(res.status, data);
  }
  return data as T;
  });
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
/** Resolve against the current provider before account teardown. */
export function captureLogoutBearer(): Promise<string | null> {
  return getAuthToken().catch(() => null);
}

export async function logout(
  deviceToken?: string | null,
  capturedBearer: Promise<string | null> = captureLogoutBearer(),
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const bearer = await capturedBearer;
    if (!bearer || controller.signal.aborted) return;
    await fetch(`${getApiBase()}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", "X-GRIDGO-Role": "client" },
      body: JSON.stringify(deviceToken ? { deviceToken } : {}),
      signal: controller.signal,
    });
  } catch {
    // Local sign-out remains available offline. Never mutate a newer identity.
  } finally {
    clearTimeout(timer);
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
  signal?: AbortSignal,
): Promise<{ device: Device; created: boolean; reassigned: boolean }> {
  return request<{ device: Device; created: boolean; reassigned: boolean }>("/devices", {
    method: "POST",
    signal,
    body: JSON.stringify({ token, platform, appRole: "client" }),
  });
}

/**
 * Provisional. Register this phone **before anyone has signed in**.
 *
 * A customer that installs GRIDGO and does not sign in for a week is still a
 * phone GRIDGO needs to reach — "there is a new version, update your app" is
 * exactly the announcement that must land on a handset with no session.
 * `POST /devices` requires a bearer today; the platform is opening it to an
 * unauthenticated caller in parallel with this app, registering the token
 * **unclaimed**. Signing in then claims it through the ordinary
 * {@link registerDevice}, because the contract already moves a token from one
 * owner to another on registration.
 *
 * Two deliberate differences from every other call in this module:
 *
 * - It never sends a bearer, even when one exists. A claimed registration is
 *   {@link registerDevice}'s job, and mixing the two would make which one ran
 *   depend on timing.
 * - It does not go through `request()`, so its `401` cannot clear the session.
 *   A deployment without this route answers `401`, and routing that through the
 *   unauthorized handler would sign a customer out because a *provisional*
 *   route is not live yet. `store/push.ts` reads the status and treats `401`,
 *   `403`, `404` and `405` as "not open yet" rather than a failure.
 *
 * Throws {@link ApiError} exactly as `request()` would, so callers read one
 * shape.
 */
export async function registerDeviceUnclaimed(
  token: string,
  platform: DevicePlatform,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/devices`, {
    method: "POST",
    signal,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform, appRole: "client" }),
  });
  if (!res.ok) {
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    throw new ApiError(res.status, data);
  }
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

export async function me(options?: RequestOptions): Promise<User> {
  const result = await request<{ user: User }>("/auth/me", {}, options);
  return result.user;
}

/**
 * Whether this email may continue in the Client app.
 *
 * Called after Clerk has accepted the password, before any device-trust code
 * is sent. Never sends a bearer: a leftover JWT would stall the lookup on a
 * token wait, and this answer is about the typed address, not the leftover.
 * A missing route (older API) throws {@link ApiError} so the login gate can
 * fail open for real clients.
 */
export async function clientEmailAvailable(email: string): Promise<boolean> {
  const res = await fetch(`${getApiBase()}/auth/clerk/client-available`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
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
  return (
    typeof data === "object" &&
    data !== null &&
    "available" in data &&
    (data as { available: unknown }).available === true
  );
}

/** Fields a verified Clerk session may send when creating or completing a client. */
export type ClerkActivateInput = {
  accountType?: AccountType;
  orgName?: string;
  name?: string;
};

/**
 * Create or link a client profile from the current Clerk session JWT.
 *
 * Sibling contract: `POST /auth/clerk/activate`. A 401 here is "still
 * unmapped", not a dead session, so the probe does not fire `onUnauthorized`.
 */
export async function activateClerkClient(input: ClerkActivateInput = {}): Promise<User> {
  const body: Record<string, string> = {};
  if (input.accountType) body.accountType = input.accountType;
  if (input.orgName) body.orgName = input.orgName;
  if (input.name) body.name = input.name;
  const result = await request<{ user: User }>(
    "/auth/clerk/activate",
    { method: "POST", body: JSON.stringify(body) },
    { ignoreUnauthorized: true },
  );
  return result.user;
}

// ---------------------------------------------------------------------------
// Shop boards — the public supplier catalog
//
// A shop's board is the listings it wrote itself: a sample, a price, the steps
// a client answers, and what artwork it takes. `docs/SUPPLIER_CATALOG_API.md`
// in gridgo-api is the contract. Everything here is public browse — a listing
// reaches it only when the shop is approved, its service is live, the listing
// is active and complete, and it has a ready photo. There is nothing to filter
// on this side; if it is in the payload, a client may order it.
// ---------------------------------------------------------------------------

/** One artwork type a listing accepts. `inputKind` decides upload vs link. */
export type AcceptedFormat = {
  code: string;
  displayName: string;
  inputKind: "file" | "url";
  extensions: string[];
  mimeTypes: string[];
  active: boolean;
};

/**
 * A sample photo on a listing.
 *
 * `downloadUrl` is a short-lived signed link that comes with the payload, so a
 * board does not cost one round trip per photo. It expires — never store it,
 * and re-read the listing rather than holding it past `downloadUrlExpiresAt`.
 */
export type CatalogPhoto = {
  fileId: string;
  sortOrder: number;
  altText: string | null;
  url: string;
  downloadUrl?: string;
  downloadUrlExpiresAt?: string;
};

/**
 * A choice inside one group. `priceModifierMinor` is added to the base price;
 * `specBinding` is how a shop's own label ("A4") maps onto a governed field the
 * rest of the platform understands.
 */
export type CatalogOption = {
  id: string;
  label: string;
  priceModifierMinor: number;
  specBinding: { fieldCode: string; value?: string; valueCode?: string } | null;
  sortOrder: number;
};

/** `spec` is a step the client must answer; `addon` is one they may skip. */
export type CatalogOptionGroup = {
  id: string;
  name: string;
  kind: "spec" | "addon";
  helpText: string | null;
  required: boolean;
  selectionMode: "single";
  sortOrder: number;
  version: number;
  options: CatalogOption[];
};

/** The shop's own before-you-order guide, in its order. */
export type CatalogPrepStep = {
  id: string;
  sortOrder: number;
  title: string;
  body: string;
};

export type CatalogPricingUnit =
  | "per_unit"
  | "per_package"
  | "per_page"
  | "per_area"
  | "per_length"
  | "whole_job";

/** The unit a shop states a measured listing in. Area is that unit squared. */
export type MeasureUnit = "mm" | "cm" | "in" | "ft" | "m";

/** What a listing has to ask a client before it can be priced at all. */
export type MeasurementKind = "none" | "pages" | "area" | "length";

/** Thousandths of the listing's own measure unit, so 3.5 ft is 3500. */
export type LineMeasurement = {
  pages?: number;
  width?: number;
  height?: number;
  length?: number;
};

/** A cheaper rate from a quantity up. */
export type CatalogPriceTier = { minQuantity: number; unitPriceMinor: number };

/**
 * A speed the shop sells. `priceMinor` replaces the rate outright; the other
 * shape is a flat `surchargeMinor` on top. Never both.
 */
export type CatalogSpeedTier = {
  id: string;
  label: string;
  turnaroundHours: number;
  priceMinor: number | null;
  surchargeMinor: number | null;
};

/** One listing on a shop's board. */
export type CatalogItem = {
  id: string;
  supplierId: string;
  supplierServiceId: string;
  categoryCode: string;
  subcategoryCode: string;
  name: string;
  description: string | null;
  basePriceMinor: number;
  /** Base plus the cheapest option of every required group. */
  fromPriceMinor: number;
  /** Only present when option ids were sent; null otherwise. */
  effectivePriceMinor: number | null;
  pricingUnit: CatalogPricingUnit;
  packageQty: number | null;
  /** What this listing must ask before it can be priced. */
  measurementKind: MeasurementKind;
  measureUnit: MeasureUnit | null;
  /**
   * The smallest size the shop will bill for. A small banner wastes the same
   * sheet as a big one, so under this the minimum is what is charged.
   */
  minimumWidthMilli: number | null;
  minimumHeightMilli: number | null;
  minimumLengthMilli: number | null;
  /** The least the shop will run at all. */
  minimumOrderQuantity: number | null;
  priceTiers: CatalogPriceTier[];
  speedTiers: CatalogSpeedTier[];
  pricingBasis: string;
  turnaroundMode: "inherit" | "override";
  turnaroundHours: number | null;
  rush: { turnaroundHours: number; priceMinor: number } | null;
  acceptedFormats: AcceptedFormat[];
  photos: CatalogPhoto[];
  prepSteps: CatalogPrepStep[];
  optionGroups: CatalogOptionGroup[];
  version: number;
  serviceVersion: number;
};

/** Where a shop is. The same point delivery distance is measured from. */
export type ShopPoint = { lat: number; lng: number; label: string };

export type ShopMedia = { slot: string; fileId: string; url: string };

/** One live service line, and the listings under it. */
export type ShopService = {
  id: string;
  version: number;
  categoryCode: string;
  pricingBasis: string;
  turnaroundHours: number | null;
  acceptedFormats: string[];
  items: CatalogItem[];
};

/**
 * A shop in the list, before its board is read.
 *
 * `queueAhead` is how many jobs are in front of a new one. GRIDGO does not
 * publish it yet, so it is optional and usually absent — the matched-shop card
 * shows the line only when a real number arrives. Never fill it in from
 * anything else; a made-up position is the one number a client would plan
 * around.
 */
export type ShopSummary = {
  supplierId: string;
  shopName: string;
  shop: ShopPoint | null;
  media: ShopMedia[];
  categories: string[];
  itemCount: number;
  queueAhead?: number | null;
};

/** One shop, with every live service line and complete listing on it. */
export type ShopBoard = {
  supplierId: string;
  shopName: string;
  shop: ShopPoint | null;
  media: ShopMedia[];
  categories: string[];
  services: ShopService[];
  queueAhead?: number | null;
};

const CATALOG_SHOP_PAGE_CAP = 25;

/** Approved shops with at least one complete listing. Follows catalog pages. */
export async function listCatalogShops(
  categoryCode?: string | null,
): Promise<ShopSummary[]> {
  const shops: ShopSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < CATALOG_SHOP_PAGE_CAP; page += 1) {
    const params = new URLSearchParams();
    if (categoryCode) params.set("categoryCode", categoryCode);
    if (cursor) params.set("cursor", cursor);
    const query = params.toString() ? `?${params.toString()}` : "";
    const pageBody = await request<{
      shops?: ShopSummary[];
      nextCursor?: string | null;
    }>(`/catalog/shops${query}`);
    shops.push(...(pageBody.shops ?? []));
    if (!pageBody.nextCursor) break;
    cursor = pageBody.nextCursor;
  }
  return shops;
}

/** One shop's whole board. */
export async function getCatalogShop(supplierId: string): Promise<ShopBoard> {
  const result = await request<{ shop: ShopBoard }>(
    `/catalog/shops/${encodeURIComponent(supplierId)}`,
  );
  return result.shop;
}

/**
 * One listing, priced for the options chosen.
 *
 * Sending the selected option ids is what turns `effectivePriceMinor` from null
 * into the price this exact configuration costs. The app computes the same
 * figure locally while the client is still picking (`lib/listing.ts`); this is
 * the server's answer, and the server's is the one that counts.
 */
export async function getCatalogItem(
  itemId: string,
  optionIds: string[] = [],
): Promise<CatalogItem> {
  const query = optionIds.length
    ? `?optionIds=${encodeURIComponent(optionIds.join(","))}`
    : "";
  const result = await request<{ item: CatalogItem }>(
    `/catalog/items/${encodeURIComponent(itemId)}${query}`,
  );
  return result.item;
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
 * The bundled seed is already a complete tree (codes matching the API), so
 * screens paint `productCategoriesNow()` on the first frame. This call is a
 * background refresh of the live `{ taxonomy, categoryTree }` document. A
 * live in-flight request is shared, and a successful (or seed-fallback) tree
 * is held for a few minutes so home, the picker, and the match screen do not
 * each wait on the same request.
 */
const PRODUCT_CATEGORIES_TTL_MS = 5 * 60 * 1000;
let productCategoryCache: { at: number; value: ProductCategory[] } | null = null;
let productCategoryInflight: Promise<ProductCategory[]> | null = null;
let productCategoryGeneration = 0;

/** Instant tree for first paint. Never waits on the network. */
export function productCategoriesNow(): ProductCategory[] {
  return productCategoryCache?.value ?? PRODUCT_CATEGORY_SEED;
}

export function clearProductCategoryCache(): void {
  productCategoryGeneration++;
  productCategoryCache = null;
  productCategoryInflight = null;
}

export async function getProductCategories(): Promise<ProductCategory[]> {
  const now = Date.now();
  if (productCategoryCache && now - productCategoryCache.at < PRODUCT_CATEGORIES_TTL_MS) {
    return productCategoryCache.value;
  }
  if (productCategoryInflight) return productCategoryInflight;

  const generation = productCategoryGeneration;
  productCategoryInflight = (async () => {
    try {
      const tree = adaptProductCategories(await request("/taxonomy"));
      if (generation !== productCategoryGeneration) return getProductCategories();
      productCategoryCache = { at: Date.now(), value: tree };
      return tree;
    } catch (error) {
      if (generation !== productCategoryGeneration) return getProductCategories();
      const fallback = productCategoryCache?.value ?? PRODUCT_CATEGORY_SEED;
      productCategoryCache = { at: Date.now(), value: fallback };
      if (fallback.length) return fallback;
      throw error;
    } finally {
      if (generation === productCategoryGeneration) productCategoryInflight = null;
    }
  })();

  return productCategoryInflight;
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

export async function listNotifications(): Promise<NotificationList> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFICATIONS_TIMEOUT_MS);
  try {
    const result = await request<NotificationList>(
      `/notifications?limit=${NOTIFICATION_LIST_LIMIT}&role=client`,
      { signal: controller.signal },
    );
    return {
      notifications: Array.isArray(result.notifications) ? result.notifications : [],
      snapshot: result.snapshot ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function markNotificationRead(id: string, read = true): Promise<Notification> {
  const result = await request<{ notification: Notification }>(
    `/notifications/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ read }),
    },
  );
  return result.notification;
}

export async function markAllNotificationsRead(snapshot: string): Promise<number> {
  const result = await request<{ updatedCount: number }>("/notifications/read-all?role=client", {
    method: "PATCH",
    body: JSON.stringify({ snapshot }),
  });
  return result.updatedCount;
}

export async function health(): Promise<{ ok: boolean }> {
  return request("/health");
}

// ---------------------------------------------------------------------------
// Matching, the basket, and checkout
//
// GRIDGO matches a client to one shop from the order they put quality, speed
// and distance in, keeps the basket server-side, and takes the QR payment at
// checkout. All of it is the platform's: the ranking follows the account, the
// queue is counted from real jobs in front, and the totals on the sheet are the
// ones the order is written with.
// ---------------------------------------------------------------------------

/** The three things a client ranks. The order is the whole preference. */
export type MatchFactor = "quality" | "speed" | "cost" | "distance";

export type ClientPreferences = {
  ranking: MatchFactor[];
  /** 0 until the client has actually ranked; the ranking shown is the default. */
  version: number;
  updatedAt: string | null;
};

export type ClientAddress = {
  id: string;
  label: string;
  addressLine: string;
  point: OrderPoint;
  isDefault: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/** How busy the matched shop is, counted from the jobs actually in front. */
export type MatchQueue = {
  jobsAhead: number;
  /** The shop's own turnaround plus everything queued before this job. */
  estimatedHours: number;
};

/** One line of why this shop, in the order the client ranked. */
export type MatchReason = {
  code: string;
  factor: MatchFactor | "bundle";
  /** 1, 2, 3 — or 0 for the same-shop bundle, which outranks the ranking. */
  rank: number;
  weight: number;
  detail: string;
};

export type MatchResult = {
  shop: ShopBoard;
  queue: MatchQueue;
  reasons: MatchReason[];
  listings: CatalogItem[];
  /** How many other shops could have printed it. */
  alternativesCount: number;
  score: {
    total: number;
    weights: Record<MatchFactor, number>;
    factors: Record<MatchFactor, number>;
  };
};

export type FulfilmentMode = "delivery" | "pickup";
export type ServiceLevel = "standard" | "scheduled";

export type CartLineRecord = {
  id: string;
  supplierId: string;
  catalogItemId: string;
  quantity: number;
  optionIds: string[];
  /** How big it is, for a listing the shop prices by size. */
  measurement: LineMeasurement | null;
  structuredSpec: Record<string, unknown>;
  artworkFileId: string | null;
  mockupFileId: string | null;
  /** This line's own drop-off, for a run split across several addresses. */
  dropoff: OrderPoint | null;
  sortOrder: number;
  /** The listing as it stands now, priced for the options on this line. */
  listing: CatalogItem | null;
  lineSubtotalMinor: number | null;
};

export type Cart = {
  id: string;
  state: "draft" | "checked_out";
  version: number;
  serviceLevel: ServiceLevel;
  scheduledFor: string | null;
  fulfillmentMode: FulfilmentMode;
  defaultDropoff: OrderPoint | null;
  lines: CartLineRecord[];
  checkedOutOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** One shop's share of a placed order: its own pickup, drop-off and delivery. */
export type MatchedJob = {
  id: string;
  shop: ShopBoard | null;
  state: string;
  fulfillmentMode: FulfilmentMode;
  pickup: OrderPoint;
  dropoff: OrderPoint | null;
  deliveryDistanceMeters: number;
  deliveryFeeMinor: number;
  estimatedHours: number;
  scheduledFor: string | null;
};

export type MatchedOrder = {
  id: string;
  state: string;
  itemSubtotalMinor: number;
  serviceFeeRateBps: number;
  serviceFeeMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  fulfillmentMode: FulfilmentMode;
  serviceLevel: ServiceLevel;
  scheduledFor: string | null;
  paymentPlan: {
    method: "qr_manual";
    downpaymentMinor: number;
    balanceMinor: number;
    downpaymentStatus: string;
  };
  jobs: MatchedJob[];
  invoiceNumber: string;
  createdAt: string;
};

export type Invoice = {
  invoiceNumber: string;
  orderId: string;
  issuedAt: string;
  currency: string;
  lines: {
    id: string;
    jobId: string;
    itemName: string;
    quantity: number;
    unitPriceMinor: number;
    amountMinor: number;
    artworkFileId: string | null;
    mockupFileId: string | null;
    dropoff: OrderPoint | null;
  }[];
  itemSubtotalMinor: number;
  serviceFeeRateBps: number;
  serviceFeeMinor: number;
  deliveryLines: { jobId: string; shopName: string; amountMinor: number }[];
  deliveryFeeMinor: number;
  totalMinor: number;
  paymentPlan: { method: "qr_manual"; downpaymentMinor: number; balanceMinor: number };
};

/**
 * What this client asked GRIDGO to match on.
 *
 * `version: 0` means they never answered and the ranking returned is the
 * platform default — the app treats that as "not yet ranked" and asks, rather
 * than matching on a preference nobody gave.
 */
export async function getPreferences(): Promise<ClientPreferences> {
  const result = await request<{ preferences: ClientPreferences }>("/me/preferences");
  return result.preferences;
}

export async function savePreferences(ranking: MatchFactor[]): Promise<ClientPreferences> {
  const result = await request<{ preferences: ClientPreferences }>("/me/preferences", {
    method: "PUT",
    body: JSON.stringify({ ranking }),
  });
  return result.preferences;
}

export async function listAddresses(): Promise<ClientAddress[]> {
  const result = await request<{ addresses: ClientAddress[] }>("/me/addresses");
  return result.addresses;
}

export async function saveAddress(input: {
  label: string;
  addressLine: string;
  point: OrderPoint;
  isDefault?: boolean;
}): Promise<ClientAddress> {
  const result = await request<{ address: ClientAddress }>("/me/addresses", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.address;
}

// ---------------------------------------------------------------------------
// The account itself
//
// `GET /me` is the client account as GRIDGO holds it, `PATCH /me` corrects the
// parts this app is allowed to change, and `POST /me/business-apply` is how a
// personal account becomes a business one. Everything about the account goes
// through these three, so the contract lives in one place.
//
// A correction carries the version it was read at, and GRIDGO **requires** it:
// a `PATCH` without `expectedVersion` is refused outright, and one carrying a
// version that has moved comes back `409 account_version_conflict`. Operations
// correcting a number while the client is editing it is exactly that case, and
// the screen offers the latest rather than putting the old value back.
//
// Contract: `src/account-profile-routes.js` in gridgo-api. Every response is
// the `{ user }` envelope, and the user carries `version`.
// ---------------------------------------------------------------------------

/** The details this app may change. Email and account type are not among them. */
export type AccountPatch = {
  name?: string;
  phone?: string;
  orgName?: string;
};

/**
 * Where orders go, sent whole rather than by id.
 *
 * `POST /me/business-apply` takes an address body and matches it against the
 * ones already saved — same label, line and point is the same address — so
 * sending a saved one back sets it as the default without making a duplicate.
 */
export type BusinessApplyAddress = {
  label: string;
  addressLine: string;
  point: { lat: number; lng: number };
  isDefault?: boolean;
};

/** What a personal client sends to trade under a business name. */
export type BusinessApplyInput = {
  businessName: string;
  /** Omitted where the account's own name and number already stand. */
  contactName?: string;
  contactPhone?: string;
  address?: BusinessApplyAddress;
};

/** The account, re-read. Carries the `version` every correction must quote. */
export async function getAccount(): Promise<User> {
  const result = await request<{ user: User }>("/me");
  return result.user;
}

export async function patchAccount(
  patch: AccountPatch,
  expectedVersion: number,
): Promise<User> {
  const result = await request<{ user: User }>("/me", {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion, ...patch }),
  });
  return result.user;
}

export async function applyAsBusiness(input: BusinessApplyInput): Promise<User> {
  const result = await request<{ user: User }>("/me/business-apply", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.user;
}

export type MatchInput = {
  subcategoryCode: string;
  /** Omit to use the ranking saved on the account. */
  ranking?: MatchFactor[];
  addressId?: string;
  dropoff?: OrderPoint | null;
  /** Lets the matcher keep a basket with one shop in it on that shop. */
  cartId?: string;
  /**
   * When the client needs it. A filter, not a preference: a shop that cannot
   * finish by this is not offered rather than ranked lower, because "can you
   * make Friday" is not something to weigh against a price.
   */
  deadline?: string | null;
};

/**
 * The one shop, and why.
 *
 * A drop-off is required when the client ranked distance first — there is no
 * "nearest" until GRIDGO knows what it is near — and the API refuses without
 * one rather than quietly matching on the other two.
 */
export async function matchShop(input: MatchInput): Promise<MatchResult> {
  return request<MatchResult>("/me/matches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** The next-best shop, given every one already seen. */
export async function matchNextShop(
  input: MatchInput & { excludedSupplierIds: string[] },
): Promise<MatchResult> {
  return request<MatchResult>("/me/matches/next", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CartFulfilment = {
  fulfillmentMode?: FulfilmentMode;
  serviceLevel?: ServiceLevel;
  scheduledFor?: string | null;
  defaultDropoff?: OrderPoint | null;
};

export async function createCart(input: CartFulfilment = {}): Promise<Cart> {
  const result = await request<{ cart: Cart }>("/me/carts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.cart;
}

export async function getCart(cartId: string): Promise<Cart> {
  const result = await request<{ cart: Cart }>(`/me/carts/${encodeURIComponent(cartId)}`);
  return result.cart;
}

export async function setCartFulfilment(
  cartId: string,
  input: CartFulfilment,
): Promise<Cart> {
  const result = await request<{ cart: Cart }>(
    `/me/carts/${encodeURIComponent(cartId)}/fulfillment`,
    { method: "PUT", body: JSON.stringify(input) },
  );
  return result.cart;
}

/** One drop-off for the whole run, or a different one per line. */
export async function setCartDropoffs(
  cartId: string,
  input: {
    defaultDropoff?: OrderPoint | null;
    lines?: { lineId: string; dropoff: OrderPoint | null }[];
  },
): Promise<Cart> {
  const result = await request<{ cart: Cart }>(
    `/me/carts/${encodeURIComponent(cartId)}/dropoffs`,
    { method: "PUT", body: JSON.stringify(input) },
  );
  return result.cart;
}

export async function addCartLine(
  cartId: string,
  input: {
    catalogItemId: string;
    optionIds: string[];
    quantity: number;
    /** Required by a listing the shop prices by size; refused by any other. */
    measurement?: LineMeasurement | null;
    structuredSpec?: Record<string, unknown>;
    artworkFileId?: string | null;
    dropoff?: OrderPoint | null;
  },
): Promise<Cart> {
  const result = await request<{ cart: Cart }>(
    `/me/carts/${encodeURIComponent(cartId)}/lines`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return result.cart;
}

export async function updateCartLine(
  cartId: string,
  lineId: string,
  input: {
    quantity?: number;
    optionIds?: string[];
    measurement?: LineMeasurement | null;
    structuredSpec?: Record<string, unknown>;
    artworkFileId?: string | null;
    dropoff?: OrderPoint | null;
  },
): Promise<Cart> {
  const result = await request<{ cart: Cart }>(
    `/me/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return result.cart;
}

/**
 * Rate the shop that ran a finished order.
 *
 * Once per order — the platform refuses a second, which is the honest answer
 * when two devices race rather than something to paper over here.
 */
/** One day, and whether GRIDGO could finish this kind of work by the end of it. */
export type DeadlineDay = {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  /**
   * `cannot` — nobody could finish by then.
   * `tight`  — somebody could, but the choice is narrow.
   * `open`   — comfortably achievable.
   *
   * Never a count. A client is not told how many shops print something.
   */
  state: "cannot" | "tight" | "open";
};

/**
 * Which days GRIDGO could make, for one kind of work.
 *
 * Answered by the platform because the queues and capacities behind it are the
 * shops' own. `earliest` is null when nobody prints this at all.
 */
export async function deadlineDays(
  subcategoryCode: string,
  // Four months. A print deadline is regularly further out than a fortnight,
  // and a shorter window reads to a client as GRIDGO refusing the date rather
  // than the calendar simply stopping.
  days = 120,
): Promise<{ days: DeadlineDay[]; earliest: string | null }> {
  const query = `?subcategoryCode=${encodeURIComponent(subcategoryCode)}&days=${days}`;
  return request<{ days: DeadlineDay[]; earliest: string | null }>(`/me/deadline-days${query}`);
}

export async function rateOrder(
  orderId: string,
  input: { qualityStars: number; speedStars: number; valueStars: number; comment?: string },
): Promise<void> {
  await request(`/orders/${encodeURIComponent(orderId)}/review`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeCartLine(cartId: string, lineId: string): Promise<Cart> {
  const result = await request<{ cart: Cart }>(
    `/me/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineId)}`,
    { method: "DELETE" },
  );
  return result.cart;
}

/** Bind a stored `mockup` file to a basket line. */
export async function setCartLineMockup(
  cartId: string,
  lineId: string,
  fileId: string,
): Promise<Cart> {
  const result = await request<{ cart: Cart }>(
    `/me/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineId)}/mockup`,
    { method: "PUT", body: JSON.stringify({ fileId }) },
  );
  return result.cart;
}

/**
 * Place the order.
 *
 * QR Ph only, and the reference and the receipt screenshot go with it — the
 * payment is submitted, never confirmed, because Operations matches it against
 * the GRIDGO wallet by hand. The order comes back waiting for Operations QA.
 */
export async function checkoutCart(
  cartId: string,
  payment: { reference: string; proofFileId: string },
): Promise<{ order: MatchedOrder; invoice: Invoice }> {
  return request(`/me/carts/${encodeURIComponent(cartId)}/checkout`, {
    method: "POST",
    body: JSON.stringify({ payment: { method: "qr_manual", ...payment } }),
  });
}

export async function getInvoice(orderId: string): Promise<Invoice> {
  const result = await request<{ invoice: Invoice }>(
    `/orders/${encodeURIComponent(orderId)}/invoice`,
  );
  return result.invoice;
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

  const done = (async () => {
    const auth = await resolveToken();
    return new Promise<StoredFile>((resolve, reject) => {
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
      if (auth.token) xhr.setRequestHeader("Authorization", `Bearer ${auth.token}`);
        xhr.setRequestHeader("X-GRIDGO-Role", "client");
      // Content-Type is left unset on purpose: the platform supplies the
      // multipart boundary, and overriding it corrupts the request body.

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event: ProgressEvent) => {
          onProgress(
            event.lengthComputable && event.total > 0
              ? event.loaded / event.total
              : null,
          );
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
        if (xhr.status === 401 && auth.token) {
          if (auth.source === "legacy") setToken(null);
          notifyUnauthorized();
        }
        reject(new ApiError(xhr.status, data));
      };

      xhr.onerror = () => reject(new Error("Network request failed"));
      xhr.ontimeout = () => reject(new Error("Upload timeout"));
      xhr.onabort = () => reject(new ApiError(0, { error: "upload_cancelled" }));

      xhr.send(form);
    });
  })();

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
