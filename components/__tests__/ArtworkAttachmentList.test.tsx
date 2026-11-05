import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";

import { ArtworkAttachmentList } from "@/components/ArtworkAttachmentList";

type Props = ComponentProps<typeof ArtworkAttachmentList>;

const FILE = { kind: "file", fileId: "file_front" } as const;

function renderList(overrides: Partial<Props> = {}) {
  return render(
    <ArtworkAttachmentList
      entries={[]}
      uploads={[]}
      files={{}}
      linkChecks={{}}
      takesFiles
      formats={[]}
      wordNote={null}
      ordered
      saving={false}
      saveError={null}
      notice={null}
      onPick={jest.fn()}
      onRemove={jest.fn()}
      onMove={jest.fn()}
      onRelabel={jest.fn()}
      onRecheck={jest.fn()}
      onRetryUpload={jest.fn()}
      onDismissUpload={jest.fn()}
      onChooseSaved={jest.fn()}
      {...overrides}
    />,
  );
}

function expectSourceNamed(label: string) {
  expect(screen.getByLabelText(label)).toBeTruthy();
  expect(screen.getByText(label)).toBeTruthy();
}

it("names where the file comes from on both actions before anything is attached", async () => {
  await renderList();

  expectSourceNamed("Upload from phone");
  expectSourceNamed("Choose from My files on GRIDGO");
  expect(screen.getByLabelText("Choose from My files on GRIDGO").props.accessibilityHint).toBe(
    "Adds a file you saved on GRIDGO, without uploading it again",
  );
  expect(screen.queryByText("Choose files")).toBeNull();
  expect(screen.queryByText("Choose from My files")).toBeNull();
});

it("keeps naming the source once a file is attached", async () => {
  await renderList({ entries: [FILE] });

  expectSourceNamed("Upload more from phone");
  expectSourceNamed("Choose from My files on GRIDGO");
  expect(screen.queryByText("Upload from phone")).toBeNull();
  expect(screen.queryByText("Add more files")).toBeNull();
});

it("leaves the My files action out where the screen does not offer it", async () => {
  await renderList({ onChooseSaved: undefined });

  expectSourceNamed("Upload from phone");
  expect(screen.queryByLabelText("Choose from My files on GRIDGO")).toBeNull();
});

// One press per file (AGENTS.md): this test goes last.
it("opens My files from its own action, and starts no upload", async () => {
  const onPick = jest.fn();
  const onChooseSaved = jest.fn();
  await renderList({ onPick, onChooseSaved });

  fireEvent.press(screen.getByLabelText("Choose from My files on GRIDGO"));

  expect(onChooseSaved).toHaveBeenCalledTimes(1);
  expect(onPick).not.toHaveBeenCalled();
});
