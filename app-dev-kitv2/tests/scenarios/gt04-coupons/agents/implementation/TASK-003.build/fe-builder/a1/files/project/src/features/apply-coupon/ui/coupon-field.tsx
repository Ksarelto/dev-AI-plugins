import { useState, type ReactElement } from "react";
import { Button } from "@/shared/ui/button";
import { InlineError } from "@/shared/ui/inline-error";
import { Input } from "@/shared/ui/input";

export type ApplyResult = { ok: true; discount: number } | { ok: false; message: string };

export function CouponField({ isGuest, onApply }: { isGuest: boolean; onApply: (code: string) => Promise<ApplyResult> }): ReactElement | null {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ApplyResult | null>(null);
  if (isGuest) return null;
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setResult(await onApply(code));
      }}
    >
      <Input id="coupon-code" label="Coupon code" value={code} onChange={(event) => setCode(event.target.value)} />
      <Button type="submit" disabled={!code}>
        Apply
      </Button>
      {result?.ok && <p data-testid="discount">-{result.discount.toFixed(2)} EUR</p>}
      {result && !result.ok && <InlineError message={result.message} />}
    </form>
  );
}
