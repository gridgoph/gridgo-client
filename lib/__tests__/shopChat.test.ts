import {
  HIDDEN_CONTACT,
  SHOP_CHAT_ATTACHMENT_MAX_BYTES,
  SHOP_CHAT_REMINDER,
  addShopChatFiles,
  fileSizeLabel,
  firstUnreadId,
  hasHiddenContact,
  hiddenContactNote,
  mergeMessages,
  messageCaption,
  participantOf,
  shopChatEntry,
  shopChatFrom,
  shopChatMessageFrom,
  shopChatNotice,
  shopChatOf,
  shopChatReportError,
  shopChatRoute,
  shopChatSendError,
  shopChatUnavailable,
  showsShopChatEntry,
  unreadShopChatNoticeIds,
  type ShopChatMessage,
} from "@/lib/shopChat";

const apiError = (status: number, error: string) => Object.assign(new Error(error), { status, body: { error } });

function message(id: string, mine: boolean): ShopChatMessage {
  return { id, senderLabel: mine ? "Client" : "Print shop", body: id, mine, createdAt: "2026-10-17T12:00:00.000Z", attachments: [] };
}

describe("shopChatOf", () => {
  it("reads the order's window and keeps the server's reminder", () => {
    expect(
      shopChatOf({
        clientShopChat: {
          status: "open",
          closesAt: null,
          participants: ["Client", "Print shop", "GRIDGO"],
          reminder: "Chat messages do not change the order.",
        },
      }),
    ).toEqual({ status: "open", closesAt: null, reminder: "Chat messages do not change the order." });
  });

  it("is null without one or with a status this build has never heard of", () => {
    expect(shopChatOf({})).toBeNull();
    expect(shopChatOf(null)).toBeNull();
    expect(shopChatOf({ clientShopChat: { status: "archived" } })).toBeNull();
  });

  it("falls back to the contract's reminder when none is sent", () => {
    expect(shopChatOf({ clientShopChat: { status: "read_only", closesAt: "2026-10-20T04:00:00.000Z" } })).toEqual({
      status: "read_only",
      closesAt: "2026-10-20T04:00:00.000Z",
      reminder: SHOP_CHAT_REMINDER,
    });
  });

  it("offers the conversation only once the shop has accepted", () => {
    expect(showsShopChatEntry(shopChatOf({ clientShopChat: { status: "unavailable" } }))).toBe(false);
    expect(showsShopChatEntry(shopChatOf({ clientShopChat: { status: "open" } }))).toBe(true);
    expect(showsShopChatEntry(shopChatOf({ clientShopChat: { status: "read_only" } }))).toBe(true);
    expect(showsShopChatEntry(null)).toBe(false);
  });
});

describe("shopChatFrom", () => {
  it("reads unread and the repeated-contact warning", () => {
    const chat = shopChatFrom({ status: "open", closesAt: null, unread: 2, contactAttempts: 3, warning: "Flagged." });
    expect(chat).toMatchObject({ status: "open", unread: 2, warning: "Flagged." });
  });

  it("reads an unknown status as closed, never as open", () => {
    expect(shopChatFrom({ status: "paused" }).status).toBe("read_only");
    expect(shopChatFrom(null)).toMatchObject({ status: "read_only", unread: 0, warning: null });
  });
});

describe("participant labels", () => {
  it("passes only Client, Print shop and GRIDGO", () => {
    expect(participantOf("GRIDGO", false)).toBe("GRIDGO");
    expect(participantOf("Print shop", false)).toBe("Print shop");
    expect(participantOf("Client", true)).toBe("Client");
  });

  it("never draws a name a broken payload sends in its place", () => {
    expect(participantOf("Maria Santos", false)).toBe("Print shop");
    expect(participantOf("Maria Santos", true)).toBe("Client");
    expect(participantOf(undefined, false)).toBe("Print shop");
  });

  it("reads a message without carrying any field it does not know", () => {
    const parsed = shopChatMessageFrom({
      id: "m1",
      senderLabel: "Print shop",
      body: `Call ${HIDDEN_CONTACT}`,
      mine: false,
      createdAt: "2026-10-17T12:00:00.000Z",
      senderName: "Someone",
      attachments: [{ fileId: "f1", contentType: "application/pdf", size: 2048, originalFilename: "document.pdf" }],
    });
    expect(parsed).toEqual({
      id: "m1",
      senderLabel: "Print shop",
      body: `Call ${HIDDEN_CONTACT}`,
      mine: false,
      createdAt: "2026-10-17T12:00:00.000Z",
      attachments: [{ fileId: "f1", contentType: "application/pdf", size: 2048, originalFilename: "document.pdf" }],
    });
    expect(shopChatMessageFrom({ id: "m2" })).toBeNull();
  });

  it("captions a message with its label and the Davao time", () => {
    expect(messageCaption({ senderLabel: "GRIDGO", createdAt: "2026-10-17T04:05:00.000Z" })).toBe("GRIDGO · 12:05 PM");
  });
});

describe("masked contacts", () => {
  it("notices the server's mask and words it for each side", () => {
    expect(hasHiddenContact("Call [contact hidden] or [contact hidden]")).toBe(true);
    expect(hasHiddenContact("Print 100 copies, 8.5 x 11 inches.")).toBe(false);
    expect(hiddenContactNote({ mine: true })).toBe("Contact details were hidden. Keep talking and paying through GRIDGO.");
    expect(hiddenContactNote({ mine: false })).toBe("GRIDGO hid contact details in this message.");
  });
});

describe("entry and notice", () => {
  const open = { status: "open" as const, closesAt: null, reminder: SHOP_CHAT_REMINDER };
  const closed = { status: "read_only" as const, closesAt: "2026-10-19T04:00:00.000Z", reminder: SHOP_CHAT_REMINDER };

  it("words the order screen's row, and a new message", () => {
    expect(shopChatEntry(open, false).title).toBe("Message the print shop");
    expect(shopChatEntry(closed, false)).toMatchObject({
      title: "Messages with the print shop",
      detail: "Closed. Kept with this order as a record.",
    });
    expect(shopChatEntry(open, true)).toMatchObject({
      detail: "New message. Open to read it.",
      accessibilityLabel: "Message the print shop, new message",
    });
    expect(shopChatRoute("ord_1")).toEqual({ pathname: "/order/shop-chat", params: { orderId: "ord_1" } });
  });

  it("says who is in the conversation, and when it closes once the check window has started", () => {
    const now = Date.parse("2026-10-18T02:00:00.000Z");
    expect(shopChatNotice(open, now)).toMatch(/You appear as Client and the shop as Print shop\. GRIDGO reads/);
    expect(shopChatNotice(open, now)).not.toMatch(/Open until/);
    expect(shopChatNotice({ ...open, closesAt: "2026-10-18T09:00:00.000Z" }, now)).toMatch(/Open until 5:00 PM today\.$/);
    expect(shopChatNotice(closed, now)).toBe(
      "This conversation is closed, so no new messages can be sent. It stays with the order as a record.",
    );
    expect(shopChatNotice({ ...open, status: "unavailable" }, now)).toBe(
      "You can message the print shop once it accepts this order.",
    );
  });
});

describe("unread", () => {
  it("puts the new-messages line before the first unread message from the others", () => {
    const rows = [message("a", false), message("b", true), message("c", false), message("d", true), message("e", false)];
    expect(firstUnreadId(rows, 0)).toBeNull();
    expect(firstUnreadId(rows, 1)).toBe("e");
    expect(firstUnreadId(rows, 2)).toBe("c");
    expect(firstUnreadId(rows, 9)).toBe("a");
  });

  it("appends only messages not already shown", () => {
    const current = [message("a", false)];
    expect(mergeMessages(current, [message("a", false)])).toBe(current);
    expect(mergeMessages(current, [message("a", false), message("b", true)]).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("finds this order's unread message notices", () => {
    const items = [
      { id: "n1", type: "client_shop_chat_message", orderId: "ord_1", read: false, at: "2026-10-17T04:00:00.000Z" },
      { id: "n2", type: "client_shop_chat_message", orderId: "ord_1", read: true, at: "2026-10-17T04:00:00.000Z" },
      { id: "n3", type: "client_shop_chat_message", orderId: "ord_2", read: false, at: "2026-10-17T04:00:00.000Z" },
      { id: "n4", type: "order_progress", orderId: "ord_1", read: false, at: "2026-10-17T04:00:00.000Z" },
      { id: "n5", type: "client_shop_chat_message", orderId: "ord_1", read: false, at: "2026-10-17T04:00:00.000Z" },
      { id: "n6", type: "client_shop_chat_message", orderId: "ord_1", read: false, at: "2026-10-17T04:09:00.000Z" },
    ];
    expect(unreadShopChatNoticeIds(items, ["n5"], "ord_1")).toEqual(["n1", "n6"]);
    // Only notices about messages already on screen, however late they arrived.
    expect(unreadShopChatNoticeIds(items, ["n5"], "ord_1", "2026-10-17T04:05:00.000Z")).toEqual(["n1"]);
  });
});

describe("attachment limits", () => {
  const asset = (name: string, mimeType: string, size = 2048) => ({ uri: `file:///cache/${name}`, name, mimeType, size });
  const toPending = (picked: { uri: string; name: string; mimeType: string }) => picked;

  it("takes photos and PDFs", () => {
    const added = addShopChatFiles([], [asset("proof.pdf", "application/pdf"), asset("door.webp", "image/webp")], toPending);
    expect(added).toEqual({
      ok: true,
      pending: [
        { uri: "file:///cache/proof.pdf", name: "proof.pdf", mimeType: "application/pdf" },
        { uri: "file:///cache/door.webp", name: "door.webp", mimeType: "image/webp" },
      ],
    });
  });

  it("refuses other formats, empty files and anything over 10 MB", () => {
    expect(addShopChatFiles([], [asset("art.ai", "application/postscript")], toPending)).toEqual({
      ok: false,
      error: "Attach a JPEG, PNG or WebP photo, or a PDF.",
    });
    expect(addShopChatFiles([], [asset("blank.png", "image/png", 0)], toPending)).toEqual({ ok: false, error: "That file is empty." });
    expect(addShopChatFiles([], [asset("big.pdf", "application/pdf", SHOP_CHAT_ATTACHMENT_MAX_BYTES + 1)], toPending)).toEqual({
      ok: false,
      error: "Each file can be up to 10 MB.",
    });
    expect(addShopChatFiles([], [asset("edge.pdf", "application/pdf", SHOP_CHAT_ATTACHMENT_MAX_BYTES)], toPending).ok).toBe(true);
  });

  it("stops at four files a message", () => {
    const four = ["a", "b", "c", "d"].map((name) => asset(`${name}.png`, "image/png"));
    expect(addShopChatFiles(four, [asset("e.png", "image/png")], toPending)).toEqual({
      ok: false,
      error: "A message can include up to 4 files.",
    });
  });

  it("sizes a sent PDF", () => {
    expect(fileSizeLabel(1536 * 1024)).toBe("1.5 MB");
    expect(fileSizeLabel(640 * 1024)).toBe("640 KB");
    expect(fileSizeLabel(null)).toBeNull();
  });
});

describe("error copy", () => {
  it("says why a send did not go through", () => {
    expect(shopChatSendError(apiError(409, "client_shop_chat_read_only"))).toBe(
      "This conversation is closed, so no new messages can be sent.",
    );
    expect(shopChatSendError(apiError(409, "client_shop_chat_not_available"))).toMatch(/once it accepts/);
    expect(shopChatSendError(apiError(413, "file_too_large"))).toBe(
      "That file could not be sent. Attach a JPEG, PNG, WebP or PDF of up to 10 MB.",
    );
    expect(shopChatSendError(apiError(415, "invalid_file_type"))).toMatch(/JPEG, PNG, WebP or PDF/);
    expect(shopChatSendError(apiError(422, "chat_image_sanitization_failed"))).toMatch(/location and device details/);
    expect(shopChatSendError(apiError(429, "too_many_requests"))).toMatch(/too fast/);
    expect(shopChatSendError(new Error("Network request failed"))).toMatch(/did not reach the print shop/);
  });

  it("says why it cannot be shown, or leaves a dropped connection to a retry", () => {
    expect(shopChatUnavailable(apiError(403, "forbidden"))?.title).toBe("This conversation is not available");
    expect(shopChatUnavailable(new Error("offline"))).toBeNull();
  });

  it("says why a report did not go through", () => {
    expect(shopChatReportError(apiError(429, "too_many_requests"))).toMatch(/Wait a moment/);
    expect(shopChatReportError(new Error("offline"))).toBe("The report did not reach GRIDGO. Check your connection and try again.");
  });
});
