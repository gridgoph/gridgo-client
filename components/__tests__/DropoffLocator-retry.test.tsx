import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";

import { DropoffLocator } from "@/components/DropoffLocator";
import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as geocode from "@/lib/geocode";

jest.mock("@/components/PinPicker", () => ({ PinPicker: () => null }));
jest.mock("@/components/PinPicker.native", () => ({ PinPicker: () => null }));

let editor: ReturnType<typeof useDropoffEditor> | null = null;
function capture(current: ReturnType<typeof useDropoffEditor>) {
  editor = current;
}

function Harness() {
  const current = useDropoffEditor({ skipPrePin: true });
  useEffect(() => capture(current));
  return <DropoffLocator editor={current} />;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, geocode.SEARCH_DEBOUNCE_MS + 30));
  });
}

// Regression for #432 review C4: an offline search could only be retried by
// editing the words. Driven through the editor inside act(): under RNTL 14 a
// press after changeText drops the useState write it causes (see AGENTS.md).
it("offers Retry after a failed lookup, and Retry asks the same words again", async () => {
  const search = jest
    .spyOn(geocode, "searchNominatim")
    .mockResolvedValueOnce({ status: "failed", message: geocode.GEOCODE_OFFLINE })
    .mockResolvedValueOnce({
      status: "ok",
      suggestions: [
        {
          id: "1",
          label: "SM Lanang Premier",
          line1: "SM Lanang Premier, J. P. Laurel Avenue",
          landmark: "",
          area: "J. P. Laurel Avenue, Agdao District",
          point: { lat: 7.099, lng: 125.6308 },
        },
      ],
    });

  await render(<Harness />);
  await act(async () => editor?.onChangeQuery("SM Lanang"));
  await settle();
  expect(await screen.findByText(geocode.GEOCODE_OFFLINE)).toBeTruthy();
  expect(screen.getByLabelText("Retry search")).toBeTruthy();

  await act(async () => editor?.retrySearch());
  await settle();
  expect(await screen.findByLabelText("Use SM Lanang Premier, J. P. Laurel Avenue, Agdao District")).toBeTruthy();
  expect(search).toHaveBeenCalledTimes(2);
  expect(search.mock.calls[1][0]).toBe("SM Lanang");
  expect(screen.queryByLabelText("Retry search")).toBeNull();
});

it("offers no Retry when the search simply found nothing", async () => {
  jest.spyOn(geocode, "searchNominatim").mockResolvedValue({ status: "empty", message: geocode.NO_MATCH });
  await render(<Harness />);
  await act(async () => editor?.onChangeQuery("zzzz"));
  await settle();
  expect(await screen.findByText(geocode.NO_MATCH)).toBeTruthy();
  expect(screen.queryByLabelText("Retry search")).toBeNull();
});

it("wires the keyboard's Search key and the Retry button to the same retry", () => {
  const src = readFileSync(join(__dirname, "..", "DropoffLocator.tsx"), "utf8");
  expect(src).toContain("onSubmitEditing={editor.retrySearch}");
  expect(src).toContain("onPress={editor.retrySearch}");
});
