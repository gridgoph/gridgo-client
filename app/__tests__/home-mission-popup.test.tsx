import { waitFor } from "@testing-library/react-native";

import HomeScreen from "@/app/(tabs)/home";
import * as api from "@/lib/api";
import { useExpressGuide } from "@/store/expressGuide";
import { renderScreen } from "@/test/renderScreen";
import { resetExpressHome } from "@/test/expressHomeHarness";

const mockPush = jest.fn();

jest.mock("expo-router", () => jest.requireActual("@/test/expressHomeHarness").expressHomeRouter((href: unknown) => mockPush(href)));
jest.mock("@/lib/api", () => jest.requireActual("@/test/expressHomeHarness").expressHomeApiMock());

beforeEach(() => {
  mockPush.mockClear();
  jest.mocked(api.updateExpressGuide).mockClear();
  resetExpressHome();
});

// client#441: GRIDGO says today's popup is due; Home opens it once and records the day.
it("opens the mission popup once and tells GRIDGO it was shown today", async () => {
  await renderScreen(<HomeScreen />);

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/mission"));
  expect(api.updateExpressGuide).toHaveBeenCalledWith("popup_shown", undefined);
  expect(useExpressGuide.getState().popupOpened).toBe(true);
  expect(mockPush.mock.calls.filter(([href]) => href === "/mission")).toHaveLength(1);
});
