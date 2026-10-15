import {
  groupListingsEmpty,
  groupPickGone,
  groupPickInput,
  pickedFromGroupMatch,
} from "@/lib/groupListings";
import { otherListing, topListing, topPickMatch } from "@/test/matchFixtures";

describe("groupListingsEmpty", () => {
  it("says plainly that nothing more fits the group's date", () => {
    const empty = groupListingsEmpty("deadline_not_met", "Shop A", "2026-11-14T06:00:00.000Z");
    expect(empty.title).toBe("Nothing more fits Sat 14 Nov");
    expect(empty.body).toMatch(/^No more products can be added to Shop A for this date\./);
  });

  it("says plainly that the group has nothing more to offer", () => {
    const empty = groupListingsEmpty("no_orderable_listings", "Shop B", null);
    expect(empty.title).toBe("Nothing more to add from Shop B");
    expect(empty.body).toMatch(/^No products are currently available to add from Shop B\./);
  });

  it("reads a reason it does not know as nothing to offer, never an error", () => {
    expect(groupListingsEmpty("some_new_reason", "Shop A", null).title).toBe("Nothing more to add from Shop A");
  });
});

describe("groupPickInput", () => {
  it("holds the match to the group and leaves the date to the group", () => {
    const input = groupPickInput("cart_1", "cline_0", "brochures");
    expect(input).toEqual({ subcategoryCode: "brochures", cartId: "cart_1", groupId: "cline_0" });
    expect(input).not.toHaveProperty("deadline");
  });
});

describe("pickedFromGroupMatch", () => {
  const match = topPickMatch({
    listings: [topListing("sci_first"), topListing("sci_tapped", { selectToken: "tok_tapped" })],
    otherListings: [otherListing("sci_other")],
  });

  it("finds the tapped card by its id, never the first listing", () => {
    expect(pickedFromGroupMatch(match, "sci_tapped")?.selectToken).toBe("tok_tapped");
  });

  it("is null when the card is no longer offered", () => {
    expect(pickedFromGroupMatch(match, "sci_gone")).toBeNull();
  });

  it("is null when the card came back with no token to pick it by", () => {
    const tokenless = topPickMatch({ listings: [topListing("sci_tapped", { selectToken: undefined })] });
    expect(pickedFromGroupMatch(tokenless, "sci_tapped")).toBeNull();
  });
});

it("names the product and the group when a pick dropped out", () => {
  expect(groupPickGone("Brochures", "Shop A")).toBe(
    "Brochures can no longer join Shop A for this date. The list is up to date now. Choose another product.",
  );
});
