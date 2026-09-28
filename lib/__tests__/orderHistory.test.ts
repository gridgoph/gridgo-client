import { correctionReason, historyRows } from "@/lib/orderHistory";

const INTERNAL = /payout|milestone|retention|proof|pof|file_|sharePercent/i;

describe("historyRows", () => {
  it("reads GRIDGO's plain note for each step", () => {
    const rows = historyRows(
      [
        { at: "2026-09-28T07:00:00Z", state: "production" },
        { at: "2026-09-28T08:00:00Z", state: "production", note: "In production" },
        { at: "2026-09-28T09:00:00Z", state: "supplier_self_qc", note: "Checking and packing your order" },
      ],
      { plainNotes: true },
    );
    expect(rows.map((row) => row.title)).toEqual(["In production", "Checking and packing your order"]);
    // The plain projection names nobody.
    expect(rows.every((row) => row.actor === null)).toBe(true);
  });

  it("falls back to the client's label when a step carries no note", () => {
    const rows = historyRows([{ at: "2026-09-28T07:00:00Z", state: "supplier_self_qc" }], { plainNotes: true });
    expect(rows[0].title).toBe("Printing and packing");
  });

  it("never draws an older payload's free-text notes, where payout text leaked", () => {
    const rows = historyRows(
      [
        { at: "2026-09-28T08:00:00Z", state: "production", by: "user_supplier", note: "Proof printing filed (file_pof_1)" },
        {
          at: "2026-09-28T08:01:00Z",
          state: "production",
          by: "user_ops",
          note: "Payout milestone printing released",
          milestoneCode: "printing",
        },
        { at: "2026-09-28T08:02:00Z", state: "ready_for_dispatch", by: "user_supplier", note: "PKG-QC-77" },
      ],
      { plainNotes: false },
    );
    expect(rows.map((row) => row.title)).toEqual(["In production", "Ready for dispatch"]);
    expect(JSON.stringify(rows)).not.toMatch(INTERNAL);
    expect(JSON.stringify(rows)).not.toMatch(/PKG-QC/);
  });

  it("drops an entry that names a shop payout stage even in the plain projection", () => {
    const rows = historyRows(
      [
        { at: "2026-09-28T08:00:00Z", state: "issue_window_open", note: "Order received; please check your items" },
        { at: "2026-09-29T08:00:00Z", state: "completed", note: "Client retention milestone released", milestoneCode: "retention" },
      ],
      { plainNotes: true },
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(INTERNAL);
  });

  it("reads the internal payout ending as completed, once", () => {
    const rows = historyRows(
      [
        { at: "2026-09-28T08:00:00Z", state: "completed", note: "Issue window expired with no active claim" },
        { at: "2026-09-28T08:00:00Z", state: "completed", note: "Client retention milestone released" },
        { at: "2026-09-30T08:00:00Z", state: "payout_released", note: "All payout stages released" },
      ],
      { plainNotes: false },
    );
    expect(rows.map((row) => row.state)).toEqual(["completed"]);
    expect(rows[0].title).toBe("Completed");
  });

  it("uses the collecting client's words for the travel steps", () => {
    const rows = historyRows(
      [{ at: "2026-09-28T08:00:00Z", state: "out_for_delivery", note: "Out for delivery" }],
      { plainNotes: true, fulfillmentMode: "pickup" },
    );
    expect(rows[0].title).toBe("On the way to GRIDGO Office");
  });

  it("survives a missing or malformed history", () => {
    expect(historyRows(undefined, { plainNotes: true })).toEqual([]);
    expect(historyRows([null as never], { plainNotes: true })).toEqual([]);
  });
});

describe("correctionReason", () => {
  const plain = { productionProgress: { status: "waiting_for_photo", photos: [] } };
  const plainTimeline = [
    { at: "2026-09-28T01:00:00Z", state: "client_correction", note: "Artwork needs a change" },
  ];

  it("reads Operations' reason from its own field", () => {
    expect(
      correctionReason({
        ...plain,
        timeline: plainTimeline,
        correction: { reason: " Bleed is missing on all four edges ", requestedAt: "2026-09-28T01:00:00Z" },
      }),
    ).toBe("Bleed is missing on all four edges");
  });

  it("never offers GRIDGO's fixed step wording as the reason", () => {
    expect(correctionReason({ ...plain, timeline: plainTimeline, correction: null })).toBeNull();
    expect(
      correctionReason({ ...plain, timeline: plainTimeline, correction: { reason: "  ", requestedAt: null } }),
    ).toBeNull();
  });

  it("falls back to an older payload's correction note", () => {
    expect(
      correctionReason({
        timeline: [
          { at: "2026-09-28T01:00:00Z", state: "client_correction", by: "user_ops", note: "Text runs into the trim" },
        ],
      }),
    ).toBe("Text runs into the trim");
  });
});
