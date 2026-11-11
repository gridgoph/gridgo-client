import { render, screen } from "@testing-library/react-native";
import { Appearance, StyleSheet } from "react-native";

import { HomePromoTile } from "@/components/HomePromoTile";
import { colors } from "@/constants/theme";
import type { HomePromotion } from "@/lib/homePromos";

/** The card's link line under the name (gridgo-client#402, DavaoGo mockup). */

afterEach(() => {
  jest.restoreAllMocks();
});

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

it("applies a #FFFFFF promo background with dark ink in both Dark and Light themes via a plain object style", async () => {
  // NativeWind's native CSS interop wraps `[classStyle, fnStyle]` into an array
  // when `Pressable.style` is a function; React Native's `Pressable` only calls
  // `style` when `typeof style === "function"`, so a function `style` drops
  // `backgroundColor` on Android/iOS and leaves a white promo black in Dark theme.
  jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
  await render(<HomePromoTile promo={promo({ color: "#FFFFFF", style: "light" })} onPress={() => {}} />);

  const darkTile = screen.getByTestId("promo-tile-promo_davaogo");
  expect(typeof darkTile.props.style).not.toBe("function");
  const darkStyle = StyleSheet.flatten([{ borderRadius: 16, padding: 12 }, darkTile.props.style]);
  expect(darkStyle.backgroundColor).toBe("#FFFFFF");
  expect(darkStyle.borderColor).toBe("#FFFFFF");
  expect(screen.getByText("DavaoGo")).toHaveStyle({ color: "#1A1A1A" });
  expect(screen.getByTestId("promo-tile-link-text")).toHaveStyle({ color: "#1A1A1AB8" });
  expect(screen.getByTestId("promo-tile-tag")).toHaveStyle({ backgroundColor: "#1A1A1A1A" });

  jest.spyOn(Appearance, "getColorScheme").mockReturnValue("light");
  await render(<HomePromoTile promo={promo({ color: "#FFFFFF", style: "light" })} onPress={() => {}} />);

  const lightTile = screen.getByTestId("promo-tile-promo_davaogo");
  expect(typeof lightTile.props.style).not.toBe("function");
  const lightStyle = StyleSheet.flatten([{ borderRadius: 16, padding: 12 }, lightTile.props.style]);
  expect(lightStyle.backgroundColor).toBe("#FFFFFF");
  expect(lightStyle.borderColor).toBe(colors.light.outline);
  expect(screen.getByText("DavaoGo")).toHaveStyle({ color: "#1A1A1A" });
});
