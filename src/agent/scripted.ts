import type { Question, SqlAttempt } from "../types.js";
import type { SqlAgent } from "./agent.js";
import { mutationByName } from "../mutate.js";

/**
 * How the offline scripted agent should behave on a given question. This lets
 * the whole harness run deterministically with no API key: "oracle" emits the
 * gold SQL, "abstain" declines, and a mutation name emits a buggy variant of
 * the gold SQL. It exists to exercise the verifier across every category in a
 * reproducible way, not to stand in for a real agent's quality.
 */
export type OfflineDirective = "oracle" | "abstain" | { mutate: string };

export class ScriptedAgent implements SqlAgent {
  readonly name = "scripted:offline";
  constructor(private readonly directives: Map<string, OfflineDirective>) {}

  answer(question: Question): SqlAttempt {
    const directive = this.directives.get(question.id) ?? "oracle";

    if (directive === "abstain") {
      return { questionId: question.id, sql: null, confidence: 0.5, abstained: true };
    }
    if (directive === "oracle") {
      return { questionId: question.id, sql: question.goldSql, confidence: 0.9, abstained: false };
    }

    const mutation = mutationByName(directive.mutate);
    const mutated = mutation?.apply(question.goldSql) ?? null;
    if (mutated === null) {
      // The scripted bug did not apply; fall back to the gold query so the
      // fixture never silently means something other than what it says.
      return { questionId: question.id, sql: question.goldSql, confidence: 0.9, abstained: false };
    }
    return { questionId: question.id, sql: mutated, confidence: 0.82, abstained: false };
  }
}
