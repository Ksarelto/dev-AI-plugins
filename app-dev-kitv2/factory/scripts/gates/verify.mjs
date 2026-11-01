// gate-verify (S6): the review has no blocking finding (quality.review_blocking, P0/P1 by default) —
// reviewer lenses and role audits — and gate-checks passes (the whole suite with the acceptance tests,
// typecheck, lint, build, integration tests and full evals). gate-checks already ran before the
// reviewers; its passing result is reused while the working tree is unchanged.
import { runGate } from "../lib/gatekeeper.mjs";

export const inputs = ["review", "acceptance-tests", "change-set"];
export const cacheable = false;

export async function run(ctx) {
  const failures = [];
  const review = ctx.load("review");
  if (!review) failures.push({ check: "review", message: "06-verify/review.md was not written" });
  const blocking = ctx.config.quality?.review_blocking ?? ["P0", "P1"];
  for (const f of review?.data.findings ?? []) {
    if (blocking.includes(f.severity)) {
      failures.push({ check: "review", rule: `blocking-${f.severity}`, fix: true, file: f.file, message: `${f.id ?? f.lens ?? "finding"}: ${f.claim}${f.fix_hint ? ` — ${f.fix_hint}` : ""}` });
    }
  }
  failures.push(...(await runGate("checks", ctx)).failures);
  return failures;
}
