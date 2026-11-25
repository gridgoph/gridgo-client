import { LIST_HEADER_PROBLEM, listContact, listDate, parseMemberList } from "@/lib/memberListCsv";

const NOW = new Date("2026-11-26T04:00:00.000Z");
const rows = (text: string) => {
  const parsed = parseMemberList(text, NOW);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.rows;
};

describe("reading a member list", () => {
  it("reads the three columns in any order, quotes, blank rows and a byte order mark", () => {
    expect(
      rows('\uFEFFMember since,Name,Email or mobile\r\n2024-08,"Sample, Alex ""AJ""",alex@example.com\r\n,,\r\n2025-01,Bea Example,09170000000\r\n'),
    ).toEqual([
      { name: 'Sample, Alex "AJ"', contact: "alex@example.com", memberSince: "2024-08" },
      { name: "Bea Example", contact: "09170000000", memberSince: "2025-01" },
    ]);
  });

  it("keeps a row GRIDGO will send back, so it can be fixed here", () => {
    expect(rows("Name,Email or mobile,Member since\nAlex Sample,,\n")).toEqual([{ name: "Alex Sample", contact: "", memberSince: "" }]);
  });

  it("tolerates empty columns a table program leaves behind", () => {
    expect(rows("Name,Email or mobile,Member since,,\nAlex Sample,a@example.com,2024-08,,\n")).toHaveLength(1);
  });

  it.each(["", "Name,Email\nAlex,a@example.com", "Name,Name,Member since\nA,B,C", "Alex Sample,a@example.com,2024-08"])(
    "refuses columns it does not know: %j",
    (text) => {
      expect(parseMemberList(text, NOW)).toEqual({ ok: false, problem: LIST_HEADER_PROBLEM });
    },
  );

  it("refuses broken quoting, an empty list and more than one call takes", () => {
    expect(parseMemberList('Name,Email or mobile,Member since\n"Alex,a@example.com,2024-08', NOW).ok).toBe(false);
    expect(parseMemberList("Name,Email or mobile,Member since\n", NOW)).toEqual({
      ok: false,
      problem: "That file has the columns but nobody on it yet.",
    });
    const many = `Name,Email or mobile,Member since\n${"A,a@example.com,2024-08\n".repeat(501)}`;
    expect(parseMemberList(many, NOW)).toEqual({ ok: false, problem: "That list has 501 people. Send up to 500 at a time." });
  });
});

describe("what a table program does to a value", () => {
  it("reads a written month, and leaves anything unclear for GRIDGO to send back", () => {
    expect(listDate("Aug 2024", NOW)).toBe("2024-08");
    expect(listDate("August 2024", NOW)).toBe("2024-08");
    expect(listDate("Sept 2023", NOW)).toBe("2023-09");
    expect(listDate("Aug-24", NOW)).toBe("2024-08");
    expect(listDate("Aug-99", NOW)).toBe("1999-08");
    expect(listDate("8/1/2024", NOW)).toBe("2024-08-01");
    expect(listDate("25/12/2024", NOW)).toBe("25/12/2024");
    expect(listDate("2024-08-15", NOW)).toBe("2024-08-15");
    expect(listDate("last year", NOW)).toBe("last year");
  });

  it("gives a mobile its zero back and touches nothing else", () => {
    expect(listContact("9170000000")).toBe("09170000000");
    expect(listContact(" a@example.com ")).toBe("a@example.com");
    expect(listContact("917000000")).toBe("917000000");
  });
});
