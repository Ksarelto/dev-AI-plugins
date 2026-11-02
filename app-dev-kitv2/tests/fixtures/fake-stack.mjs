// A fake stack command for gate tests: `node fake-stack.mjs <command> [report-path] [args…]` replays
// .fake/<command>.json from the project ({ code, output, report }), writing `report` to the path.
// Every call is appended to .fake/calls.log (command and extra args) when .fake/ exists.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const [command, reportPath, ...rest] = process.argv.slice(2);
if (existsSync(".fake")) appendFileSync(".fake/calls.log", `${[command, ...rest].join(" ")}\n`);
const file = `.fake/${command}.json`;
const script = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { code: 0, output: "" };
if (reportPath && script.report) writeFileSync(reportPath, JSON.stringify(script.report));
process.stdout.write(script.output ?? "");
process.exit(script.code ?? 0);
