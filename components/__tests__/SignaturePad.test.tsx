import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { SignaturePad } from "@/components/SignaturePad";
import { signatureIsBlank, type Signature } from "@/lib/signature";

/**
 * The pad records what the pen draws. One gesture per test: a fired event
 * spends the React 19 testing budget for later renders in the same file.
 */
it("turns one stroke into the signature, kept inside the pad", async () => {
  const onChange = jest.fn<void, [Signature]>();
  await render(<SignaturePad value={null} onChange={onChange} height={180} />);
  expect(screen.getByLabelText("Signature pad, empty")).toBeTruthy();

  await act(async () => {
    fireEvent(screen.getByLabelText("Signature pad, empty"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 180 } },
    });
  });
  await act(async () => {
    fireGestureHandler(getByGestureTestId("signature-pad"), [
      { state: State.BEGAN, x: 20, y: 120 },
      { state: State.ACTIVE, x: 90, y: 60 },
      { state: State.ACTIVE, x: 160, y: 120 },
      // Off the right edge: drawn on the edge, never outside the paper.
      { state: State.ACTIVE, x: 400, y: 90 },
      { state: State.END, x: 400, y: 90 },
    ]);
  });

  expect(onChange).toHaveBeenCalledTimes(1);
  const signature = onChange.mock.calls[0][0];
  expect(signature.width).toBe(300);
  expect(signature.height).toBe(180);
  expect(signature.strokes).toHaveLength(1);
  expect(signature.strokes[0]).toHaveLength(4);
  expect(signature.strokes[0][0]).toEqual({ x: 20, y: 120 });
  expect(signature.strokes[0].at(-1)).toEqual({ x: 300, y: 90 });
  expect(signatureIsBlank(signature)).toBe(false);
});
