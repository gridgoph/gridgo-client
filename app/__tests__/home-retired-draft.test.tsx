import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import HomeScreen from "@/app/(tabs)/home";
import { useRequestDraft } from "@/store/requestDraft";
import { resetReorder } from "@/test/reorderFixtures";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => jest.requireActual("@/test/reorderFixtures").reorderRouter(jest.fn()));
jest.mock("@/lib/api", () => jest.requireActual("@/test/reorderFixtures").reorderApiMock());

const NOTICE = "Your saved request was cleared";

beforeEach(() => {
  resetReorder();
  useRequestDraft.getState().dismissRetiredNotice();
});

it("says nothing on an ordinary launch", async () => {
  await renderScreen(<HomeScreen />);

  expect(screen.queryByText(NOTICE)).toBeNull();
});

it("tells the client once, naming no job and no money", async () => {
  useRequestDraft.setState({ retiredNotice: true });
  await renderScreen(<HomeScreen />);

  expect(screen.getByText(NOTICE)).toBeTruthy();
  expect(screen.getByText(/Tap \+ to start a new print or reorder a past job/)).toBeTruthy();
});

// One press per file (AGENTS.md): this test goes last.
it("closes for good when dismissed", async () => {
  useRequestDraft.setState({ retiredNotice: true });
  await renderScreen(<HomeScreen />);

  fireEvent.press(screen.getByLabelText("Dismiss the saved request notice"));

  await waitFor(() => expect(useRequestDraft.getState().retiredNotice).toBe(false));
  await waitFor(() => expect(screen.queryByText(NOTICE)).toBeNull());
});
