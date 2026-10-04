import { addDays, davaoToday, type SeasonWindow } from "@/lib/seasonWindows";
import { SEASON_REUSE_MS, useSeasonWindows } from "@/store/seasonWindows";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getSeasonWindows: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function windowStarting(id: string, daysFromToday: number): SeasonWindow {
  const startDate = addDays(davaoToday(), daysFromToday);
  return {
    id,
    name: id,
    startDate,
    endDate: addDays(startDate, 7),
    demandLevel: "Busy",
    message: "",
    banner: { startDate: addDays(startDate, -42), endDate: addDays(startDate, -28) },
  };
}

beforeEach(() => {
  api.getSeasonWindows.mockReset();
  useSeasonWindows.setState({ seasons: { windows: [], banners: [] }, readAt: null, dismissed: [] });
});

it("reads once and reuses a fresh answer", async () => {
  const seasons = { windows: [windowStarting("a", 35)], banners: [] };
  api.getSeasonWindows.mockResolvedValue(seasons);

  await useSeasonWindows.getState().load({ now: 1_000 });
  await useSeasonWindows.getState().load({ now: 1_000 + SEASON_REUSE_MS - 1 });

  expect(api.getSeasonWindows).toHaveBeenCalledTimes(1);
  expect(useSeasonWindows.getState().seasons).toEqual(seasons);
});

it("keeps what it holds when a read fails, and never throws", async () => {
  const held = { windows: [windowStarting("a", 35)], banners: [] };
  useSeasonWindows.setState({ seasons: held, readAt: 0 });
  api.getSeasonWindows.mockRejectedValue(new Error("offline"));

  await expect(useSeasonWindows.getState().load({ force: true })).resolves.toBeUndefined();
  expect(useSeasonWindows.getState().seasons).toEqual(held);
});

it("remembers each dismissed window once", () => {
  useSeasonWindows.getState().dismiss("a");
  useSeasonWindows.getState().dismiss("b");
  useSeasonWindows.getState().dismiss("a");
  expect(useSeasonWindows.getState().dismissed).toEqual(["b", "a"]);
});

it("brings back today's dismissed banner when its push is tapped, and only that one", async () => {
  const showing = windowStarting("showing", 35);
  const later = windowStarting("later", 90);
  api.getSeasonWindows.mockResolvedValue({ windows: [showing, later], banners: [showing] });
  useSeasonWindows.setState({ dismissed: ["showing", "later", "old"] });

  await useSeasonWindows.getState().reveal();

  expect(api.getSeasonWindows).toHaveBeenCalledTimes(1);
  expect(useSeasonWindows.getState().dismissed).toEqual(["later", "old"]);
});
