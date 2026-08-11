import { hostnameFromHostUri, resolveApiBase } from "@/lib/api";

describe("resolveApiBase", () => {
  it("prefers a non-empty EXPO_PUBLIC_API_URL and strips a trailing slash", () => {
    expect(
      resolveApiBase({
        envUrl: "http://api.example.com:9000/",
        envPort: "8787",
        hostUri: "192.168.1.55:8081",
        platformOS: "android",
      }),
    ).toBe("http://api.example.com:9000");
  });

  /**
   * The hosted pilot, and the one branch a production build depends on.
   *
   * A build is pointed at the deployed API by setting `EXPO_PUBLIC_API_URL`
   * before `expo export` — nothing about the domain is in the source. What has
   * to be true is that the variable wins outright: an `https` origin on the
   * default port must not have `:8787` bolted onto it, and a packager host must
   * not be able to reach the answer, because a dev server is exactly what a
   * production build does not have.
   */
  it("points a production build at the deployed origin, whatever else is set", () => {
    expect(
      resolveApiBase({
        envUrl: "https://api.example.com",
        envPort: "8787",
        // Both of the fallbacks the dev flow relies on, present and ignored.
        hostUri: "192.168.1.55:8081",
        platformOS: "android",
      }),
    ).toBe("https://api.example.com");

    // Scheme and path-less origin survive; only a trailing slash is trimmed.
    expect(
      resolveApiBase({
        envUrl: "https://api.example.com/",
        envPort: undefined,
        hostUri: null,
        platformOS: "ios",
      }),
    ).toBe("https://api.example.com");

    // And it never falls back to loopback, which would make a shipped build
    // talk to the phone itself.
    for (const platformOS of ["ios", "android", "web"]) {
      const base = resolveApiBase({
        envUrl: "https://api.example.com",
        envPort: "8787",
        hostUri: "localhost:8081",
        platformOS,
      });
      expect(base).toBe("https://api.example.com");
      expect(base).not.toMatch(/127\.0\.0\.1|10\.0\.2\.2|localhost/);
    }
  });

  it("uses the Expo Go LAN host for a physical device (drops bundler port)", () => {
    expect(
      resolveApiBase({
        envUrl: "",
        envPort: undefined,
        hostUri: "192.168.1.55:8081",
        platformOS: "android",
      }),
    ).toBe("http://192.168.1.55:8787");

    expect(
      resolveApiBase({
        envUrl: null,
        envPort: "8787",
        hostUri: "192.168.1.55:8081",
        platformOS: "ios",
      }),
    ).toBe("http://192.168.1.55:8787");
  });

  it("maps loopback host on Android to the emulator alias 10.0.2.2", () => {
    expect(
      resolveApiBase({
        envUrl: undefined,
        envPort: "8787",
        hostUri: "localhost:8081",
        platformOS: "android",
      }),
    ).toBe("http://10.0.2.2:8787");

    expect(
      resolveApiBase({
        envUrl: undefined,
        envPort: "8787",
        hostUri: "127.0.0.1:8081",
        platformOS: "android",
      }),
    ).toBe("http://10.0.2.2:8787");
  });

  it("keeps loopback on iOS simulator (no 10.0.2.2 alias)", () => {
    expect(
      resolveApiBase({
        envUrl: undefined,
        envPort: "8787",
        hostUri: "127.0.0.1:8081",
        platformOS: "ios",
      }),
    ).toBe("http://127.0.0.1:8787");

    // hostname is preserved as-is; only Android remaps loopback → 10.0.2.2
    expect(
      resolveApiBase({
        envUrl: undefined,
        envPort: "8787",
        hostUri: "localhost:8081",
        platformOS: "ios",
      }),
    ).toBe("http://localhost:8787");
  });

  it("falls back to 127.0.0.1 when no hostUri is available", () => {
    expect(
      resolveApiBase({
        envUrl: "   ",
        envPort: undefined,
        hostUri: null,
        platformOS: "android",
      }),
    ).toBe("http://127.0.0.1:8787");

    expect(
      resolveApiBase({
        envUrl: undefined,
        envPort: "9000",
        hostUri: undefined,
        platformOS: "ios",
      }),
    ).toBe("http://127.0.0.1:9000");
  });

  it("honours EXPO_PUBLIC_API_PORT when deriving from hostUri", () => {
    expect(
      resolveApiBase({
        envUrl: undefined,
        envPort: "9999",
        hostUri: "10.0.0.4:8081",
        platformOS: "android",
      }),
    ).toBe("http://10.0.0.4:9999");
  });
});

describe("hostnameFromHostUri", () => {
  it("parses host:port and full URLs", () => {
    expect(hostnameFromHostUri("192.168.1.55:8081")).toBe("192.168.1.55");
    expect(hostnameFromHostUri("http://192.168.1.55:8081")).toBe("192.168.1.55");
    expect(hostnameFromHostUri("exp://192.168.1.55:8081")).toBe("192.168.1.55");
    expect(hostnameFromHostUri(null)).toBeNull();
    expect(hostnameFromHostUri("")).toBeNull();
  });
});
