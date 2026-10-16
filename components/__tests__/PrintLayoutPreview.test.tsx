import { fireEvent, render, screen } from "@testing-library/react-native";

import { PrintLayoutPreview } from "@/components/PrintLayoutPreview";
import type { PrintLayoutCheck, PrintLayoutPaper } from "@/lib/api";
import { layoutAdvice } from "@/lib/printLayout";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

const A1: PrintLayoutPaper = { optionId: "opt_a1", label: "A1", widthMilli: 594000, heightMilli: 841000, pageSize: "A1" };
const A0: PrintLayoutPaper = { optionId: "opt_a0", label: "A0", widthMilli: 841000, heightMilli: 1189000, pageSize: "A0" };
const LISTING = {
  printLayouts: ["fit_to_paper", "actual_size_centered"],
  optionGroups: [{
    id: "grp_size", name: "Size", kind: "spec" as const, helpText: null, required: true, selectionMode: "single" as const, sortOrder: 0, version: 1,
    options: [
      { id: "opt_a1", label: "A1", priceModifierMinor: 0, specBinding: { fieldCode: "size", value: "A1" }, sortOrder: 0 },
      { id: "opt_a0", label: "A0", priceModifierMinor: 0, specBinding: { fieldCode: "size", value: "A0" }, sortOrder: 1 },
    ],
  }],
};
const CUT: PrintLayoutCheck = {
  supportedLayouts: ["fit_to_paper", "actual_size_centered"],
  layout: "actual_size_centered",
  paper: A1,
  files: [{
    fileId: "file_1",
    page: { widthMilli: 841000, heightMilli: 1189000, pageSize: "A0", orientation: "portrait", largestShortSideMilli: 841000, largestLongSideMilli: 1189000, mixedPageSizes: false },
    exceedsPaper: true,
  }],
  exceedsPaper: true,
  cutOff: true,
  scaleChanges: false,
  suggestedPaper: A0,
  unknown: [],
};

it("draws the page on the paper and warns of the cut-off, with the paper that fits one tap away", async () => {
  const onSwitchPaper = jest.fn();
  await render(
    <PrintLayoutPreview
      check={CUT}
      layout="actual_size_centered"
      advice={layoutAdvice(CUT, { listing: LISTING })}
      onSwitchPaper={onSwitchPaper}
    />,
  );
  expect(
    screen.getByLabelText(
      "Actual size, centred on A1. Your page is 841 × 1189 mm, the paper 594 × 841 mm. The hatched part outside the paper is cut off.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Paper: A1 (594 × 841 mm)")).toBeTruthy();
  expect(screen.getByText("Your page: A0 (841 × 1189 mm)")).toBeTruthy();
  expect(screen.getByText("Parts of your page will be cut off on A1.")).toBeTruthy();
  expect(screen.getByText("Choose A0 to print it whole.")).toBeTruthy();
  fireEvent.press(screen.getByText("Print on A0 instead"));
  expect(onSwitchPaper).toHaveBeenCalledWith(A0);
});
