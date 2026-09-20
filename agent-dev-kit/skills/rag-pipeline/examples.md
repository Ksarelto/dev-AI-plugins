# rag-pipeline examples

Embeddings and generation use `src/llm/client.ts`. Confirm Qdrant JS model names via Context7.

## Ingest (parent-child)

```ts
import { openai } from "../llm/client.js";
import { models } from "../llm/models.js";

type Chunk = {
  text: string;
  metadata: {
    source: string;
    page?: number;
    section?: string;
    created_at: string;
    parent_text: string;
  };
};

export async function ingestDocument(path: string, upsert: (chunks: Chunk[], vectors: number[][]) => Promise<void>) {
  const documents = await loadDocuments(path);
  const chunks: Chunk[] = [];
  for (const doc of documents) {
    for (const parent of split(doc.text, { size: 1024, overlap: 100 })) {
      for (const child of split(parent, { size: 256, overlap: 30 })) {
        chunks.push({
          text: child,
          metadata: {
            source: doc.source,
            page: doc.page,
            section: doc.section,
            created_at: doc.createdAt,
            parent_text: parent,
          },
        });
      }
    }
  }
  const { data } = await openai.embeddings.create({
    model: models.embed,
    input: chunks.map((c) => c.text),
  });
  await upsert(chunks, data.map((d) => d.embedding));
  return chunks.length;
}
```

## Hybrid retrieve + rerank (Qdrant dense + in-process BM25)

If the collection has Qdrant sparse vectors, use `queryPoints` + RRF prefetch. FastEmbed is Python — this stack uses Qdrant sparse **or** BM25 in-process, then RRF:

```ts
function rrf(lists: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export async function retrieveContext(query: string): Promise<string[]> {
  const denseHits = await denseSearch(query, 20);
  const sparseHits = await bm25Search(query, 20);
  const fusedIds = rrf([denseHits.map((h) => h.id), sparseHits.map((h) => h.id)]).slice(0, 20);
  const parents = uniqueParents(fusedIds);
  return rerank(query, parents, 5);
}
```

## Generate with citations

```ts
import { openai } from "../llm/client.js";
import { models } from "../llm/models.js";

export async function answerWithRag(query: string) {
  const contexts = await retrieveContext(query);
  const contextBlock = contexts.map((c, i) => `[${i + 1}] ${c}`).join("\n");
  const completion = await openai.chat.completions.create({
    model: models.generate,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Answer only from the numbered context. Cite as [1], [2]. If the answer is not in the context, say so — do not fabricate.",
      },
      { role: "user", content: `Context:\n${contextBlock}\n\nQuestion: ${query}` },
    ],
  });
  return { answer: completion.choices[0].message.content, sources: contexts };
}
```
