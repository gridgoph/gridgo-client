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
