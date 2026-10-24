/**
 * Token estimation for pre-execution routing. Roughly 4 characters per token
 * for English prose. Always labeled as an estimate; executions record the
 * provider-reported counts when available.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
