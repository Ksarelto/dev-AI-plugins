# Guardrails and tracing

## Input vs output

Input guardrails run before the main agent; output guardrails run on the final output. A tripped tripwire stops the run — catch it at the call site and return a safe message.

There is no LangGraph `interruptBefore`. For irreversible tools, trip an output guardrail (or a check inside the tool) unless the session already recorded explicit user confirmation. Instructions alone are not HITL.

```ts
import type { InputGuardrail } from "@openai/agents";
import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { models } from "../../../llm/models.js";

const SafetyCheck = z.object({
  isSafe: z.boolean(),
  reason: z.string(),
});

const safetyAgent = new Agent({
  name: "safety_checker",
  instructions: "Decide if the request is allowed for a product-support bot.",
  model: models.extract,
  outputType: SafetyCheck,
});

const safetyInput: InputGuardrail = {
  name: "safety_input",
  execute: async ({ input, context }) => {
    const result = await run(safetyAgent, String(input), {
      maxTurns: 3,
      context: context.context,
    });
    const check = SafetyCheck.parse(result.finalOutput);
    return {
      outputInfo: check,
      tripwireTriggered: !check.isSafe,
    };
  },
};
```

`defineInputGuardrail` is not re-exported from `@openai/agents` (JS 0.18). Use an `InputGuardrail` object. Catch trips by `error.name === "InputGuardrailTripwireTriggered"` at the HTTP boundary so the router does not import the SDK.

## Tracing

Default SDK tracing targets the OpenAI dashboard. With `OPENROUTER_API_KEY` that exporter is wrong.

At startup: `setTracingDisabled(true)`, or register a processor that writes OpenTelemetry/Langfuse. Wrap a business flow in the SDK `trace()` helper only after the exporter is not OpenAI.

Redact PII in spans. Trace model, tokens, latency, session id — not raw secrets.
