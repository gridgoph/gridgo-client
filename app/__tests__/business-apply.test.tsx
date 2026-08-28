import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import BusinessApplyScreen from "@/app/business-apply";
import { useBusinessApply } from "@/store/businessApply";
import { useSession } from "@/store/session";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: (...args: unknown[]) => mockBack(...args), push: jest.fn() },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, applyAsBusiness: jest.fn(), listAddresses: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const CLIENT = {
  id: "u1",
  email: "ana@bautista.ph",
  name: "Ana Bautista",
  role: "client" as const,
  phone: "+639171234567",
  accountType: "individual" as const,
  version: 3,
};

const ADDRESS = {
  id: "addr_1",
  label: "Office",
  addressLine: "12 Quimpo Blvd, Talomo",
  point: { lat: 7.07, lng: 125.61, label: "12 Quimpo Blvd, Talomo" },
  isDefault: false,
  version: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

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

/*
  One test in this file, and deliberately so: the submission drives an async
  update into two stores outside React, and this project's stack leaves every
  later render in the same file empty once that has happened (see AGENTS.md).
  The refusal paths are asserted against `lib/accountProfile.ts` directly.
*/
describe("applying as a business", () => {
  beforeEach(() => {
    mockBack.mockClear();
    api.applyAsBusiness.mockReset();
    api.listAddresses.mockReset();
    api.listAddresses.mockResolvedValue([ADDRESS]);
    useBusinessApply.getState().reset();
    useSession.setState({ user: CLIENT, source: "clerk", loading: false, error: null });
  });

  it("walks the steps, sends what GRIDGO asked for, and lands back on Account", async () => {
    api.applyAsBusiness.mockResolvedValue({
      ...CLIENT,
      accountType: "business",
      orgName: "Bautista Trading",
      version: 4,
    });

    await renderInSafeArea(<BusinessApplyScreen />);

    // Step 1 — the business name. Contact is skipped: GRIDGO already holds a
    // name and a number, and retyping them is friction, not diligence.
    expect(screen.getByText("What is the business called?")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Business name"), "Bautista Trading");
    await waitFor(() =>
      expect(screen.getByLabelText("Business name").props.value).toBe("Bautista Trading"),
    );
    fireEvent.press(screen.getByText("Continue"));

    // Step 2 — where orders go, chosen from what is already saved.
    await waitFor(() => expect(screen.getByText("Where do orders go?")).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText("Send orders to Office")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Send orders to Office"));
    fireEvent.press(screen.getByText("Continue"));

    // Step 3 — every answer shown back before anything is written.
    await waitFor(() => expect(screen.getByText("Is this right?")).toBeTruthy());
    expect(screen.getByText("Bautista Trading")).toBeTruthy();
    expect(screen.getByText("Office")).toBeTruthy();
    expect(screen.getByText("ana@bautista.ph")).toBeTruthy();

    // The primary action carries its verb as its label, not an aria name.
    fireEvent.press(screen.getByText("Apply as a business"));

    await waitFor(() => expect(api.applyAsBusiness).toHaveBeenCalled());
    expect(api.applyAsBusiness).toHaveBeenCalledWith({
      businessName: "Bautista Trading",
      contactName: "Ana Bautista",
      contactPhone: "+639171234567",
      address: {
        label: "Office",
        addressLine: "12 Quimpo Blvd, Talomo",
        point: { lat: 7.07, lng: 125.61 },
        isDefault: true,
      },
    });

    // The session carries GRIDGO's answer, never the app's guess at it, so the
    // identity card is a business the moment the client is back on it.
    await waitFor(() => expect(useSession.getState().user?.accountType).toBe("business"));
    expect(useSession.getState().user?.orgName).toBe("Bautista Trading");
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
