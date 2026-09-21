import { fireEvent, render, screen } from "@testing-library/react-native";

import { ServiceFeeRow } from "@/components/ServiceFeeRow";
import { SERVICE_FEE_EXPLAINER } from "@/lib/serviceFee";

describe("ServiceFeeRow", () => {
  it("shows the live rate and reveals the explainer on tap", async () => {
    await render(<ServiceFeeRow amountMinor={400} rateBps={1000} />);

    expect(screen.getByText("Service fee · 10%")).toBeTruthy();
    expect(screen.getByText("₱4.00")).toBeTruthy();
    expect(screen.queryByText(SERVICE_FEE_EXPLAINER)).toBeNull();

    await fireEvent.press(screen.getByLabelText("Service fee · 10%"));
    expect(screen.getByText(SERVICE_FEE_EXPLAINER)).toBeTruthy();
  });
});
