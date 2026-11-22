import type { Usage } from './types';

/**
 * Token usage across the calls of one request (the first call and the repair retry).
 *
 * A provider may report usage on one call and not on the other. Adding only the calls that reported would present the tokens of
 * one call as the total of the request, so the tally answers two different questions: `complete` is the request total, set only
 * when every call reported; `partial` is what the calls that did report added up to, set only when some did and some did not.
 */
export function createUsageTally() {
  let calls = 0;
  let reported = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  return {
    add(usage: Usage | undefined): void {
      calls += 1;
      if (!usage) return;
      reported += 1;
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
    },
    get complete(): Usage | undefined {
      return calls > 0 && reported === calls ? { inputTokens, outputTokens } : undefined;
    },
    get partial(): Usage | undefined {
      return reported > 0 && reported < calls ? { inputTokens, outputTokens } : undefined;
    },
  };
}
