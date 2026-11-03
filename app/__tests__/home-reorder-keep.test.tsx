import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import HomeScreen from "@/app/(tabs)/home";
import { useRequestDraft } from "@/store/requestDraft";
import { REPLACE_QUESTION, resetHomeReorder } from "@/test/homeReorder";
import { renderScreen } from "@/test/renderScreen";

const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();

jest.mock("expo-router", () =>
  jest.requireActual("@/test/homeReorder").homeReorderRouter(
    (href: string) => mockNavigate(href),
    (href: string) => mockDismissTo(href),
  ),
);
jest.mock("@/lib/api", () => jest.requireActual("@/test/homeReorder").homeReorderApiMock());

beforeEach(() => {
  mockNavigate.mockClear();
  mockDismissTo.mockClear();
  resetHomeReorder("Birthday tarpaulin");
});

// Two presses: the only test in this file (AGENTS.md, "Running and testing").
it("keeps the draft and stays on Home when the client cancels", async () => {
  await renderScreen(<HomeScreen />);
  fireEvent.press(await screen.findByLabelText("Reorder Flyers"));
  await screen.findByText(REPLACE_QUESTION);

  fireEvent.press(screen.getByText("Keep my draft"));

  await waitFor(() => expect(screen.queryByText(REPLACE_QUESTION)).toBeNull());
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(useRequestDraft.getState().title).toBe("Birthday tarpaulin");
});
