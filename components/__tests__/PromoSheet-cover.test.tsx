import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PromoSheet } from "@/components/PromoSheet";
import { promotionsFrom } from "@/lib/homePromos";

/** The About sheet's cover is `image` only, shown whole at 16:9 (gridgo-client#425). */

const base = {
  id: "promo_dgo",
  name: "DavaoGo",
  description: "Rides and deliveries around Davao.",
  tag: "partner",
  linkText: "Visit DavaoGo",
  linkUrl: "https://davaogo.app/",
};

function renderSheet(feed: Record<string, unknown>) {
  const [promo] = promotionsFrom([{ ...base, ...feed }]);
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <PromoSheet promo={promo} onClose={jest.fn()} onOpenLink={jest.fn()} />
    </SafeAreaProvider>,
  );
}

it("shows the cover whole at 16:9", async () => {
  await renderSheet({
    image: { fileId: "file_cover", downloadUrl: "https://files.example/cover.jpg" },
    cardImage: { fileId: "file_card", downloadUrl: "https://files.example/card.jpg" },
  });
  const cover = screen.getByTestId("promo-sheet-cover");
  expect(cover.props.source).toEqual({ uri: "https://files.example/cover.jpg" });
  expect(cover.props.resizeMode).toBe("contain");
  expect(cover).toHaveStyle({ aspectRatio: 16 / 9 });
});

it("draws no cover block without a cover, even when the card has an image", async () => {
  await renderSheet({ cardImage: { fileId: "file_card", downloadUrl: "https://files.example/card.jpg" } });
  expect(screen.getByTestId("promo-sheet")).toBeTruthy();
  expect(screen.queryByTestId("promo-sheet-cover")).toBeNull();
});
