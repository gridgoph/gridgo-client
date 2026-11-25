import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import JoinOrgScreen from "@/app/my-orgs/join";
import type { QrPictureReaderProps } from "@/components/QrPictureReader";
import { JOIN_TOKEN } from "@/test/membershipFixtures";
import { renderScreen } from "@/test/renderScreen";

let mockReader: QrPictureReaderProps | null = null;
jest.mock("expo-router", () => {
  const router = { push: jest.fn() };
  return { useRouter: () => router };
});
jest.mock("@/components/QrPictureReader", () => ({
  QrPictureReader: (props: QrPictureReaderProps) => {
    mockReader = props;
    return null;
  },
}));
jest.mock("@/lib/pickImage", () => ({ pickImage: jest.fn(async () => ({ asset: { uri: "file:///qr.png", name: "qr.png" } })) }));
jest.mock("@/lib/receiptOcrRecognize", () => ({ imageUriToDataUrl: jest.fn(async () => "data:image/png;base64,QR") }));

it("reads the QR in a picture and opens its invite as a QR join", async () => {
  await renderScreen(<JoinOrgScreen />);
  fireEvent.press(screen.getByText("Choose a picture of the QR"));
  await waitFor(() => expect(mockReader?.dataUrl).toBe("data:image/png;base64,QR"));
  await act(async () => mockReader!.onResult({ type: "result", text: `gridgoclient://join/${JOIN_TOKEN}` }));
  expect(useRouter().push).toHaveBeenCalledWith({ pathname: "/join/[token]", params: { token: JOIN_TOKEN, source: "qr" } });
});
