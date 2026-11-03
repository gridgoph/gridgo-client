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
  resetHomeReorder();
});

/*
 * The reported bug, on a phone with no draft: the tap filled the draft but
 * `dismissTo` never left Home, and the next tap asked to replace that draft.
 */
it("opens the reorder straight away when there is no draft", async () => {
  await renderScreen(<HomeScreen />);

  fireEvent.press(await screen.findByLabelText("Reorder Flyers"));

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(REQUEST_STEPPER_HREF));
  expect(mockDismissTo).not.toHaveBeenCalled();
  expect(screen.queryByText(REPLACE_QUESTION)).toBeNull();
  expect(useRequestDraft.getState()).toEqual(
    expect.objectContaining({ title: "Flyers", addressLine1: "Sample drop-off", artworkFileId: "file_flyer" }),
  );
});
