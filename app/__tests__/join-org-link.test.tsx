import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import JoinOrgScreen from "@/app/my-orgs/join";
import { JOIN_TOKEN } from "@/test/membershipFixtures";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => {
  const router = { push: jest.fn(), replace: jest.fn() };
  return { useRouter: () => router };
});

it("offers the camera, a picture of the QR and the link, with the privacy line", async () => {
  await renderScreen(<JoinOrgScreen />);
  expect(screen.getByText("Scan your org’s QR")).toBeTruthy();
  expect(screen.getByText("Choose a picture of the QR")).toBeTruthy();
  expect(screen.getByLabelText("Invite link")).toBeTruthy();
  expect(screen.getByText(/Never what you printed/)).toBeTruthy();
});

// A changeText and a press, last in the file.
it("opens the invite a pasted message carries", async () => {
  await renderScreen(<JoinOrgScreen />);
  await fireEvent.changeText(screen.getByLabelText("Invite link"), `Join us! gridgoclient://join/${JOIN_TOKEN}`);
  await waitFor(() => expect(screen.getByLabelText("Invite link").props.value).toContain(JOIN_TOKEN));
  fireEvent.press(screen.getByText("Continue"));
  await waitFor(() =>
    expect(useRouter().push).toHaveBeenCalledWith({ pathname: "/join/[token]", params: { token: JOIN_TOKEN, source: "link" } }),
  );
});
