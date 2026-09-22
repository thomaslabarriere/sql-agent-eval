import type { Question, SqlAttempt } from "../types.js";

export interface SqlAgent {
  readonly name: string;
  answer(question: Question, schema: string): Promise<SqlAttempt> | SqlAttempt;
}
