import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTour } from "@/store/tour";

/**
 * The tour's memory: once per account on this phone, gone for good on Skip or
 * Done, back on Replay.
 */

beforeEach(() => {
  useTour.getState().reset();
  useTour.setState({ hydrated: true, focusToken: 0 });
});

const progress = (accountId: string) => useTour.getState().progress[accountId];

describe("once only", () => {
  it("starts for a first-time client and does not start again once finished", () => {
    const tour = useTour.getState();
    tour.autoStart("usr_a", true);
    expect(progress("usr_a")).toEqual({ status: "active", step: 0 });

    for (let step = 0; step < 8; step++) useTour.getState().next("usr_a");
    expect(progress("usr_a")).toEqual({ status: "done" });

    useTour.getState().autoStart("usr_a", true);
    expect(progress("usr_a")).toEqual({ status: "done" });
  });

  it("does not restart a tour that is under way", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().next("usr_a");
    useTour.getState().autoStart("usr_a", true);
    expect(progress("usr_a")).toEqual({ status: "active", step: 1 });
  });

  it("never starts on its own for a client who already has orders", () => {
    useTour.getState().autoStart("usr_a", false);
    expect(progress("usr_a")).toBeUndefined();
  });

  it("waits for the phone's record to load before deciding", () => {
    useTour.setState({ hydrated: false });
    useTour.getState().autoStart("usr_a", true);
    expect(progress("usr_a")).toBeUndefined();
  });

  it("is kept per account, so a second client on the same phone still gets it", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().skip("usr_a");
    useTour.getState().autoStart("usr_b", true);
    expect(progress("usr_a")).toEqual({ status: "done" });
    expect(progress("usr_b")).toEqual({ status: "active", step: 0 });
  });

  it("persists what each account has seen, and nothing about the screen", async () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().skip("usr_a");
    useTour.getState().setRect("home.search", { x: 1, y: 2, width: 3, height: 4 });

    const stored = await AsyncStorage.getItem("gridgo.client.tour.v1");
    expect(JSON.parse(stored ?? "{}").state).toEqual({ progress: { usr_a: { status: "done" } } });
  });
});

describe("skip", () => {
  it("ends the tour from the middle and keeps it ended", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().next("usr_a");
    useTour.getState().next("usr_a");
    useTour.getState().skip("usr_a");
    expect(progress("usr_a")).toEqual({ status: "done" });

    useTour.getState().arrive("usr_a", "checkout");
    expect(progress("usr_a")).toEqual({ status: "done" });
  });
});

describe("replay", () => {
  it("starts a finished tour over from the first step", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().skip("usr_a");
    useTour.getState().replay("usr_a");
    expect(progress("usr_a")).toEqual({ status: "active", step: 0 });
  });

  it("works for a client the tour never started for", () => {
    useTour.getState().replay("usr_a");
    expect(progress("usr_a")).toEqual({ status: "active", step: 0 });
  });
});

describe("screens", () => {
  it("moves the tour up to the screen the client reached", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().arrive("usr_a", "when");
    expect(useTour.getState().screen).toBe("when");
    expect(progress("usr_a")).toEqual({ status: "active", step: 3 });
  });

  it("lets only the latest focus clear the screen", () => {
    const first = useTour.getState().arrive("usr_a", "pick");
    const second = useTour.getState().arrive("usr_a", "pick");
    useTour.getState().leave(first);
    expect(useTour.getState().screen).toBe("pick");
    useTour.getState().leave(second);
    expect(useTour.getState().screen).toBeNull();
  });

  it("back stays on the screen it was asked from", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().back("usr_a");
    expect(progress("usr_a")).toEqual({ status: "active", step: 0 });
    useTour.getState().next("usr_a");
    useTour.getState().back("usr_a");
    expect(progress("usr_a")).toEqual({ status: "active", step: 0 });
  });
});
