// gate-stories (S2): every story traces to a requirement in the spec, every spec AC lands in a
// story, stories invent no ACs, every AC parses as Given/When/Then, and UI stories list their states.
import { validate } from "../lib/schemas.mjs";

export const inputs = ["stories", "prd", "delta-spec"];

export function run(ctx) {
  const stories = ctx.load("stories");
  if (!stories) return [{ check: "stories", message: "02-stories/stories.yaml is missing" }];
  const failures = [];
  const fail = (check, rule, message) => failures.push({ check, rule, file: stories.rel, message });
  for (const e of validate("stories", stories.data)) fail("schema", "stories", e);
  if (failures.length) return failures;

  const spec = ctx.spec();
  if (!spec) return [{ check: "stories", message: "no approved spec to trace stories against" }];
  const reqIds = new Set(spec.reqs.map((r) => r.id));
  const specAcs = new Set(spec.reqs.flatMap((r) => r.acs.map((a) => a.id)));
  const storyIds = new Set();
  const covered = new Set();

  for (const story of stories.data.stories) {
    if (storyIds.has(story.id)) fail("ids", "duplicate", `${story.id} is defined twice`);
    storyIds.add(story.id);
    for (const req of story.traces) if (!reqIds.has(req)) fail("trace", "unknown-req", `${story.id} traces ${req}, which is not in the spec`);
    for (const ac of story.acs) {
      if (!specAcs.has(ac.id)) fail("trace", "invented-ac", `${story.id} has ${ac.id}, which is not in the spec`);
      covered.add(ac.id);
      const steps = ac.gherkin.split("\n").map((l) => l.trim().split(/\s+/)[0]);
      for (const keyword of ["Given", "When", "Then"]) {
        if (!steps.includes(keyword)) fail("gherkin", "missing-step", `${ac.id} has no "${keyword}" step`);
      }
    }
    if (story.ux && !story.ux.states?.length) fail("ux", "no-states", `${story.id} has a UX surface but lists no states`);
  }
  for (const ac of specAcs) if (!covered.has(ac)) fail("trace", "uncovered-ac", `${ac} is not in any story`);
  if (stories.data.feature !== ctx.state.feature) fail("stories", "feature-id", `feature is ${stories.data.feature}`);
  return failures;
}
