import { forgetAppleRevocation } from "@/store/accountDeletion";
import { useSession } from "@/store/session";

jest.mock("@/store/accountDeletion", () => ({
  ...jest.requireActual("@/store/accountDeletion"),
  forgetAppleRevocation: jest.fn(),
}));

/** Apple's held code and result belong to the person, so a real sign-out drops them. */
it("drops the Apple revocation memory on sign-out, and not on a launch with no user yet", () => {
  useSession.setState({ user: null, signingOut: false });
  expect(forgetAppleRevocation).not.toHaveBeenCalled();

  useSession.setState({ signingOut: true });
  expect(forgetAppleRevocation).toHaveBeenCalledTimes(1);
});
