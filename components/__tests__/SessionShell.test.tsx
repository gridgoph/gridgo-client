import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { SessionShell } from "@/components/SessionShell";
import { useSession } from "@/store/session";

const tabs = (
  <>
    <Text>Home</Text>
    <Text>Orders</Text>
    <Text>Notifications</Text>
    <Text>Account</Text>
  </>
);

afterEach(() => {
  useSession.setState({ user: null });
});

describe("suspended /auth/me", () => {
  it("renders the reason and does not render the main tabs", async () => {
    useSession.setState({
      user: {
        id: "user_client",
        email: "client@gridgo.test",
        name: "Ana Client",
        role: "client",
        accountStatus: "suspended",
        accountStatusReason: "Missed a payment",
      },
    });

    await render(<SessionShell>{tabs}</SessionShell>);

    expect(screen.getByText("This account is suspended.")).toBeTruthy();
    expect(screen.getByText("Missed a payment")).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.queryByText("Home")).toBeNull();
    expect(screen.queryByText("Orders")).toBeNull();
    expect(screen.queryByText("Notifications")).toBeNull();
    expect(screen.queryByText("Account")).toBeNull();
  });

  it("renders the removal reason instead of the main tabs", async () => {
    useSession.setState({
      user: {
        id: "user_client",
        email: "client@gridgo.test",
        name: "Ana Client",
        role: "client",
        accountStatus: "removed",
        accountStatusReason: "Closed the account",
      },
    });

    await render(<SessionShell>{tabs}</SessionShell>);

    expect(screen.getByText("This account has been removed.")).toBeTruthy();
    expect(screen.getByText("Closed the account")).toBeTruthy();
    expect(screen.queryByText("Home")).toBeNull();
  });
});
