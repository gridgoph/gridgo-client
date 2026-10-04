import { fireEvent, render, screen } from "@testing-library/react-native";

import { ArtworkPanel } from "@/components/ArtworkPanel";
import { ApiError } from "@/lib/api";
import { useArtworkDeletion } from "@/store/artworkDeletion";
import { artworkOrder, storedArtwork } from "@/test/artworkFixtures";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getFile: jest.fn(),
    getFileDownloadUrl: jest.fn(),
    listIssues: jest.fn(async () => []),
    deleteFile: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("words a hold the client could not see, and keeps the file and the button", async () => {
  api.getFile.mockResolvedValue(storedArtwork());
  api.deleteFile.mockRejectedValue(new ApiError(409, { error: "file_retention_hold" }));
  useArtworkDeletion.setState({ byOrder: { ord_art_1: { phase: "confirming", result: null, version: 0 } } });
  await render(<ArtworkPanel order={artworkOrder()} refunds={[]} />);
  await screen.findByLabelText("Delete my artwork");

  fireEvent.press(screen.getByLabelText("Delete artwork"));

  expect(await screen.findByText(/Something is still open on this job/)).toBeTruthy();
  expect(screen.queryByText(/file_retention_hold/)).toBeNull();
  expect(api.deleteFile).toHaveBeenCalledWith("file_art");
  expect(await screen.findByLabelText(/^Open flyer-front\.pdf/)).toBeTruthy();
  expect(screen.getByLabelText("Delete my artwork")).toBeTruthy();
});
