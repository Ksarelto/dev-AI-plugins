// gate-profile (A0 Bootstrap): the app profile exists and is schema-valid.
import { validate } from "../lib/schemas.mjs";

export const inputs = ["app-profile"];

export function run(ctx) {
  const profile = ctx.load("app-profile");
  if (!profile) return [{ check: "app-profile", message: ".factory/app-profile.yaml is missing" }];
  return validate("app-profile", profile.data).map((e) => ({ check: "schema", rule: "app-profile", file: profile.rel, message: e }));
}
