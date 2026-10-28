import {
  DIAGNOSTIC_MAX_CHARS,
  DIAGNOSTIC_STACK_LINES,
  diagnosticLog,
  diagnosticSummary,
  redactDiagnostic,
} from "@/lib/errorDiagnostic";

/**
 * A crash screen prints its error so a screenshot names the cause, and a
 * screenshot travels. These markers are invented, never real credentials.
 */

const SECRET = /FAKE_BEARER|FAKE_SIGNATURE|FAKE_JWT|FAKE_KEY|FAKE_COOKIE|FAKE_TOKEN|FAKE_PASSWORD/;

describe("redactDiagnostic", () => {
  it("takes out a bearer token and the Authorization header that carries it", () => {
    const out = redactDiagnostic("Request failed. Authorization: Bearer FAKE_BEARER.abc and bearer FAKE_BEARER2");
    expect(out).not.toMatch(SECRET);
    expect(out).toContain("Authorization: [redacted]");
    expect(out).toContain("Bearer [redacted]");
  });

  it("keeps a signed link's address and drops its query", () => {
    const out = redactDiagnostic(
      "Image failed https://files.example.invalid/sample.jpg?X-Amz-Credential=a&X-Amz-Signature=FAKE_SIGNATURE#top",
    );
    expect(out).toBe("Image failed https://files.example.invalid/sample.jpg?[redacted]#top");
  });

  it("takes out a JWT, prefixed keys, cookies and key=value secrets", () => {
    const out = redactDiagnostic(
      [
        "jwt eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJGQUtFX0pXVCJ9.FAKE_JWT_sig",
        "key sk_test_FAKE_KEY_123456 and tok_FAKE_TOKEN_123",
        "Cookie: __session=FAKE_COOKIE",
        "token=FAKE_TOKEN&password: FAKE_PASSWORD",
        "blob FAKE_KEY_0123456789abcdefghijklmnopqrstuvwxyz0123",
      ].join("\n"),
    );
    expect(out).not.toMatch(SECRET);
  });

  it("leaves an ordinary message alone", () => {
    const message = "Cannot read property 'label' of undefined";
    expect(redactDiagnostic(message)).toBe(message);
  });
});

describe("diagnosticSummary", () => {
  it("keeps the error's type with its message", () => {
    expect(diagnosticSummary(new TypeError("Cannot read property 'label' of undefined"))).toBe(
      "TypeError: Cannot read property 'label' of undefined",
    );
  });

  it("folds a multiline message onto one line and redacts every line", () => {
    const summary = diagnosticSummary(new Error("first line\n  Authorization: Bearer FAKE_BEARER\nlast line"));
    expect(summary).toBe("Error: first line Authorization: [redacted] last line");
  });

  it("is bounded however long the message", () => {
    const summary = diagnosticSummary(new Error(`word `.repeat(500)));
    expect(summary.length).toBeLessThanOrEqual(DIAGNOSTIC_MAX_CHARS);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("names a thrown value that is not an Error", () => {
    expect(diagnosticSummary("token=FAKE_TOKEN")).toBe("Thrown value: token=[redacted]");
    expect(diagnosticSummary({ code: 7 })).toBe('Thrown value: {"code":7}');
  });
});

describe("diagnosticLog", () => {
  it("adds the first stack frames, redacted and capped", () => {
    const error = new Error("boom");
    error.stack = [
      "Error: boom",
      ...Array.from(
        { length: 30 },
        (_, i) => `    at frame${i} (http://10.0.2.2:8081/index.bundle?platform=android&token=FAKE_TOKEN:1:${i})`,
      ),
    ].join("\n");
    const log = diagnosticLog(error);
    const lines = log.split("\n");
    expect(lines[0]).toBe("Error: boom");
    expect(lines).toHaveLength(1 + DIAGNOSTIC_STACK_LINES);
    expect(lines[1]).toBe("at frame0 (http://10.0.2.2:8081/index.bundle?[redacted]");
    expect(log).not.toMatch(SECRET);
  });
});
