// Cartographer adapters for the backend (express-layered) and agent (langgraph) stacks, on tiny trees,
// run in each role's folder with project-relative paths.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { ENGINE, YAML } from "./helpers.mjs";

const { buildIndex } = await import(`${ENGINE}/scripts/lib/cartographer.mjs`);
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "carto-"));
  mkdirSync(join(dir, ".factory"), { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}
const inventory = (dir) => YAML.parse(readFileSync(join(dir, ".factory/_index/component-inventory.yaml"), "utf8")).components;

test("express-layered: layered modules with exports, importers and the endpoints a routes file declares", () => {
  const dir = tree({
    "api/src/routes/coupons.routes.ts": "import { CouponsController } from '../controllers/coupons.controller.js';\nexport function createCouponsRouter(c) { router.post('/apply', c.apply); router.get('/:code', c.get); }\n",
    "api/src/controllers/coupons.controller.ts": "import { CouponsService } from '../services/coupons.service.js';\nexport class CouponsController {}\n",
    "api/src/services/coupons.service.ts": "import { CouponsRepository } from '../repositories/coupons.repository.js';\nexport class CouponsService {}\n",
    "api/src/repositories/coupons.repository.ts": "export interface CouponsRepository {}\nexport function createCouponsRepository() {}\n",
    "api/src/services/coupons.service.test.ts": "import '../services/coupons.service.js';\n",
  });
  const r = buildIndex(dir, { roles: { backend: { enabled: true, stack: "b", path: "api" } } }, { b: { stack: { index_adapter: "express-layered" } } });
  assert.deepEqual(r.adapters, ["express-layered"]);
  const c = inventory(dir);
  const route = c.find((x) => x.layer === "route");
  assert.deepEqual([route.name, route.path, route.endpoints], ["coupons", "api/src/routes/coupons.routes.ts", ["POST /apply", "GET /:code"]]);
  const repo = c.find((x) => x.layer === "repository");
  assert.deepEqual([repo.exports, repo.used_by], [["CouponsRepository", "createCouponsRepository"], 1]);
  assert.ok(!c.some((x) => x.path.includes(".test.")), "tests are not components");
});

test("langgraph: agent folders, their nodes and tools, and the llm/rag modules", () => {
  const dir = tree({
    "src/agents/support/graph.ts": "import { createLookupTool } from './tools/lookup.js';\nexport function buildSupportGraph() {}\n",
    "src/agents/support/state.ts": "export const SupportState = 1;\n",
    "src/agents/support/tools/lookup.ts": "export function createLookupTool() {}\n",
    "src/agents/support/nodes/guard.ts": "export function createGuardNode() {}\n",
    "src/llm/models.ts": "export function createChatModel() {}\n",
  });
  buildIndex(dir, { roles: { "ai-agent": { enabled: true, stack: "a" } } }, { a: { stack: { index_adapter: "langgraph" } } });
  const byLayer = (layer) => inventory(dir).filter((x) => x.layer === layer).map((x) => x.path).sort();
  assert.deepEqual(byLayer("agent"), ["src/agents/support/graph.ts", "src/agents/support/state.ts"]);
  assert.deepEqual(byLayer("tool"), ["src/agents/support/tools/lookup.ts"]);
  assert.deepEqual(byLayer("node"), ["src/agents/support/nodes/guard.ts"]);
  assert.deepEqual(byLayer("llm"), ["src/llm/models.ts"]);
  assert.equal(inventory(dir).find((x) => x.layer === "tool").used_by, 1);
});
