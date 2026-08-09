import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NewRequestScreen from "@/app/(tabs)/new-request";
import { useRequestDraft } from "@/store/requestDraft";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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
});
