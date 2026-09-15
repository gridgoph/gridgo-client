import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Platform } from "react-native";

import { PushedStackHeader } from "@/components/PushedStackHeader";
import { pushedScreenOptions } from "@/lib/navigationHeaders";

const mockInsets = { top: 48, right: 0, bottom: 0, left: 0 };
const headerProps: { headerStatusBarHeight?: number; title?: string }[] = [];

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
}));

jest.mock("expo-router/react-navigation", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    getHeaderTitle: (options: { title?: string }, name: string) => options.title ?? name,
    Header: (props: { headerStatusBarHeight?: number; title?: string; headerRight?: () => ReactNode }) => {
      headerProps.push(props);
      return <View testID="pushed-stack-header">{props.headerRight?.()}</View>;
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

  it.each(["Sign in", "New request"])("keeps the theme gear in the %s header", async (title) => {
    jest.replaceProperty(Platform, "OS", "android");
    try {
      await render(
        <PushedStackHeader options={pushedScreenOptions(title)} route={{ name: "test" }} />,
      );

      expect(screen.getByRole("button", { name: "Choose theme" })).toBeOnTheScreen();
      expect(headerProps[0]?.title).toBe(title);
      expect(headerProps[0]?.headerStatusBarHeight).toBe(mockInsets.top);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
