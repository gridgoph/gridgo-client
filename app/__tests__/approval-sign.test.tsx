import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SignApprovalScreen from "@/app/approval/sign";
import { useApproval } from "@/store/approval";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ scope: "cart:cart_1", reviewed: "7" }),
}));

/**
 * The signature step: the client signs, keeps it, and goes back to the screen
 * that asked. The signature is bound to the version they were reviewing.
 * One interaction chain, so one test in this file.
 */
it("keeps a drawn signature for exactly what was reviewed", async () => {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <SignApprovalScreen />
    </SafeAreaProvider>,
  );
  expect(screen.getByText("I approve this order")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Use this signature" }).props.accessibilityState.disabled).toBe(true);

  await act(async () => {
    fireEvent(screen.getByLabelText("Signature pad, empty"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 220 } },
    });
  });
  await act(async () => {
    fireGestureHandler(getByGestureTestId("signature-pad"), [
      { state: State.BEGAN, x: 30, y: 150 },
      { state: State.ACTIVE, x: 120, y: 80 },
      { state: State.ACTIVE, x: 220, y: 160 },
      { state: State.END, x: 220, y: 160 },
    ]);
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Use this signature" }).props.accessibilityState.disabled).toBe(false),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Use this signature" }));

  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  const draft = useApproval.getState().drafts["cart:cart_1"];
  expect(draft).toEqual(expect.objectContaining({ method: "drawn", reviewed: "7" }));
  expect(draft.signature?.strokes[0]).toHaveLength(3);
});
