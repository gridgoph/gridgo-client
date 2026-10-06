import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import BusinessApplyScreen from "@/app/business-apply";
import { useClientApplication } from "@/store/clientApplication";
import { useSession } from "@/store/session";

const mockParams: { mode?: string } = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getApplicationChecklist: jest.fn(async () => ({ businessPermitRequired: false })) };
});

const CLIENT = {
  id: "u1",
  email: "pta@school.edu.ph",
  name: "Ana Reyes",
  role: "client" as const,
  phone: "+639171234567",
  accountType: "individual" as const,
  version: 3,
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
  Render-only. The steps themselves — what each checks, what is sent, how a
  refusal lands — are asserted against `store/clientApplication.ts` and
  `lib/clientApplication.ts`, because this stack empties every later render in
  a file once a press drives an async store update (see AGENTS.md).
*/
describe("the account application", () => {
  beforeEach(() => {
    delete mockParams.mode;
    useClientApplication.getState().reset();
    useSession.setState({ user: CLIENT, source: "clerk", loading: false, error: null });
  });

  it("opens on the two tracks, organization first, with the steps numbered", async () => {
    await renderInSafeArea(<BusinessApplyScreen />);

    expect(screen.getByText("Who is this account for?")).toBeTruthy();
    expect(screen.getByLabelText("Organization")).toBeTruthy();
    expect(screen.getByLabelText("Business")).toBeTruthy();
    expect(screen.getByLabelText("School")).toBeTruthy();
    expect(screen.getByLabelText("Step 4: Email")).toBeTruthy();
    expect(screen.getByLabelText("Step 5: Send")).toBeTruthy();
  });

  it("shows a pending application as with Operations, with a way to resend it complete", async () => {
    useSession.setState({
      user: {
        ...CLIENT,
        approvalCase: { id: "apc_1", kind: "business_client", status: "pending", version: 1 },
      },
    });
    await renderInSafeArea(<BusinessApplyScreen />);

    expect(screen.getByText("Application sent")).toBeTruthy();
    expect(screen.getByText("Open the application")).toBeTruthy();
  });

  it("verifies an approved organization's first officer without asking which track", async () => {
    mockParams.mode = "first_officer";
    useSession.setState({
      user: {
        ...CLIENT,
        accountType: "organization",
        orgName: "Grade 10 PTA",
        approvalCase: { id: "apc_1", kind: "business_client", status: "approved", version: 4 },
      },
    });
    await renderInSafeArea(<BusinessApplyScreen />);

    expect(screen.getByText("Confirm your organization")).toBeTruthy();
    expect(screen.queryByLabelText("Business")).toBeNull();
    expect(useClientApplication.getState().expectedVersion).toBe(4);
  });
  // Last in the file: moving the step from outside React spends the render budget.
  it("lists every required document for the track, with who can see them", async () => {
    await renderInSafeArea(<BusinessApplyScreen />);
    useClientApplication.setState({ index: 2 });

    expect(await screen.findByText("Add your documents")).toBeTruthy();
    expect(screen.getByText("0 of 3 required added")).toBeTruthy();
    expect(screen.getByText("Primary government ID")).toBeTruthy();
    expect(screen.getByText("Student ID")).toBeTruthy();
    expect(screen.getByText("Proof of enrolment")).toBeTruthy();
    expect(screen.getByText("School recognition certificate")).toBeTruthy();
    expect(screen.getByText(/Only GRIDGO Operations can open these files/)).toBeTruthy();
  });

});
