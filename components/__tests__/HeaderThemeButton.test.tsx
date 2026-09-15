import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import { HeaderThemeButton } from "@/components/HeaderThemeButton";
import { useThemeStore } from "@/store/theme";

describe("HeaderThemeButton", () => {
  it.each(["system", "light", "dark"] as const)("applies the %s preference", async (preference) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    try {
      await act(async () => {
        useThemeStore.getState().setPreference(preference === "dark" ? "light" : "dark");
      });
      await render(<HeaderThemeButton />);
      await fireEvent.press(screen.getByRole("button", { name: "Choose theme" }));

      expect(alert).toHaveBeenCalledTimes(1);
      const [title, , buttons, options] = alert.mock.calls[0];
      expect(title).toBe("Theme");
      expect(options?.cancelable).toBe(true);
      expect(buttons?.map((button) => button.text)).toEqual(["System", "Light", "Dark"]);
      const choice = buttons?.find((button) => button.text?.toLowerCase() === preference);
      expect(choice?.onPress).toBeDefined();
      await act(async () => { choice?.onPress?.(); });
      expect(useThemeStore.getState().preference).toBe(preference);
    } finally {
      alert.mockRestore();
    }
  });
});
