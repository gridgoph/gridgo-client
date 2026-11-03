import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import HomeScreen from "@/app/(tabs)/home";
import { REQUEST_STEPPER_HREF } from "@/hooks/useStartRequest";
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

/* A client who really started a request is asked before it is replaced. */
it("asks before replacing a draft the client started, and changes nothing yet", async () => {
  await renderScreen(<HomeScreen />);

  fireEvent.press(await screen.findByLabelText("Reorder Flyers"));

  expect(await screen.findByText(REPLACE_QUESTION)).toBeTruthy();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(useRequestDraft.getState().title).toBe("Birthday tarpaulin");
});

// Two presses: last in this file (AGENTS.md, "Running and testing").
it("replaces the draft and opens the reorder when the client confirms", async () => {
  await renderScreen(<HomeScreen />);
  fireEvent.press(await screen.findByLabelText("Reorder Flyers"));
  await screen.findByText(REPLACE_QUESTION);

  fireEvent.press(screen.getByLabelText("Replace the draft"));

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(REQUEST_STEPPER_HREF));
  expect(mockDismissTo).not.toHaveBeenCalled();
  expect(useRequestDraft.getState()).toEqual(
    expect.objectContaining({ title: "Flyers", artworkFileId: "file_flyer" }),
  );
});
