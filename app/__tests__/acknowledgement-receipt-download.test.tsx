import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import AcknowledgementReceiptScreen from "@/app/order/acknowledgement-receipt";
import { saveSignedInFile } from "@/lib/fileSave";
import { issuedReceipt } from "@/test/acknowledgementReceiptFixtures";
import { completedOrder } from "@/test/receivedOrder";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ orderId: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getAcknowledgementReceipt: jest.fn(),
  getOrder: jest.fn(),
}));
jest.mock("@/lib/fileSave", () => ({
  ...jest.requireActual("@/lib/fileSave"),
  saveSignedInFile: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");
const save = saveSignedInFile as jest.MockedFunction<typeof saveSignedInFile>;

afterEach(async () => {
  await cleanup();
});

it("downloads the signed-in PDF under its AR number and says where it went", async () => {
  api.getOrder.mockResolvedValue(completedOrder());
  api.getAcknowledgementReceipt.mockResolvedValue(issuedReceipt({ arNumber: "AR-0000000042" }));
  save.mockResolvedValue({ kind: "saved", message: "Downloaded AR-0000000042.pdf." });
  await renderScreen(<AcknowledgementReceiptScreen />);

  fireEvent.press(await screen.findByRole("button", { name: "Download receipt (PDF)" }));

  expect(await screen.findByText("Downloaded AR-0000000042.pdf.")).toBeTruthy();
  const [request, name, mime] = save.mock.calls[0];
  expect(request.url).toMatch(/\/orders\/ord_refund_1\/acknowledgement-receipt\/download$/);
  expect(name).toBe("AR-0000000042.pdf");
  expect(mime).toBe("application/pdf");
});
