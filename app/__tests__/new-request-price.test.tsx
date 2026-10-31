import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NewRequestScreen from "@/app/(tabs)/new-request";
import { usePlatformSettings } from "@/store/platformSettings";
import { useRequestDraft } from "@/store/requestDraft";
import { expectNoServiceFee, setServiceFeeSwitch } from "@/test/serviceFeeSwitch";

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

/**
 * The retained draft quotes the catalog's rate, which is the shop's. A client
 * reads GRIDGO's figure everywhere, so the draft draws it through GridgoPrice:
 * the same ₱5.50 the listing sheet shows for a ₱5.00 rate at 10%.
 */
describe("NewRequestScreen prices", () => {
  beforeEach(() => {
    api.getTaxonomy.mockResolvedValue(taxonomy);
    api.listZones.mockResolvedValue(zones);
    useRequestDraft.setState({
      stepIndex: 0,
      productId: "qa_flyers",
      productName: "Flyers",
      basePriceMinor: 500,
      unit: "piece",
      family: "flyer",
      title: "Flyers",
      size: "",
      material: "",
      finish: "",
      quantity: 100,
      deadline: "",
      addressLine1: "",
      barangay: "",
      landmark: "",
      zone: "davao_central",
      artworkFileId: "",
      artworkName: "",
    });
  });

  it("quotes GRIDGO's price on Details, never the shop's rate", async () => {
    setServiceFeeSwitch(false);
    await renderInSafeArea(<NewRequestScreen />);
    await waitFor(() => expect(api.listZones).toHaveBeenCalled());

    expect(screen.getByText("From ₱5.50 each")).toBeTruthy();
    expect(screen.queryByText(/₱5\.00/)).toBeNull();
    expectNoServiceFee(screen);
  });

  it("waits on a skeleton while the rate is unknown", async () => {
    usePlatformSettings.setState({ settings: null });
    await renderInSafeArea(<NewRequestScreen />);
    await waitFor(() => expect(api.listZones).toHaveBeenCalled());

    expect(screen.getByLabelText("Price loading")).toBeTruthy();
    expect(screen.queryByText(/₱5\.00/)).toBeNull();
  });

  it("quotes the same figure on Send", async () => {
    setServiceFeeSwitch(false);
    useRequestDraft.setState({ stepIndex: 3 });
    await renderInSafeArea(<NewRequestScreen />);

    expect(await screen.findByText("₱5.50 each")).toBeTruthy();
    expect(screen.queryByText(/₱5\.00/)).toBeNull();
    // Send states the payment split as percentages, so the fee check here is
    // the wording alone.
    expect(screen.queryAllByText(/service fee/i)).toHaveLength(0);
  });
});
