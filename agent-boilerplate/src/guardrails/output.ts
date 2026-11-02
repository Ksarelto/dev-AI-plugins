export interface Citation {
  chunkId: string;
  documentId: string;
  title: string;
  source: string;
}

/** Short, stable reference the model is told to cite, e.g. `[ref:1a2b3c4d]`. */
export function citationRef(chunkId: string): string {
  return chunkId.slice(0, 8);
}

const CITATION_MARKER = /\[ref:([0-9a-f]{8})\]/g;

/**
 * Keeps only citations the answer actually references AND that the retriever returned in
 * this turn. A model cannot cite a document it never saw.
 */
export function selectCitations(answer: string, retrieved: Citation[]): Citation[] {
  const referenced = new Set<string>();
  for (const match of answer.matchAll(CITATION_MARKER)) if (match[1]) referenced.add(match[1]);
  const seen = new Set<string>();
  return retrieved.filter((citation) => {
    const ref = citationRef(citation.chunkId);
    if (!referenced.has(ref) || seen.has(ref)) return false;
    seen.add(ref);
    return true;
  });
}
