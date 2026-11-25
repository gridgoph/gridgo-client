import { fireEvent, screen } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import JoinOrgScreen from "@/app/my-orgs/join";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => {
  const router = { push: jest.fn() };
  return { useRouter: () => router };
});

it("says what is missing beside the field and goes nowhere", async () => {
  await renderScreen(<JoinOrgScreen />);
  fireEvent.press(screen.getByText("Continue"));
  expect(await screen.findByText("Paste the link your officer sent.")).toBeTruthy();
  expect(useRouter().push).not.toHaveBeenCalled();
});
