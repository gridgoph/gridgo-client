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

const SECRET = /FAKE_BEARER|FAKE_SIGNATURE|FAKE_JWT|FAKE_KEY|FAKE_COOKIE|FAKE_TOKEN|FAKE_PASSWORD|FAKE_SID|FAKE_PREF/;

/** A message carrying credentials in JSON, single quotes and a multi-cookie header. */
const QUOTED =
  'Request failed {"token":"FAKE_TOKEN","password":"FAKE_PASSWORD","user":"ana"} ' +
  "and {'accessToken': 'FAKE_TOKEN2', 'apiKey':'FAKE_KEY2'} with secret='FAKE_PASSWORD3'\n" +
  "Cookie: theme=light; sid=FAKE_SID; pref=FAKE_PREF\n" +
  "Set-Cookie: sid=FAKE_SID2; Path=/; HttpOnly";

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

  it("takes out credentials in quoted JSON and single-quoted pairs", () => {
    const out = redactDiagnostic(QUOTED);
    expect(out).not.toMatch(SECRET);
    expect(out).toContain('{"token":"[redacted]","password":"[redacted]","user":"ana"}');
    expect(out).toContain("{'accessToken': '[redacted]', 'apiKey':'[redacted]'}");
    expect(out).toContain("secret='[redacted]'");
  });

  it("takes out a quoted value that holds an escaped quote", () => {
    const out = redactDiagnostic('{"password":"FAKE_\\"PASSWORD","next":1}');
    expect(out).toBe('{"password":"[redacted]","next":1}');
  });

  it("takes out every cookie in a Cookie or Set-Cookie header, not just the first", () => {
    const out = redactDiagnostic("Cookie: theme=light; sid=FAKE_SID; pref=FAKE_PREF\nSet-Cookie: sid=FAKE_SID2; Path=/");
    expect(out).not.toMatch(SECRET);
    expect(out).toBe("Cookie: [redacted]\nSet-Cookie: [redacted]");
  });

  it("takes out credentials in escaped (double-encoded) JSON", () => {
    const out = redactDiagnostic('API said "{\\"token\\":\\"FAKE_TOKEN\\",\\"ok\\":false}"');
    expect(out).not.toMatch(SECRET);
    expect(out).toBe('API said "{\\"token\\":\\"[redacted]\\",\\"ok\\":false}"');
  });

  it("takes out a key whose name carries digits or dots", () => {
    const out = redactDiagnostic('oauth2Token=FAKE_TOKEN {"auth.v2.password":"FAKE_PASSWORD"}');
    expect(out).toBe('oauth2Token=[redacted] {"auth.v2.password":"[redacted]"}');
  });

  it("takes out an object or array held under a secret key", () => {
    const out = redactDiagnostic('{"credentials":{"user":"ana","pin":"FAKE_PASSWORD"},"tokens":["FAKE_TOKEN","FAKE_TOKEN2"],"n":1}');
    expect(out).toBe('{"credentials":[redacted],"tokens":[redacted],"n":1}');
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

  it("redacts JSON and cookie credentials in the one line it shows", () => {
    const summary = diagnosticSummary(new Error(QUOTED));
    expect(summary).not.toMatch(SECRET);
    expect(summary).toContain('Error: Request failed {"token":"[redacted]"');
  });

  it("redacts a thrown object, which it shows as JSON", () => {
    const summary = diagnosticSummary({ status: 401, token: "FAKE_TOKEN", nested: { password: "FAKE_PASSWORD" } });
    expect(summary).toBe('Thrown value: {"status":401,"token":"[redacted]","nested":{"password":"[redacted]"}}');
  });

  it("redacts a thrown object by key at every depth, objects and arrays included", () => {
    const summary = diagnosticSummary({
      status: 401,
      body: { session: { id: "FAKE_SID", user: "ana" }, items: [{ apiKey: "FAKE_KEY" }] },
      refreshTokens: ["FAKE_TOKEN"],
    });
    expect(summary).not.toMatch(SECRET);
    expect(summary).toBe(
      'Thrown value: {"status":401,"body":{"session":"[redacted]","items":[{"apiKey":"[redacted]"}]},"refreshTokens":"[redacted]"}',
    );
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

  it("redacts JSON, single-quoted and cookie credentials in the summary and every frame", () => {
    const error = new Error(QUOTED);
    error.stack = [
      `Error: ${QUOTED}`,
      `    at send (app.js:1:2) {"password":"FAKE_PASSWORD9"}`,
      "    at retry (app.js:3:4) Cookie: a=1; sid=FAKE_SID9",
    ].join("\n");
    const log = diagnosticLog(error);
    expect(log).not.toMatch(SECRET);
    expect(log).toContain('{"password":"[redacted]"}');
    expect(log).toContain("Cookie: [redacted]");
    expect(diagnosticLog({ token: "FAKE_TOKEN" })).toBe('Thrown value: {"token":"[redacted]"}');
  });
});
