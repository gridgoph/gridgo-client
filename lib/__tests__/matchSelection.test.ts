import { ApiError } from "@/lib/api";
import {
  clearMatchSelections,
  holdMatchSelection,
  isStaleMatchRefusal,
  markMatchSpent,
  matchIsSpent,
  matchSelectionFor,
  selectionExpired,
} from "@/lib/matchSelection";

beforeEach(() => {
  clearMatchSelections();
});

describe("match selections", () => {
  it("holds the token for the listing the client chose, until a new job starts", () => {
    holdMatchSelection("sci_other", {
      matchRequestId: "req_1",
      selectToken: "tok_other",
      expiresAt: "2026-10-02T01:15:00.000Z",
    });
    expect(matchSelectionFor("sci_other")).toEqual({
      matchRequestId: "req_1",
      selectToken: "tok_other",
      expiresAt: "2026-10-02T01:15:00.000Z",
    });
    expect(matchSelectionFor("sci_unpicked")).toBeNull();
    expect(matchSelectionFor(null)).toBeNull();

    clearMatchSelections();
    expect(matchSelectionFor("sci_other")).toBeNull();
  });

  it("knows when a match's tokens have run out", () => {
    const now = Date.parse("2026-10-02T01:00:00.000Z");
    expect(selectionExpired("2026-10-02T01:15:00.000Z", now)).toBe(false);
    expect(selectionExpired("2026-10-02T00:59:59.000Z", now)).toBe(true);
    expect(selectionExpired(null, now)).toBe(false);
  });

  it("remembers a match GRIDGO refused as out of date", () => {
    expect(matchIsSpent("req_1")).toBe(false);
    markMatchSpent("req_1");
    expect(matchIsSpent("req_1")).toBe(true);
    expect(matchIsSpent(null)).toBe(false);
  });

  it("tells a stale pick apart from any other refusal", () => {
    const refusal = (status: number, error: string) => new ApiError(status, { error });
    expect(isStaleMatchRefusal(refusal(410, "select_token_expired"))).toBe(true);
    expect(isStaleMatchRefusal(refusal(400, "invalid_select_token"))).toBe(true);
    expect(isStaleMatchRefusal(refusal(409, "deadline_not_met"))).toBe(true);
    expect(isStaleMatchRefusal(refusal(409, "cart_belongs_to_another_shop"))).toBe(false);
    expect(isStaleMatchRefusal(new Error("offline"))).toBe(false);
  });
});
