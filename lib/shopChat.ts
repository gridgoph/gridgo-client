/*
  The client's masked conversation with the print shop on one order
  (gridgo-client#246, gridgo-api `docs/ORDER_CLIENT_SHOP_CHAT_API.md`).

  It passes through GRIDGO: the three people in it are only ever "Client",
  "Print shop" and "GRIDGO", the server hides phone numbers, emails, links and
  handles before anyone reads a message, and Operations can read every thread
  and write as GRIDGO. The client reads only the masked text, including in the
  answer to their own send.

  The API decides the window and says so on the order as `clientShopChat`:
  `unavailable` until the shop accepts, `open` until the issue window closes,
  then `read_only`. The messages stay with the order as dispute evidence, so
  a closed conversation is still readable. This module only reads that answer
  and words it; it never works the window out from the order's state.

  Chat never changes the order. Price, specification and deadline changes go
  through the shop's formal change request (`lib/orderChanges.ts`), which the
  client answers on the order screen.
*/

import type { Notification } from "@/lib/api";
import { closesAtLabel } from "@/lib/deliveryChat";

export type ShopChatStatus = "open" | "read_only" | "unavailable";

/** The order's `clientShopChat`: whether the conversation takes messages. */
export type ShopChatSummary = {
  status: ShopChatStatus;
  /** The order's issue-window end. Null until the window has started. */
  closesAt: string | null;
  /** The server's fixed reminder that chat does not change the order. */
  reminder: string;
};

/** The conversation as `GET /orders/:id/client-shop-chat` returns it. */
export type ShopChat = ShopChatSummary & {
  /** Messages from the others that were unread before this read. */
  unread: number;
  /** The server's fixed warning once this client has repeatedly shared contacts. */
  warning: string | null;
};

export type ShopChatParticipant = "Client" | "Print shop" | "GRIDGO";

export type ShopChatAttachment = {
  fileId: string;
  contentType: string | null;
  size: number | null;
  /** Always `image.png` or `document.pdf`; the original name is never kept. */
  originalFilename: string | null;
};

export type ShopChatMessage = {
  id: string;
  senderLabel: ShopChatParticipant;
  /** Masked by the server. Empty when an attachment is the whole message. */
  body: string;
  mine: boolean;
  createdAt: string;
  attachments: ShopChatAttachment[];
};

export type ShopChatReportReason = "contact_sharing" | "inappropriate" | "change_request" | "other";

export const SHOP_CHAT_ROUTE = "/order/shop-chat" as const;
export const SHOP_CHAT_ATTACHMENT_PURPOSE = "client_shop_chat_attachment";
/** The inbox (and push) type for a new message in this conversation. */
export const SHOP_CHAT_NOTIFICATION_TYPE = "client_shop_chat_message";
export const SHOP_MESSAGE_MAX = 1000;
export const SHOP_CHAT_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const SHOP_CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SHOP_CHAT_ATTACHMENT_MAX_COUNT = 4;
/** How often an open conversation asks for new messages while on screen. */
export const SHOP_CHAT_POLL_MS = 5_000;
/** What the server writes where it removed a phone number, email, link or handle. */
export const HIDDEN_CONTACT = "[contact hidden]";

export const SHOP_CHAT_REMINDER =
  "Price, specification and deadline changes require a formal change request. Chat messages do not change the order.";

export const SHOP_CHAT_REPORT_REASONS: { code: ShopChatReportReason; label: string; detail: string }[] = [
  {
    code: "contact_sharing",
    label: "Sharing contact details",
    detail: "A number, email, link or handle, or asking to talk outside GRIDGO.",
  },
  { code: "inappropriate", label: "Rude or inappropriate", detail: "Insults, threats or anything offensive." },
  {
    code: "change_request",
    label: "Changing the order in chat",
    detail: "Agreeing a new price, specification or deadline without a change request.",
  },
  { code: "other", label: "Something else", detail: "GRIDGO reads the conversation and decides." },
];

const PARTICIPANTS: readonly ShopChatParticipant[] = ["Client", "Print shop", "GRIDGO"];

function statusOf(value: unknown): ShopChatStatus | null {
  return value === "open" || value === "read_only" || value === "unavailable" ? value : null;
}

function isoOrNull(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function reminderOf(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : SHOP_CHAT_REMINDER;
}

/** The order's conversation, or null when it has none or sent something unknown. */
export function shopChatOf(order: { clientShopChat?: unknown } | null | undefined): ShopChatSummary | null {
  const raw = order?.clientShopChat;
  if (!raw || typeof raw !== "object") return null;
  const { status, closesAt, reminder } = raw as Record<string, unknown>;
  const known = statusOf(status);
  if (!known) return null;
  return { status: known, closesAt: isoOrNull(closesAt), reminder: reminderOf(reminder) };
}

/** The conversation's `chat` block. An unknown status reads as closed, never as open. */
export function shopChatFrom(raw: unknown): ShopChat {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    status: statusOf(row.status) ?? "read_only",
    closesAt: isoOrNull(row.closesAt),
    reminder: reminderOf(row.reminder),
    unread: typeof row.unread === "number" && row.unread > 0 ? Math.floor(row.unread) : 0,
    warning: typeof row.warning === "string" && row.warning.trim() ? row.warning.trim() : null,
  };
}

/**
 * Only the three labels are ever drawn. Anything else — a name in a payload
 * from a broken build — is not shown: the client's own message is Client, and
 * the only others who write to a client here are the shop and GRIDGO.
 */
export function participantOf(label: unknown, mine: boolean): ShopChatParticipant {
  if (PARTICIPANTS.includes(label as ShopChatParticipant)) return label as ShopChatParticipant;
  return mine ? "Client" : "Print shop";
}

export function shopChatMessageFrom(raw: unknown): ShopChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !isoOrNull(row.createdAt)) return null;
  const mine = row.mine === true;
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  return {
    id: row.id,
    senderLabel: participantOf(row.senderLabel, mine),
    body: typeof row.body === "string" ? row.body : "",
    mine,
    createdAt: row.createdAt as string,
    attachments: attachments.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const file = entry as Record<string, unknown>;
      if (typeof file.fileId !== "string") return [];
      return [
        {
          fileId: file.fileId,
          contentType: typeof file.contentType === "string" ? file.contentType : null,
          size: typeof file.size === "number" ? file.size : null,
          originalFilename: typeof file.originalFilename === "string" ? file.originalFilename : null,
        },
      ];
    }),
  };
}

export function shopChatRoute(orderId: string): { pathname: typeof SHOP_CHAT_ROUTE; params: { orderId: string } } {
  return { pathname: SHOP_CHAT_ROUTE, params: { orderId } };
}

/** Whether to offer the conversation on the order screen. Before acceptance there is nothing to open. */
export function showsShopChatEntry(chat: ShopChatSummary | null): chat is ShopChatSummary {
  return chat?.status === "open" || chat?.status === "read_only";
}

/** The row on the order screen that opens the conversation. */
export function shopChatEntry(chat: ShopChatSummary, unread: boolean) {
  const open = chat.status === "open";
  const title = open ? "Message the print shop" : "Messages with the print shop";
  const detail = unread
    ? "New message. Open to read it."
    : open
      ? "Ask about your job while it is made. Names and contact details stay hidden."
      : "Closed. Kept with this order as a record.";
  return {
    title,
    detail,
    accessibilityLabel: unread ? `${title}, new message` : title,
  };
}

/** The line under the conversation's heading. */
export function shopChatNotice(chat: ShopChatSummary, now: Date | number = Date.now()): string {
  if (chat.status === "unavailable") {
    return "You can message the print shop once it accepts this order.";
  }
  if (chat.status === "read_only") {
    return "This conversation is closed, so no new messages can be sent. It stays with the order as a record.";
  }
  const until = chat.closesAt ? ` Open until ${closesAtLabel(chat.closesAt, now)}.` : "";
  return `You appear as Client and the shop as Print shop. GRIDGO reads this conversation and may join. Phone numbers, emails, links and handles are hidden.${until}`;
}

/** How the composer explains where a real change goes. */
export const SHOP_CHAT_CHANGE_HELP =
  "If the shop needs to change something, it sends a change request that you answer on the order.";

export function hasHiddenContact(body: string): boolean {
  return body.includes(HIDDEN_CONTACT);
}

/** The note under a message where the server hid contact details. */
export function hiddenContactNote(message: Pick<ShopChatMessage, "mine">): string {
  return message.mine
    ? "Contact details were hidden. Keep talking and paying through GRIDGO."
    : "GRIDGO hid contact details in this message.";
}

/** "Print shop · 3:40 PM" under a bubble, in Davao time. */
export function messageCaption(message: Pick<ShopChatMessage, "senderLabel" | "createdAt">): string {
  const time = new Date(message.createdAt).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${message.senderLabel} · ${time}`;
}

/**
 * Where the "New messages" line goes: before the first of the last `unread`
 * messages someone else wrote. Null when nothing was unread.
 */
export function firstUnreadId(messages: readonly ShopChatMessage[], unread: number): string | null {
  if (unread <= 0) return null;
  let left = unread;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].mine) continue;
    left--;
    if (left === 0) return messages[index].id;
  }
  return messages.find((message) => !message.mine)?.id ?? null;
}

/** Appends a newer page, dropping anything already shown. */
export function mergeMessages(current: readonly ShopChatMessage[], page: readonly ShopChatMessage[]): ShopChatMessage[] {
  const seen = new Set(current.map((message) => message.id));
  const fresh = page.filter((message) => !seen.has(message.id));
  return fresh.length ? [...current, ...fresh] : (current as ShopChatMessage[]);
}

/**
 * Unread inbox notices about this order's conversation. With `seenUntil`, only
 * those about messages already on screen: a notice can reach the phone after
 * the conversation read the message it is about, and must not stay unread.
 */
export function unreadShopChatNoticeIds(
  items: readonly Pick<Notification, "id" | "type" | "orderId" | "read" | "at">[],
  readIds: readonly string[],
  orderId: string,
  seenUntil?: string | null,
): string[] {
  const until = seenUntil ? Date.parse(seenUntil) : null;
  return items
    .filter(
      (item) =>
        item.type === SHOP_CHAT_NOTIFICATION_TYPE &&
        item.orderId === orderId &&
        !item.read &&
        !readIds.includes(item.id) &&
        (until == null || Date.parse(item.at) <= until),
    )
    .map((item) => item.id);
}

export type ShopChatPickedFile = { uri: string; name?: string | null; mimeType?: string | null; size?: number | null };

export function isShopChatPdf(file: { contentType?: string | null; mimeType?: string | null; name?: string | null }): boolean {
  const type = file.contentType ?? file.mimeType ?? "";
  return type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
}

/** Why a picked file cannot go on a message, or null. The server checks again. */
export function shopChatFileProblem(asset: ShopChatPickedFile): string | null {
  const type = asset.mimeType === "image/jpg" ? "image/jpeg" : (asset.mimeType || "");
  const name = String(asset.name || "").toLowerCase();
  const extensionOk = [".jpg", ".jpeg", ".png", ".webp", ".pdf"].some((ext) => name.endsWith(ext));
  const typeOk = (SHOP_CHAT_ATTACHMENT_TYPES as readonly string[]).includes(type);
  if (!typeOk && !extensionOk) return "Attach a JPEG, PNG or WebP photo, or a PDF.";
  if (asset.size === 0) return "That file is empty.";
  if (typeof asset.size === "number" && asset.size > SHOP_CHAT_ATTACHMENT_MAX_BYTES) {
    return "Each file can be up to 10 MB.";
  }
  return null;
}

/** Adds picked files to a message's unsent ones, or says why it cannot. */
export function addShopChatFiles<T extends { uri: string; name: string; mimeType?: string | null }>(
  pending: T[],
  assets: ShopChatPickedFile[],
  toPending: (asset: { uri: string; name: string; mimeType: string }) => T,
): { ok: true; pending: T[] } | { ok: false; error: string } {
  const next = [...pending];
  for (const asset of assets) {
    const problem = shopChatFileProblem(asset);
    if (problem) return { ok: false, error: problem };
    if (next.length >= SHOP_CHAT_ATTACHMENT_MAX_COUNT) {
      return { ok: false, error: `A message can include up to ${SHOP_CHAT_ATTACHMENT_MAX_COUNT} files.` };
    }
    const pdf = isShopChatPdf(asset);
    next.push(
      toPending({
        uri: asset.uri,
        name: asset.name || (pdf ? "document.pdf" : "photo.jpg"),
        mimeType: asset.mimeType || (pdf ? "application/pdf" : "image/jpeg"),
      }),
    );
  }
  return { ok: true, pending: next };
}

/** "1.2 MB" / "640 KB" beside a sent PDF. */
export function fileSizeLabel(size: number | null): string | null {
  if (size == null || size <= 0) return null;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

/**
 * The API's `error` code. Read off the body rather than through `instanceof
 * ApiError`, so this module never imports the client at run time.
 */
function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const body = (error as { body?: unknown }).body;
  if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error);
  return null;
}

export type ShopChatUnavailable = { title: string; body: string };

/** Why the conversation cannot be shown, or null for an error a retry may fix. */
export function shopChatUnavailable(error: unknown): ShopChatUnavailable | null {
  const code = errorCode(error);
  if (code === "forbidden" || code === "order_not_found" || code === "not_found") {
    return {
      title: "This conversation is not available",
      body: "Only the client and the print shop on an order can read its messages.",
    };
  }
  return null;
}

/** Copy for a send that did not go through. */
export function shopChatSendError(error: unknown): string {
  const code = errorCode(error);
  if (code === "client_shop_chat_read_only") {
    return "This conversation is closed, so no new messages can be sent.";
  }
  if (code === "client_shop_chat_not_available") {
    return "You can message the print shop once it accepts this order.";
  }
  if (code === "too_many_requests") {
    return "You are sending messages too fast. Wait a moment and try again.";
  }
  if (code === "invalid_request") {
    return `Write a message of up to ${SHOP_MESSAGE_MAX} characters, or attach a file.`;
  }
  if (code === "chat_image_sanitization_failed") {
    return "GRIDGO removes location and device details from photos before sending, and this one could not be prepared. Try another photo.";
  }
  if (code === "invalid_chat_attachment" || code === "invalid_file_type" || code === "file_too_large") {
    return "That file could not be sent. Attach a JPEG, PNG, WebP or PDF of up to 10 MB.";
  }
  if (code === "file_already_attached") {
    return "That file was already sent. Choose it again to send it once more.";
  }
  return "That did not reach the print shop. Check your connection and send it again.";
}

/** Copy for a report that did not go through. */
export function shopChatReportError(error: unknown): string {
  const code = errorCode(error);
  if (code === "too_many_requests") return "Too many messages and reports at once. Wait a moment and try again.";
  if (code === "chat_message_not_found") return "That message is no longer in this conversation.";
  return "The report did not reach GRIDGO. Check your connection and try again.";
}
