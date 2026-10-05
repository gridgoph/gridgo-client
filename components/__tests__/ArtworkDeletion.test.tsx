import { fireEvent, render, screen } from "@testing-library/react-native";

import { ArtworkPanel } from "@/components/ArtworkPanel";
import { ARTWORK_RETENTION_NOTE } from "@/lib/artworkDeletion";
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

beforeEach(() => {
  jest.clearAllMocks();
  useArtworkDeletion.setState({ byOrder: {} });
  api.getFile.mockResolvedValue(storedArtwork());
  api.listIssues.mockResolvedValue([]);
  api.deleteFile.mockReset();
});

it("offers Delete my artwork on a completed job, under the retention line", async () => {
  await render(<ArtworkPanel order={artworkOrder()} refunds={[]} />);

  const button = await screen.findByLabelText("Delete my artwork");
  expect(screen.getByText(ARTWORK_RETENTION_NOTE)).toBeTruthy();
  expect(screen.getByText(/30 days after a job is completed/)).toBeTruthy();
  expect(button.props.accessibilityState).toEqual({ disabled: false });
  expect(api.deleteFile).not.toHaveBeenCalled();
});

it("says when it can be deleted on a job still in progress, without a button or the retention line", async () => {
  await render(<ArtworkPanel order={artworkOrder({ state: "production" })} refunds={[]} />);

  expect(await screen.findByText("flyer-front.pdf")).toBeTruthy();
  expect(screen.getByText("You can delete your artwork once this job is completed.")).toBeTruthy();
  expect(screen.queryByLabelText("Delete my artwork")).toBeNull();
  expect(screen.queryByText(ARTWORK_RETENTION_NOTE)).toBeNull();
  expect(api.listIssues).not.toHaveBeenCalled();
});

it("keeps the button but disables it, with the reason, while a problem report is open", async () => {
  api.listIssues.mockResolvedValue([{ status: "open" }]);
  await render(<ArtworkPanel order={artworkOrder()} refunds={[]} />);

  expect(await screen.findByText(/A problem report is open on this job/)).toBeTruthy();
  expect(screen.getByLabelText("Delete my artwork").props.accessibilityState).toEqual({ disabled: true });
  expect(api.listIssues).toHaveBeenCalledWith("ord_art_1");
});

it("disables it while a refund request is open", async () => {
  await render(<ArtworkPanel order={artworkOrder({ refundHold: true })} refunds={[]} />);

  expect(await screen.findByText(/A refund request is open on this job/)).toBeTruthy();
  expect(screen.getByLabelText("Delete my artwork").props.accessibilityState).toEqual({ disabled: true });
});

it("offers nothing for a file GRIDGO added, which only GRIDGO can remove", async () => {
  api.getFile.mockResolvedValue(storedArtwork({ ownerId: "user_ops" }));
  await render(<ArtworkPanel order={artworkOrder()} refunds={[]} />);

  expect(await screen.findByLabelText(/^Open flyer-front\.pdf/)).toBeTruthy();
  expect(screen.getByText(ARTWORK_RETENTION_NOTE)).toBeTruthy();
  expect(screen.queryByLabelText("Delete my artwork")).toBeNull();
});

it("draws an already deleted file as deleted, with nothing to open or delete", async () => {
  api.getFile.mockResolvedValue(storedArtwork({ state: "deleted", deletedAt: "2026-10-03T02:00:00Z" }));
  await render(<ArtworkPanel order={artworkOrder()} refunds={[]} />);

  expect(await screen.findByText(/^Artwork · Deleted .*3.*2026$/)).toBeTruthy();
  expect(screen.getByText("Your artwork is deleted. To reorder this job, upload it again.")).toBeTruthy();
  expect(screen.queryByLabelText(/^Open flyer-front\.pdf/)).toBeNull();
  expect(screen.queryByLabelText("Delete my artwork")).toBeNull();
  expect(api.getFileDownloadUrl).not.toHaveBeenCalled();
});

// One press, so this test stays last in the file (see AGENTS.md, testing).
it("asks first, saying it cannot be undone and that a reorder needs the file again", async () => {
  await render(<ArtworkPanel order={artworkOrder()} refunds={[]} />);

  fireEvent.press(await screen.findByLabelText("Delete my artwork"));

  expect(await screen.findByText("Delete your artwork for Trade fair flyers?")).toBeTruthy();
  expect(screen.getByText(/This cannot be undone\./)).toBeTruthy();
  expect(screen.getByText(/To reorder this job, you will need to upload the file again\./)).toBeTruthy();
  expect(screen.getByText("Keep it")).toBeTruthy();
  // Asking is not deleting.
  expect(api.deleteFile).not.toHaveBeenCalled();
});
