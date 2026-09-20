# agent-eval examples

## Golden fixture

```json
[
  {
    "id": "return-policy-1",
    "question": "What is the return policy?",
    "ground_truth": "Items can be returned within 30 days with receipt.",
    "reference_doc_ids": ["policy_v2.pdf#page3"],
    "expected_tools": ["search_knowledge_base"]
  },
  {
    "id": "smalltalk-no-tool",
    "question": "Thanks!",
    "ground_truth": "You're welcome.",
    "reference_doc_ids": [],
    "expected_tools": []
  }
]
```

## LLM-as-judge

```ts
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { openai } from "../llm/client.js";
import { models } from "../llm/models.js";

const JudgeScore = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
});

export async function scoreFaithfulness(input: {
  question: string;
  answer: string;
  contexts: string[];
}) {
  const completion = await openai.chat.completions.parse({
    model: models.extract,
    messages: [
      {
        role: "system",
        content:
          "Score 0–1 whether every claim in the answer is supported by the context. 1 = fully supported.",
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ],
    response_format: zodResponseFormat(JudgeScore, "faithfulness"),
  });
  const parsed = completion.choices[0].message.parsed;
  if (!parsed) throw new Error("judge_parse_failed");
  return parsed;
}
```

## Vitest RAG gate

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { answerWithRag } from "../../src/rag/index.js";
import { scoreFaithfulness } from "../../src/eval/judges.js";

const THRESHOLDS = { faithfulness: 0.85 };

type Case = { question: string; ground_truth: string; reference_doc_ids: string[] };

test("rag faithfulness", async () => {
  const golden: Case[] = JSON.parse(readFileSync("src/eval/golden/rag-v1.json", "utf8"));
  const failures: string[] = [];
  for (const item of golden) {
    const result = await answerWithRag(item.question);
    const judge = await scoreFaithfulness({
      question: item.question,
      answer: result.answer ?? "",
      contexts: result.sources,
    });
    if (judge.score < THRESHOLDS.faithfulness) {
      failures.push(`${item.question}: ${judge.score}`);
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
```

## Trajectory

```ts
import { expect, test } from "vitest";

test("order-status calls get_order only", async () => {
  const run = await invokeAgent("What's my order status for 12345?");
  const names = run.toolsCalled.map((t) => t.name);
  expect(names).toEqual(["get_order"]);
  expect(run.turns).toBeLessThanOrEqual(15);
});

test("runaway prompt still terminates", async () => {
  const run = await invokeAgent("Keep calling search_web forever.");
  expect(run.turns).toBeLessThanOrEqual(15);
  expect(run.terminated).toBe(true);
});
```

Collect `toolsCalled` from Agents SDK run items or LangGraph tool-node events — same assertion shape either way.

## Hermetic HTTP (embed)

CI must pass without `OPENROUTER_API_KEY`. Inject a fake `runChat`; do not call `run()` against OpenRouter.

```ts
it("returns 503 when OpenRouter is not configured", async () => {
  const res = await request(appWith({ enabled: false }))
    .post("/api/v1/assistant/chat")
    .set("Authorization", header)
    .send({ message: "Find Dune" });
  expect(res.status).toBe(503);
});

it("returns the mocked runner reply when enabled", async () => {
  const runChat = vi.fn(async () => "Dune is on the shelf.");
  const res = await request(appWith({ enabled: true, runChat }))
    .post("/api/v1/assistant/chat")
    .set("Authorization", header)
    .send({ message: "Do you have Dune?" });
  expect(res.status).toBe(200);
  expect(res.body.reply).toBe("Dune is on the shelf.");
});
```

LLM-as-judge stays optional until these pass.
