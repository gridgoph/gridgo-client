import { render } from "@testing-library/react-native";
import { Platform, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";

const dialog = (tone: "primary" | "destructive") => (
  <ConfirmDialog
    visible
    question="Delete the artwork on this job?"
    body="The files are removed for good."
    confirmLabel="Delete artwork"
    cancelLabel="Keep it"
    tone={tone}
    onConfirm={jest.fn()}
    onCancel={jest.fn()}
  />
);

describe("ConfirmDialog focus on web", () => {
  let focus: jest.SpyInstance;

  beforeEach(() => {
    jest.replaceProperty(Platform, "OS", "web");
    focus = jest.spyOn(View.prototype as unknown as { focus: () => void }, "focus");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Routine first: a dialog left mounted by an earlier render in this file
  // can call focus again and would count against it.
  it("leaves a routine confirmation to the platform", async () => {
    await render(dialog("primary"));
    expect(focus).not.toHaveBeenCalled();
  });

  it("opens a destructive dialog on the safe answer, so Enter does not delete", async () => {
    await render(dialog("destructive"));
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
