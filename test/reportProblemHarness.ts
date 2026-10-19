import { fireEvent, screen, waitFor } from "@testing-library/react-native";

/** Shared set-up for Report a problem's screenshot tests, which are split one press per file. */

export const REPORT_THREAD_ID = "2c1b0a9e-8d7c-4b3a-9f10-1234567890ab";

export const REPORT_DEVICE = {
  app: "GRIDGO Client 1.0.42",
  phone: "Samsung SM-A546E",
  system: "Android 14",
};

export const REPORT_TEXT = "I tapped Pay and the screen went blank.";

/** A picked screenshot as the document picker returns it. */
export function pickedShot(name: string) {
  return { uri: `file:///cache/${name}`, name, mimeType: "image/png", size: 2048 };
}

export function pickerReturns(getDocumentAsync: jest.Mock, names: string[]) {
  getDocumentAsync.mockResolvedValue({ canceled: false, assets: names.map(pickedShot) });
}

/** Types what happened and waits until the form holds it. */
export async function writeReport() {
  fireEvent.changeText(screen.getByLabelText("What happened"), REPORT_TEXT);
  await waitFor(() => expect(screen.getByLabelText("What happened").props.value).toBe(REPORT_TEXT));
}
