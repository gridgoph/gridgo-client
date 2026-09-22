import { GRIDGO_DEV_WEB_HOST, isolatedDevWebHref } from "@/lib/devWebHost";

function loc(hostname: string, port = "8081") {
  return {
    protocol: "http:",
    hostname,
    port,
    pathname: "/login",
    search: "?next=1",
    hash: "#top",
  };
}

describe("isolatedDevWebHref", () => {
  it("keeps this app on its own Clerk cookie host", () => {
    expect(GRIDGO_DEV_WEB_HOST).toBe("client.localhost");
    expect(isolatedDevWebHref(loc("localhost"), GRIDGO_DEV_WEB_HOST)).toBe(
      "http://client.localhost:8081/login?next=1#top",
    );
    expect(isolatedDevWebHref(loc("127.0.0.1"), GRIDGO_DEV_WEB_HOST)).toBe(
      "http://client.localhost:8081/login?next=1#top",
    );
    expect(isolatedDevWebHref(loc("[::1]"), GRIDGO_DEV_WEB_HOST)).toBe(
      "http://client.localhost:8081/login?next=1#top",
    );
  });

  it("does not bounce an already-isolated or LAN origin", () => {
    expect(isolatedDevWebHref(loc(GRIDGO_DEV_WEB_HOST), GRIDGO_DEV_WEB_HOST)).toBeNull();
    expect(isolatedDevWebHref(loc("192.168.80.49"), GRIDGO_DEV_WEB_HOST)).toBeNull();
  });
});
