import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { ExpressStepBar } from "@/components/express/ExpressChrome";
import { PrinterStep } from "@/components/express/PrinterStep";
import { renderScreen } from "@/test/renderScreen";
import { seedWhoPrints } from "@/test/whoPrintsFixtures";
import { useExpress } from "@/store/express";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listAddresses: jest.fn(async () => []),
}));

it("keeps today's three steps where the API has no printer choice", async () => {
  await renderScreen(<ExpressStepBar step="pay" canGo={() => true} onStep={jest.fn()} withPrinter={false} />);
  expect(screen.queryByLabelText("Printer")).toBeNull();
  expect(screen.getByLabelText("Pay")).toBeTruthy();
});

// The one press in this file goes last.
it("Verified only filters the list", async () => {
  seedWhoPrints();
  await renderScreen(<PrinterStep />);
  fireEvent.press(screen.getByLabelText("Verified only"));
  await waitFor(() => expect(useExpress.getState().verifiedOnly).toBe(true));
});
