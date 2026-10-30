import { render, screen } from "@testing-library/react-native";

import { PrepareFileGuide } from "@/components/PrepareFileGuide";

describe("PrepareFileGuide", () => {
  it("draws each of GRIDGO's targets for the product", async () => {
    await render(
      <PrepareFileGuide
        rows={[
          { id: "colour", title: "Save it in CMYK", body: "Printers mix ink in CMYK." },
          { id: "resolution", title: "300 DPI at the printed size", body: "Sharper prints." },
        ]}
      />,
    );

    expect(screen.getByText("Prepare your file")).toBeTruthy();
    expect(screen.getByLabelText("Save it in CMYK. Printers mix ink in CMYK.")).toBeTruthy();
    expect(screen.getByText("300 DPI at the printed size")).toBeTruthy();
  });
});
