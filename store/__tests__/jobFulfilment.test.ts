import { useJobFulfilment, withJobFulfilment } from "@/store/jobFulfilment";

const HOME = { lat: 7.0731, lng: 125.6128, label: "Bajada, Davao City" };
const OLD = { lat: 7.2, lng: 125.5, label: "Basket address" };

beforeEach(() => useJobFulfilment.getState().clear());

describe("a match request for this job", () => {
  it("asks the old way, with the basket's drop-off, when no choice was made", () => {
    expect(withJobFulfilment({ subcategoryCode: "flyers" }, OLD)).toEqual({ subcategoryCode: "flyers", dropoff: OLD });
  });

  it("carries a delivery with the address it was given", () => {
    useJobFulfilment.getState().set({ fulfillmentMode: "delivery", dropoff: HOME });
    expect(withJobFulfilment({ subcategoryCode: "flyers", deadline: null }, OLD)).toEqual({
      subcategoryCode: "flyers",
      deadline: null,
      fulfillmentMode: "delivery",
      dropoff: HOME,
    });
  });

  it("carries a pick-up with no drop-off: GRIDGO measures from its hub", () => {
    useJobFulfilment.getState().set({ fulfillmentMode: "pickup", dropoff: null });
    expect(withJobFulfilment({ subcategoryCode: "flyers" }, OLD)).toEqual({
      subcategoryCode: "flyers",
      fulfillmentMode: "pickup",
      dropoff: null,
    });
  });
});
