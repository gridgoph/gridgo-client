import { shouldRetryClerkJoin, type ClerkJoinRetryState } from "@/lib/sessionResume";

const kept: ClerkJoinRetryState = {
  clerkSignedIn: true,
  user: null,
  pendingClerkProfile: false,
  loading: false,
  signingOut: false,
  error: null,
  loginIdle: true,
  signupIdle: true,
};

describe("shouldRetryClerkJoin", () => {
  it("joins a Clerk session GRIDGO has not joined yet", () => {
    expect(shouldRetryClerkJoin(kept)).toBe(true);
  });

  it.each<[string, Partial<ClerkJoinRetryState>]>([
    ["Clerk is signed out", { clerkSignedIn: false }],
    ["a client is already signed in", { user: { id: "u1" } }],
    ["Finish signing up is waiting", { pendingClerkProfile: true }],
    ["a join is already running", { loading: true }],
    ["the client is signing out", { signingOut: true }],
    ["the identity was refused", { error: "This email is not available." }],
    ["sign-in is collecting a code", { loginIdle: false }],
    ["sign-up is collecting a code", { signupIdle: false }],
  ])("leaves it alone when %s", (_why, change) => {
    expect(shouldRetryClerkJoin({ ...kept, ...change })).toBe(false);
  });
});
