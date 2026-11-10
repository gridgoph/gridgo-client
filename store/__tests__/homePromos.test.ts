import { resetPromotionSession } from "@/lib/homePromos";
import { trackHomePromo, useHomePromos } from "@/store/homePromos";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getHomePromotions: jest.fn(),
  recordPromotionEvent: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const promo = { id: "promo_1", name: "DavaoGo", linkUrl: "https://davaogo.app/" };

beforeEach(() => {
  resetPromotionSession();
  api.recordPromotionEvent.mockClear();
  api.getHomePromotions.mockReset();
  useHomePromos.getState().clear();
});

describe("trackHomePromo", () => {
  it("sends a view once per session, with one session id", () => {
    trackHomePromo("promo_1", "view");
    trackHomePromo("promo_1", "view");
    trackHomePromo("promo_2", "view");
    expect(api.recordPromotionEvent).toHaveBeenCalledTimes(2);
    const [[, , first], [, , second]] = api.recordPromotionEvent.mock.calls;
    expect(first).toBe(second);
    expect(api.recordPromotionEvent).toHaveBeenCalledWith("promo_1", "view", first);
  });

  it("sends every sheet open and link tap", () => {
    trackHomePromo("promo_1", "open");
    trackHomePromo("promo_1", "open");
    trackHomePromo("promo_1", "tap");
    expect(api.recordPromotionEvent.mock.calls.map((call: unknown[]) => call[1])).toEqual(["open", "open", "tap"]);
  });

  it("never throws when the count is refused", async () => {
    api.recordPromotionEvent.mockRejectedValueOnce(new Error("offline"));
    expect(() => trackHomePromo("promo_1", "tap")).not.toThrow();
    await Promise.resolve();
  });
});

describe("useHomePromos", () => {
  it("keeps the feed for the account that asked", async () => {
    api.getHomePromotions.mockResolvedValue({ promotions: [promo] });
    await useHomePromos.getState().load("user_1");
    expect(useHomePromos.getState()).toEqual(expect.objectContaining({ owner: "user_1" }));
    expect(useHomePromos.getState().promos.map((p) => p.id)).toEqual(["promo_1"]);
  });

  it("keeps what is on screen when a re-read fails", async () => {
    api.getHomePromotions.mockResolvedValueOnce({ promotions: [promo] }).mockRejectedValueOnce(new Error("offline"));
    await useHomePromos.getState().load("user_1");
    await useHomePromos.getState().load("user_1");
    expect(useHomePromos.getState().promos).toHaveLength(1);
  });

  it("drops another account's promos", async () => {
    api.getHomePromotions.mockResolvedValueOnce({ promotions: [promo] }).mockRejectedValueOnce(new Error("offline"));
    await useHomePromos.getState().load("user_1");
    await useHomePromos.getState().load("user_2");
    expect(useHomePromos.getState().promos).toEqual([]);
  });
});
