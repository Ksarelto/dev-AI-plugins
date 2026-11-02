// gate-stories (S2): every story traces to a requirement in the spec, every spec AC lands in a story
// that traces the AC's own requirement, stories invent no ACs, every AC is Given/When/Then with real
// steps and the spec's exact values, UI stories list their states (with ux-notes.md written), a story
// for a must requirement has an error, edge or permission AC (or says why it cannot), and a story
// that wants three things or more is flagged (warning) for splitting.
import { acValues, plainText } from "../lib/ids.mjs";
import { validate } from "../lib/schemas.mjs";

export const inputs = ["stories", "ux-notes", "prd", "delta-spec"];


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
  const acReq = new Map(spec.reqs.flatMap((r) => r.acs.map((a) => [a.id, r.id])));
  const acText = new Map(spec.reqs.flatMap((r) => r.acs.map((a) => [a.id, a.text])));
  const acKind = new Map(spec.reqs.flatMap((r) => r.acs.map((a) => [a.id, a.kind ?? "happy"])));
  const must = new Set(spec.reqs.filter((r) => (r.priority ?? "must") === "must").map((r) => r.id));
  const storyIds = new Set();
  const covered = new Set();

  for (const story of stories.data.stories) {
    if (storyIds.has(story.id)) fail("ids", "duplicate", `${story.id} is defined twice`);
    storyIds.add(story.id);
    for (const req of story.traces) if (!reqIds.has(req)) fail("trace", "unknown-req", `${story.id} traces ${req}, which is not in the spec`);
    for (const ac of story.acs) {
      if (!specAcs.has(ac.id)) fail("trace", "invented-ac", `${story.id} has ${ac.id}, which is not in the spec`);
      covered.add(ac.id);
      if (acReq.has(ac.id) && !story.traces.includes(acReq.get(ac.id))) fail("trace", "ac-req-not-traced", `${story.id} holds ${ac.id} of ${acReq.get(ac.id)} but does not trace ${acReq.get(ac.id)}`);
      const lines = ac.gherkin.split("\n").map((l) => l.trim().split(/\s+/));
      for (const keyword of ["Given", "When", "Then"]) {
        const step = lines.find((l) => l[0] === keyword);
        if (!step) fail("gherkin", "missing-step", `${ac.id} has no "${keyword}" step`);
        else if (step.length < 3) fail("gherkin", "empty-step", `${ac.id}: "${step.join(" ")}" says nothing — name the state, action or outcome`);
      }
      const gherkin = plainText(ac.gherkin);
      for (const value of acValues(acText.get(ac.id) ?? "")) {
        if (!gherkin.includes(value)) fail("gherkin", "value-missing", `${ac.id}: the Gherkin lacks "${value}" from the spec's acceptance criterion`);
      }
    }
    if (story.ux?.surfaces?.length && !story.ux.states?.length) fail("ux", "no-states", `${story.id} has a UX surface but lists no states`);
    const unhappy = story.acs.some((ac) => ["error", "edge", "permission"].includes(acKind.get(ac.id)));
    if (story.traces.some((r) => must.has(r)) && !unhappy && !story.no_unhappy_path) {
      fail("unhappy", "unhappy-path-missing", `${story.id} serves a must requirement but none of its ACs is kind error, edge or permission — add one to the spec, or set no_unhappy_path with the reason`);
    }
    const wants = String(story.i_want ?? "").split(/,|;|\band\b|\bthen\b|\bor\b/i).filter((p) => p.trim().split(/\s+/).length >= 2);
    if (wants.length >= 3) failures.push({ check: "size", rule: "story-too-big", file: stories.rel, warn: true, message: `${story.id} wants ${wants.length} things ("${story.i_want}") — consider splitting it` });
  }
  for (const ac of specAcs) if (!covered.has(ac)) fail("trace", "uncovered-ac", `${ac} is not in any story`);
  if (stories.data.stories.some((s) => s.ux?.surfaces?.length) && !ctx.load("ux-notes")) fail("ux", "no-ux-notes", "stories have UX surfaces but 02-stories/ux-notes.md is missing");
  if (stories.data.feature !== ctx.state.feature) fail("stories", "feature-id", `feature is ${stories.data.feature}`);
  return failures;
}
