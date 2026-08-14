/**
 * Complete a Clerk Google browser-SSO attempt.
 *
 * `useSSO().startSSOFlow` is not enough: a created session must be activated
 * with `setActive({ session })` or Clerk has a session the app never adopted.
 * A second tap while already signed in must not start SSO again.
 */

export type GoogleSsoFlowResult = {
  createdSessionId: string | null;
  setActive?: (args: { session: string }) => Promise<unknown>;
  authSessionResult?: { type?: string } | null;
};

export type GoogleSsoOutcome =
  | { status: "already_signed_in" }
  | { status: "activated"; sessionId: string }
  | { status: "cancelled" }
  | { status: "incomplete" };

export async function completeGoogleSso(input: {
  alreadySignedIn: boolean;
  startSSOFlow: () => Promise<GoogleSsoFlowResult>;
  setActive: (args: { session: string }) => Promise<unknown>;
}): Promise<GoogleSsoOutcome> {
  if (input.alreadySignedIn) return { status: "already_signed_in" };

  const result = await input.startSSOFlow();
  const dismiss = result.authSessionResult?.type;
  if (dismiss === "cancel" || dismiss === "dismiss") return { status: "cancelled" };

  if (result.createdSessionId) {
    const activate = result.setActive ?? input.setActive;
    await activate({ session: result.createdSessionId });
    return { status: "activated", sessionId: result.createdSessionId };
  }

  return { status: "incomplete" };
}
