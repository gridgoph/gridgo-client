import { listingDraftKey, listingDraftNow, useListingDraft, type ListingDraft } from "@/store/listingDraft";

const DRAFT: ListingDraft = {
  selection: { grp_paper: "opt_gloss" },
  quantity: 3,
  measured: { width: "6", height: "3", length: "", pages: "" },
  note: "Trim the white edge",
  layout: "fit_to_paper",
};

beforeEach(() => useListingDraft.getState().clear());

describe("listing drafts", () => {
  it("are keyed to the basket row being changed, else to the listing", () => {
    expect(listingDraftKey("sci_flyers", "cline_1")).toBe("line:cline_1");
    expect(listingDraftKey("sci_flyers", undefined)).toBe("item:sci_flyers");
    expect(listingDraftKey(undefined, undefined)).toBeNull();
  });

  it("hold one sheet's answers until it is added", () => {
    useListingDraft.getState().keep("item:sci_flyers", DRAFT);
    useListingDraft.getState().keep("item:sci_tarp", { ...DRAFT, quantity: 1 });
    expect(listingDraftNow("item:sci_flyers")).toEqual(DRAFT);

    useListingDraft.getState().drop("item:sci_flyers");
    expect(listingDraftNow("item:sci_flyers")).toBeNull();
    expect(listingDraftNow("item:sci_tarp")?.quantity).toBe(1);
    expect(listingDraftNow(null)).toBeNull();
  });
});
