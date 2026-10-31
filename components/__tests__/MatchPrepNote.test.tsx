import { render, screen } from "@testing-library/react-native";

import { MatchPrepNote } from "@/components/MatchPrepNote";

describe("MatchPrepNote", () => {
  it("names the three questions before the match and the one being answered", async () => {
    await render(<MatchPrepNote current="priorities" />);

    const note = screen.getByLabelText(
      "Before we match: your date, delivery and priorities prepare the match. Now: priorities.",
    );
    expect(note.props.accessible).toBe(true);
    expect(screen.getByText("BEFORE WE MATCH: DATE · DELIVERY · PRIORITIES")).toBeTruthy();
  });
});
