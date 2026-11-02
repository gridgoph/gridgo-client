import { screen } from "@testing-library/react-native";

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

it("gives the close button a 44pt-plus target", async () => {
  setUpQuickActions();
  await renderQuickActions();

  const close = await screen.findByTestId("quick-actions-close");
  const style = [close.props.style].flat(3).reduce((all, part) => ({ ...all, ...(part ?? {}) }), {});
  expect(style.width).toBeGreaterThanOrEqual(44);
  expect(style.height).toBeGreaterThanOrEqual(44);
});
