// Stack knowledge in packs: a task's skills, rules and golden files come from its stack's stack.yaml,
// and stage agents get the skills and the convention set the stack names for them.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, conductor, loopSetup, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const { procedureKnowledge, stageKnowledge, taskKnowledge } = await import(`${ENGINE}/scripts/lib/knowledge.mjs`);
const ROOT = join(TESTS, "..", "..");
const kit = (name) => ({ root: join(ROOT, name), stack: YAML.parse(readFileSync(join(ROOT, name, "stack.yaml"), "utf8")) });
const front = (pack) => YAML.parse(pack.split("---")[1]);

test("taskKnowledge: test skill outside green, the type's skills, '*' + type rules, golden files", () => {
  const fe = kit("frontend-dev-kit");
  const red = taskKnowledge(fe, "feature-ui", "red");
  assert.deepEqual(red.skills, ["frontend-dev-kit:testing", "frontend-dev-kit:react-feature", "frontend-dev-kit:react-component", "frontend-dev-kit:error-handling"]);
  assert.ok(red.rules.some((r) => r.endsWith("frontend-dev-kit/rules/general-coding-principles.mdc")));
  assert.ok(red.rules.some((r) => r.endsWith("frontend-dev-kit/rules/styling.mdc")));
  assert.equal(new Set(red.rules).size, red.rules.length, "no rule twice");
  assert.deepEqual(red.golden, [join(ROOT, "frontend-dev-kit", "skills/react-feature/examples.md")]);
  const green = taskKnowledge(fe, "feature-ui", "green");
  assert.ok(!green.skills.includes("frontend-dev-kit:testing"), "green does not load the test skill");
  assert.deepEqual(red.skill_files.map((f) => f.replace(`${ROOT}/`, "")), ["frontend-dev-kit/skills/testing/SKILL.md", "frontend-dev-kit/skills/react-feature/SKILL.md", "frontend-dev-kit/skills/react-component/SKILL.md", "frontend-dev-kit/skills/error-handling/SKILL.md"], "the forced skill loads, for the context estimate");
  assert.deepEqual(taskKnowledge(null, "x", "red"), { skills: [], skill_files: [], rules: [], golden: [] });
});

test("stageKnowledge: only agents a stack names, with that stack's whole rule set", () => {
  const packs = [{ role: "frontend", pack: kit("frontend-dev-kit") }, { role: "backend", pack: kit("node-backend-dev-kit") }];
  const reviewer = stageKnowledge(packs, "reviewer");
  assert.deepEqual(reviewer.map((k) => k.role), ["frontend", "backend"]);
  assert.ok(reviewer[0].skills.includes("frontend-dev-kit:code-review"));
  assert.ok(reviewer[1].rules.some((r) => r.endsWith("node-backend-dev-kit/rules/database.mdc")), "type rules are part of the set");
  assert.deepEqual(stageKnowledge(packs, "intake-normaliser"), [], "an agent no stack names gets nothing");
  assert.deepEqual(stageKnowledge(packs, "contract-steward").map((k) => k.role), ["backend"]);
});

test("an agent's skills list can call each stack skill its dispatch loads, without forcing the other kits", () => {
  const agentFile = (pack, agent) => join(ROOT, "app-dev-kitv2", pack, "agents", `${agent}.md`);
  const skillsOf = (pack, agent) => YAML.parse(readFileSync(agentFile(pack, agent), "utf8").split("---")[1]).skills;
  const list = (v) => (v == null ? [] : [v].flat());
  const stacks = ["frontend-dev-kit", "node-backend-dev-kit", "node-agent-dev-kit"].map((name) => kit(name));
  const owner = {
    "solution-architect": "factory-analysis", planner: "factory-analysis", "test-strategist": "factory-analysis", "contract-steward": "factory-analysis",
    "acceptance-test-author": "factory-quality", reviewer: "factory-quality", "qa-engineer": "factory-quality", "tech-writer": "factory-delivery", "ai-architect": "factory-role-ai-agent",
  };
  for (const stack of stacks) {
    for (const [agent, refs] of Object.entries(stack.stack.stage_skills)) {
      const have = skillsOf(owner[agent], agent);
      for (const ref of list(refs)) assert.ok(have.includes(ref), `${agent} cannot call ${ref}`);
    }
  }
  const builders = [
    ["factory-role-frontend", "fe-builder", "frontend-dev-kit"],
    ["factory-role-frontend", "fe-test-author", "frontend-dev-kit"],
    ["factory-role-backend", "be-builder", "node-backend-dev-kit"],
    ["factory-role-backend", "be-test-author", "node-backend-dev-kit"],
    ["factory-role-ai-agent", "ai-builder", "node-agent-dev-kit"],
    ["factory-role-ai-agent", "ai-test-author", "node-agent-dev-kit"],
  ];
  for (const [pack, agent, stackName] of builders) {
    const have = skillsOf(pack, agent);
    const named = new Set(Object.values(kit(stackName).stack.skills).flatMap(list));
    for (const ref of named) assert.ok(have.includes(ref), `${agent} cannot call ${ref}`);
  }
  assert.ok(skillsOf("factory-role-backend", "migration-author").includes("node-backend-dev-kit:drizzle-database"));
  assert.ok(skillsOf("factory-role-ai-agent", "ai-rag-builder").includes("node-agent-dev-kit:rag-pipeline"));
  assert.ok(skillsOf("factory-role-ai-agent", "eval-author").includes("node-agent-dev-kit:agent-evals"));
  const fe = { name: "factory-role-frontend", root: join(ROOT, "app-dev-kitv2", "factory-role-frontend") };
  assert.deepEqual(procedureKnowledge(fe, "fe-builder").skills, ["factory-role-frontend:fe-implement-task", "factory-role-frontend:fe-red-tests"]);
});

test("a task pack lists its stack skills, reads its rules, carries the golden file and counts them as listed reads", async () => {
  const env = loopSetup();
  const s = JSON.parse(readFileSync(join(env.featureDir, "state.json"), "utf8"));
  s.tasks = { "TASK-001": { status: "done", attempts: 1, rung: 0 } };
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.task, "TASK-002");
  const pack = readFileSync(join(env.dir, d.pack), "utf8");
  assert.match(pack, /Stack skills \(load each with the Skill tool[^)]*\): frontend-dev-kit:testing, frontend-dev-kit:api-client, frontend-dev-kit:react-query-hook/);
  assert.match(pack, /Rule: \S+frontend-dev-kit\/rules\/api-contract\.mdc \[READ\]/);
  assert.match(pack, /Golden files \(match these\):\n {2}- \S+frontend-dev-kit\/skills\/api-client\/examples\.md/);
  assert.doesNotMatch(pack, /Procedure:/, "the old bare skill line is gone");
  const rules = (pack.match(/^Rule: /gm) ?? []).length;
  assert.ok(rules >= 5, `rules read: ${rules}`);
  assert.ok(front(pack).listed_reads >= rules + 1, "rules and golden files do not use up the T4 allowance");
});

test("a stage pack gives the reviewer its stack skills and rules as reference, never as its procedure", async () => {
  const V2 = (p) => join(ROOT, "app-dev-kitv2", p);
  const dir = makeProject(
    [
      `packs: { factory-role-frontend: "${V2("factory-role-frontend")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}", factory-quality: "${V2("factory-quality")}" }`,
      "roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, owns_paths: [\"src/**\"] } }",
      "pipeline: { profiles: { test: [verification] }, stages: { verification: { precheck: null } } }",
    ].join("\n"),
  );
  const featureDir = makeFeature(dir, { stages: ["verification"] });
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const r = await conductor.stepAsync(dir);
  const d = (r.dispatches ?? []).find((x) => x.agent === "reviewer");
  assert.ok(d, JSON.stringify(r));
  const pack = readFileSync(join(dir, d.pack), "utf8");
  assert.match(pack, /Stack knowledge for frontend \(frontend-dev-kit\)[^\n]*keep to your own procedure[^\n]*frontend-dev-kit:code-review, frontend-dev-kit:accessibility/);
  assert.match(pack, /- \S+frontend-dev-kit\/rules\/styling\.mdc/);
});
