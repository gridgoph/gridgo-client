import { cartoApiKey, cartoDarkTileUrl } from "@/lib/cartoTiles";

describe("cartoDarkTileUrl", () => {
  it("leaves dark tiles keyless when no key is configured", () => {
    expect(cartoApiKey("")).toBeNull();
    expect(cartoApiKey(undefined)).toBeNull();
    expect(cartoDarkTileUrl("")).not.toMatch(/key=/);
  });

  it("appends the Carto key as the documented query param", () => {
    expect(cartoDarkTileUrl("test-key_1")).toContain("?key=test-key_1");
  });

  it("reads the default path from the literal env variable", () => {
    const previous = process.env.EXPO_PUBLIC_CARTO_API_KEY;
    try {
      process.env.EXPO_PUBLIC_CARTO_API_KEY = "probe-from-env";
      expect(cartoDarkTileUrl()).toContain("?key=probe-from-env");
      delete process.env.EXPO_PUBLIC_CARTO_API_KEY;
      expect(cartoDarkTileUrl()).not.toMatch(/key=/);
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_CARTO_API_KEY;
      else process.env.EXPO_PUBLIC_CARTO_API_KEY = previous;
    }
  });
});
