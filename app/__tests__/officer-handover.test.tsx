import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OfficerHandoverScreen from "@/app/officer-handover";
import type { ClientOrganization } from "@/lib/api";
import { useClientApplication } from "@/store/clientApplication";
import { useOrganization } from "@/store/organization";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getApplicationChecklist: jest.fn(async () => ({ businessPermitRequired: false })) };
});

const ORGANIZATION: ClientOrganization = {
  userId: "u1",
  name: "Grade 10 PTA",
  school: "DCNHS",
  email: "pta@school.edu.ph",
  currentOfficer: { id: "officer_1", fullName: "Ana Reyes", verifiedAt: "2026-07-01T00:00:00Z" },
  confirmedAt: null,
  nextConfirmationAt: null,
  confirmationRequestedAt: null,
  approvalCase: { id: "apc_1", status: "approved", version: 7 },
  actions: [],
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

it("starts at the new officer and says the current one stays until Operations approves", async () => {
  useSession.setState({
    user: { id: "u1", email: "pta@school.edu.ph", name: "Ana Reyes", role: "client", accountType: "organization" },
    source: "clerk",
    loading: false,
    error: null,
  });
  useOrganization.setState({ organization: ORGANIZATION, ownerId: "u1", status: "ready" });
  useClientApplication.getState().reset();

  await renderInSafeArea(<OfficerHandoverScreen />);

  expect(screen.getByText("Who is the new officer?")).toBeTruthy();
  expect(screen.getByText(/Ana Reyes stays the officer of record until Operations approves them/)).toBeTruthy();
  // A new person: nothing of the current officer is filled in.
  expect(screen.getByLabelText("Full name").props.value).toBe("");
  expect(useClientApplication.getState().expectedVersion).toBe(7);
});
