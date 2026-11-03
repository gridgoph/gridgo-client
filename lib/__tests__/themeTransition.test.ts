import type { ThemeName } from "@/constants/theme";
import { createThemeQueue, type ThemeFade } from "@/lib/themeTransition";

/** A fade the test finishes by hand, recording what it was asked for. */
function manualFade() {
  const runs: { to: ThemeName; apply: () => void; finish: () => void }[] = [];
  const fade: ThemeFade = (to, apply) =>
    new Promise<void>((resolve) => {
      runs.push({ to, apply, finish: resolve });
    });
  return { fade, runs };
}

function setup(options: { animate?: boolean; fade?: ThemeFade } = {}) {
  let screenTheme: ThemeName = "light";
  const applied: ThemeName[] = [];
  const wanted: (ThemeName | null)[] = [];
  const request = createThemeQueue({
    current: () => screenTheme,
    apply: (next) => {
      applied.push(next);
      screenTheme = next;
    },
    fade: () => (options.animate === false ? null : options.fade ?? null),
    onWanted: (next) => wanted.push(next),
  });
  return { request, applied, wanted, screen: () => screenTheme };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it("changes the theme inside the fade, not before it", async () => {
  const { fade, runs } = manualFade();
  const { request, applied, wanted } = setup({ fade });

  const done = request("dark");
  expect(wanted).toEqual(["dark"]);
  expect(applied).toEqual([]);

  runs[0].apply();
  runs[0].finish();
  await done;

  expect(applied).toEqual(["dark"]);
  expect(wanted).toEqual(["dark", null]);
});

it("holds the knob until a snapshot fade has pictured the old screen", async () => {
  const { fade, runs } = manualFade();
  const snapshot = Object.assign(fade, { snapshot: true });
  const { request, applied, wanted } = setup({ fade: snapshot });

  const done = request("dark");
  expect(wanted).toEqual([]);

  runs[0].apply();
  expect(wanted).toEqual(["dark"]);
  expect(applied).toEqual(["dark"]);
  runs[0].finish();
  await done;
  expect(wanted).toEqual(["dark", null]);
});

it("lands the last tap when a second one comes mid-fade", async () => {
  const { fade, runs } = manualFade();
  const { request, applied, screen } = setup({ fade });

  const first = request("dark");
  void request("light");
  runs[0].apply();
  runs[0].finish();
  await flush();

  // The client asked for light again: a second fade takes the screen back.
  expect(runs).toHaveLength(2);
  expect(runs[1].to).toBe("light");
  runs[1].apply();
  runs[1].finish();
  await first;

  expect(applied).toEqual(["dark", "light"]);
  expect(screen()).toBe("light");
});

it("changes at once with no fade under reduce motion", async () => {
  const { fade, runs } = manualFade();
  const { request, applied, wanted } = setup({ fade, animate: false });

  await request("dark");

  expect(runs).toHaveLength(0);
  expect(applied).toEqual(["dark"]);
  expect(wanted).toEqual(["dark", null]);
});

it("still saves a tap for the theme already on screen, without a fade", async () => {
  const { fade, runs } = manualFade();
  const { request, applied } = setup({ fade });

  await request("light");

  expect(runs).toHaveLength(0);
  expect(applied).toEqual(["light"]);
});

it("lands the theme once even when the fade fails", async () => {
  const { request, applied } = setup({
    fade: async (_to, apply) => {
      apply();
      throw new Error("transition aborted");
    },
  });

  await request("dark");
  expect(applied).toEqual(["dark"]);

  const failedEarly = setup({ fade: async () => Promise.reject(new Error("no snapshot")) });
  await failedEarly.request("dark");
  expect(failedEarly.applied).toEqual(["dark"]);
});
