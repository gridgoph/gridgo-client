import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { StartPrintFab } from "@/components/StartPrintFab";
import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

describe("StartPrintFab", () => {
  beforeEach(() => {
    mockPush.mockClear();
    useCart.getState().reset();
    useRequestDraft.getState().reset();
  });

  it("opens the catalogue when nothing is in progress", async () => {
    await renderInSafeArea(<StartPrintFab />);
    fireEvent.press(screen.getByLabelText("Start a print request"));
    expect(mockPush).toHaveBeenCalledWith("/request/category");
  });

  it("opens checkout when a basket is already started", async () => {
    useCart.setState({ cartId: "cart_1" });
    await renderInSafeArea(<StartPrintFab />);
    fireEvent.press(screen.getByLabelText("Start a print request"));
    expect(mockPush).toHaveBeenCalledWith("/checkout");
  });
});
