import { fireEvent, render, screen } from "@testing-library/react-native";
import { Appearance } from "react-native";

import { HomePromoTile, PROMO_LOGO_FIT, PromoLogo } from "@/components/HomePromoTile";
import type { HomePromotion } from "@/lib/homePromos";

/**
 * The card's pictures (gridgo-client#425): the logo is always whole in its
 * disc, the card image fills the card under a scrim with white ink, and the
 * cover never reaches the card. The error test goes last (one event per file).
 */

afterEach(() => {
  jest.restoreAllMocks();
});

function promo(overrides: Partial<HomePromotion> = {}): HomePromotion {
  return {
    id: "promo_davaogo",
    name: "DavaoGo",
    logoUrl: "https://files.example/logo.png",
    cardImageUrl: null,
    imageUrl: null,
    description: "",
    tag: "sponsored",
    linkText: "Plan your commute",
    linkUrl: "https://davaogo.example",
    tapAction: "sheet",
    style: "light",
    color: "#FFFFFF",
    ...overrides,
  };
}

it("fits the logo whole inside the circle, with even padding", async () => {
  await render(<PromoLogo uri="https://files.example/square.png" name="DavaoGo" size={56} />);
  const logo = screen.getByTestId("promo-logo-image", { includeHiddenElements: true });
  expect(logo.props.resizeMode).toBe("contain");
  expect(logo).toHaveStyle({ width: 56 * PROMO_LOGO_FIT, height: 56 * PROMO_LOGO_FIT });
  // A square logo's corners stay inside the circle: half its diagonal is under the radius.
  expect((PROMO_LOGO_FIT * Math.SQRT2) / 2).toBeLessThan(0.5);
  // On a white disc in both themes.
  expect(screen.getByTestId("promo-logo", { includeHiddenElements: true }).props.className).toContain("bg-slip-paper");
});

it("keeps the colour card when there is no card image, and never draws the cover on it", async () => {
  await render(<HomePromoTile promo={promo({ imageUrl: "https://files.example/cover.jpg" })} onPress={() => {}} />);
  expect(screen.queryByTestId("promo-tile-card-image")).toBeNull();
  expect(screen.queryByTestId("promo-tile-scrim", { includeHiddenElements: true })).toBeNull();
  expect(screen.getByText("DavaoGo")).toHaveStyle({ color: "#1A1A1A" });
});

it.each(["light", "dark"] as const)("fills the card with the card image under a scrim, in white ink (%s)", async (scheme) => {
  jest.spyOn(Appearance, "getColorScheme").mockReturnValue(scheme);
  await render(
    <HomePromoTile
      promo={promo({ cardImageUrl: "https://files.example/card.jpg", imageUrl: "https://files.example/cover.jpg" })}
      onPress={() => {}}
    />,
  );
  const picture = screen.getByTestId("promo-tile-card-image");
  expect(picture.props.source).toEqual({ uri: "https://files.example/card.jpg" });
  expect(picture.props.resizeMode).toBe("cover");
  expect(picture).toHaveStyle({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 });
  expect(screen.getByTestId("promo-tile-scrim", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText("DavaoGo")).toHaveStyle({ color: "#FFFFFF" });
  expect(screen.getByTestId("promo-tile-link-text")).toHaveStyle({ color: "#FFFFFFD9" });
  expect(screen.getByTestId("promo-tile-tag")).toHaveStyle({ backgroundColor: "#00000073" });
});

it("goes back to the colour card when the card image will not load", async () => {
  const onCardImageError = jest.fn();
  await render(
    <HomePromoTile promo={promo({ cardImageUrl: "https://files.example/card.jpg" })} onPress={() => {}} onCardImageError={onCardImageError} />,
  );
  fireEvent(screen.getByTestId("promo-tile-card-image"), "error");
  expect(await screen.findByText("DavaoGo")).toHaveStyle({ color: "#1A1A1A" });
  expect(screen.queryByTestId("promo-tile-card-image")).toBeNull();
  expect(onCardImageError).toHaveBeenCalledWith("https://files.example/card.jpg");
});
