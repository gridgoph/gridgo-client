import { failedUpload, storedFileIds, writeSlot, type ImageUpload } from "@/lib/imageUpload";
import { checkProblemPhotos, issueDecisionView, MAX_PROBLEM_PHOTOS } from "@/lib/issueWindow";

const slot = (key: string, phase: ImageUpload["phase"], fileId: string | null = null): ImageUpload => ({
  key, phase, fileName: `${key}.jpg`, localUri: null, fileId, progress: null, error: null,
});

describe("problem report photos", () => {
  it("asks for at least one uploaded photo", () => {
    expect(checkProblemPhotos([])).toMatch(/at least one photo/);
    expect(checkProblemPhotos([failedUpload("unreadable")])).toMatch(/at least one photo/);
    expect(checkProblemPhotos([slot("a", "stored", "file_a")])).toBeNull();
  });

  it("waits for a photo still sending", () => {
    expect(checkProblemPhotos([slot("a", "stored", "file_a"), slot("b", "sending")])).toMatch(/finish uploading/);
  });

  it("caps the report at ten photos", () => {
    const eleven = Array.from({ length: MAX_PROBLEM_PHOTOS + 1 }, (_, i) => slot(`p${i}`, "stored", `file_${i}`));
    expect(checkProblemPhotos(eleven)).toMatch(/at most 10/);
  });

  it("sends only the ids GRIDGO stored, in order", () => {
    expect(storedFileIds([slot("a", "stored", "file_a"), slot("b", "failed"), slot("c", "stored", "file_c")])).toEqual([
      "file_a",
      "file_c",
    ]);
  });

  it("appends a new slot and updates only its own key", () => {
    const first = writeSlot([], "a", slot("a", "sending"));
    const both = writeSlot(first, "b", slot("b", "sending"));
    const stored = writeSlot(both, "a", (current) => ({ ...current, phase: "stored", fileId: "file_a" }));
    expect(stored.map((s) => [s.key, s.phase])).toEqual([["a", "stored"], ["b", "sending"]]);
  });
});

describe("issueDecisionView", () => {
  it("shows the remedy and Operations' reason once approved, never the fault", () => {
    const view = issueDecisionView({
      remedy: "full_refund",
      reason: "The photos show the colour was wrong before it left the press.",
      status: "approved",
    });
    expect(view).toEqual({ headline: "A full refund", reason: "The photos show the colour was wrong before it left the press." });
  });

  it("says a finding awaiting approval is not decided yet", () => {
    const view = issueDecisionView({ remedy: "full_refund", reason: "Internal working", status: "awaiting_approval" });
    expect(view?.headline).toMatch(/getting it approved/);
    expect(view?.reason).toBeNull();
  });

  it("draws nothing without a finding", () => {
    expect(issueDecisionView(null)).toBeNull();
  });
});
