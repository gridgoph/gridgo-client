import { render, screen } from "@testing-library/react-native";

import { HomePromoTile } from "@/components/HomePromoTile";
import type { HomePromotion } from "@/lib/homePromos";

/** The card's link line under the name (gridgo-client#402, DavaoGo mockup). */

function promo(overrides: Partial<HomePromotion> = {}): HomePromotion {
  return {
    id: "promo_davaogo",
    name: "DavaoGo",
    logoUrl: null,
    imageUrl: null,
    description: "",
    tag: "sponsored",
    linkText: "Plan your commute",
    linkUrl: "https://davaogo.example",
    tapAction: "sheet",
    style: "light",
    color: null,
    ...overrides,
  };
}

it("shows the link text on one truncated line under the name", async () => {
  await render(<HomePromoTile promo={promo({ style: "yellow" })} onPress={() => {}} />);
  const line = screen.getByText("Plan your commute");
  expect(line.props.numberOfLines).toBe(1);
  expect(line.props.ellipsizeMode).toBe("tail");
  expect(screen.getByText("DavaoGo")).toBeTruthy();
  expect(screen.getByText("Sponsored")).toBeTruthy();
});

it("draws nothing extra when Operations wrote no link text", async () => {
  await render(<HomePromoTile promo={promo({ linkText: "" })} onPress={() => {}} />);
  expect(screen.getByText("DavaoGo")).toBeTruthy();
  expect(screen.queryByTestId("promo-tile-link")).toBeNull();
});

it("labels the tag chip and the name for a reader", async () => {
  await render(<HomePromoTile promo={promo({ color: "#17A673", tapAction: "link" })} onPress={() => {}} />);
  expect(screen.getByLabelText("DavaoGo. Sponsored")).toBeTruthy();
  expect(screen.getByText("Sponsored")).toBeTruthy();
});

it("draws the link text in 72% ink and the arrow in full ink", async () => {
  await render(<HomePromoTile promo={promo({ color: "#FFFFFF" })} onPress={() => {}} />);
  expect(screen.getByTestId("promo-tile-link-text")).toHaveStyle({ color: "#1A1A1AB8" });
});
