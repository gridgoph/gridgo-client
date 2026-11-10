import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PromoSheet } from "@/components/PromoSheet";
import { promotionsFrom } from "@/lib/homePromos";

/** The promo sheet's one button opens the partner's link (client#402). */

const [promo] = promotionsFrom([
  {
    id: "promo_dgo",
    name: "DavaoGo",
    description: "Rides and deliveries around Davao.",
    tag: "partner",
    linkText: "Visit DavaoGo",
    linkUrl: "https://davaogo.app/",
  },
]);

it("hands the promo to the link button", async () => {
  const onOpenLink = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <PromoSheet promo={promo} onClose={jest.fn()} onOpenLink={onOpenLink} />
    </SafeAreaProvider>,
  );
  // No logo: the disc carries the first letter.
  expect(screen.getByText("D", { includeHiddenElements: true })).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Visit DavaoGo"));
  expect(onOpenLink).toHaveBeenCalledWith(promo);
});
