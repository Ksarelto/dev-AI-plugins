import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const casesDir = join(__dirname, "cases");

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with",
  "using", "use", "used", "when", "how", "this", "that", "it", "is", "are",
  "from", "by", "as", "into", "new", "set", "up", "via", "not", "no", "our",
  "your", "you", "me", "i", "need", "help", "can", "please", "what", "should",
  "does", "do", "these", "just", "now", "if", "so",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function parseFrontmatter(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return parseYaml(match[1]);
}

function loadCandidates(sourceDir, component) {
  const dir = join(root, sourceDir, component);
  if (!existsSync(dir)) return [];

  if (component === "skills") {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const skillPath = join(dir, e.name, "SKILL.md");
        if (!existsSync(skillPath)) return null;
        const fm = parseFrontmatter(skillPath);
        return fm && { name: fm.name, description: fm.description ?? "" };
      })
      .filter(Boolean);
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => {
      const fm = parseFrontmatter(join(dir, e.name));
      return fm && { name: fm.name, description: fm.description ?? "" };
    })
    .filter(Boolean);
}

function scoreCandidate(promptTokens, candidate) {
  const nameTokens = new Set(tokenize(candidate.name));
  const descTokens = new Set(tokenize(candidate.description));
  let score = 0;
  for (const t of promptTokens) {
    if (nameTokens.has(t)) score += 3;
    else if (descTokens.has(t)) score += 1;
  }
  return score;
}

function runEvalFile(file) {
  const suite = JSON.parse(readFileSync(join(casesDir, file), "utf8"));
  const candidates = loadCandidates(suite.source, suite.component);

  if (candidates.length === 0) {
    console.error(`FAIL [${suite.plugin}]: no ${suite.component} found at ${suite.source}/${suite.component}`);
    return { passed: 0, failed: suite.cases.length, warned: 0 };
  }

  let passed = 0;
  let failed = 0;
  let warned = 0;

  for (const testCase of suite.cases) {
    const promptTokens = tokenize(testCase.prompt);
    const scored = candidates
      .map((c) => ({ ...c, score: scoreCandidate(promptTokens, c) }))
      .sort((a, b) => b.score - a.score);

    const topScore = scored[0].score;
    const winners = scored.filter((c) => c.score === topScore).map((c) => c.name);
    const expectedScore = scored.find((c) => c.name === testCase.expect)?.score ?? -1;

    if (expectedScore === -1) {
      console.error(
        `FAIL [${suite.plugin}] "${testCase.prompt}": expect="${testCase.expect}" does not match any ${suite.component} name`
      );
      failed++;
      continue;
    }

    if (topScore === 0) {
      console.error(
        `FAIL [${suite.plugin}] "${testCase.prompt}": no candidate matched any prompt tokens (description too narrow?)`
      );
      failed++;
    } else if (winners.includes(testCase.expect)) {
      if (winners.length > 1) {
        console.warn(
          `WARN [${suite.plugin}] "${testCase.prompt}": tied top match [${winners.join(", ")}] — descriptions may overlap`
        );
        warned++;
      }
      passed++;
    } else {
      console.error(
        `FAIL [${suite.plugin}] "${testCase.prompt}": expected "${testCase.expect}" (score ${expectedScore}), top match was [${winners.join(", ")}] (score ${topScore})`
      );
      failed++;
    }
  }

  return { passed, failed, warned };
}

const files = readdirSync(casesDir).filter((f) => f.endsWith(".json"));
let totalPassed = 0;
let totalFailed = 0;
let totalWarned = 0;

for (const file of files) {
  const { passed, failed, warned } = runEvalFile(file);
  totalPassed += passed;
  totalFailed += failed;
  totalWarned += warned;
}

console.log(
  `\n${totalPassed} passed, ${totalFailed} failed, ${totalWarned} warned (${files.length} eval files)`
);

process.exit(totalFailed > 0 ? 1 : 0);
