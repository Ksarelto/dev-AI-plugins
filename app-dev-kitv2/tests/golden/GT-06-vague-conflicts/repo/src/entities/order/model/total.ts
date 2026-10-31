export function calculateTotal(lines: number[], shipping: number): number {
  return Math.round((lines.reduce((a, b) => a + b, 0) + shipping) * 100) / 100;
}
