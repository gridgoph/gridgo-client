import { useState } from "react";
import { Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { OptionGroupPicker } from "@/components/OptionGroupPicker";
import { isSelectionComplete, selectedOptionIds, type ListingSelection } from "@/lib/listing";
import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";

const group: CatalogOptionGroup = {
  id: "finish", name: "Finish", kind: "addon", required: false,
  selectionMode: "single", sortOrder: 0, version: 1, helpText: null,
  options: [{ id: "laminate", label: "Lamination", priceModifierMinor: 2000, specBinding: null, sortOrder: 0 }],
};

function Picker({ current }: { current: CatalogOptionGroup }) {
  const [selection, setSelection] = useState<ListingSelection>({ finish: "laminate" });
  const item = { optionGroups: [current] } as CatalogItem;
  return <>
    <OptionGroupPicker group={current} step={null} selectedId={selection.finish}
      onSelect={(id) => setSelection(id ? { finish: id } : {})} />
    <Text>{isSelectionComplete(item, selection) ? "Ready" : "Needs a choice"}</Text>
    <Text>{JSON.stringify(selectedOptionIds(item, selection))}</Text>
  </>;
}

it("lets the client remove an unavailable optional choice after a live update", async () => {
  const view = await render(<Picker current={group} />);
  expect(screen.getByText("Ready")).toBeTruthy();
  expect(screen.queryByText("Remove unavailable selection")).toBeNull();
  await view.rerender(<Picker current={{ ...group, options: [] }} />);
  expect(screen.getByText("Needs a choice")).toBeTruthy();
  expect(screen.getByText("[]")).toBeTruthy();
  fireEvent.press(screen.getByText("Remove unavailable selection"));
  expect(screen.getByText("Ready")).toBeTruthy();
  expect(screen.queryByText("Remove unavailable selection")).toBeNull();
  expect(screen.getByText("[]")).toBeTruthy();
});
