import { fireEvent, screen } from "@testing-library/react-native";

import NewQuoteScreen from "@/app/quotes/new";
import { renderScreen } from "@/test/renderScreen";

/**
 * Request a quote (gridgo-api#226): nothing is sent until the brief is whole,
 * and every missing field says what to fix. The file comes first.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ productType: "three_d_printing_scale_models" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listAddresses: jest.fn(async () => []),
    createQuoteRequest: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("asks for the file and the job's facts before sending anything", async () => {
  await renderScreen(<NewQuoteScreen />);

  // The product type arrives chosen from where the client started.
  expect(screen.getByRole("radio", { name: /^3D printing & scale models/ }).props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(screen.queryByText(/deadline/i)).toBeNull();

  fireEvent.press(screen.getByRole("button", { name: "Send quote request" }));

  expect(await screen.findByText("Upload your artwork or a reference first.")).toBeTruthy();
  expect(screen.getByText("Say what it is for.")).toBeTruthy();
  expect(screen.getByText("Choose indoor or outdoor.")).toBeTruthy();
  expect(screen.getByText("Give a size, for example 2 x 6 ft.")).toBeTruthy();
  expect(screen.getByText("Choose delivery or pick-up.")).toBeTruthy();
  expect(screen.getByText("Check the fields marked above.")).toBeTruthy();
  expect(api.createQuoteRequest).not.toHaveBeenCalled();
});
