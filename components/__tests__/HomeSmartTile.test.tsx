import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { HOME_TILE_HEIGHT, HomeSmartTile } from "@/components/HomeSmartTile";
import type { SmartTileView } from "@/lib/homeSummary";

/** Home's smart tile (client#335): one size in every state, so Home never moves. */

const VIEWS: SmartTileView[] = [
  { kind: "missions", done: 2, total: 5, href: "/founding-tester", label: "Founding Tester, 2 of 5 steps done" },
  {
    kind: "active_order",
    orderId: "ord_1",
    headline: "Printing",
    detail: "Ready by Wed, 4 Nov",
    step: 2,
    stepCount: 4,
    more: 1,
    needsPayment: false,
    href: "/order/ord_1",
    label: "Your order, Printing, and 1 more",
  },
  { kind: "tester_voucher", amount: "₱15", daysLeft: 27, href: "/founding-tester", label: "Tester voucher, ₱15 off, 27 days left" },
  { kind: "invite", href: "/invite", label: "Invite a friend" },
  { kind: "orders", href: "/(tabs)/orders", label: "Your orders" },
];

function minHeight(testID: string): number | undefined {
  const node = screen.getByTestId(testID);
  expect(typeof node.props.style).not.toBe("function");
  const flat = StyleSheet.flatten(node.props.style);
  expect(flat?.height).toBeUndefined();
  return flat?.minHeight;
}

it.each(VIEWS.map((view) => [view.kind, view] as const))("draws the %s state at the shared minimum height", async (kind, view) => {
  await render(<HomeSmartTile view={view} onPress={jest.fn()} />);

  expect(screen.getByLabelText(view.label)).toBeTruthy();
  expect(minHeight(`smart-tile-${kind}`)).toBe(HOME_TILE_HEIGHT);
});

it("holds the same space while the summary loads", async () => {
  await render(<HomeSmartTile view={null} onPress={jest.fn()} />);

  expect(minHeight("smart-tile-loading")).toBe(HOME_TILE_HEIGHT);
});

it("says what the active order is doing with no line-cap truncation on overline, headline or detail", async () => {
  await render(<HomeSmartTile view={VIEWS[1]} onPress={jest.fn()} />);

  expect(screen.getByText("YOUR ORDER · +1").props.numberOfLines).toBeUndefined();
  expect(screen.getByText("Printing").props.numberOfLines).toBeUndefined();
  expect(screen.getByText("Ready by Wed, 4 Nov").props.numberOfLines).toBeUndefined();
});
