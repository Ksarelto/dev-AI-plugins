import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutPage } from "./checkout-page";

test("the page offers the coupon field and drops the total after a valid coupon", async () => {
  render(<CheckoutPage isGuest={false} applyCoupon={async () => ({ ok: true, discount: 10 })} />);
  await userEvent.type(screen.getByLabelText("Coupon code"), "B2B10");
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(await screen.findByTestId("total")).toHaveTextContent("95.00 EUR");
});
