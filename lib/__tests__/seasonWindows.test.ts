import {
  addDays,
  bannerHeadline,
  bannerInterval,
  bannersToShow,
  busiestLevel,
  davaoToday,
  daysBetween,
  parseSeasonWindows,
  seasonRange,
  seasonsInMonth,
  seasonsOn,
  type SeasonWindow,
} from "@/lib/seasonWindows";

function season(overrides: Partial<SeasonWindow> = {}): SeasonWindow {
  const startDate = overrides.startDate ?? "2026-11-13";
  return {
    id: "sea_school",
    name: "School season",
    startDate,
    endDate: "2026-11-30",
    demandLevel: "Peak",
    message: "Plan your printing early.",
    banner: bannerInterval(startDate),
    ...overrides,
  };
}

describe("parseSeasonWindows", () => {
  it("reads the public envelope", () => {
    const parsed = parseSeasonWindows({
      timeZone: "Asia/Manila",
      today: "2026-10-02",
      awarenessOnly: true,
      windows: [
        {
          id: "sea_example",
          name: " School season ",
          startDate: "2026-11-13",
          endDate: "2026-11-30",
          demandLevel: "Peak",
          message: "Plan your printing early.",
          status: "upcoming",
          banner: { startDate: "2026-10-02", endDate: "2026-10-16", active: true },
        },
      ],
      banners: [],
    });
    expect(parsed.windows).toEqual([
      {
        id: "sea_example",
        name: "School season",
        startDate: "2026-11-13",
        endDate: "2026-11-30",
        demandLevel: "Peak",
        message: "Plan your printing early.",
        banner: { startDate: "2026-10-02", endDate: "2026-10-16" },
      },
    ]);
    expect(parsed.banners).toEqual([]);
  });

  it("drops a malformed row and keeps the rest", () => {
    const parsed = parseSeasonWindows({
      windows: [
        { id: "a", name: "No dates" },
        { id: "b", name: "Backwards", startDate: "2026-11-30", endDate: "2026-11-01" },
        { id: "c", name: "Fine", startDate: "2026-12-01", endDate: "2026-12-05", demandLevel: "Busy" },
      ],
    });
    expect(parsed.windows.map((window) => window.id)).toEqual(["c"]);
  });

  it("reads an unknown level as Normal rather than losing the season", () => {
    const parsed = parseSeasonWindows({
      windows: [{ id: "x", name: "New", startDate: "2026-12-01", endDate: "2026-12-02", demandLevel: "Extreme" }],
    });
    expect(parsed.windows[0].demandLevel).toBe("Normal");
  });

  it("works out the banner interval when the server left it out", () => {
    const parsed = parseSeasonWindows({
      windows: [{ id: "x", name: "S", startDate: "2026-11-13", endDate: "2026-11-30" }],
    });
    expect(parsed.windows[0].banner).toEqual({ startDate: "2026-10-02", endDate: "2026-10-16" });
  });

  it("answers an empty envelope for nonsense", () => {
    expect(parseSeasonWindows(null)).toEqual({ windows: [], banners: [] });
    expect(parseSeasonWindows("<html>")).toEqual({ windows: [], banners: [] });
  });
});

describe("calendar arithmetic", () => {
  it("counts days on the calendar across months and years", () => {
    expect(addDays("2026-11-13", -42)).toBe("2026-10-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-02", "2026-11-13")).toBe(42);
  });

  it("opens the banner six weeks out and closes it four weeks out, inclusive", () => {
    expect(bannerInterval("2026-11-13")).toEqual({ startDate: "2026-10-02", endDate: "2026-10-16" });
  });

  it("reads today in Davao, not on the phone", () => {
    // 17:30 UTC on 1 Oct is already 01:30 on 2 Oct in Davao.
    expect(davaoToday(new Date("2026-10-01T17:30:00Z"))).toBe("2026-10-02");
    expect(davaoToday(new Date("2026-10-01T15:59:00Z"))).toBe("2026-10-01");
  });
});

describe("which days a season covers", () => {
  it("includes both end dates", () => {
    const windows = [season()];
    expect(seasonsOn("2026-11-12", windows)).toEqual([]);
    expect(seasonsOn("2026-11-13", windows)).toHaveLength(1);
    expect(seasonsOn("2026-11-30", windows)).toHaveLength(1);
    expect(seasonsOn("2026-12-01", windows)).toEqual([]);
  });

  it("shades an overlap in the busier level", () => {
    expect(busiestLevel([season({ demandLevel: "Busy" }), season({ demandLevel: "Peak" })])).toBe("Peak");
    expect(busiestLevel([season({ demandLevel: "Normal" })])).toBe("Normal");
    expect(busiestLevel([])).toBeNull();
  });

  it("lists the seasons touching a month, in start order", () => {
    const early = season({ id: "a", startDate: "2026-10-25", endDate: "2026-11-02" });
    const late = season({ id: "b", startDate: "2026-11-20", endDate: "2026-12-10" });
    const december = season({ id: "c", startDate: "2026-12-01", endDate: "2026-12-05" });
    expect(seasonsInMonth("2026-11", [late, december, early]).map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("words a range compactly", () => {
    expect(seasonRange({ startDate: "2026-11-13", endDate: "2026-11-30" })).toBe("13–30 Nov");
    expect(seasonRange({ startDate: "2027-03-28", endDate: "2027-04-05" })).toBe("28 Mar – 5 Apr");
    expect(seasonRange({ startDate: "2026-12-20", endDate: "2027-01-03" })).toBe("20 Dec – 3 Jan 2027");
  });
});

describe("the Home banner", () => {
  const window = season();
  const seasons = { windows: [window], banners: [window] };

  it("shows from 42 days before the season through 28 days before it", () => {
    expect(bannersToShow(seasons, [], "2026-10-01")).toEqual([]);
    expect(bannersToShow(seasons, [], "2026-10-02")).toEqual([window]);
    expect(bannersToShow(seasons, [], "2026-10-16")).toEqual([window]);
    expect(bannersToShow(seasons, [], "2026-10-17")).toEqual([]);
  });

  it("goes when its interval has passed even if the read is a day old", () => {
    // The server still listed it yesterday; today is past its last day.
    expect(bannersToShow(seasons, [], "2026-10-20")).toEqual([]);
  });

  it("stays away once dismissed on this phone", () => {
    expect(bannersToShow(seasons, ["sea_school"], "2026-10-05")).toEqual([]);
    expect(bannersToShow(seasons, ["sea_other"], "2026-10-05")).toEqual([window]);
  });

  it("only draws what the server put in banners", () => {
    expect(bannersToShow({ windows: [window], banners: [] }, [], "2026-10-05")).toEqual([]);
  });

  it("counts down to the start", () => {
    expect(bannerHeadline(window, "2026-10-02")).toBe("School season starts in 6 weeks");
    expect(bannerHeadline(window, "2026-10-05")).toBe("School season starts in 39 days");
    expect(bannerHeadline(window, "2026-11-12")).toBe("School season starts tomorrow");
    expect(bannerHeadline(window, "2026-11-13")).toBe("School season has started");
  });
});
