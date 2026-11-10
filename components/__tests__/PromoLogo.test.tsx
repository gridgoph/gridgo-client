import { fireEvent, render, screen } from "@testing-library/react-native";

import { PromoLogo } from "@/components/HomePromoTile";

/** A failed logo retries when the feed sends a fresh URL (client#402 review). */

function sourceUri(): string | undefined {
  const source = screen.getByTestId("promo-logo-image", { includeHiddenElements: true }).props.source;
  return Array.isArray(source) ? source[0]?.uri : source?.uri;
}

it("falls back to the first letter, then tries a new URL", async () => {
  const view = await render(<PromoLogo uri="https://files.example/old.png" name="DavaoGo" size={36} />);
  fireEvent(screen.getByTestId("promo-logo-image", { includeHiddenElements: true }), "error");
  expect(await screen.findByText("D", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByTestId("promo-logo-image", { includeHiddenElements: true })).toBeNull();

  await view.rerender(<PromoLogo uri="https://files.example/fresh.png" name="DavaoGo" size={36} />);
  expect(sourceUri()).toBe("https://files.example/fresh.png");
  expect(screen.queryByText("D", { includeHiddenElements: true })).toBeNull();
});
