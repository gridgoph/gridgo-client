import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrganizationsScreen from "@/app/(tabs)/organizations";
import type { ClientOrganization, User } from "@/lib/api";
import { useOrganization } from "@/store/organization";
import { useSession } from "@/store/session";
import { useStatements } from "@/store/statements";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrganization: jest.fn(),
    getOrganizationStatement: jest.fn(),
    confirmOrganizationOfficer: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ORG_USER: User = {
  id: "u_org",
  email: "pta@school.edu.ph",
  name: "Ana Reyes",
  role: "client",
  accountType: "organization",
  approvalCase: { id: "apc_1", kind: "business_client", status: "approved", version: 3 },
};

const DUE: ClientOrganization = {
  userId: "u_org",
  name: "Grade 10 PTA",
  school: "DCNHS",
  email: "pta@school.edu.ph",
  currentOfficer: { id: "officer_1", fullName: "Ana Reyes", verifiedAt: "2026-07-01T02:00:00Z" },
  confirmedAt: null,
  nextConfirmationAt: "2027-01-01T02:00:00Z",
  confirmationRequestedAt: "2026-10-01T02:00:00Z",
  approvalCase: { id: "apc_1", status: "approved", version: 3 },
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

/* One press in this file (see AGENTS.md on RNTL 14). */
it("confirms the officer in one tap and says so", async () => {
  useSession.setState({ user: ORG_USER, source: "clerk", loading: false, error: null, signingOut: false });
  useOrganization.getState().reset();
  useStatements.getState().reset();
  api.getOrganization.mockResolvedValue(DUE);
  api.getOrganizationStatement.mockReturnValue(new Promise(() => undefined));
  api.confirmOrganizationOfficer.mockResolvedValue({ ...DUE, confirmationRequestedAt: null });

  await renderInSafeArea(<OrganizationsScreen />);
  fireEvent.press(await screen.findByText("Confirm Ana Reyes is still the officer"));

  expect(api.confirmOrganizationOfficer).toHaveBeenCalledWith("officer_1");
  expect(await screen.findByText("Ana Reyes confirmed")).toBeTruthy();
  expect(screen.queryByText("Is Ana Reyes still your officer?")).toBeNull();
});
