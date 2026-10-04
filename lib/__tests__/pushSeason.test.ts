import { parsePushData, pushTargetRoute, SEASON_PUSH_TYPE } from "@/lib/push";

describe("a tapped season push", () => {
  it("opens Home, where the season's banner lives", () => {
    expect(pushTargetRoute(parsePushData({ type: SEASON_PUSH_TYPE, notificationId: "ntf_1" }))).toBe(
      "/(tabs)/home",
    );
  });

  it("is the type gridgo-api sends", () => {
    expect(SEASON_PUSH_TYPE).toBe("season_window");
  });
});
