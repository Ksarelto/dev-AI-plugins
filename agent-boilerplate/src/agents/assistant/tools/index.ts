import type { StructuredToolInterface } from '@langchain/core/tools';
import type { Logger } from '../../../lib/logger.js';
import type { KnowledgeRetriever } from '../../../rag/retriever.js';
import { createCurrentTimeTool } from './current-time.js';
import { createSearchKnowledgeTool } from './search-knowledge.js';

/**
 * The tool registry for this agent. Every tool is read-only; a tool that writes must ask
 * for confirmation (LangGraph `interrupt()`) before acting.
 */
export function createAssistantTools(deps: {
  retriever: KnowledgeRetriever | undefined;
  topK: number;
  logger: Logger;
}): StructuredToolInterface[] {
  return [createSearchKnowledgeTool(deps), createCurrentTimeTool()];
}
