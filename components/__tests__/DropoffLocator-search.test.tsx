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

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const LANANG = {
  status: "ok" as const,
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
};

afterEach(() => {
  jest.restoreAllMocks();
});

// Driven through the editor inside act(): under RNTL 14 a press after
// changeText drops the useState write it causes (see AGENTS.md).

// #432 review C6: Nominatim's usage policy forbids search-as-you-type.
it("asks nothing while the client types, and exactly once when they search", async () => {
  const search = jest.spyOn(geocode, "searchNominatim").mockResolvedValue(LANANG);
  await render(<Harness />);
  await act(async () => editor?.onChangeQuery("SM"));
  await act(async () => editor?.onChangeQuery("SM Lan"));
  await act(async () => editor?.onChangeQuery("SM Lanang"));
  await wait(1500);
  expect(search).not.toHaveBeenCalled();
  expect(screen.queryByText("Looking in Davao City…")).toBeNull();

  await act(async () => editor?.submitSearch());
  expect(await screen.findByLabelText("Use SM Lanang Premier, J. P. Laurel Avenue, Agdao District")).toBeTruthy();
  expect(search).toHaveBeenCalledTimes(1);
  expect(search.mock.calls[0][0]).toBe("SM Lanang");
});

// #432 review C4: an offline search could only be retried by editing the words.
it("offers Retry after a failed lookup, and Retry asks the same words again", async () => {
  const search = jest
    .spyOn(geocode, "searchNominatim")
    .mockResolvedValueOnce({ status: "failed", message: geocode.GEOCODE_OFFLINE })
    .mockResolvedValueOnce(LANANG);

  await render(<Harness />);
  await act(async () => editor?.onChangeQuery("SM Lanang"));
  await act(async () => editor?.submitSearch());
  expect(await screen.findByText(geocode.GEOCODE_OFFLINE)).toBeTruthy();
  expect(screen.getByLabelText("Retry search")).toBeTruthy();

  await act(async () => editor?.retrySearch());
  expect(await screen.findByLabelText("Use SM Lanang Premier, J. P. Laurel Avenue, Agdao District")).toBeTruthy();
  expect(search).toHaveBeenCalledTimes(2);
  expect(search.mock.calls[1][0]).toBe("SM Lanang");
  expect(screen.queryByLabelText("Retry search")).toBeNull();
});

it("drops a lookup still on its way once the words change", async () => {
  let answer: (value: geocode.SearchResult) => void = () => undefined;
  jest.spyOn(geocode, "searchNominatim").mockImplementation(() => new Promise((resolve) => (answer = resolve)));
  await render(<Harness />);
  await act(async () => editor?.onChangeQuery("SM Lanang"));
  await act(async () => editor?.submitSearch());
  expect(await screen.findByText("Looking in Davao City…")).toBeTruthy();
  await act(async () => editor?.onChangeQuery("Abreeza"));
  await act(async () => answer(LANANG));
  expect(screen.queryByLabelText(/^Use SM Lanang/)).toBeNull();
  expect(screen.queryByText("Looking in Davao City…")).toBeNull();
});

it("offers no Retry when the search simply found nothing", async () => {
  jest.spyOn(geocode, "searchNominatim").mockResolvedValue({ status: "empty", message: geocode.NO_MATCH });
  await render(<Harness />);
  await act(async () => editor?.onChangeQuery("zzzz"));
  await act(async () => editor?.submitSearch());
  expect(await screen.findByText(geocode.NO_MATCH)).toBeTruthy();
  expect(screen.queryByLabelText("Retry search")).toBeNull();
});

it("wires the Search button, the keyboard's Search key and Retry to the one request", () => {
  const src = readFileSync(join(__dirname, "..", "DropoffLocator.tsx"), "utf8");
  expect(src).toContain("onSubmitEditing={editor.submitSearch}");
  expect(src).toContain("onPress={editor.submitSearch}");
  expect(src).toContain("onPress={editor.retrySearch}");
});
