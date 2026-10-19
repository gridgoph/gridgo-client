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

describe("ReadyTime on a same-day order (gridgo-api#292)", () => {
  const davao = (hour: number, plusDays: number) => {
    const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
    return new Date(Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00+08:00`) + plusDays * 86_400_000).toISOString();
  };

  it("names today's clock time beside the date", async () => {
    await render(<ReadyTime promiseBy={davao(15, 0)} />);
    expect(screen.getByText("Today, ready by 3:00 PM")).toBeTruthy();
    expect(screen.getByText(/^Ready by /)).toBeTruthy();
  });

  it("names tomorrow's, and nothing further out", async () => {
    await render(<ReadyTime promiseBy={davao(11, 1)} />);
    expect(screen.getByText("Tomorrow, ready by 11:00 AM")).toBeTruthy();
  });

  it("adds no near line for a later date", async () => {
    await render(<ReadyTime promiseBy={davao(11, 5)} />);
    expect(screen.queryByText(/^(Today|Tomorrow), ready by/)).toBeNull();
  });
});
