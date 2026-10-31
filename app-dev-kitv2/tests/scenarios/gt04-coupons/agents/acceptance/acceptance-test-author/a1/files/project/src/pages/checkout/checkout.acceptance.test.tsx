import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutPage } from "@/pages/checkout";

const applyCoupon = async (code: string) =>
  code === "B2B10"
    ? { ok: true as const, discount: 10 }
    : code === "LOYAL"
      ? { ok: false as const, message: "Coupons cannot be combined with the loyalty discount" }
      : { ok: false as const, message: "This coupon has expired" };

async function apply(code: string) {
  render(<CheckoutPage isGuest={false} applyCoupon={applyCoupon} />);
  await userEvent.type(screen.getByLabelText("Coupon code"), code);
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
}

test("AC-0001 applying B2B10 shows a -10.00 EUR discount line", async () => {
  await apply("B2B10");
  expect(await screen.findByTestId("discount")).toHaveTextContent("-10.00 EUR");
});

test("AC-0002 an expired coupon shows the message and keeps the total", async () => {
  await apply("OLD");
  expect(await screen.findByRole("alert")).toHaveTextContent("This coupon has expired");
  expect(screen.getByTestId("total")).toHaveTextContent("105.00 EUR");
});

test("AC-0003 the total is sum(lines) - discount + shipping", async () => {
  await apply("B2B10");
  expect(await screen.findByTestId("total")).toHaveTextContent("95.00 EUR");
});

test("AC-0004 a loyalty discount blocks coupons", async () => {
  await apply("LOYAL");
  expect(await screen.findByRole("alert")).toHaveTextContent("Coupons cannot be combined with the loyalty discount");
});
