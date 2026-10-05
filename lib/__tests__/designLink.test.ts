import {
  checkArtworkLink,
  type AcceptedFormat,
  type ArtworkLinkCheck,
  type CartLineRecord,
} from "@/lib/api";
import {
  checkedLink,
  linkDisplay,
  designLinkFormats,
  designLinkPhrase,
  lineArtworkSummary,
  lineHasArtwork,
  linkVerdict,
  parseDesignLink,
  providerOf,
} from "@/lib/designLink";
import { linesMissingArtwork } from "@/lib/basket";

const CANVA: AcceptedFormat = {
  code: "canva_link",
  displayName: "Canva link",
  inputKind: "url",
  extensions: [],
  mimeTypes: [],
  active: true,
};
const OTHER: AcceptedFormat = { ...CANVA, code: "other_link", displayName: "Other link" };
const DRIVE: AcceptedFormat = { ...CANVA, code: "google_drive", displayName: "Google Drive" };
const WETRANSFER: AcceptedFormat = { ...CANVA, code: "we_transfer", displayName: "WeTransfer" };
const PDF: AcceptedFormat = {
  code: "pdf",
  displayName: "PDF",
  inputKind: "file",
  extensions: ["pdf"],
  mimeTypes: ["application/pdf"],
  active: true,
};

function check(overrides: Partial<ArtworkLinkCheck>): ArtworkLinkCheck {
  return {
    ok: false,
    reachable: true,
    httpStatus: 200,
    provider: "canva",
    access: "unknown",
    message: "This is a Canva edit link, but edit permission cannot be verified without signing in.",
    ...overrides,
  };
}

describe("design link parsing", () => {
  it("takes a Canva link as a canva_link where the shop takes one", () => {
    expect(parseDesignLink(" https://www.canva.com/design/DAF1/edit ", [PDF, CANVA])).toEqual({
      ok: true,
      link: { formatCode: "canva_link", url: "https://www.canva.com/design/DAF1/edit" },
      provider: "canva",
    });
  });

  it("reads an address copied without its scheme as https", () => {
    const parsed = parseDesignLink("canva.com/design/DAF1/view", [CANVA]);
    expect(parsed.ok && parsed.link.url).toBe("https://canva.com/design/DAF1/view");
  });

  it("files a Drive link under google_drive where the shop takes that", () => {
    const parsed = parseDesignLink("https://drive.google.com/file/d/abc/view", [DRIVE, OTHER]);
    expect(parsed).toMatchObject({ ok: true, link: { formatCode: "google_drive" }, provider: "google_drive" });
    expect(parseDesignLink("https://we.tl/t-abc", [WETRANSFER])).toMatchObject({
      ok: true,
      link: { formatCode: "we_transfer" },
    });
  });

  it("sends anything else as an other link", () => {
    const parsed = parseDesignLink("https://drive.google.com/file/d/abc/view", [CANVA, OTHER]);
    expect(parsed).toMatchObject({ ok: true, link: { formatCode: "other_link" }, provider: "google_drive" });
  });

  it("refuses a non-Canva link where the shop takes Canva only, before any round trip", () => {
    expect(parseDesignLink("https://drive.google.com/file/d/abc", [CANVA])).toEqual({
      ok: false,
      message: "This shop takes a Canva link. Paste one of those, or upload the file.",
    });
  });

  it("files Canva's short link as a Canva link, which GRIDGO resolves to the full address", () => {
    expect(parseDesignLink("https://canva.link/abc123", [CANVA])).toMatchObject({
      ok: true,
      link: { formatCode: "canva_link", url: "https://canva.link/abc123" },
      provider: "canva",
    });
    // GRIDGO files a short link as canva_link whatever it is sent as.
    expect(parseDesignLink("https://canva.link/abc123", [OTHER])).toMatchObject({ ok: false });
  });

  it("shows an address without its tracking tail", () => {
    expect(linkDisplay("https://www.canva.com/design/DAF1/tok/view?utm_content=DAF1&utm_source=x")).toBe(
      "canva.com/design/DAF1/tok/view",
    );
  });

  it("keeps the address the checker resolved a short link to", () => {
    const pasted = { formatCode: "canva_link", url: "https://canva.link/abc123" };
    expect(
      checkedLink(pasted, { url: "https://www.canva.com/design/DAF1/tok/view", formatCode: "canva_link" }, [CANVA]),
    ).toEqual({ formatCode: "canva_link", url: "https://www.canva.com/design/DAF1/tok/view" });
    // An older checker sends neither field.
    expect(checkedLink(pasted, {}, [CANVA])).toBe(pasted);
    // A format this listing does not take is not sent to be refused.
    expect(checkedLink(pasted, { url: "https://www.canva.com/design/x", formatCode: "other_link" }, [CANVA]))
      .toEqual({ formatCode: "canva_link", url: "https://www.canva.com/design/x" });
  });

  it("refuses plain http, which GRIDGO will not store", () => {
    expect(parseDesignLink("http://www.canva.com/design/x", [CANVA])).toMatchObject({ ok: false });
  });

  it("refuses text that is not a link", () => {
    expect(parseDesignLink("my flyer design", [CANVA])).toMatchObject({ ok: false });
    expect(parseDesignLink("https://user:pw@canva.com/design/x", [CANVA])).toMatchObject({ ok: false });
  });

  it("names providers on the same domain boundary as the API", () => {
    expect(providerOf("https://notcanva.com/x")).toBe("other");
    expect(providerOf("https://www.dropbox.com/s/x")).toBe("dropbox");
    expect(providerOf("https://www.figma.com/file/x")).toBe("figma");
    expect(providerOf("https://wetransfer.com/downloads/x")).toBe("we_transfer");
    expect(providerOf("https://canva.link/x")).toBe("canva");
  });

  it("opens the field only for link formats GRIDGO can keep", () => {
    const figma: AcceptedFormat = { ...OTHER, code: "figma_link", displayName: "Figma" };
    expect(designLinkFormats([PDF, DRIVE, CANVA, figma]).map((format) => format.code)).toEqual([
      "google_drive",
      "canva_link",
    ]);
    expect(designLinkPhrase([figma])).toBe("");
  });

  it("says what the field takes in a client's words, not the registry's", () => {
    expect(designLinkPhrase([PDF, CANVA])).toBe("a Canva link");
    expect(designLinkPhrase([CANVA, OTHER])).toBe("a Canva or other sharing link");
    expect(designLinkPhrase([CANVA, DRIVE, WETRANSFER])).toBe("a Canva, Google Drive or WeTransfer link");
    expect(designLinkPhrase([OTHER])).toBe("a sharing link");
    expect(designLinkPhrase([PDF])).toBe("");
  });
});

describe("link check verdicts", () => {
  it("says a public link can be viewed, or edited", () => {
    expect(linkVerdict({ phase: "checked", check: check({ ok: true, access: "public_view" }) }))
      .toMatchObject({ tone: "success", title: "Anyone with the link can view it", blocks: false });
    expect(linkVerdict({ phase: "checked", check: check({ ok: true, access: "public_edit" }) }))
      .toMatchObject({ tone: "success", title: "Anyone with the link can edit it", blocks: false });
  });

  it("blocks a link that asks people to sign in, and says how to fix it", () => {
    expect(linkVerdict({ phase: "checked", check: check({ access: "sign_in_required" }) })).toEqual({
      tone: "error",
      title: "This link is private",
      body: "In the Share menu, set access to Anyone with the link, then paste it again. Or upload the file instead.",
      blocks: true,
    });
  });

  it("offers the upload only where the listing takes a file", () => {
    expect(
      linkVerdict({ phase: "checked", check: check({ access: "sign_in_required" }) }, { canUpload: false })?.body,
    ).toBe("In the Share menu, set access to Anyone with the link, then paste it again.");
  });

  it("blocks a link with nothing behind it", () => {
    expect(
      linkVerdict({ phase: "checked", check: check({ access: "not_found", httpStatus: 404 }) }),
    ).toMatchObject({ tone: "error", title: "We couldn't open this link", blocks: true });
  });

  it("blocks an inconclusive check, with the sharing fix and the upload (gridgo-api#122)", () => {
    const verdict = linkVerdict({ phase: "checked", check: check({ access: "unknown" }) });
    expect(verdict).toMatchObject({ tone: "error", title: "We couldn't confirm anyone can open it", blocks: true });
    expect(verdict?.body).toBe("Set sharing to Anyone with the link, then check it again. Or upload the file instead.");
  });

  it("blocks an unreachable link, saying why in GRIDGO's words", () => {
    expect(
      linkVerdict({
        phase: "checked",
        check: check({ reachable: false, httpStatus: null, message: "The link check timed out." }),
      }),
    ).toEqual({
      tone: "error",
      title: "We couldn't open this link",
      body: "The link check timed out. Or upload the file instead.",
      blocks: true,
    });
  });

  it("blocks a link it could not check yet, and says to try again", () => {
    expect(
      linkVerdict({ phase: "failed", message: "GRIDGO has checked a lot of links in the last minute.", blocks: false }),
    ).toMatchObject({ tone: "error", blocks: true, body: "Check it again in a minute. Or upload the file instead." });
  });

  it("has nothing to say while checking, or on an API with no check", () => {
    expect(linkVerdict({ phase: "checking" })).toBeNull();
    expect(linkVerdict({ phase: "unavailable" })).toBeNull();
  });
});

describe("a line's artwork", () => {
  const base = { artworkFileId: null, artworkLinks: [] as { formatCode: string; url: string }[] };
  const link = { formatCode: "canva_link", url: "https://www.canva.com/design/DAF1/view" };

  it("counts a design link as artwork, at checkout too", () => {
    expect(lineHasArtwork({ ...base, artworkLinks: [link] })).toBe(true);
    expect(lineHasArtwork(base)).toBe(false);
    const lines = [
      { id: "a", ...base, artworkLinks: [link] },
      { id: "b", ...base },
    ] as unknown as CartLineRecord[];
    expect(linesMissingArtwork(lines).map((line) => line.id)).toEqual(["b"]);
  });

  it("survives an API that sends no links at all", () => {
    expect(lineHasArtwork({ artworkFileId: null })).toBe(false);
    expect(lineArtworkSummary({ artworkFileId: "file_1" })).toBe("Artwork attached");
  });

  it("names the link on the checkout row", () => {
    expect(lineArtworkSummary({ ...base, artworkLinks: [link] })).toBe("Canva link attached");
    expect(lineArtworkSummary({ artworkFileId: "file_1", artworkLinks: [link] })).toBe(
      "Artwork and Canva link attached",
    );
  });
});

describe("POST /artwork/link-check", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function respond(status: number, body: unknown) {
    global.fetch = jest.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    })) as unknown as typeof fetch;
  }

  it("sends the link and returns the check", async () => {
    const answer = check({ ok: true, access: "public_view" });
    respond(200, answer);
    await expect(
      checkArtworkLink({ formatCode: "canva_link", url: "https://www.canva.com/design/x/view" }),
    ).resolves.toEqual(answer);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain("/artwork/link-check");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      url: "https://www.canva.com/design/x/view",
      formatCode: "canva_link",
    });
  });

  it("answers null on an API without the route, rather than failing", async () => {
    respond(404, { error: "not_found" });
    await expect(
      checkArtworkLink({ formatCode: "canva_link", url: "https://www.canva.com/design/x" }),
    ).resolves.toBeNull();
  });

  it("still throws a real refusal", async () => {
    respond(429, { error: "artwork_link_rate_limited", message: "Wait a minute." });
    await expect(
      checkArtworkLink({ formatCode: "canva_link", url: "https://www.canva.com/design/x" }),
    ).rejects.toMatchObject({ status: 429 });
  });
});
