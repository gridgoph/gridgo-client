import { fireEvent, screen } from "@testing-library/react-native";

import { QR_LOAD_FAILED, QrPaySheet } from "@/components/QrPaySheet";
import { renderScreen } from "@/test/renderScreen";

jest.mock("@/lib/savePaymentQr", () => ({
  ...jest.requireActual("@/lib/savePaymentQr"),
  savePaymentQrToPhotos: jest.fn(),
}));

// 9BA29059: the sheet showed ₱0.00 and an empty QR box. One press in this file, last.

it("never asks for ₱0.00: a zero amount reads Not yet", async () => {
  await renderScreen(<QrPaySheet open onClose={() => {}} downpaymentMinor={0} downpaymentPercent={100} />);
  expect(screen.getByText("Not yet")).toBeTruthy();
  expect(screen.queryByText(/₱0\.00/)).toBeNull();
});

it("a plate that fails to load says so with a retry, then loads again", async () => {
  await renderScreen(
    <QrPaySheet open onClose={() => {}} downpaymentMinor={5175} downpaymentPercent={100} imageUrl="https://example.test/qr.png" />,
  );
  fireEvent(screen.getByLabelText("GRIDGO's QR Ph code"), "error", { nativeEvent: { error: "404" } });
  expect(await screen.findByText(QR_LOAD_FAILED)).toBeTruthy();
  expect(screen.queryByLabelText("GRIDGO's QR Ph code")).toBeNull();
  // The amount stays; only the plate is missing.
  expect(screen.getByText("₱51.75")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Load the QR again"));
  expect(await screen.findByLabelText("GRIDGO's QR Ph code")).toBeTruthy();
  expect(screen.queryByText(QR_LOAD_FAILED)).toBeNull();
});
