import { render, screen } from "@testing-library/react-native";

import { ReadyTime } from "@/components/ReadyTime";

describe("ReadyTime", () => {
  it.each([undefined, null, "invalid"])("omits a missing or invalid projection (%s)", async (promiseBy) => {
    await render(<ReadyTime promiseBy={promiseBy} />);
    expect(screen.queryByText(/Ready by/)).toBeNull();
    expect(screen.queryByText(/Includes jobs ahead/)).toBeNull();
  });
});
