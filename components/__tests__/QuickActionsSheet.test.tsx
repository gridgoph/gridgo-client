import { screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";

import { CLOSE_HEIGHT, GRID_GUTTER, GRID_TILE_HEIGHT, gridRows, gridTileWidth } from "@/components/QuickActionsSheet";
import { useQuickActions } from "@/store/quickActions";
import { renderQuickActions, setUpQuickActions } from "@/test/quickActionsHarness";

/** The "+" sheet (client#335): what it offers, before anything is pressed. */

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
}));
jest.mock("@/lib/api", () => jest.requireActual("@/test/quickActionsApiMock").quickActionsApiMock());

it("draws nothing while closed", async () => {
  setUpQuickActions();
  useQuickActions.setState({ open: false });
  await renderQuickActions();

  expect(screen.queryByTestId("quick-actions-sheet")).toBeNull();
});

it("offers every action, keeping unusable ones with their reason", async () => {
  setUpQuickActions({ unread: 2 });
  await renderQuickActions();

  expect(await screen.findByText("What do you need?")).toBeTruthy();
  expect(screen.getByLabelText(/^Start a new print/)).toBeTruthy();
  expect(screen.getByText("Chat with GRIDGO")).toBeTruthy();
  expect(screen.getByText("2 new")).toBeTruthy();
  expect(screen.getByText("Get a quote")).toBeTruthy();
  expect(screen.getByText("Report a problem")).toBeTruthy();
  expect(await screen.findByText("No order in progress")).toBeTruthy();
  expect(screen.getByText("No past print yet")).toBeTruthy();
  expect(screen.getByText("Founding Tester mission")).toBeTruthy();
  expect(screen.getByText("2 / 5")).toBeTruthy();
});

it("leaves the mission row out for a client who is not a tester", async () => {
  setUpQuickActions({ tester: false });
  await renderQuickActions();

  expect(await screen.findByText("What do you need?")).toBeTruthy();
  expect(screen.queryByText("Founding Tester mission")).toBeNull();
});

/** A host view's style as one object, the way React Native will draw it. */
function flat(style: unknown): Record<string, unknown> {
  expect(typeof style).not.toBe("function");
  return ([style].flat(3) as (Record<string, unknown> | null | undefined)[]).reduce<Record<string, unknown>>(
    (all, part) => ({ ...all, ...(part ?? {}) }),
    {},
  );
}

it("gives the full-width Close button a 48dp-plus target", async () => {
  setUpQuickActions();
  await renderQuickActions();

  const close = await screen.findByTestId("quick-actions-close");
  expect(close.props.accessibilityLabel).toBe("Close quick actions");
  expect(screen.getByText("Close")).toBeTruthy();
  expect(flat(close.props.style).minHeight).toBeGreaterThanOrEqual(48);
  expect(CLOSE_HEIGHT).toBeGreaterThanOrEqual(48);
});

it("lays the grid out as two rows of two equal tiles from fixed column maths", async () => {
  setUpQuickActions();
  await renderQuickActions();

  const keys = ["chat", "track", "reorder", "quote"];
  const tiles = await Promise.all(keys.map((key) => screen.findByTestId(`quick-action-${key}`)));
  // From the window, never from the tile's own text.
  const width = gridTileWidth(Dimensions.get("window").width);
  for (const tile of tiles) {
    const style = flat(tile.props.style);
    expect(style.width).toBe(width);
    expect(style.minHeight).toBe(GRID_TILE_HEIGHT);
  }

  const grid = screen.getByTestId("quick-actions-grid");
  expect(grid.children).toHaveLength(2);
  expect(flat(grid.props.style).gap).toBe(GRID_GUTTER);
});

it("pairs the grid tiles so none is left alone on a row", () => {
  expect(gridRows(["chat", "track", "reorder", "quote"])).toEqual([
    ["chat", "track"],
    ["reorder", "quote"],
  ]);
  // The iPhone and Android sizes the sheet was checked at: (w - 16 * 2 - 12) / 2.
  expect(gridTileWidth(390)).toBe(173);
  expect(gridTileWidth(412)).toBe(184);
});
