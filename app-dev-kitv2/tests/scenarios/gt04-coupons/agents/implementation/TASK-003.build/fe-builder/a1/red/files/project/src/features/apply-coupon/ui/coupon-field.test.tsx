import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CouponField } from "./coupon-field";

async function apply(code: string) {
  await userEvent.type(screen.getByLabelText("Coupon code"), code);
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
}

test("a valid coupon shows the discount line (AC-0001)", async () => {
  render(<CouponField isGuest={false} onApply={async () => ({ ok: true, discount: 10 })} />);
  await apply("B2B10");
  expect(await screen.findByTestId("discount")).toHaveTextContent("-10.00 EUR");
});

test("an expired coupon shows the message (AC-0002)", async () => {
  render(<CouponField isGuest={false} onApply={async () => ({ ok: false, message: "This coupon has expired" })} />);
  await apply("OLD");
  expect(await screen.findByRole("alert")).toHaveTextContent("This coupon has expired");
});

test("a loyalty discount blocks coupons (AC-0004)", async () => {
  render(<CouponField isGuest={false} onApply={async () => ({ ok: false, message: "Coupons cannot be combined with the loyalty discount" })} />);
  await apply("B2B10");
  expect(await screen.findByRole("alert")).toHaveTextContent("Coupons cannot be combined with the loyalty discount");
});

test("guests do not see the coupon field", () => {
  const { container } = render(<CouponField isGuest onApply={async () => ({ ok: true, discount: 0 })} />);
  expect(container).toBeEmptyDOMElement();
});
