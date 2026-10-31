// A fake stack command for gate tests: `node fake-stack.mjs <command> [report-path]` replays
// .fake/<command>.json from the project ({ code, output, report }), writing `report` to the path.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [command, reportPath] = process.argv.slice(2);
const file = `.fake/${command}.json`;
const script = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { code: 0, output: "" };
if (reportPath && script.report) writeFileSync(reportPath, JSON.stringify(script.report));
process.stdout.write(script.output ?? "");
process.exit(script.code ?? 0);
