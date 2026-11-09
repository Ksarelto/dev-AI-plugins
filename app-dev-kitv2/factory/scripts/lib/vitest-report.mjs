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
// An assertion is a red whatever it compares — even `toThrow(ZodError)` or an expected ETIMEDOUT code.
const ASSERTION = /^(AssertionError|TestingLibraryElementError|JestAssertionError)\b|^\w*Error: expect\(.*\)\.(not\.)?(to|resolves|rejects)\w*|not implemented/i;
// Otherwise the environment failing is never a red: config validation, a database or network that is not there.
const ENV_ERRORS = /^(\w*Error: )?(Invalid environment|ZodError)|ECONNREFUSED|ENOTFOUND|EADDRINUSE|ETIMEDOUT|EAI_AGAIN|getaddrinfo|Test timed out|Hook timed out|Timeout of \d+ms/i;
// Assertion wording without the class name: vitest's "expected X to …" and Testing Library lookups.
const GOOD_RED = /Unable to find an? (accessible )?(element|label|role|text)|\bexpected\b.*\bto\b/i;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
/** Removes terminal colour codes: a runner that ignores NO_COLOR must not turn an assertion into a "wrong failure". */
export const stripAnsi = (text) => String(text).replace(ANSI, "");

/** Whether a failing test fails for the right reason (assertion or explicit "not implemented"). */
export function goodRedFailure(message) {
  const first = firstLine(message);
  if (ASSERTION.test(first)) return true;
  if (ENV_ERRORS.test(first)) return false;
  return GOOD_RED.test(first) && !LOAD_ERRORS.test(first);
}

/** Removes a report before a run, so a crashed or misconfigured runner can never leave a stale pass. */
export function freshReport(file) {
  rmSync(file, { force: true });
  return file;
}

/** Acceptance tests fail by design until verification; task gates leave them out of "the suite passes". */
export const isAcceptanceTest = (file) => /\.acceptance\.test\./.test(file);

export const firstLine = (message) => stripAnsi(message).split("\n").find((l) => l.trim())?.trim().slice(0, 200) ?? "";
