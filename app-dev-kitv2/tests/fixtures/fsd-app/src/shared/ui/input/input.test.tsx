import { render, screen } from "@testing-library/react";
import { Input } from "./input";

test("labels the input", () => {
  render(<Input id="code" label="Coupon code" />);
  expect(screen.getByLabelText("Coupon code")).toBeInTheDocument();
});
