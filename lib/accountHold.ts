export function accountHold(user: {
  accountStatus?: string | null;
  accountStatusReason?: string | null;
} | null | undefined): { title: string; reason: string } | null {
  if (user?.accountStatus === "suspended") {
    return { title: "This account is suspended.", reason: user.accountStatusReason ?? "" };
  }
  if (user?.accountStatus === "removed") {
    return { title: "This account has been removed.", reason: user.accountStatusReason ?? "" };
  }
  return null;
}

/**
 * The account standing a `403 account_suspended|account_removed` body carries.
 * `GET /me` sits behind the API's hold gate, so a mid-session refresh learns of
 * a hold this way rather than from `/auth/me`.
 */
export function accountHoldFromForbidden(
  body: unknown,
): { accountStatus: "suspended" | "removed"; accountStatusReason: string | null } | null {
  if (typeof body !== "object" || !body) return null;
  const { error, reason } = body as { error?: unknown; reason?: unknown };
  const accountStatusReason = typeof reason === "string" ? reason : null;
  if (error === "account_suspended") return { accountStatus: "suspended", accountStatusReason };
  if (error === "account_removed") return { accountStatus: "removed", accountStatusReason };
  return null;
}
