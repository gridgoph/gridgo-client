import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AUTHENTICATED_ROOT_SCREENS,
  hasActiveSession,
  SIGNED_OUT_ROOT_SCREENS,
} from "@/lib/sessionGuard";

describe("sessionGuard", () => {
  it("treats a non-null user as signed in and null as signed out", () => {
    expect(hasActiveSession(null)).toBe(false);
    expect(hasActiveSession(undefined)).toBe(false);
    expect(
      hasActiveSession({
        id: "u1",
        email: "client@gridgo.local",
        name: "Client",
        role: "client",
      }),
    ).toBe(true);
  });

  it("requires root-stack siblings outside (tabs) so logout cannot leave them open", () => {
    expect(AUTHENTICATED_ROOT_SCREENS).toEqual(
      expect.arrayContaining([
        "(tabs)",
        "order/[id]",
        "design-system",
        "settings",
        "saved-places",
        "saved-place",
      ]),
    );
    expect(SIGNED_OUT_ROOT_SCREENS).toContain("(auth)/login");
  });

  it("wires Stack.Protected in the root layout for the signed-in set (regression lock)", () => {
    // Source contract: if someone removes the guard or drops a protected screen
    // from the signed-in group, this fails before a manual sign-out walk.
    const layoutPath = join(__dirname, "../../app/_layout.tsx");
    const source = readFileSync(layoutPath, "utf8");

    expect(source).toContain("Stack.Protected");
    expect(source).toContain("hasActiveSession");
    expect(source).toMatch(/guard=\{\s*isSignedIn\s*\}/);
    expect(source).toMatch(/guard=\{\s*!isSignedIn\s*\}/);

    for (const name of AUTHENTICATED_ROOT_SCREENS) {
      expect(source).toContain(`name="${name}"`);
    }
    for (const name of SIGNED_OUT_ROOT_SCREENS) {
      expect(source).toContain(`name="${name}"`);
    }

    // Authenticated screens must sit inside the isSignedIn Protected block,
    // not only appear as free Stack.Screen entries.
    const signedInBlock = source.match(
      /Stack\.Protected\s+guard=\{\s*isSignedIn\s*\}[\s\S]*?<\/Stack\.Protected>/,
    );
    expect(signedInBlock).not.toBeNull();
    for (const name of AUTHENTICATED_ROOT_SCREENS) {
      expect(signedInBlock![0]).toContain(`name="${name}"`);
    }

    const signedOutBlock = source.match(
      /Stack\.Protected\s+guard=\{\s*!isSignedIn\s*\}[\s\S]*?<\/Stack\.Protected>/,
    );
    expect(signedOutBlock).not.toBeNull();
    for (const name of SIGNED_OUT_ROOT_SCREENS) {
      expect(signedOutBlock![0]).toContain(`name="${name}"`);
    }
  });
});
