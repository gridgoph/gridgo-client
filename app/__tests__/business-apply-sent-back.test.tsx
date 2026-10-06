import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import BusinessApplyScreen from "@/app/business-apply";
import { useClientApplication } from "@/store/clientApplication";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getApplicationChecklist: jest.fn(async () => ({ businessPermitRequired: false })),
    getClientApplication: jest.fn(async () => ({
      approvalCase: { id: "apc_1", status: "rejected", version: 2, applicationRevision: 1 },
      application: {
        accountType: "organization",
        businessName: "Grade 10 PTA",
        businessNature: "Parents' association",
        school: "Davao City National High School",
        organizationEmail: "pta@school.edu.ph",
        handover: false,
        officer: {
          fullName: "Ana Reyes",
          dateOfBirth: "2004-03-15",
          address: "Bajada, Davao City",
          phone: "0917 123 4567",
          governmentIdType: "passport",
          governmentIdExpiresOn: "2031-01-01",
          studentIdExpiresOn: "2030-05-31",
        },
        documents: {
          government_id: { fileId: "file_gov", name: "passport.jpg" },
          student_id: { fileId: "file_student", name: "student-id.jpg" },
          enrollment_document: { fileId: "file_enrol", name: "cor.pdf" },
          school_recognition_certificate: { fileId: "file_recog", name: "recognition.jpg" },
        },
      },
      sentBack: {
        reason: "Please upload these again:\n- School recognition certificate: Does not look right",
        documents: [
          { key: "school_recognition_certificate", label: "School recognition certificate", note: "Does not look right" },
        ],
      },
    })),
  };
});

/*
  Render-only (see business-apply.test.tsx): the read-back, the flagged
  document and the resend are asserted against the store and lib.
*/
it("reopens a sent-back application on the document asked for again, with the rest kept", async () => {
  useClientApplication.getState().reset();
  useSession.setState({
    user: {
      id: "u1",
      email: "pta@school.edu.ph",
      name: "Ana Reyes",
      role: "client",
      accountType: "individual",
      version: 3,
      approvalCase: {
        id: "apc_1",
        kind: "business_client",
        status: "rejected",
        version: 2,
        rejectionReason: "Please upload these again:\n- School recognition certificate: Does not look right",
      },
    },
    source: "clerk",
    loading: false,
    error: null,
  });
  await render(<BusinessApplyScreen />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });

  expect(await screen.findByText("Upload the document again")).toBeTruthy();
  expect(screen.getByText("Not approved")).toBeTruthy();
  expect(screen.getByText("Operations asked for one document again")).toBeTruthy();
  expect(screen.getByText(/Everything else you sent is kept and filled in/)).toBeTruthy();
  expect(screen.getByText("Sent back")).toBeTruthy();
  expect(screen.getByText("Operations: Does not look right")).toBeTruthy();
  expect(screen.getByText("Sent before: recognition.jpg")).toBeTruthy();
  expect(screen.getByLabelText("Upload School recognition certificate again")).toBeTruthy();
  expect(screen.getAllByText("Kept")).toHaveLength(3);
  expect(screen.getByText("passport.jpg · sent before")).toBeTruthy();
  // Sent back, the optional certificate counts until it is replaced.
  expect(screen.getByText("3 of 4 required added")).toBeTruthy();
  // It leads the list, straight under Operations' words.
  const rows = screen.getAllByTestId(/^document-/).map((row) => row.props.testID);
  expect(rows[0]).toBe("document-school_recognition_certificate");
});
