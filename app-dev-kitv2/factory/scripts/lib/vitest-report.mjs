// Reads a Vitest (Jest-compatible) JSON report into { files: [{ file, collected, error, tests: [...] }] }.
import { existsSync, realpathSync, rmSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { readJson, toPosix } from "./core.mjs";

export function readVitestReport(file, projectDir) {
  if (!existsSync(file)) return null;
  const raw = readJson(file);
  // Test runners report resolved paths (/private/var/… on macOS for /var/…); compare real paths.
  const root = realpathSync(projectDir);
  const files = (raw.testResults ?? []).map((r) => {
    let path = r.name;
    if (isAbsolute(r.name)) {
      const abs = existsSync(r.name) ? realpathSync(r.name) : r.name;
      path = [relative(root, abs), relative(projectDir, abs)].find((p) => !p.startsWith("..")) ?? relative(root, abs);
    }
    path = toPosix(path);
    const tests = (r.assertionResults ?? []).map((t) => ({
      name: t.fullName ?? t.title,
      status: t.status,
      message: (t.failureMessages ?? []).join("\n"),
    }));
    // A file that failed with no test results never loaded (import, syntax or setup error).
    const collected = !(r.status === "failed" && tests.length === 0);
    return { file: path, collected, error: collected ? null : r.message || "the test file failed to load", tests };
  });
  return { files, passed: raw.numPassedTests ?? 0, failed: raw.numFailedTests ?? 0 };
}

const LOAD_ERRORS = /Cannot find module|Failed to (resolve|load)|SyntaxError|is not exported|does not provide an export|is not a function|is not a constructor|ReferenceError/i;
// Word-bounded: "Unexpected token" is a load error, not an assertion.
const GOOD_RED = /AssertionError|\bexpected\b|\btoBe\w*|\btoEqual\b|\btoHave\w*|\btoMatch\w*|\btoThrow\b|\btoContain\w*|Unable to find|not implemented/i;

/** Whether a failing test fails for the right reason (assertion or explicit "not implemented"). */
export function goodRedFailure(message) {
  if (/not implemented/i.test(message)) return true;
  return GOOD_RED.test(message) && !LOAD_ERRORS.test(message.split("\n")[0]);
}

/** Removes a report before a run, so a crashed or misconfigured runner can never leave a stale pass. */
export function freshReport(file) {
  rmSync(file, { force: true });
  return file;
}

/** Acceptance tests fail by design until verification; task gates leave them out of "the suite passes". */
export const isAcceptanceTest = (file) => /\.acceptance\.test\./.test(file);

export const firstLine = (message) => String(message).split("\n").find((l) => l.trim())?.trim().slice(0, 200) ?? "";
