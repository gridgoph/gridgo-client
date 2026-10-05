import { fireEvent, render, screen } from "@testing-library/react-native";

import { ArtworkPanel } from "@/components/ArtworkPanel";
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

it("deletes the client's file, then reads it again and shows it deleted", async () => {
  const deleted = storedArtwork({ state: "deleted", deletedAt: "2026-10-04T03:00:00Z" });
  api.getFile.mockResolvedValueOnce(storedArtwork()).mockResolvedValue(deleted);
  api.deleteFile.mockResolvedValue(deleted);
  useArtworkDeletion.setState({ byOrder: { ord_art_1: { phase: "confirming", result: null, version: 0 } } });
  await render(<ArtworkPanel order={artworkOrder()} refunds={[]} />);
  await screen.findByLabelText("Delete my artwork");

  fireEvent.press(screen.getByLabelText("Delete artwork"));

  expect(await screen.findByText(/^Artwork · Deleted .*4.*2026$/)).toBeTruthy();
  expect(screen.getByText("Your artwork is deleted. To reorder this job, upload it again.")).toBeTruthy();
  expect(api.deleteFile).toHaveBeenCalledTimes(1);
  expect(api.deleteFile).toHaveBeenCalledWith("file_art");
  expect(screen.queryByLabelText("Delete my artwork")).toBeNull();
});
