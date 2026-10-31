// gate-arch (S3): every component is owned by a story, net-new components say why nothing existing
// was reused, cited ADRs exist, and the API contract (when present) is well-formed and traces to ACs.
import { validate } from "../lib/schemas.mjs";

export const inputs = ["component-map", "adr", "api-contract", "agent-design", "stories", "prd", "delta-spec"];
const METHODS = ["get", "put", "post", "patch", "delete", "head", "options"];

export function run(ctx) {
  const map = ctx.load("component-map");
  if (!map) return [{ check: "component-map", message: "03-architecture/component-map.md is missing" }];
  const failures = [];
  const fail = (check, rule, message, file = map.rel) => failures.push({ check, rule, file, message });
  for (const e of validate("component-map", map.data)) fail("schema", "component-map", e);
  if (failures.length) return failures;

  const storyIds = new Set((ctx.load("stories")?.data.stories ?? []).map((s) => s.id));
  const owned = new Set();
  const names = new Set();
  for (const c of map.data.components) {
    if (names.has(c.name)) fail("components", "duplicate", `${c.name} is listed twice`);
    names.add(c.name);
    for (const s of c.stories) {
      if (!storyIds.has(s)) fail("trace", "unknown-story", `${c.name} is owned by ${s}, which is not in stories.yaml`);
      owned.add(s);
    }
    if (c.reuse === "new" && !c.reuse_rejected) fail("reuse", "no-reason", `${c.name} is new but gives no reuse_rejected reason`);
  }
  for (const s of storyIds) if (!owned.has(s)) fail("trace", "story-without-component", `${s} has no component`);
  // A role with an architect (ai-agent: graph topology, state, tools) owes its design document.
  const architects = Object.values(ctx.config.roles ?? {}).filter((r) => r?.enabled && ctx.packs?.[r.pack]?.role?.agents?.architect);
  if (architects.length && !ctx.load("agent-design")) fail("agent-design", "missing", "03-architecture/agent-design.md is missing (an enabled role has an architect)", "03-architecture/agent-design.md");

  const adrs = new Map(ctx.all("adr").map((a) => [a.data.id, a]));
  for (const a of adrs.values()) for (const e of validate("adr", a.data)) fail("schema", "adr", e, a.rel);
  for (const id of map.data.decisions) if (!adrs.has(id)) fail("decisions", "missing-adr", `${id} is cited but no 03-architecture/adr-*.md has that id`);

  const contract = ctx.load("api-contract");
  const ops = new Set();
  if (contract) {
    const specAcs = new Set(ctx.spec()?.reqs.flatMap((r) => r.acs.map((a) => a.id)) ?? []);
    if (!/^3\./.test(String(contract.data.openapi ?? ""))) fail("contract", "openapi-version", "api-contract.yaml must be OpenAPI 3.x", contract.rel);
    for (const [path, item] of Object.entries(contract.data.paths ?? {})) {
      for (const method of METHODS.filter((m) => item?.[m])) {
        const op = item[method];
        if (!op.operationId) fail("contract", "no-operation-id", `${method.toUpperCase()} ${path} has no operationId`, contract.rel);
        else if (ops.has(op.operationId)) fail("contract", "duplicate-operation", `${op.operationId} is used twice`, contract.rel);
        ops.add(op.operationId);
        for (const ac of op["x-factory"]?.acs ?? []) if (!specAcs.has(ac)) fail("contract", "unknown-ac", `${op.operationId} cites ${ac}, which is not in the spec`, contract.rel);
        if (!op["x-factory"]?.acs?.length) fail("contract", "no-acs", `${op.operationId} has no x-factory.acs`, contract.rel);
      }
    }
  }
  for (const op of map.data.contract_ops ?? []) if (!ops.has(op)) fail("contract", "unknown-operation", `component map uses ${op}, which api-contract.yaml does not define`);
  return failures;
}
