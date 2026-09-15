import { render } from "@testing-library/react-native";

import { PushedStackHeader } from "@/components/PushedStackHeader";

const mockInsets = { top: 48, right: 0, bottom: 0, left: 0 };
const headerProps: Array<{ headerStatusBarHeight?: number; title?: string }> = [];

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
}));

jest.mock("expo-router/react-navigation", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    getHeaderTitle: (options: { title?: string }, name: string) => options.title ?? name,
    Header: (props: { headerStatusBarHeight?: number; title?: string }) => {
      headerProps.push(props);
      return <View testID="pushed-stack-header" />;
    },
  };
});

describe("PushedStackHeader", () => {
  beforeEach(() => {
    headerProps.length = 0;
  });

  it("applies the status inset once as headerStatusBarHeight", async () => {
    await render(
      <PushedStackHeader
        options={{ title: "Sign in" }}
        route={{ name: "(auth)/login" }}
        back={{ title: "Welcome", href: undefined }}
      />,
    );

    expect(headerProps).toHaveLength(1);
    expect(headerProps[0]?.headerStatusBarHeight).toBe(mockInsets.top);
    expect(headerProps[0]?.title).toBe("Sign in");
  });
});
