# File ownership

| Path | Owns | Must not |
|------|------|----------|
| `src/config/env.ts` | Validated env | Be read as raw `process.env` at call sites |
| `src/llm/client.ts` | The one `OpenAI` instance | A second client “for embeddings” |
| `src/llm/models.ts` | Role → OpenRouter slug | Be bypassed with string literals |
| `src/llm/langgraph-model.ts` | `ChatOpenAI` OpenRouter adapter | Its own slug table or API key |
| `src/agents/<name>/` | One agent’s loop, prompt, allowlist | Import another agent’s `tools.ts` |
| `src/tools/` | Tool implementations | Call the LLM client |
| `src/rag/` | Ingest vs query pipelines | Live inside `agent.ts` |
| `src/eval/` | Golden JSON + judges | Hit production HTTP handlers |
| `src/observability/` | Tracer setup | Log secrets or full prompts by default |

One agent directory per named agent. Triage + two specialists = three folders.

Do not add Python packages, `@openrouter/sdk`, or `OPENAI_API_KEY` against `api.openai.com`.
