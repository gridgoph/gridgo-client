import { claimAppleRevocation, forgetAppleRevocation } from "@/store/accountDeletion";
import { useSession } from "@/store/session";

jest.mock("@/store/accountDeletion", () => ({
  ...jest.requireActual("@/store/accountDeletion"),
  forgetAppleRevocation: jest.fn(),
  claimAppleRevocation: jest.fn(),
}));

/** Apple's held code and result belong to the person, so a real sign-out drops them. */
it("drops the Apple revocation memory on sign-out, and not on a launch with no user yet", () => {
  useSession.setState({ user: null, signingOut: false });
  expect(forgetAppleRevocation).not.toHaveBeenCalled();

  useSession.setState({ signingOut: true });
  expect(forgetAppleRevocation).toHaveBeenCalledTimes(1);
});

it("drops it when Clerk reports the identity gone, and not on a mid-session 401", () => {
  (forgetAppleRevocation as jest.Mock).mockClear();
  useSession.setState({ signingOut: false, source: "clerk", user: { id: "usr_1" } as never });

  // A 401 drops the GRIDGO user but keeps the Clerk identity.
  useSession.setState({ user: null });
  expect(forgetAppleRevocation).not.toHaveBeenCalled();

  useSession.getState().clearSession();
  expect(forgetAppleRevocation).toHaveBeenCalledTimes(1);
});

it("tells the Apple memory which account signed in", () => {
  (claimAppleRevocation as jest.Mock).mockClear();
  useSession.setState({ user: { id: "usr_2" } as never });
  expect(claimAppleRevocation).toHaveBeenCalledWith("usr_2");
});
