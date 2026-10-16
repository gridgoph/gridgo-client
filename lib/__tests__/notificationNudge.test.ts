import type { Notification } from "@/lib/api";
import {
  bellLabel,
  freshUnread,
  nextBaseline,
  nudgeAnnouncement,
  shouldChime,
} from "@/lib/notificationNudge";
import { loadUpdateChime } from "@/lib/updateChime";
import type { AudioModule } from "@/lib/expoAudio";

const n = (id: string, read = false): Notification => ({
  id,
  userId: "u",
  title: `T ${id}`,
  body: "",
  read,
  at: "2026-10-15T00:00:00Z",
});

describe("freshUnread", () => {
  it("finds nothing before there is a baseline", () => {
    expect(freshUnread(null, [n("a")], () => false)).toEqual([]);
  });

  it("finds unread rows the baseline has not seen", () => {
    const fresh = freshUnread(["a"], [n("b"), n("a"), n("c", true)], (x) => x.read);
    expect(fresh.map((x) => x.id)).toEqual(["b"]);
  });

  it("keeps earlier ids in the baseline", () => {
    expect(nextBaseline(["a"], [n("b")])).toEqual(["a", "b"]);
    expect(nextBaseline(null, [n("b")])).toEqual(["b"]);
  });
});

describe("shouldChime", () => {
  it("is silent when muted", () => {
    expect(shouldChime({ muted: true, appState: "active" })).toBe(false);
  });

  it("keeps quiet while the receipt's print owns the sound (#229)", () => {
    expect(shouldChime({ muted: false, appState: "active", hushed: true })).toBe(false);
  });

  it("plays only while the app is on screen", () => {
    expect(shouldChime({ muted: false, appState: "active" })).toBe(true);
    expect(shouldChime({ muted: false, appState: "background" })).toBe(false);
    expect(shouldChime({ muted: false, appState: "inactive" })).toBe(false);
  });
});

describe("words", () => {
  it("says the count with the bell's name", () => {
    expect(bellLabel(0)).toBe("Notifications");
    expect(bellLabel(1)).toBe("Notifications, 1 unread");
    expect(bellLabel(4)).toBe("Notifications, 4 unread");
  });

  it("announces one update by its title, several by count", () => {
    expect(nudgeAnnouncement([{ title: "Ready" }])).toBe("New update: Ready");
    expect(nudgeAnnouncement([{ title: "a" }, { title: "b" }])).toBe("2 new updates");
  });
});

describe("loadUpdateChime", () => {
  it("is silence when the build has no audio module", () => {
    expect(loadUpdateChime(null)).toBeNull();
  });

  it("follows the phone's silent mode on every play", async () => {
    const player = { play: jest.fn(), remove: jest.fn(), seekTo: jest.fn() };
    const audioModule: AudioModule = {
      createAudioPlayer: jest.fn(() => player),
      setAudioModeAsync: jest.fn(async () => undefined),
    };
    const chime = loadUpdateChime(audioModule);
    chime?.play();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(audioModule.setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: false, interruptionMode: "mixWithOthers" }),
    );
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("plays nothing after it is released", async () => {
    const player = { play: jest.fn(), remove: jest.fn() };
    const chime = loadUpdateChime({ createAudioPlayer: () => player });
    chime?.release();
    chime?.release();
    chime?.play();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.play).not.toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalledTimes(1);
  });
});
