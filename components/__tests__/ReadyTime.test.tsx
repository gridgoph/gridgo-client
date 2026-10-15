import { render, screen } from "@testing-library/react-native";

import { ReadyTime } from "@/components/ReadyTime";

describe("ReadyTime", () => {
  it.each([undefined, null, "invalid"])("omits a missing or invalid projection (%s)", async (promiseBy) => {
    await render(<ReadyTime promiseBy={promiseBy} />);
    expect(screen.queryByText(/Ready by/)).toBeNull();
    expect(screen.queryByText(/Includes jobs ahead/)).toBeNull();
  });

  it("sets the API's Ready early on the date it beat", async () => {
    await render(<ReadyTime promiseBy="2026-09-26T06:30:00.000Z" early="Ready early" />);
    expect(screen.getByText("Ready early")).toBeTruthy();
    expect(screen.getByText(/Ready by Sat, Sep 26, 2026/)).toBeTruthy();
  });

  it("draws no early chip by default", async () => {
    await render(<ReadyTime promiseBy="2026-09-26T06:30:00.000Z" />);
    expect(screen.queryByText("Ready early")).toBeNull();
  });
});
