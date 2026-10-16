import { readFileSync } from "node:fs";
import path from "node:path";

import { recordFunnel, setToken, setTokenProvider } from "@/lib/api";

afterEach(() => {
  jest.restoreAllMocks();
  setToken(null);
  setTokenProvider(null);
});

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

it("posts a funnel event to the GRIDGO API", async () => {
  setToken("client-session");
  const request = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    status: 201,
    text: async () => JSON.stringify({ id: "fun_1" }),
  } as Response);
  await recordFunnel({ kind: "checkout_reached" });
  expect(request).toHaveBeenCalledWith(
    expect.stringMatching(/\/funnel-events$/),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ kind: "checkout_reached" }),
    }),
  );
});

it("sends each checkout step from the screens that own it", () => {
  const api = source("lib/api.ts");
  expect(api).toContain('"/funnel-events"');
  expect(api).not.toMatch(/segment\.com|googletagmanager|amplitude|mixpanel|posthog/i);
  // Home, the category screen and each category page all start a job here.
  expect(source("hooks/useStartPrintJob.ts")).toContain('kind: "product_viewed"');
  expect(source("app/request/listing.tsx")).toContain('kind: "listing_viewed"');
  const checkout = source("app/checkout.tsx");
  expect(checkout).toContain('kind: "checkout_reached"');
  expect(checkout).toContain('kind: "checkout_left"');
  expect(checkout).toContain('kind: "paid"');
  expect(source("components/PaymentPanel.tsx")).toContain('kind: "paid"');
});
