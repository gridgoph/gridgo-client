import { clearMatchPrefetch, prefetchMatch, takeMatch } from "@/lib/matchPrefetch";

jest.mock("@/lib/api", () => ({
  matchShop: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const result = { shop: { supplierId: "s1", shopName: "One" } };

beforeEach(() => {
  clearMatchPrefetch();
  api.matchShop.mockReset();
  api.matchShop.mockResolvedValue(result);
});

describe("match prefetch", () => {
  const input = { subcategoryCode: "flyers", dropoff: null as null };

  it("starts one match and reuses it for the screen that follows", async () => {
    const first = prefetchMatch(input);
    const second = takeMatch(input);
    expect(second).toBe(first);
    expect(api.matchShop).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBe(result);
  });

  it("does not reuse a match for a different job", async () => {
    prefetchMatch(input);
    takeMatch({ subcategoryCode: "brochures" });
    expect(api.matchShop).toHaveBeenCalledTimes(2);
  });

  it("drops a failed match so the screen can retry", async () => {
    api.matchShop.mockRejectedValueOnce(new Error("offline"));
    await expect(prefetchMatch(input)).rejects.toThrow("offline");
    api.matchShop.mockResolvedValue(result);
    await expect(takeMatch(input)).resolves.toBe(result);
    expect(api.matchShop).toHaveBeenCalledTimes(2);
  });
});
