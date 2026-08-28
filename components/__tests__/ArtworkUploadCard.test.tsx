import { fireEvent, render, screen } from "@testing-library/react-native";

import { ArtworkUploadCard } from "@/components/ArtworkUploadCard";
import { EMPTY_ARTWORK, type ArtworkUploadState } from "@/lib/artworkUpload";

function state(overrides: Partial<ArtworkUploadState> = {}): ArtworkUploadState {
  return { ...EMPTY_ARTWORK, ...overrides };
}

describe("ArtworkUploadCard", () => {
  it("is itself the button that opens the picker when nothing has been sent", async () => {
    // The reported defect: the empty card explained what file to send and gave
    // no way to send it, while the screen's only control was a disabled yellow
    // button underneath.
    const onPick = jest.fn();
    await render(
      <ArtworkUploadCard
        state={state()}
        onPick={onPick}
        onRetry={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText("Choose your artwork file"));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("says what it takes on the control itself", async () => {
    await render(
      <ArtworkUploadCard
        state={state()}
        onPick={jest.fn()}
        onRetry={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText("Choose a file")).toBeTruthy();
    expect(screen.getByLabelText("Choose your artwork file").props.accessibilityHint).toBe(
      "JPEG, PNG, WebP or PDF, up to 200 MB",
    );
  });

  it("stops being a button once a file is on it, and offers Replace instead", async () => {
    const onPick = jest.fn();
    await render(
      <ArtworkUploadCard
        state={state({ phase: "stored", fileId: "file_1", fileName: "poster.pdf" })}
        onPick={onPick}
        onRetry={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText("Choose your artwork file")).toBeNull();
    fireEvent.press(screen.getByText("Replace file"));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("does not take a tap mid-transfer, when the only sensible action is Cancel", async () => {
    const onCancel = jest.fn();
    await render(
      <ArtworkUploadCard
        state={state({ phase: "sending", fileName: "poster.pdf", progress: 0.4 })}
        onPick={jest.fn()}
        onRetry={jest.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.queryByLabelText("Choose your artwork file")).toBeNull();
    fireEvent.press(screen.getByText("Cancel upload"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("offers nothing to press on a read-only surface", async () => {
    await render(
      <ArtworkUploadCard
        state={state()}
        onPick={jest.fn()}
        onRetry={jest.fn()}
        onCancel={jest.fn()}
        readOnly
      />,
    );

    expect(screen.queryByLabelText("Choose your artwork file")).toBeNull();
    expect(screen.queryByText("Choose a file")).toBeNull();
  });
});
