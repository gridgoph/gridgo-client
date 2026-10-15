import type { ShopBoard, ShopHours } from "@/lib/api";
import { unpricedLineReason } from "@/lib/clientPrice";
import { userFacingError } from "@/lib/copy";
import { ApiError } from "@/lib/api";
import {
  everyShopPaused,
  SHOP_PAUSED_LINE,
  shopHoursSpoken,
  shopHoursView,
  subcategoryHoursView,
} from "@/lib/shopHours";

// 02:44 on Friday 16 Oct 2026 in Davao.
const NOW = new Date("2026-10-15T18:44:00.000Z");

const hours = (over: Partial<ShopHours> = {}): ShopHours => ({
  isOpenNow: false,
  temporarilyClosed: false,
  nextOpeningAt: "2026-10-16T00:00:00.000Z",
  calendarAvailable: true,
  ...over,
});

const board = (shopHours: ShopHours | null | undefined, code = "flyers"): ShopBoard =>
  ({
    supplierId: "s",
    shopName: "",
    shop: null,
    media: [],
    categories: [],
    hours: shopHours,
    services: [{ items: [{ subcategoryCode: code }] }],
  }) as unknown as ShopBoard;

describe("shopHoursView", () => {
  it("says open now", () => {
    expect(shopHoursView(hours({ isOpenNow: true, nextOpeningAt: NOW.toISOString() }), NOW)).toEqual({
      kind: "open",
      label: "Open now",
    });
  });

  it("says when a closed shop next opens, in Davao time", () => {
    expect(shopHoursView(hours(), NOW)?.label).toBe("Closed · opens today, 8:00 AM");
    expect(shopHoursView(hours({ nextOpeningAt: "2026-10-17T00:30:00.000Z" }), NOW)?.label).toBe(
      "Closed · opens tomorrow, 8:30 AM",
    );
    expect(shopHoursView(hours({ nextOpeningAt: "2026-10-19T00:00:00.000Z" }), NOW)?.label).toMatch(
      /^Closed · opens Mon.*19.*, 8:00 AM$/,
    );
  });

  it("says closed for now with no reopening date", () => {
    expect(shopHoursView(hours({ temporarilyClosed: true, nextOpeningAt: null }), NOW)).toEqual({
      kind: "paused",
      label: "Closed for now",
    });
  });

  it("says plain closed when GRIDGO has no opening within reach", () => {
    expect(shopHoursView(hours({ nextOpeningAt: null }), NOW)?.label).toBe("Closed");
  });

  it("says nothing it cannot stand behind", () => {
    expect(shopHoursView(null, NOW)).toBeNull();
    expect(shopHoursView(undefined, NOW)).toBeNull();
    expect(shopHoursView(hours({ calendarAvailable: false, nextOpeningAt: null }), NOW)).toBeNull();
    // A read held from before the opening it names.
    expect(shopHoursView(hours({ nextOpeningAt: "2026-10-15T10:00:00.000Z" }), NOW)).toBeNull();
  });

  it("is spoken as a sentence about the shop", () => {
    expect(shopHoursSpoken({ kind: "closed", label: "Closed · opens today, 8:00 AM" })).toBe(
      "Shop closed, opens today, 8:00 AM",
    );
    expect(shopHoursSpoken({ kind: "open", label: "Open now" })).toBe("Shop open now");
  });
});

describe("subcategoryHoursView", () => {
  it("draws nothing while any shop printing it is open", () => {
    expect(subcategoryHoursView([board(hours()), board(hours({ isOpenNow: true }))], "flyers", NOW)).toBeNull();
  });

  it("names the soonest opening when all are closed", () => {
    const view = subcategoryHoursView(
      [
        board(hours({ nextOpeningAt: "2026-10-17T00:00:00.000Z" })),
        board(hours({ temporarilyClosed: true, nextOpeningAt: null })),
        board(hours({ nextOpeningAt: "2026-10-16T01:00:00.000Z" })),
      ],
      "flyers",
      NOW,
    );
    expect(view?.label).toBe("Closed · opens today, 9:00 AM");
  });

  it("is closed for now only when every shop is", () => {
    const paused = [board(hours({ temporarilyClosed: true, nextOpeningAt: null }))];
    expect(subcategoryHoursView(paused, "flyers", NOW)?.kind).toBe("paused");
    expect(everyShopPaused(paused, "flyers")).toBe(true);
    expect(everyShopPaused([...paused, board(hours())], "flyers")).toBe(false);
  });

  it("ignores shops that do not print it, and boards without hours", () => {
    expect(subcategoryHoursView([board(hours({ isOpenNow: true }), "banners")], "flyers", NOW)).toBeNull();
    expect(subcategoryHoursView([board(undefined), board(hours())], "flyers", NOW)).toBeNull();
    expect(everyShopPaused(null, "flyers")).toBe(false);
  });
});

describe("refusals from a shop closed for now", () => {
  it("names the reason on a basket line GRIDGO stopped pricing", () => {
    const line = {
      quantity: 1,
      listing: { minimumOrderQuantity: 5, shopHours: hours({ temporarilyClosed: true }) },
    } as unknown as Parameters<typeof unpricedLineReason>[0];
    expect(unpricedLineReason(line)).toBe(SHOP_PAUSED_LINE);
  });

  it("words checkout's shop_unavailable plainly", () => {
    const error = new ApiError(409, { error: "shop_unavailable", message: "A shop in this cart is no longer available." });
    expect(userFacingError(error, "fallback")).toMatch(/closed for now and is not taking new orders/);
  });
});
