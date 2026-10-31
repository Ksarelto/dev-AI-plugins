/** Order total: sum of the lines minus the discount plus shipping, rounded half-even to 2 decimals. */
export function calculateTotal(lines: number[], shipping: number, discount = 0): number {
  return roundHalfEven(lines.reduce((sum, line) => sum + line, 0) - Math.max(0, discount) + shipping);
}

function roundHalfEven(value: number): number {
  const cents = value * 100;
  const floor = Math.floor(cents);
  const diff = cents - floor;
  const rounded = diff > 0.5 || (diff === 0.5 && floor % 2 === 1) ? floor + 1 : floor;
  return rounded / 100;
}
