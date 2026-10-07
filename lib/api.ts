import { withRequestDeadline } from "@/lib/requestDeadline";
import { liveGeneration, assertLiveGeneration } from "@/lib/live";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { adaptProductCategories, type ProductCategory } from "@/lib/productCategories";
import type { PhysicalInvoiceDraft, PhysicalInvoiceRequest } from "@/lib/physicalInvoice";
import type { DevicePlatform } from "@/lib/push";
import { parseSeasonWindows, type SeasonWindows } from "@/lib/seasonWindows";

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

export type ApprovalCaseSummary = {
  id: string;
  kind: "business_client" | "supplier" | "rider";
  status: "pending" | "approved" | "rejected" | "suspended";
  version: number;
  applicationRevision?: number;
  submittedAt?: string | null;
  decidedAt?: string | null;
  rejectionReason?: string | null;
  suspensionReason?: string | null;
  updatedAt?: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  accountStatus?: "active" | "suspended" | "removed";
  accountStatusReason?: string | null;
  accountStatusAt?: string | null;
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
  /**
   * The client's business/organization application, when one exists.
   * Attached from `GET /me` or the `business_client` row on `GET /auth/me`.
   */
  approvalCase?: ApprovalCaseSummary | null;
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
  /**
   * `not_submitted | pending_confirmation | confirmed | legacy_confirmed |
   * rejected | not_required`. `not_required` is the balance on an order paid
   * in full. Kept a string: a status added after this build must not crash it.
   */
  status: string;
  reference: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  proofFileId?: string | null;
};

export type OrderPayments = Partial<Record<InstallmentCode | "initial" | "final_online", PaymentInstallment>>;

/**
 * A photo the print shop filed while making the job (gridgo-api#112).
 *
 * `downloadUrl` is signed for a few minutes, exactly like artwork, and can be
 * missing when storage could not sign it — the photo still exists, so ask
 * `GET /files/:fileId/download-url` for a link rather than hiding it.
 */
export type ProductionPhoto = {
  fileId: string;
  contentType?: string;
  at?: string;
  downloadUrl?: string | null;
  downloadUrlExpiresAt?: string | null;
};

/**
 * The client's progress gallery. `status` is `waiting_for_photo |
 * photos_available` today; read it through `progressView`, which trusts the
 * photos over the word. Absent on an API that predates the gallery.
 */
export type ProductionProgress = {
  status: string;
  photos: ProductionPhoto[];
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

export type ProductionItem = {
  id: string;
  itemName: string;
  quantity: number;
  pricingUnit: string | null;
  packageQty: number | null;
  measurement: { pages?: number; widthMilli?: number; heightMilli?: number; lengthMilli?: number; unit?: string | null } | null;
  structuredSpec: Record<string, unknown>;
  options: { groupName: string; label: string }[];
  artworkFileId: string | null;
  mockupFileId: string | null;
  /** Design links snapshotted at checkout; absent on an API from before them. */
  artworkLinks?: ArtworkLink[];
};

/**
 * One print job as the client is allowed to see it.
 *
 * Money is printing, the service fee, delivery and total. The shop's own
 * price under a different name is still withheld — `subtotalMinor` is the
 * print line, not the supplier settlement.
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
  /**
   * The shops' own figure for the items — what they are paid. Null until a
   * supplier accepts. Never drawn on its own: the client reads it plus
   * `serviceFeeMinor` (`orderItemsMinor` in `lib/orderState.ts`).
   */
  subtotalMinor: number | null;
  /**
   * GRIDGO's charge on the items, as the order was written. The live rate
   * lives on `GET /settings`; this is the amount billed.
   */
  serviceFeeMinor?: number | null;
  /** The rate this order was priced at, in basis points. */
  serviceFeeRateBps?: number | null;
  /** Distance band fee. Null until the supplier's shop is known. */
  deliveryFeeMinor: number | null;
  /** Subtotal + service fee + delivery. Null until a supplier accepts. */
  totalMinor: number | null;
  /** The invoice number GRIDGO issued with this order, when one exists. */
  invoiceNumber?: string | null;
  /** An approved organization's discount, already inside `totalMinor`. */
  organizationDiscountMinor?: number;
  /** The officer of record when the order was placed. Never today's officer. */
  organizationOfficer?: OrganizationOfficerSnapshot | null;
  /** A printed-invoice request this client filed, when there is one. */
  physicalInvoiceRequest?: PhysicalInvoiceRequest | null;
  downpaymentMinor: number | null;
  balanceMinor: number | null;
  /**
   * The share of the total this order takes up front, snapshotted when it was
   * written: 100 for paid in full, 75 on the old two-half plan. Absent on an
   * older payload — read it through `downpaymentPercentOf` in `lib/payment.ts`.
   */
  downpaymentPercent?: number | null;
  /** Supplier shop → delivery address, once both are known. */
  deliveryDistanceMeters?: number | null;
  priceRange?: PriceRange | null;
  payments?: OrderPayments;
  /**
   * Why Operations turned the artwork back, from the latest correction they
   * asked for (gridgo-api#115). Null when there is none to show; absent on an
   * API from before it. Read it through `correctionReason`.
   */
  correction?: { reason: string; requestedAt: string | null } | null;
  /** Progress photos, or the honest lack of one. See `lib/productionProgress.ts`. */
  productionProgress?: ProductionProgress | null;
  paymentMethod: string | null;
  paymentStatus: string;
  /** When the client was told a supplier accepted. Payment is gated on it. */
  assignmentNotifiedAt?: string | null;
  issueWindowOpenedAt?: string | null;
  issueWindowExpiresAt?: string | null;
  promisedDate: string | null;
  /** Client promise, projected by GRIDGO with the queue and working calendar. */
  promiseBy?: string | null;
  /** Display string only — never file identity. See docs/STORAGE_API.md. */
  artworkName: string | null;
  /** Stored artwork ids, newest last. Empty is valid. */
  artworkFileIds?: string[];
  mockupFileIds?: string[];
  productionItems?: ProductionItem[];
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
  /** The choice made before matching, snapshotted at checkout (gridgo-api#148). */
  requestFulfillment?: RequestFulfilment | null;
  /** A pick-up order's hub hours and fee as they stood at checkout. */
  hubPickup?: HubPickup | null;
  /** The hub fee on a pick-up order, already inside `deliveryFeeMinor`. */
  pickupFeeMinor?: number | null;
  /**
   * GRIDGO's check of the artwork before the shop hears of the job
   * (gridgo-api#122). `pending` from checkout until Operations passes it.
   */
  fileCheck?: OrderFileCheck | null;
  /** True while a refund request is open: work and new payments are paused. */
  refundHold?: boolean;
  /** `cancelled | fulfilled_with_refund` once a refund was settled. */
  refundDisposition?: string | null;
  /** A settled refund turned the unpaid installment into history, not a debt. */
  unpaidBalanceCancelled?: boolean;
  /**
   * The assigned shop timed out, declined or cancelled, and the client chooses
   * a replacement or a full refund (gridgo-api `docs/SHOP_RECOVERY_API.md`).
   * Read through `lib/shopRecovery.ts`.
   */
  shopRecovery?: ShopRecovery | null;
  /**
   * The shop asked for a later deadline (gridgo-api
   * `docs/ORDER_RESCHEDULE_API.md`). Read through `lib/reschedule.ts`.
   */
  rescheduleRequest?: RescheduleRequest | null;
  /**
   * Set when this order is one shop group of a multi-shop basket
   * (gridgo-api `docs/MULTI_SHOP_CHECKOUT_API.md`). The group is an ordinary
   * order with its own job, rider and refunds; the basket holds the one
   * payment and the one receipt. Read through `lib/basketGroups.ts`.
   */
  basketId?: string | null;
  /** "Shop A", "Shop B" — never the shop's identity. */
  groupLabel?: string | null;
  /**
   * The basket's one deadline, from before each product kept its own date
   * (gridgo-client#189). A group's own date is its `deadline`.
   */
  basketDeadline?: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * The job's history. Current APIs send the client `{at, state, note}` with
   * GRIDGO's plain wording; older ones also sent who acted and free-text notes,
   * which is why notes are only drawn from the plain projection
   * (`lib/orderHistory.ts`).
   */
  timeline: {
    at: string;
    state: string;
    by?: string;
    note?: string;
    fileId?: string;
    /** Only on an older payload: a shop payout stage. Never drawn. */
    milestoneCode?: string;
  }[];
};

/** The client's view of the artwork check: no reviewer, a reason only on a failure. */
export type OrderFileCheck = {
  status: "pending" | "passed" | "failed" | "cancelled" | (string & {});
  requestedAt?: string | null;
  reviewedAt?: string | null;
  reason?: string | null;
};

/** The four fixed zones. Labels come from the API; never re-spell them. */
export type DistanceZoneKey = "nearby" | "away" | "long_distance" | "out_of_zone";

/** Where a shop sits relative to the client's drop-off, as a word. */
export type DistanceZone = { key: DistanceZoneKey | (string & {}); label: string };

/**
 * One row of `settings.deliveryFeeBands`. The first three zones are a flat
 * `feeMinor`; Out of Zone has none and is `baseFeeMinor + perKmMinor` for
 * every started kilometre. `zone` / `label` are absent on an API from before
 * the zones (gridgo-api#121), which priced every band flat.
 */
export type DeliveryFeeBand = {
  zone?: DistanceZoneKey | (string & {});
  label?: string;
  /** Inclusive. Null on the last, open-ended band. */
  maxDistanceMeters: number | null;
  feeMinor?: number;
  baseFeeMinor?: number;
  perKmMinor?: number;
};

/** A shop's established rating. Absent below five reviews — never zero. */
export type ShopRating = { average: number; count: number };

/** Platform-wide operational settings. The issue window is one of them. */
export type PlatformSettings = {
  issueWindowHours: number;
  /**
   * The four delivery zones, in order: Nearby, Away, Long Distance, Out of
   * Zone. One table drives both the word a client reads and the fee they pay
   * — price it through `deliveryFeeForDistance` (`lib/distanceZone.ts`).
   */
  deliveryFeeBands: DeliveryFeeBand[];
  /**
   * GRIDGO's own charge, in basis points of the items subtotal. Never a
   * constant in the app: Operations changes it without a release, and a stale
   * copy here would disagree with what the client is billed.
   */
  serviceFeeRateBps: number;
  /**
   * Whether checkout names the fee. The pesos stay inside Printing either
   * way. Absent on an older payload; treat as shown.
   */
  serviceFeeVisibleToClient?: boolean;
  /**
   * Whether a client may file a new printed-invoice request. Super Admin
   * writes it; absent or false means off. A request already on the order
   * stays visible either way.
   */
  physicalInvoiceRequestsEnabled?: boolean;
  /**
   * The share of the total a new order takes up front: 100 (paid in full) or
   * 75. Absent on an API that predates the setting, which still writes 75/25
   * orders — read it through `settingsDownpaymentPercent`.
   */
  downpaymentPercent?: number;
  /**
   * GRIDGO Office as a pick-up hub (gridgo-api#148): its fixed point, the
   * hours Super Admin set, and the flat pick-up fee. `schedule: null` means
   * nobody has set hours yet — say so, never invent opening days. Absent on
   * an API from before the hub settings.
   */
  hubPickup?: HubPickup;
  /** The approved-organization discount on printing. Absent on an older API. */
  organizationDiscountRateBps?: number;
};

/** One opening window in the hub's week. Weekday 0 is Sunday. */
export type HubOpeningWindow = { weekday: number; opensMinute: number; closesMinute: number };

/** A run of days the hub is shut, inclusive, as `YYYY-MM-DD`. */
export type HubClosure = { startDay: string; endDay: string; reason?: string | null };

export type HubSchedule = {
  /** The hub's offset from UTC; Davao is +480. Minutes in `week` are local to it. */
  utcOffsetMinutes: number;
  week: HubOpeningWindow[];
  closures?: HubClosure[];
};

export type HubPickup = {
  point?: OrderPoint;
  schedule: HubSchedule | null;
  /** Once per order, already inside any delivery total it is quoted in. */
  feeMinor: number;
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
  /** Set once deletion was asked for, and once the bytes were removed. */
  deleteRequestedAt?: string | null;
  deletedAt?: string | null;
  /**
   * Where the file is attached. A client is sent `{type, id}` only: `field`
   * says which slot, and that is ops' working detail.
   */
  references: { type: string; id: string; field?: string }[];
  /** Present only when the bytes carried something worth reading. */
  detected?: DetectedArtwork;
  /**
   * GRIDGO's structural check of uploaded artwork (gridgo-api#122). `ready`
   * means uploaded, not approved: a `failed` file is refused at checkout and
   * has to be replaced. Absent on an older API and on non-artwork files.
   */
  artworkCheck?: ArtworkFileCheck | null;
};

export type ArtworkFileCheck = {
  status: "passed" | "failed" | (string & {});
  checkedAt?: string | null;
  reason?: string | null;
  /** Plain words for the client; never branch on them. */
  message?: string | null;
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
  /** Historical lifecycle stage; current orderState remains a live snapshot. */
  eventState?: string;
  paymentAction?: { installment: "final_online"; status: "due" | "pending_confirmation"; amountMinor: number };
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
  /** Organization reminders and notices (gridgo-client#165). */
  organizationUserId?: string;
  officerId?: string | null;
  actions?: string[];
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
  /**
   * Expo-web page hostname. `client.localhost` must call the API on that same
   * host — `127.0.0.1` is a different site and Chromium blocks the fetch.
   */
  pageHostname?: string | null;
};

/**
 * Resolve the demo API origin.
 *
 * Precedence:
 * 1. Non-empty `envUrl` (trailing slash stripped)
 * 2. On web, the page hostname + `apiPort` (Clerk isolation hosts)
 * 3. Hostname from Expo dev-server `hostUri` + `apiPort`
 * 4. If that hostname is loopback and platform is Android:
 *    emulator → `10.0.2.2`; physical USB phone → `127.0.0.1` (adb reverse)
 * 5. `http://127.0.0.1:<apiPort>`
 */
export function resolveApiBase({
  envUrl,
  envPort,
  hostUri,
  platformOS,
  isDevice,
  pageHostname,
}: ResolveApiBaseInput): string {
  const trimmedUrl = envUrl?.trim().replace(/\/$/, "");
  if (trimmedUrl) return trimmedUrl;

  const port = envPort?.trim() || DEFAULT_API_PORT;
  const pageHost = pageHostname?.trim();
  if (platformOS === "web" && pageHost) {
    return httpApiOrigin(pageHost, port);
  }
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

function httpApiOrigin(hostname: string, port: string): string {
  const host =
    hostname.startsWith("[") || !hostname.includes(":") ? hostname : `[${hostname}]`;
  return `http://${host}:${port}`;
}

function readWebPageHostname(): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const hostname = window.location.hostname?.trim();
  return hostname || null;
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

  const candidates: (string | null | undefined)[] = [
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
    pageHostname: readWebPageHostname(),
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

/** Resolve against the current provider before account teardown. */
export function captureLogoutBearer(): Promise<string | null> {
  return getAuthToken().catch(() => null);
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
  const result = await request<{ user: User; approvalCases?: ApprovalCaseSummary[] }>(
    "/auth/me",
    {},
    options,
  );
  return withBusinessApplication(result.user, result.approvalCases);
}

function withBusinessApplication(
  user: User,
  approvalCases?: ApprovalCaseSummary[] | ApprovalCaseSummary | null,
): User {
  // A probe can answer `{ user: null }`; there is nothing to fold onto then.
  if (!user) return user;
  const list = Array.isArray(approvalCases)
    ? approvalCases
    : approvalCases
      ? [approvalCases]
      : [];
  const businessCase =
    list.find((item) => item.kind === "business_client") ?? user.approvalCase ?? null;
  return { ...user, approvalCase: businessCase };
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
  /** `url` is a design link: `canva_link` or `other_link`. See `lib/designLink.ts`. */
  inputKind: "file" | "url";
  extensions: string[];
  mimeTypes: string[];
  active: boolean;
};

/** A design kept on Canva, Drive or the like instead of an uploaded file. HTTPS only. */
export type ArtworkLink = { formatCode: string; url: string };

/**
 * What `POST /artwork/link-check` found. Advisory: `ok` is true only with real
 * evidence of public access, and `message` is display text never to branch on.
 */
export type ArtworkLinkCheck = {
  ok: boolean;
  reachable: boolean;
  httpStatus: number | null;
  provider: "canva" | "google_drive" | "dropbox" | "we_transfer" | "figma" | "other";
  access: "public_view" | "public_edit" | "sign_in_required" | "not_found" | "unknown";
  message: string;
  /** The address checked: a `canva.link` short link comes back as the full design URL. */
  url?: string;
  /** The format that address is filed under. Absent from checkers before gridgo-api#104. */
  formatCode?: string;
};

/**
 * Check that a design link opens without signing in.
 *
 * Null when this API has no link check (an older deployment answers the route
 * with 404/405/501): the field then simply goes unchecked rather than failing.
 */
export async function checkArtworkLink(link: ArtworkLink): Promise<ArtworkLinkCheck | null> {
  try {
    return await request<ArtworkLinkCheck>("/artwork/link-check", {
      method: "POST",
      body: JSON.stringify({ url: link.url, formatCode: link.formatCode }),
    });
  } catch (error) {
    if (error instanceof ApiError && [404, 405, 501].includes(error.status)) return null;
    throw error;
  }
}

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
  /** Shop / ops amount. A client reads `clientPriceModifierMinor`. */
  priceModifierMinor: number;
  /**
   * GRIDGO's amount for this option, fee inside, sign kept (gridgo-api#132).
   * Display only: never sum these into an amount due — quote the line.
   */
  clientPriceModifierMinor?: number | null;
  /** A multiplier option scales the rate instead of adding to it. */
  priceMultiplierBps?: number | null;
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
export type CatalogPriceTier = {
  minQuantity: number;
  /** Shop / ops amount. */
  unitPriceMinor: number;
  /** GRIDGO's rate from this quantity up, fee inside. */
  clientUnitPriceMinor?: number | null;
};

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
  /** GRIDGO's amounts for the two above; null where the shop's is. */
  clientPriceMinor?: number | null;
  clientSurchargeMinor?: number | null;
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
  /** Shop / ops amount. A client reads `clientBasePriceMinor`. */
  basePriceMinor: number;
  /** GRIDGO amount for `basePriceMinor`, fee inside (gridgo-api#132). */
  clientBasePriceMinor?: number | null;
  /** Base plus the cheapest option of every required group. Shop / ops amount. */
  fromPriceMinor: number;
  /** Only present when option ids were sent; null otherwise. Shop / ops amount. */
  effectivePriceMinor: number | null;
  /**
   * GRIDGO amount for `fromPriceMinor` (shop + live service fee). Additive so
   * supplier / web can keep reading the shop fields.
   */
  clientFromPriceMinor?: number | null;
  /** GRIDGO amount for `effectivePriceMinor`. */
  clientEffectivePriceMinor?: number | null;
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
  /**
   * The widest job this press prints, in whole feet (1–20). Tarpaulin &
   * Outdoor Banners only; null elsewhere and on a listing that has not set it.
   * GRIDGO refuses a wider line with `printer_cap_exceeded` — see
   * `lib/printerWidth.ts`.
   */
  printerMaxWidthFeet?: number | null;
  priceTiers: CatalogPriceTier[];
  speedTiers: CatalogSpeedTier[];
  pricingBasis: string;
  turnaroundMode: "inherit" | "override";
  /**
   * Production time in whole working days on the shop's own open hours
   * (gridgo-supplier#122). Read through `productionDays` in `lib/listing.ts`.
   */
  turnaroundDays?: number | null;
  /** The soonest, in working days. Null when the listing has no range. */
  minimumTurnaroundDays?: number | null;
  /** The shop's working-day length; how an older GRIDGO's hours become days. */
  productionDayMinutes?: number | null;
  /** An older GRIDGO's working hours; kept for the release gap. */
  turnaroundHours: number | null;
  rush: { turnaroundHours: number; priceMinor: number; clientPriceMinor?: number | null } | null;
  acceptedFormats: AcceptedFormat[];
  photos: CatalogPhoto[];
  prepSteps: CatalogPrepStep[];
  optionGroups: CatalogOptionGroup[];
  version: number;
  serviceVersion: number;
  /**
   * The zone from the client's drop-off. Null when there is no drop-off (and
   * on every generic catalogue read); absent on an older API.
   */
  distanceZone?: DistanceZone | null;
  /**
   * Kilometres to the drop-off, one decimal. Sent on Out of Zone listings
   * only — the three nearer zones are a word, because a figure there would
   * locate the shop. For display; never price from it.
   */
  distanceKm?: number;
  /** Present only once the shop has five or more reviews. */
  rating?: ShopRating;
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

/** What `POST /me/catalog-quotes` prices: one configured listing, nothing saved. */
export type CatalogQuoteInput = {
  catalogItemId: string;
  quantity: number;
  optionIds?: string[];
  measurement?: LineMeasurement | null;
  structuredSpec?: Record<string, unknown>;
};

/**
 * GRIDGO's price for a configured listing, fee inside (gridgo-api#132).
 *
 * The amount due is `clientLineSubtotalMinor`; `clientUnitRateMinor` is the
 * rate it was worked from and must not be multiplied back up — tiers,
 * minimum sizes and rounding happen before the fee.
 */
export type CatalogQuote = {
  catalogItemId: string;
  version: number;
  serviceVersion: number;
  quantity: number;
  clientUnitRateMinor: number;
  clientLineSubtotalMinor: number;
  billableMilliUnits: number;
  minimumMeasurementApplied: boolean;
};

/**
 * Price one configured listing. Read-only: no cart, no reservation, no lock.
 * Selection, quantity, size and printer-width refusals use the cart's codes.
 */
export async function catalogQuote(input: CatalogQuoteInput): Promise<CatalogQuote> {
  const body: Record<string, unknown> = {
    catalogItemId: input.catalogItemId,
    quantity: input.quantity,
    optionIds: input.optionIds ?? [],
  };
  if (input.measurement) body.measurement = input.measurement;
  if (input.structuredSpec) body.structuredSpec = input.structuredSpec;
  const result = await request<{ quote: CatalogQuote }>("/me/catalog-quotes", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return result.quote;
}

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

/**
 * A client's paid redelivery of an unclaimed pick-up (gridgo-api#124). The API
 * records the choice for Operations, who arrange the delivery and its cost;
 * nothing is charged or rescheduled by the request itself.
 */
export type HubRedeliveryRequest = {
  status: string;
  costAccepted: boolean;
  at: string;
};

/**
 * The handover credential for one order (gridgo-api#125,
 * `docs/HUB_HANDOVER_API.md`). Delivery orders carry only the six-digit
 * `otp` the rider also sees. A hub pick-up adds the opaque `qrToken` — the
 * only thing ever drawn inside the QR — and the hub snapshot and unclaimed
 * count the reminders are counted from.
 */
export type OrderHandover = {
  otp: string;
  qrToken?: string;
  hub?: { id: string; point?: OrderPoint; schedule: HubSchedule | null };
  readyAt?: string | null;
  missedDays?: number;
  operationsRequired?: boolean;
  redeliveryRequest?: HubRedeliveryRequest | null;
};

/**
 * `GET /orders/:id/handover`. Null until the order is physically ready, after
 * the handover is used, for orders from before the handover switch, and on an
 * API that does not have the route yet (`404 not_found`).
 */
export async function getOrderHandover(orderId: string): Promise<OrderHandover | null> {
  try {
    const result = await request<{ handover: OrderHandover | null }>(
      `/orders/${encodeURIComponent(orderId)}/handover`,
    );
    return result.handover ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.message === "not_found") return null;
    throw error;
  }
}

/** `POST /orders/:id/hub-redelivery` — only after three missed hub days. */
export async function requestHubRedelivery(orderId: string): Promise<HubRedeliveryRequest> {
  const result = await request<{ request: HubRedeliveryRequest }>(
    `/orders/${encodeURIComponent(orderId)}/hub-redelivery`,
    { method: "POST", body: JSON.stringify({ costAccepted: true }) },
  );
  return result.request;
}

/** `POST /orders/:id/handover/escalate` — tells Operations the codes did not match. */
export async function escalateHandover(orderId: string, reason: string): Promise<void> {
  await request<{ escalated: boolean }>(
    `/orders/${encodeURIComponent(orderId)}/handover/escalate`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
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
  proofFileId?: string,
): Promise<Order> {
  const result = await request<{ order: Order }>(
    `/orders/${orderId}/payments/${installment}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ method: "qr_manual", reference, ...(proofFileId ? { proofFileId } : {}) }),
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

/** The four things a client ranks. The order is the whole preference. */
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
  /** Elapsed wait including the queue, working calendar and platform allowance. */
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

/**
 * The one badge on the Top Pick (gridgo-api#126): the first factor that
 * separated the winner from the runner-up, or `vetted` when nothing did.
 * Labels are the API's own ("Matched for Quality") and are drawn as sent.
 */
export type MatchReasonKey = "quality" | "cost" | "speed" | "distance" | "vetted";
export type MatchReasonBadge = { key: MatchReasonKey | (string & {}); label: string };

/** What every matched listing gains: its promise, its place, and its pick token. */
export type MatchedListingFields = {
  /** The padded client promise for this listing — the date to show. */
  readyBy?: string | null;
  /** Jobs ahead + 1: where this job would join that press's queue. */
  placeInLine?: number | null;
  /** Opaque, 15-minute token that picks this listing on add-line. */
  selectToken?: string;
  /**
   * The delivery (or pick-up) charge this listing would carry, when the match
   * was asked with a fulfilment choice. Already GRIDGO's figure.
   */
  deliveryFeeMinor?: number | null;
  /** On a pick-up match: the hub fee, the same amount as `deliveryFeeMinor`. */
  pickupFeeMinor?: number | null;
};

/** A listing on the Top Pick's own board, as the match returns it. */
export type MatchListing = CatalogItem & MatchedListingFields;

/**
 * Another shop's best listing for the job. An allowlist: no supplier or
 * service id, shop name, address, contact or logo ever travels in one, so
 * nothing here can say which press it is.
 */
export type OtherListing = Pick<
  CatalogItem,
  | "id"
  | "name"
  | "photos"
  | "fromPriceMinor"
  | "clientFromPriceMinor"
  | "pricingUnit"
  | "packageQty"
  | "distanceZone"
  | "distanceKm"
  | "rating"
  | "categoryCode"
  | "subcategoryCode"
  | "basePriceMinor"
  | "clientBasePriceMinor"
  | "effectivePriceMinor"
  | "clientEffectivePriceMinor"
  | "measurementKind"
  | "measureUnit"
  | "minimumWidthMilli"
  | "minimumHeightMilli"
  | "minimumLengthMilli"
  | "minimumOrderQuantity"
  | "printerMaxWidthFeet"
  | "priceTiers"
  | "speedTiers"
  | "pricingBasis"
  | "turnaroundDays"
  | "minimumTurnaroundDays"
  | "productionDayMinutes"
  | "turnaroundHours"
  | "rush"
  | "acceptedFormats"
  | "optionGroups"
  | "version"
> &
  MatchedListingFields & { minimumTurnaroundHours?: number | null };

export type MatchResult = {
  /** The ranking GRIDGO actually matched on, echoed back. */
  ranking?: MatchFactor[];
  /** The Top Pick's one badge. Render this, never the legacy `reasons`. */
  matchReason?: MatchReasonBadge;
  /** Every other shop's best listing for the job, in the same strict order. */
  otherListings?: OtherListing[];
  /** Sent back with a `selectToken` when a listing is added to the basket. */
  matchRequestId?: string;
  /** When every token in this answer stops working. */
  selectTokenExpiresAt?: string;
  /** The Top Pick's zone. Never carries kilometres; null with no drop-off. */
  distanceZone?: DistanceZone | null;
  /** Present only once the shop has five or more reviews. */
  rating?: ShopRating;
  /**
   * Compatibility only (gridgo-api#126 keeps it for this rollout): the
   * matching screen must never draw a field of it. Against a multi-shop
   * basket it is only `{label}` — no `supplierId` either.
   */
  shop: ShopBoard | { label: string; supplierId?: undefined };
  queue: MatchQueue;
  /** Absolute client promise; older deployments may only send queue.estimatedHours. */
  promiseBy?: string | null;
  /** Legacy working notes. Superseded by `matchReason`; never drawn. */
  reasons: MatchReason[];
  /** The Top Pick's eligible listings, best first: index 0 is the pick. */
  listings: MatchListing[];
  /** Echoed when the match was asked with a fulfilment choice (gridgo-api#148). */
  requestFulfillment?: RequestFulfilment | null;
  /** On a pick-up match: the hub's point, hours and fee as they stand now. */
  hubPickup?: HubPickup | null;
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

/**
 * Delivery or pick-up, chosen before matching (gridgo-api#148), and the point
 * it was matched against: the client's address, or GRIDGO Office for pick-up.
 * Once a basket holds one it is locked — changing it means a new match and a
 * new basket.
 */
export type RequestFulfilment = { fulfillmentMode: FulfilmentMode; dropoff: OrderPoint | null };

/** Why a basket quote has no total yet. Codes are open: an unknown one is still "not yet". */
export type CartQuoteReason = {
  code:
    | "cart_empty"
    | "catalog_item_stale"
    | "line_unpriced"
    | "shop_unavailable"
    | "dropoff_required"
    | (string & {});
  lineId?: string;
  lineIds?: string[];
};

/** One delivery leg: a print run's lines and the zone its farthest drop falls in. */
export type CartQuoteDeliveryLine = {
  lineIds: string[];
  distanceZone: DistanceZone | null;
  deliveryFeeMinor: number | null;
  /** Out of Zone only, one decimal. For display; never price from it. */
  distanceKm?: number;
};

/**
 * GRIDGO's own figures for a draft basket (gridgo-api#146): every amount is
 * already the client's, fee inside. Read these rather than adding anything up
 * on the phone.
 */
export type CartQuote = {
  status: "priced" | "incomplete" | (string & {});
  reasons: CartQuoteReason[];
  clientItemSubtotalMinor: number | null;
  deliveryLines: CartQuoteDeliveryLine[];
  /** Every leg plus any pick-up fee. Null while a leg is unknown. */
  deliveryFeeMinor: number | null;
  /** On a pick-up basket chosen before matching: the hub fee, already inside `deliveryFeeMinor`. */
  pickupFeeMinor?: number;
  totalMinor: number | null;
  downpaymentPercent: number;
  downpaymentMinor: number | null;
  balanceMinor: number | null;
  /**
   * An approved organization's discount, already taken out of `totalMinor`
   * (gridgo-api#155). Drawn as its own line, never subtracted again.
   */
  organizationDiscountMinor?: number;
};

export type CartLineRecord = {
  id: string;
  /** Queue-and-calendar projection for this configured line; absent on older APIs. */
  promiseBy?: string | null;
  /**
   * The shop's id on a single-shop basket. A multi-shop basket withholds it
   * and sends `groupId` instead, so group lines by `lineGroupKey`.
   */
  supplierId?: string;
  /** Which shop group this line is in, on a multi-shop basket only. */
  groupId?: string;
  /**
   * The date this product was matched for (gridgo-client#189). Each product
   * keeps its own; null is "no rush". Absent on an API from before, which held
   * the whole basket to `cart.deadline` — read it through `lineDeadlineOf`.
   */
  deadline?: string | null;
  catalogItemId: string;
  quantity: number;
  optionIds: string[];
  /** How big it is, for a listing the shop prices by size. */
  measurement: LineMeasurement | null;
  structuredSpec: Record<string, unknown>;
  artworkFileId: string | null;
  mockupFileId: string | null;
  /** Design links on this line. Absent on an API from before them — see `lineArtworkLinks`. */
  artworkLinks?: ArtworkLink[];
  /** This line's own drop-off, for a run split across several addresses. */
  dropoff: OrderPoint | null;
  sortOrder: number;
  /** The listing as it stands now, priced for the options on this line. */
  listing: CatalogItem | null;
  lineSubtotalMinor: number | null;
  /** GRIDGO amount for `lineSubtotalMinor` (shop + live service fee). */
  clientLineSubtotalMinor?: number | null;
};

/**
 * One shop's share of a basket, as GRIDGO prices it (gridgo-api#117).
 *
 * Every figure is GRIDGO's: items carry the service fee inside them, and
 * delivery is that group's own fee to its farthest drop-off. A figure GRIDGO
 * cannot price yet is null, never zero.
 */
export type CartGroup = {
  /** Opaque, and it moves: it is the group's first line id. Re-read it. */
  id: string;
  /** "Shop A", "Shop B" — never the shop's identity. */
  label: string;
  /**
   * The date this group is printed and delivered for: a group is one shop on
   * one date (gridgo-client#189). Absent on an older API — `groupDeadlineOf`.
   */
  deadline?: string | null;
  lineIds: string[];
  clientItemSubtotalMinor: number | null;
  deliveryFeeMinor: number | null;
  totalMinor: number | null;
  /** This group's share of a hub pick-up fee charged once per basket. */
  pickupFeeMinor?: number;
  /** This group's own organization discount, already out of `totalMinor` (#166). */
  organizationDiscountMinor?: number;
};

export type Cart = {
  id: string;
  state: "draft" | "checked_out";
  version: number;
  serviceLevel: ServiceLevel;
  scheduledFor: string | null;
  /**
   * The basket's one deadline from before each product kept its own
   * (gridgo-client#189). Only a fallback now — read dates through
   * `lineDeadlineOf` / `groupDeadlineOf`.
   */
  deadline?: string | null;
  fulfillmentMode: FulfilmentMode;
  defaultDropoff: OrderPoint | null;
  /** Set when the basket was filled through the choose-before-matching flow; then read-only. */
  requestFulfillment?: RequestFulfilment | null;
  /** On a pick-up basket chosen before matching: the hub as it stands now. */
  hubPickup?: HubPickup | null;
  /** GRIDGO's figures for this draft. Null once checked out; absent on an older API. */
  clientQuote?: CartQuote | null;
  lines: CartLineRecord[];
  /**
   * One per shop and date, in the order they were first added
   * (gridgo-client#189). Absent on older APIs.
   */
  groups?: CartGroup[];
  /** Two or more groups: grouped checkout, paid in full. Absent on older APIs. */
  isMultiGroup?: boolean;
  groupCount?: number;
  /** Distinct shops behind the groups; one shop on two dates is 1. */
  shopCount?: number;
  /** Set once a multi-shop basket has been checked out. */
  basketId?: string;
  checkedOutOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** One shop group of a placed multi-shop basket, with its live state. */
export type BasketGroup = {
  orderId: string;
  label: string;
  /** This group's own date (gridgo-client#189); absent on an older API. */
  deadline?: string | null;
  state: string;
  clientItemSubtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  pickupFeeMinor?: number;
  organizationDiscountMinor?: number;
};

/**
 * A placed multi-shop basket: one payment and one receipt over several
 * ordinary orders, one per shop group (gridgo-api#117).
 */
export type Basket = {
  id: string;
  receiptOrderId: string;
  deadline: string | null;
  fulfillmentMode: FulfilmentMode;
  totalMinor: number;
  /** The full hub pick-up fee, charged once for the whole basket. */
  pickupFeeMinor?: number;
  payment: PaymentInstallment & { amountMinor: number };
  groups: BasketGroup[];
  /** Distinct shops behind the groups (gridgo-client#189); absent on older APIs. */
  shopCount?: number;
  groupCount?: number;
  createdAt?: string;
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
    downpaymentPercent?: number;
  };
  jobs: MatchedJob[];
  invoiceNumber: string;
  createdAt: string;
};

export type InvoiceLine = {
  id: string;
  jobId: string;
  itemName: string;
  quantity: number;
  /** The shop's figures. Withheld from a client on a multi-shop receipt. */
  unitPriceMinor?: number;
  amountMinor?: number;
  /** GRIDGO's figures, fee inside (gridgo-api#132). */
  clientUnitPriceMinor?: number | null;
  clientAmountMinor?: number | null;
  artworkFileId: string | null;
  mockupFileId: string | null;
  artworkLinks?: ArtworkLink[];
  dropoff: OrderPoint | null;
};

/** One shop group's section of a combined multi-shop receipt. */
export type InvoiceGroup = {
  orderId: string;
  label: string;
  /** This group's own date (gridgo-client#189); absent on an older API. */
  deadline?: string | null;
  lines: InvoiceLine[];
  clientItemSubtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  pickupFeeMinor?: number;
  /** This group's own organization discount, already out of `totalMinor` (#166). */
  organizationDiscountMinor?: number;
};

export type Invoice = {
  invoiceNumber: string;
  orderId: string;
  /** Set on the one combined receipt of a multi-shop basket. */
  basketId?: string;
  issuedAt: string;
  currency: string;
  lines: InvoiceLine[];
  /** One section per shop group, on a multi-shop receipt only. */
  groups?: InvoiceGroup[];
  /** Shop items before the fee. Deprecated on client reads — use `clientItemSubtotalMinor`. */
  itemSubtotalMinor?: number;
  /** GRIDGO's printing figure for the whole invoice, fee rounded once on the aggregate. */
  clientItemSubtotalMinor?: number | null;
  serviceFeeRateBps?: number;
  serviceFeeMinor?: number;
  /** One leg per job. `shopName` is withheld from clients in phase 3 — never draw it. */
  deliveryLines: { jobId: string; shopName?: string; amountMinor: number }[];
  /** Every fulfilment charge; a pick-up's hub fee is already inside it. */
  deliveryFeeMinor: number;
  /** Present on a pick-up chosen before matching: the hub fee inside `deliveryFeeMinor`. */
  pickupFeeMinor?: number;
  totalMinor: number;
  paymentPlan: {
    method: "qr_manual";
    downpaymentMinor: number;
    balanceMinor: number;
    downpaymentPercent?: number;
  };
  /** An approved organization's discount, already inside `totalMinor`. */
  organizationDiscountMinor?: number;
  /** The officer of record when the order was placed (gridgo-client#164). */
  organizationOfficer?: OrganizationOfficerSnapshot | null;
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
// parts this app is allowed to change, and `POST /me/business-application` is
// how a personal account asks Operations to become a business or organization.
// The account type does not change until that case is approved.
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

/** The account, re-read. Carries the `version` every correction must quote. */
export async function getAccount(): Promise<User> {
  const result = await request<{ user: User; approvalCase?: ApprovalCaseSummary | null }>("/me");
  return withBusinessApplication(result.user, result.approvalCase);
}

export async function patchAccount(
  patch: AccountPatch,
  expectedVersion: number,
): Promise<User> {
  const result = await request<{ user: User; approvalCase?: ApprovalCaseSummary | null }>("/me", {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion, ...patch }),
  });
  return withBusinessApplication(result.user, result.approvalCase);
}

export function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `apply-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type MatchInput = {
  subcategoryCode: string;
  /**
   * This order's ranking. Omit to use the one saved on the account — which is
   * what skipping the per-order step means. Never saves the preference.
   */
  ranking?: MatchFactor[];
  addressId?: string;
  dropoff?: OrderPoint | null;
  /**
   * The basket this product joins. GRIDGO rechecks a shop's queue with what
   * the basket already has there, and keeps shop identities out of a
   * multi-shop answer (gridgo-api#117). The product keeps its own `deadline`
   * (gridgo-client#189).
   * Sent only once the basket has a line — see `basketMatchContext`.
   */
  cartId?: string;
  /**
   * Add more from one shop group of the basket: matching is held to that
   * group's shop without the client ever naming it. Needs `cartId`.
   */
  groupId?: string;
  /**
   * When the client needs it. A filter, not a preference: a shop that cannot
   * finish by this is not offered rather than ranked lower, because "can you
   * make Friday" is not something to weigh against a price.
   */
  deadline?: string | null;
  /**
   * Delivery or pick-up, chosen before matching (gridgo-api#148). Delivery
   * needs `dropoff` or `addressId`; pick-up is matched against GRIDGO Office.
   * Omitted on a basket that started before the choice moved here, which
   * keeps its checkout-time choice.
   */
  fulfillmentMode?: FulfilmentMode;
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
  /** The basket's one deadline, ISO. Only an older basket has one (gridgo-client#189). */
  deadline?: string;
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
    /**
     * A listing picked on the match screen travels as its token, so the
     * server resolves the press and keeps the job's deadline on the line.
     * Both or neither; without them this is the plain catalogue add.
     */
    matchRequestId?: string;
    selectToken?: string;
    optionIds: string[];
    quantity: number;
    /** Required by a listing the shop prices by size; refused by any other. */
    measurement?: LineMeasurement | null;
    structuredSpec?: Record<string, unknown>;
    artworkFileId?: string | null;
    /** Replaces the line's links; `[]` clears them. Omit to keep them. */
    artworkLinks?: ArtworkLink[];
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
    /** Replaces the line's links; `[]` clears them. Omit to keep them. */
    artworkLinks?: ArtworkLink[];
    dropoff?: OrderPoint | null;
    /**
     * Move this product to another date (gridgo-client#189). GRIDGO rechecks
     * the listing against it and refuses with `409 deadline_not_met`.
     */
    deadline?: string;
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

/**
 * Season windows: when shops fill up early (`docs/SEASON_WINDOWS_API.md`).
 *
 * Public and awareness only. Read through `parseSeasonWindows`, which drops a
 * malformed row rather than failing the read.
 */
export async function getSeasonWindows(): Promise<SeasonWindows> {
  return parseSeasonWindows(await request<unknown>("/season-windows"));
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
): Promise<{ order: MatchedOrder; invoice: Invoice; basket?: Basket }> {
  return request(`/me/carts/${encodeURIComponent(cartId)}/checkout`, {
    method: "POST",
    body: JSON.stringify({ payment: { method: "qr_manual", ...payment } }),
  });
}

/** A placed multi-shop basket with every group's live state. */
export async function getBasket(basketId: string): Promise<Basket> {
  const result = await request<{ basket: Basket }>(`/baskets/${encodeURIComponent(basketId)}`);
  return result.basket;
}

/**
 * Send the basket's one payment again after Operations turned it back.
 *
 * A multi-shop group's own payment routes answer `409 basket_payment_required`:
 * one transfer covers every group, so it is submitted once, here.
 */
export async function submitBasketPayment(
  basketId: string,
  reference: string,
  proofFileId: string,
): Promise<Basket> {
  const result = await request<{ basket: Basket }>(
    `/baskets/${encodeURIComponent(basketId)}/payment/submit`,
    {
      method: "POST",
      body: JSON.stringify({ method: "qr_manual", reference, proofFileId }),
    },
  );
  return result.basket;
}

export async function getInvoice(orderId: string): Promise<Invoice> {
  const result = await request<{ invoice: Invoice }>(
    `/orders/${encodeURIComponent(orderId)}/invoice`,
  );
  return result.invoice;
}

export type { PhysicalInvoiceDraft, PhysicalInvoiceRequest };

export async function getPhysicalInvoice(orderId: string): Promise<PhysicalInvoiceRequest | null> {
  try {
    const result = await request<{ request: PhysicalInvoiceRequest }>(
      `/orders/${encodeURIComponent(orderId)}/physical-invoice`,
    );
    return result.request;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.body as { error?: string } | null)?.error === "physical_invoice_not_found"
    ) {
      return null;
    }
    throw error;
  }
}

export async function requestPhysicalInvoice(
  orderId: string,
  draft: PhysicalInvoiceDraft,
): Promise<PhysicalInvoiceRequest> {
  const result = await request<{ request: PhysicalInvoiceRequest }>(
    `/orders/${encodeURIComponent(orderId)}/physical-invoice`,
    { method: "POST", body: JSON.stringify(draft) },
  );
  return result.request;
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
  /** Browser `File` from the web picker. Required for `FormData` on web. */
  file?: Blob;
};

export type UploadHandle = {
  /** Resolves only when the server returns `201` with a ready file record. */
  done: Promise<StoredFile>;
  /** Abandon the transfer (client left the screen, or chose another file). */
  cancel: () => void;
};

async function uploadFilePart(asset: UploadAsset): Promise<Blob> {
  if (asset.file) return asset.file;
  if (Platform.OS === "web") {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    return new File([blob], asset.name, {
      type: asset.mimeType || blob.type || "application/octet-stream",
    });
  }
  // React Native's FormData takes this shape for a file part and streams it.
  return {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType || "application/octet-stream",
  } as unknown as Blob;
}

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
  const owner = liveGeneration();
  const xhr = new XMLHttpRequest();

  const done = (async () => {
    const auth = await resolveToken();
    assertLiveGeneration(owner);
    const filePart = await uploadFilePart(asset);
    return new Promise<StoredFile>((resolve, reject) => {
      const form = new FormData();
      form.append("purpose", purpose);
      form.append("file", filePart);

      xhr.open("POST", `${getApiBase()}/files`);
      xhr.responseType = "text";
      xhr.setRequestHeader("Accept", "application/json");
      if (auth.token) xhr.setRequestHeader("Authorization", `Bearer ${auth.token}`);
        xhr.setRequestHeader("X-GRIDGO-Role", "client");
      // Content-Type is left unset on purpose: the platform supplies the
      // multipart boundary, and overriding it corrupts the request body.

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event: ProgressEvent) => {
          if (owner !== liveGeneration()) return;
          onProgress(
            event.lengthComputable && event.total > 0
              ? event.loaded / event.total
              : null,
          );
        };
      }

      xhr.onload = () => {
        try {
          assertLiveGeneration(owner);
        } catch (error) {
          reject(error);
          return;
        }
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

/**
 * Delete the client's own artwork early (gridgo-api `docs/STORAGE_API.md`,
 * `DELETE /files/:fileId`). Allowed only once every order using the file is
 * completed and nothing is open on it; refused with `409 file_retention_hold`
 * or `409 file_in_use` otherwise. The answer's `state` is `deleted`, or
 * `delete_pending` when a case opened while storage was being cleared.
 */
export async function deleteFile(fileId: string): Promise<StoredFile> {
  const result = await request<{ file: StoredFile }>(`/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  });
  return result.file;
}

// ---------------------------------------------------------------------------
// Refunds — see docs/REFUNDS_API.md in gridgo-api (policy `available_funds_v1`)
// ---------------------------------------------------------------------------

export type RefundKind = "cancellation" | "complaint";
export type RefundProvider = "gcash" | "maya" | "bank" | "other";

/** The client's own receiving account. `revision` rises with each replacement. */
export type RefundDestination = {
  provider: string;
  accountName: string;
  qrFileId: string;
  ownershipConfirmed: boolean;
  revision: number;
};

/**
 * What Operations approved, as the client may read it. `principalMinor` is
 * the shop's share and is never drawn on its own: the client reads it with
 * `feeMinor` inside it (`refundBreakdown` in `lib/refunds.ts`).
 */
export type RefundSettlement = {
  id: string;
  principalMinor: number;
  feeMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  /** `cancelled | fulfilled_with_refund`. */
  disposition: string;
  /** Operations' decision note. Written for the client to read. */
  reason: string;
  approvedAt: string;
};

/** The transfer Operations recorded. Its screenshot is evidence, not a receipt. */
export type RefundPayment = {
  id: string;
  reference: string;
  receiptFileId: string;
  amountMinor: number;
  paidAt: string;
  evidenceLabel: string;
};

export type RefundHistoryEntry = { kind: string; reason: string; at: string };

export type Refund = {
  id: string;
  orderId: string;
  /** Open string: an unknown status must never crash the screen. */
  status: string;
  version: number;
  policyVersion: string;
  kind: string;
  reason: string;
  evidenceFileIds: string[];
  destination: RefundDestination | null;
  beforeProduction: boolean;
  late: boolean;
  filingDeadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  history: RefundHistoryEntry[];
  settlement: RefundSettlement | null;
  payment: RefundPayment | null;
};

export type RefundDestinationInput = {
  qrFileId: string;
  provider: RefundProvider;
  accountName: string;
  ownershipConfirmed: true;
};

export type RefundRequestInput = {
  kind: RefundKind;
  reason: string;
  evidenceFileIds: string[];
  destination: RefundDestinationInput;
};

/** Every refund on one order, oldest first as the API keeps them. */
export async function listOrderRefunds(orderId: string): Promise<Refund[]> {
  const result = await request<{ refunds: Refund[] }>(
    `/orders/${encodeURIComponent(orderId)}/refund-requests`,
  );
  return result.refunds;
}

export async function getRefund(refundId: string): Promise<Refund> {
  const result = await request<{ refund: Refund }>(`/refund-requests/${encodeURIComponent(refundId)}`);
  return result.refund;
}

/**
 * File a refund request. The idempotency key belongs to this exact body: a
 * retry after a lost answer sends the same key and gets the saved result
 * rather than a second request.
 */
export async function requestRefund(
  orderId: string,
  input: RefundRequestInput,
  idempotencyKey: string,
): Promise<Refund> {
  const result = await request<{ refund: Refund }>(
    `/orders/${encodeURIComponent(orderId)}/refund-requests`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
  return result.refund;
}

/** Replace the receiving QR. Operations checks the new one before paying. */
export async function replaceRefundDestination(
  refundId: string,
  input: RefundDestinationInput & { expectedVersion: number },
  idempotencyKey: string,
): Promise<Refund> {
  const result = await request<{ refund: Refund }>(
    `/refund-requests/${encodeURIComponent(refundId)}/destination`,
    {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
  return result.refund;
}

/** Withdraw a request Operations has not settled yet. */
export async function withdrawRefund(
  refundId: string,
  input: { expectedVersion: number; reason: string },
  idempotencyKey: string,
): Promise<Refund> {
  const result = await request<{ refund: Refund }>(
    `/refund-requests/${encodeURIComponent(refundId)}/withdraw`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
  return result.refund;
}

// ---------------------------------------------------------------------------
// When the shop cannot carry on: a replacement, a new date, or a refund
// ---------------------------------------------------------------------------

/**
 * The client's view of a shop that could not take or finish an order. The
 * shop, its address and the internal dates are never sent to a client.
 * `status` is an open string: `awaiting_client | ops_review |
 * refund_requested | refunded | accepted` today.
 */
export type ShopRecovery = {
  id: string;
  status: string;
  createdAt: string;
  refundRequestId: string | null;
  /** The replacement's client-ready date. Null when no shop can take it. */
  replacement: { promiseBy: string } | null;
  canAccept: boolean;
  canRefund: boolean;
};

/**
 * A shop's request for a later deadline, as the client sees it. Open strings:
 * `status` is `pending | accepted | declined | expired | operations_required`,
 * `resolution` is null or `rematch_offered | no_match | operations_required |
 * rematched | refund_requested | resolved`.
 */
export type RescheduleRequest = {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  requestedAt: string;
  /** The 24-hour answer window closes here. */
  expiresAt: string;
  answeredAt: string | null;
  resolution: string | null;
  refundRequestId: string | null;
  workHeld: boolean;
  originalPromiseBy: string | null;
  proposedPromiseBy: string | null;
  canRequestRefund?: boolean;
  /** Another shop for the same item, specs and price; held for 15 minutes. */
  rematch?: {
    id: string;
    promiseBy: string;
    expiresAt: string;
    sameProductAndSpecs: boolean;
    priceUnchanged: boolean;
  } | null;
};

/**
 * Take the replacement shop. A `409 shop_recovery_offer_changed` carries a
 * refreshed offer in its body and is never accepted for the client.
 */
export async function acceptShopRecovery(orderId: string, recoveryId: string): Promise<ShopRecovery | null> {
  const result = await request<{ recovery: ShopRecovery | null }>(
    `/orders/${encodeURIComponent(orderId)}/shop-recovery/accept`,
    { method: "POST", body: JSON.stringify({ recoveryId }) },
  );
  return result.recovery;
}

/** Choose a full refund instead. Opens a refund request; it moves no money. */
export async function refundShopRecovery(
  orderId: string,
  recoveryId: string,
  idempotencyKey: string,
): Promise<ShopRecovery | null> {
  const result = await request<{ recovery: ShopRecovery | null }>(
    `/orders/${encodeURIComponent(orderId)}/shop-recovery/refund`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ recoveryId }),
    },
  );
  return result.recovery;
}

/** Accept or decline the shop's proposed date. */
export async function answerReschedule(
  orderId: string,
  requestId: string,
  answer: "accept" | "decline",
): Promise<RescheduleRequest> {
  const result = await request<{ request: RescheduleRequest }>(
    `/orders/${encodeURIComponent(orderId)}/reschedule-request/answer`,
    { method: "POST", body: JSON.stringify({ requestId, answer }) },
  );
  return result.request;
}

/** Look for another shop again, or take the one on offer. */
export async function rematchReschedule(
  orderId: string,
  input: { requestId: string; action: "refresh" } | { requestId: string; action: "accept"; offerId: string },
): Promise<RescheduleRequest> {
  const result = await request<{ request: RescheduleRequest }>(
    `/orders/${encodeURIComponent(orderId)}/reschedule-request/rematch`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return result.request;
}

/** After declining the date: a full refund instead of another shop. */
export async function refundReschedule(
  orderId: string,
  requestId: string,
  idempotencyKey: string,
): Promise<RescheduleRequest> {
  const result = await request<{ request: RescheduleRequest }>(
    `/orders/${encodeURIComponent(orderId)}/reschedule-request/refund`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ requestId }),
    },
  );
  return result.request;
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

/**
 * The client saying the order arrived with no problems.
 *
 * Closes the issue window now rather than on the clock: the platform marks
 * the job `completed` in the client's name and releases what it was holding
 * for the supplier. Refused with `issue_open` while a report is open.
 */
export async function confirmDelivery(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}/confirm`, {
    method: "POST",
  });
  return result.order;
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

export type SupportChatPartyRole = "client" | "supplier" | "rider";
export type SupportChatSenderRole = SupportChatPartyRole | "ops_admin" | "super_admin";

export type SupportChatThread = {
  id: string;
  partyUserId: string;
  partyRole: SupportChatPartyRole;
  partyName?: string | null;
  partyEmail?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  lastMessageSenderRole?: SupportChatSenderRole | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SupportChatAttachment = {
  fileId: string;
  contentType?: string | null;
  originalFilename?: string | null;
};

export type SupportChatMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  senderRole: SupportChatSenderRole;
  senderName?: string | null;
  senderImageUrl?: string | null;
  body: string;
  attachments?: SupportChatAttachment[];
  createdAt: string;
  mine: boolean;
};

export async function getSupportChatMe(): Promise<{
  threads?: SupportChatThread[];
  thread: SupportChatThread | null;
  messages: SupportChatMessage[];
  unreadCount?: number;
}> {
  return request("/support-chat/me");
}

export async function getSupportChatThread(
  threadId: string,
  filters?: { q?: string; media?: boolean },
): Promise<{
  thread: SupportChatThread;
  messages: SupportChatMessage[];
}> {
  const params = new URLSearchParams();
  if (filters?.q?.trim()) params.set("q", filters.q.trim());
  if (filters?.media) params.set("media", "1");
  const query = params.toString();
  return request(
    `/support-chat/threads/${encodeURIComponent(threadId)}${query ? `?${query}` : ""}`,
  );
}

export async function openSupportChatThread(): Promise<{ thread: SupportChatThread }> {
  return request("/support-chat/me/threads", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * `newThread` starts a fresh conversation with this message rather than
 * adding to the latest one — ignored when `threadId` names a thread.
 */
export async function sendSupportChatMessage(
  body: string,
  threadId?: string,
  options?: { newThread?: boolean; attachmentFileIds?: string[] },
): Promise<{
  thread: SupportChatThread;
  message: SupportChatMessage;
}> {
  return request("/support-chat/me/messages", {
    method: "POST",
    body: JSON.stringify({
      body,
      ...(threadId ? { threadId } : options?.newThread ? { newThread: true } : {}),
      ...(options?.attachmentFileIds?.length
        ? { attachmentFileIds: options.attachmentFileIds }
        : {}),
    }),
  });
}

export async function deleteSupportChatThread(threadId: string): Promise<void> {
  await request(`/support-chat/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
}

export async function markSupportChatRead(threadId?: string): Promise<{
  thread: SupportChatThread | null;
  unreadCount?: number;
}> {
  if (threadId) {
    return request(`/support-chat/threads/${encodeURIComponent(threadId)}/read`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
  }
  return request("/support-chat/me/read", { method: "PATCH", body: JSON.stringify({}) });
}

/* --------------------------------------------------------------------------
   Organization and business accounts (gridgo-client#160, #163–#166)

   Contracts: gridgo-api `docs/ORGANIZATION_ACCOUNTS_API.md` (applications,
   officer of record, reminders) and `docs/ORGANIZATION_MONEY_API.md`
   (discount and statements).
   -------------------------------------------------------------------------- */

/** The officer stamped on an order or invoice when it was placed. */
export type OrganizationOfficerSnapshot = {
  id: string;
  fullName: string;
  verifiedAt: string | null;
};

/** The verified officer currently responsible for the organization. */
export type OrganizationOfficer = OrganizationOfficerSnapshot & {
  startedAt?: string | null;
  endedAt?: string | null;
};

export type ClientOrganization = {
  userId: string;
  name: string | null;
  school: string | null;
  email: string | null;
  /** Null while the first officer is still being verified. */
  currentOfficer: OrganizationOfficer | null;
  confirmedAt: string | null;
  nextConfirmationAt: string | null;
  /** Set while the quarterly "is this still the officer?" question is open. */
  confirmationRequestedAt: string | null;
  approvalCase: Pick<ApprovalCaseSummary, "id" | "status" | "version" | "applicationRevision"> | null;
  actions: string[];
};

/** Which checklist a business applicant follows. */
export type BusinessType = "sole_proprietor" | "partnership" | "corporation";

export type GovernmentIdType = "philid" | "ephilid" | "passport" | "drivers_license" | "umid";

/** The person behind an application: an organization's officer, a business's signatory. */
export type ApplicantPerson = {
  fullName: string;
  dateOfBirth: string;
  address: string;
  phone: string;
  governmentIdType: GovernmentIdType;
  governmentIdExpiresOn?: string;
  governmentIdHasNoExpiry?: boolean;
  originalId: true;
  detailsMatchId: true;
  /** Organizations only. */
  studentIdExpiresOn?: string;
};

export type ClientApplicationInput =
  | {
      accountType: "organization";
      businessName: string;
      businessNature: string;
      school: string;
      organizationEmail: string;
      officer: ApplicantPerson;
      documents: Record<string, string>;
      facultyAdviserContact?: string;
      expectedVersion?: number;
    }
  | {
      accountType: "business";
      businessType: BusinessType;
      businessName: string;
      businessNature: string;
      signatory: ApplicantPerson;
      documents: Record<string, string>;
      expectedVersion?: number;
    };

export type ApplicationChecklist = {
  requiredDocuments: Record<string, string[]>;
  optionalDocuments: Record<string, string[]>;
  optionalFields: string[];
  filePurpose: string;
  /** Operations asked a business applicant for the otherwise optional permit. */
  businessPermitRequired: boolean;
};

export async function getApplicationChecklist(): Promise<ApplicationChecklist> {
  return request("/me/client-application/checklist");
}

/** The applicant's details as they were sent; every field optional because an older revision may lack it. */
export type SubmittedApplicant = Partial<Omit<ApplicantPerson, "originalId" | "detailsMatchId">>;

/**
 * What the client sent last, read back while it is with Operations or was
 * sent back (gridgo-api `docs/ORGANIZATION_ACCOUNTS_API.md`, gridgo-client#187).
 * `documents` lists only files GRIDGO still holds ready to be sent again.
 */
export type SubmittedApplication = {
  accountType: "organization" | "business";
  businessType?: BusinessType;
  businessName?: string;
  businessNature?: string;
  school?: string;
  organizationEmail?: string;
  facultyAdviserContact?: string;
  /** The revision was an officer handover. */
  handover?: boolean;
  officer?: SubmittedApplicant;
  signatory?: SubmittedApplicant;
  documents?: Record<string, { fileId: string; name: string | null }>;
};

/** A document Operations asked for again, with what they said about it. */
export type SentBackDocument = { key: string; label: string; note: string | null };

export type ClientApplicationView = {
  approvalCase: { id: string; status: string; version: number; applicationRevision: number } | null;
  application: SubmittedApplication | null;
  sentBack: { reason: string | null; documents: SentBackDocument[] } | null;
};

export async function getClientApplication(): Promise<ClientApplicationView> {
  return request("/me/client-application");
}

/** Sends a six-digit code to the organization's shared sign-in email. */
export async function requestOrganizationEmailCode(
  email: string,
): Promise<{ expiresAt: string; resendAfter: string }> {
  return request("/me/organization/email-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyOrganizationEmailCode(
  code: string,
): Promise<{ verified: true; expiresAt: string }> {
  return request("/me/organization/email-code/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/**
 * Send (or correct) an organization or business application with its whole
 * checklist. `expectedVersion` is set when a case already exists — a pending
 * or turned-down one being corrected, or an approved organization verifying
 * its first officer. The account stays as it is until Operations approves.
 */
export async function submitClientApplication(
  input: ClientApplicationInput,
  idempotencyKey: string,
): Promise<User> {
  await request("/me/business-application", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
  return getAccount();
}

/** Null when this account has no organization record. */
export async function getOrganization(): Promise<ClientOrganization | null> {
  const result = await request<{ organization: ClientOrganization | null }>("/me/organization");
  return result.organization ?? null;
}

/**
 * Hand the account to a new officer. Needs a fresh email code first; the
 * current officer stays responsible until Operations approves the new one.
 */
export async function handoverOrganizationOfficer(
  input: { expectedVersion: number; officer: ApplicantPerson; documents: Record<string, string> },
  idempotencyKey: string,
): Promise<ClientOrganization | null> {
  const result = await request<{ organization: ClientOrganization | null }>(
    "/me/organization/officer/handover",
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
  return result.organization ?? null;
}

/** "Yes, they are still the officer." */
export async function confirmOrganizationOfficer(
  officerId: string,
): Promise<ClientOrganization | null> {
  const result = await request<{ organization: ClientOrganization | null }>(
    "/me/organization/officer/confirm",
    { method: "POST", body: JSON.stringify({ officerId }) },
  );
  return result.organization ?? null;
}

export type StatementPeriod =
  | { kind: "this_month" }
  | { kind: "this_quarter" }
  | { kind: "custom"; from: string; to: string };

export type StatementRow = {
  date: string;
  closedAt: string;
  orderId: string;
  product: string;
  amountMinor: number;
  organizationDiscountMinor: number;
  invoiceNumber: string;
  /** The officer at the time of the order; a string, `{ name }` or blank. */
  officerOfRecord: string | { name?: string; fullName?: string } | null;
};

export type OrganizationStatement = {
  notice: string;
  currency: string;
  period: { from: string; to: string; timezone: string };
  orderCount: number;
  totalSpendMinor: number;
  discountEarnedMinor: number;
  orders: StatementRow[];
};

export function statementQuery(
  period: StatementPeriod,
  format: "json" | "pdf" | "csv" = "json",
): string {
  const params = new URLSearchParams();
  if (period.kind === "custom") {
    params.set("period", "custom");
    params.set("from", period.from);
    params.set("to", period.to);
  } else {
    params.set("period", period.kind);
  }
  if (format !== "json") params.set("format", format);
  return `/me/organization/statements?${params.toString()}`;
}

export async function getOrganizationStatement(
  period: StatementPeriod,
): Promise<OrganizationStatement> {
  const result = await request<{ statement: OrganizationStatement }>(statementQuery(period));
  return result.statement;
}

/**
 * What an export download needs: the absolute URL and the headers a signed-in
 * request carries. The bytes are fetched by `lib/statementExport.ts`, which
 * knows how each platform keeps a file.
 */
export async function statementExportRequest(
  period: StatementPeriod,
  format: "pdf" | "csv",
): Promise<{ url: string; headers: Record<string, string> }> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    Accept: format === "pdf" ? "application/pdf" : "text/csv",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["X-GRIDGO-Role"] = "client";
  }
  return { url: `${getApiBase()}${statementQuery(period, format)}`, headers };
}
