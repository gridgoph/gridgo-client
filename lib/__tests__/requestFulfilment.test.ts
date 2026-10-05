import type { Cart, CartLineRecord, MatchResult } from "@/lib/api";
import {
  PICKUP_CHOICE,
  deliveryChoice,
  fulfilmentStepFor,
  fulfilmentSummary,
  isLockedFulfilment,
  needsFreshBasket,
  pickupMatchView,
} from "@/lib/requestFulfilment";

const HOME = { lat: 7.0731, lng: 125.6128, label: "Bajada, Davao City" };
const OFFICE = { lat: 7.0923, lng: 125.6165, label: "GRIDGO Office" };
const LINE = { id: "cline_1" } as CartLineRecord;

function basket(lines: CartLineRecord[], requestFulfillment: Cart["requestFulfillment"] = null) {
  return { lines, requestFulfillment };
}

describe("whether the job is asked delivery or pick-up", () => {
  it("asks when the basket is new or empty", () => {
    expect(fulfilmentStepFor(null)).toBe("ask");
    expect(fulfilmentStepFor(basket([]))).toBe("ask");
    expect(fulfilmentStepFor(basket([], deliveryChoice(HOME)))).toBe("ask");
  });

  it("joins a basket that already chose, rather than asking again", () => {
    expect(fulfilmentStepFor(basket([LINE], { fulfillmentMode: "pickup", dropoff: OFFICE }))).toBe("locked");
  });

  it("leaves a basket from before the step on its checkout-time choice", () => {
    expect(fulfilmentStepFor(basket([LINE]))).toBe("legacy");
    expect(isLockedFulfilment({ requestFulfillment: null })).toBe(false);
    expect(isLockedFulfilment({ requestFulfillment: deliveryChoice(HOME) })).toBe(true);
  });
});

describe("a basket that cannot take the job's choice", () => {
  it("is swapped for a fresh one only when it is empty and chose differently", () => {
    expect(needsFreshBasket(basket([], deliveryChoice(HOME)), PICKUP_CHOICE)).toBe(true);
    expect(needsFreshBasket(basket([], deliveryChoice(HOME)), deliveryChoice({ ...HOME, lat: 7.1 }))).toBe(true);
  });

  it("is kept when the choice matches, or when it is not locked at all", () => {
    expect(needsFreshBasket(basket([], deliveryChoice(HOME)), deliveryChoice({ ...HOME, label: "Home" }))).toBe(false);
    expect(needsFreshBasket(basket([], { fulfillmentMode: "pickup", dropoff: OFFICE }), PICKUP_CHOICE)).toBe(false);
    expect(needsFreshBasket(basket([]), PICKUP_CHOICE)).toBe(false);
    expect(needsFreshBasket(null, PICKUP_CHOICE)).toBe(false);
  });

  it("is never thrown away while it holds something", () => {
    expect(needsFreshBasket(basket([LINE], deliveryChoice(HOME)), PICKUP_CHOICE)).toBe(false);
  });
});

describe("the choice read back", () => {
  it("names the door or the office, never a shop", () => {
    expect(fulfilmentSummary(deliveryChoice(HOME))).toBe("Delivering to Bajada, Davao City");
    expect(fulfilmentSummary(PICKUP_CHOICE)).toBe("You collect at GRIDGO Office");
  });
});

describe("a pick-up match", () => {
  it("draws no distance zone: a press's distance to the hub is not the client's", () => {
    const match = {
      distanceZone: { key: "nearby", label: "Nearby" },
      listings: [{ id: "a", distanceZone: { key: "out_of_zone", label: "Out of Zone" }, distanceKm: 16 }],
      otherListings: [{ id: "b", distanceZone: { key: "away", label: "Away" } }],
    } as unknown as MatchResult;
    const view = pickupMatchView(match);
    expect(view.distanceZone).toBeNull();
    expect(view.listings[0]).toEqual({ id: "a", distanceZone: null });
    expect(view.otherListings?.[0]).toEqual({ id: "b", distanceZone: null });
  });
});
