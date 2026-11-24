import { redirectSystemPath } from "@/app/+native-intent";
import { inviteTokenInPath, usePendingGroupInvite } from "@/store/pendingGroupInvite";
import { useSession } from "@/store/session";

const TOKEN = "JVNs_AtGFFDw3w5Xpiq7VL_9aRIdN43OUpd1n6LiyGA";

beforeEach(() => {
  usePendingGroupInvite.getState().clear();
  useSession.setState({ user: null });
});

// gridgo-client#450: an invite link opens the app on the join screen, even signed out.
describe("invite links", () => {
  it("finds the token in every shape the link arrives in", () => {
    expect(inviteTokenInPath(`/express/group/join/${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenInPath(`gridgoclient://express/group/join/${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenInPath(`exp://192.168.1.5:8081/--/express/group/join/${TOKEN}?x=1`)).toBe(TOKEN);
    expect(inviteTokenInPath("/express/group/join/short")).toBeNull();
    expect(inviteTokenInPath("/express/order/abc")).toBeNull();
  });

  it("holds the invite while signed out, and leaves the path alone", () => {
    const path = `gridgoclient://express/group/join/${TOKEN}`;
    expect(redirectSystemPath({ path, initial: true })).toBe(path);
    expect(usePendingGroupInvite.getState().token).toBe(TOKEN);
  });

  it("does not hold anything for a signed-in person, who opens it directly", () => {
    useSession.setState({ user: { id: "u_1" } as never });
    redirectSystemPath({ path: `/express/group/join/${TOKEN}`, initial: false });
    expect(usePendingGroupInvite.getState().token).toBeNull();
  });
});
