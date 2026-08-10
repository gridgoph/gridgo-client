import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NewRequestScreen from "@/app/(tabs)/new-request";
import { useRequestDraft } from "@/store/requestDraft";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
  }),
  useFocusEffect: (effect: () => void) => {
    // Required inside the factory: jest.mock is hoisted above imports.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

const taxonomy = {
  categories: [
    {
      id: "taxc_large_format",
      code: "large_format",
      name: "Large format",
      productFamilyIds: ["banner"],
      active: true,
    },
  ],
  materials: [
    {
      id: "taxm_13oz",
      code: "tarpaulin_13oz",
      name: "13oz tarpaulin",
      categoryCodes: ["large_format"],
      active: true,
    },
  ],
  finishes: [
    {
      id: "taxf_hem",
      code: "hem_grommet",
      name: "Hem + grommets",
      categoryCodes: ["large_format"],
      active: true,
    },
  ],
};

const zones = [
  {
    id: "zone_central",
    code: "davao_central",
    name: "Davao Central (Bajada / JP Laurel)",
    deliveryFeeMinor: 15100,
    active: true,
  },
];

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getTaxonomy: jest.fn(),
    listZones: jest.fn(),
    createOrder: jest.fn(),
    transitionOrder: jest.fn(),
    attachFileToOrder: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

describe("NewRequestScreen", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockNavigate.mockClear();
    // Reset, not clear: a `…Once` rejection queued by one test must not carry.
    api.createOrder.mockReset();
    api.attachFileToOrder.mockReset();
    api.transitionOrder.mockReset();
    api.getTaxonomy.mockResolvedValue(taxonomy);
    api.listZones.mockResolvedValue(zones);
    useRequestDraft.setState({
      stepIndex: 0,
      productId: "prod_tarpaulin",
      productName: "Tarpaulin / Banner",
      basePriceMinor: 45000,
      unit: "sqm",
      family: "banner",
      title: "Grand opening tarpaulin",
      size: "",
      material: "",
      finish: "",
      quantity: 1,
      deadline: "",
      addressLine1: "",
      barangay: "",
      landmark: "",
      zone: "davao_central",
      artworkFileId: "",
      artworkName: "",
    });
  });

  it("collects the deadline, material and area through controls, not text boxes", async () => {
    await renderInSafeArea(<NewRequestScreen />);

    // Values the platform defines are chosen, and say so before they are used.
    await waitFor(() => expect(api.getTaxonomy).toHaveBeenCalled());
    expect(screen.getByLabelText("Material")).toBeTruthy();
    expect(screen.getByLabelText("Size")).toBeTruthy();
    expect(screen.getByLabelText("Deadline")).toBeTruthy();
    expect(screen.getByLabelText("Delivery area")).toBeTruthy();
    expect(screen.getByLabelText("Increase quantity")).toBeTruthy();

    // The deadline is never a typed string.
    expect(screen.queryByPlaceholderText(/15 Aug 2026/)).toBeNull();
  });

  it("blocks the step with a reason rather than a silent disabled button", async () => {
    await renderInSafeArea(<NewRequestScreen />);
    await waitFor(() => expect(api.listZones).toHaveBeenCalled());

    fireEvent.press(screen.getByText("Continue"));

    expect(await screen.findByText(/Choose a size/i)).toBeTruthy();
  });

  it("shows an honest failure when the platform's option lists cannot load", async () => {
    api.getTaxonomy.mockRejectedValue(new Error("Network request failed"));
    await renderInSafeArea(<NewRequestScreen />);

    expect(await screen.findByText(/Cannot reach the server/i)).toBeTruthy();
  });

  it("makes choosing a file the one yellow action on the artwork step", async () => {
    useRequestDraft.setState({ stepIndex: 1 });
    await renderInSafeArea(<NewRequestScreen />);

    expect(await screen.findByText("Choose artwork file")).toBeTruthy();
    expect(screen.queryByText("Continue")).toBeNull();
  });

  it("adopts an uploaded file that arrives when the draft rehydrates", async () => {
    // The persisted draft comes back from storage after the first render, so a
    // file uploaded before the app was killed has to be picked up when it lands.
    useRequestDraft.setState({ stepIndex: 1 });
    await renderInSafeArea(<NewRequestScreen />);
    expect(await screen.findByText("Choose artwork file")).toBeTruthy();

    await act(async () => {
      useRequestDraft.setState({
        artworkFileId: "file_abc123",
        artworkName: "opening-banner.pdf",
      });
    });

    // Named on the upload card, and again on the preview it now unlocks.
    expect((await screen.findAllByText("opening-banner.pdf")).length).toBeGreaterThan(0);
    expect(screen.getByText("Continue")).toBeTruthy();
    expect(screen.queryByText("Choose artwork file")).toBeNull();
  });

  it("reads the review step as a summary, not the raw stored strings", async () => {
    useRequestDraft.setState({
      stepIndex: 2,
      size: "3x6 ft",
      material: "13oz tarpaulin",
      quantity: 4,
      deadline: "2026-08-15T02:00:00.000Z",
      addressLine1: "12 J.P. Laurel Ave",
      barangay: "Bajada",
      landmark: "beside the blue gate",
      artworkFileId: "file_abc123",
      artworkName: "opening-banner.pdf",
    });
    await renderInSafeArea(<NewRequestScreen />);

    // Sizes, quantities, deadlines and addresses read back as facts.
    expect(await screen.findByText("3 × 6 ft")).toBeTruthy();
    expect(screen.getByText("4 sqm")).toBeTruthy();
    // Formatted for a reader — the exact wording is the device locale's.
    expect(screen.getByText(/Aug.*2026 · /)).toBeTruthy();
    expect(
      screen.getByText("12 J.P. Laurel Ave, Bajada, Davao City (beside the blue gate)"),
    ).toBeTruthy();
    expect(screen.getByText("Davao Central (Bajada / JP Laurel)")).toBeTruthy();
    // Never the raw instant the order actually stores.
    expect(screen.queryByText(/2026-08-15T/)).toBeNull();
  });

  describe("sending the request", () => {
    /** A complete draft sitting on the last step, ready to send. */
    function readyToSend() {
      useRequestDraft.setState({
        stepIndex: 3,
        size: "3x6 ft",
        material: "13oz tarpaulin",
        quantity: 2,
        deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        addressLine1: "12 J.P. Laurel Ave",
        barangay: "Bajada",
        artworkFileId: "file_abc123",
        artworkName: "opening-banner.pdf",
      });
      api.createOrder.mockResolvedValue({ id: "ord_new_1" });
      api.attachFileToOrder.mockResolvedValue({
        order: { id: "ord_new_1" },
        file: { originalFilename: "opening-banner.pdf" },
      });
      api.transitionOrder.mockResolvedValue({ id: "ord_new_1", state: "submitted" });
    }

    it("leaves the tab shell under the job it just sent", async () => {
      // `replace` targeted the root stack, whose only entry is the tab shell,
      // so it swapped the tabs for the order: no tab bar, no back control.
      readyToSend();
      await renderInSafeArea(<NewRequestScreen />);

      fireEvent.press(await screen.findByText("Send request"));

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/order/ord_new_1"));
      expect(mockNavigate).toHaveBeenCalledWith("/(tabs)/orders");
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("names the step it is on instead of one frozen 'Sending…'", async () => {
      readyToSend();
      // Hold the attach open so the middle phase is observable — it is the one
      // that actually takes time on a mobile connection.
      let releaseAttach = () => {};
      api.attachFileToOrder.mockReturnValue(
        new Promise((resolve) => {
          releaseAttach = () =>
            resolve({
              order: { id: "ord_new_1" },
              file: { originalFilename: "opening-banner.pdf" },
            });
        }),
      );
      await renderInSafeArea(<NewRequestScreen />);

      fireEvent.press(await screen.findByText("Send request"));

      expect(await screen.findByText("Attaching your artwork")).toBeTruthy();

      await act(async () => {
        releaseAttach();
      });

      await waitFor(() => expect(mockPush).toHaveBeenCalled());
    });

    it("resumes a failed send on the same job rather than creating a second one", async () => {
      readyToSend();
      api.transitionOrder.mockRejectedValueOnce(new Error("Network request failed"));
      await renderInSafeArea(<NewRequestScreen />);

      fireEvent.press(await screen.findByText("Send request"));
      expect(await screen.findByText("Not sent")).toBeTruthy();

      api.transitionOrder.mockResolvedValue({ id: "ord_new_1", state: "submitted" });
      fireEvent.press(screen.getByText("Send request"));

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/order/ord_new_1"));
      expect(api.createOrder).toHaveBeenCalledTimes(1);
      expect(api.attachFileToOrder).toHaveBeenCalledTimes(1);
    });
  });
});
