import { screen } from "@testing-library/react-native";

import LegalReviewScreen from "@/app/legal/review";
import type { LegalVersion } from "@/lib/api";
import { useLegalConsent } from "@/store/legalConsent";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const version = (documentId: string, title: string, n: number): LegalVersion => ({
  id: `${documentId}-${n}`,
  documentId,
  version: n,
  title,
  audience: "all",
  text: "Text",
  effectiveAt: "2026-10-01T00:00:00.000Z",
  placeholder: n === 1,
  material: n > 1,
  status: n === 1 ? "placeholder" : "live",
  changeSummary: n > 1 ? "Clearer delivery terms" : "Launch placeholder",
});

/**
 * One render, no presses (see AGENTS.md on this test stack): what a client
 * meets is the documents, what changed, an unticked box, a button that will
 * not go yet, and the two ways out that never wait on it.
 */
it("opens on the changed documents with an unticked box and sign-out still open", async () => {
  useLegalConsent.setState({
    userId: "user_1",
    status: "blocked",
    pending: [version("terms-of-service", "Terms of Service", 2), version("privacy-notice", "Privacy Notice", 1)],
    notices: [version("cookie-notice", "Cookie Notice", 1)],
    accepting: false,
    error: null,
  });
  await renderScreen(<LegalReviewScreen />);

  expect(screen.getByText("GRIDGO's terms have changed")).toBeTruthy();
  expect(screen.getByText("Clearer delivery terms")).toBeTruthy();
  expect(screen.getByLabelText("Read the Cookie Notice")).toBeTruthy();

  const box = screen.getByRole("checkbox", {
    name: "I have read and agree to the Terms of Service and Privacy Notice",
  });
  expect(box.props.accessibilityState.checked).toBe(false);
  expect(screen.getByRole("button", { name: "Agree and continue" }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Sign out" }).props.accessibilityState.disabled).toBe(false);
  expect(screen.getByRole("button", { name: "Your data" })).toBeTruthy();
});
