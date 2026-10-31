import type { ReactElement } from "react";

export type ApplyResult = { ok: true; discount: number } | { ok: false; message: string };

export function CouponField(_props: { isGuest: boolean; onApply: (code: string) => Promise<ApplyResult> }): ReactElement | null {
  throw new Error("not implemented");
}
