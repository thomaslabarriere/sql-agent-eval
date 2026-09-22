import type { Category, Question } from "../types.js";
import type { OfflineDirective } from "../agent/scripted.js";

/**
 * The benchmark: natural-language questions with a reference (gold) SQL. The
 * gold RESULT is derived by executing goldSql on the seeded dataset, so the
 * answers are always consistent with the data. Questions span five levels, and
 * Level 5 is the business-logic traps where a query that runs can still be
 * wrong (count vs count-distinct, wrong join, flipped status, dropped filter).
 *
 * Each item also carries an offline directive (how the scripted, no-API agent
 * behaves) and the category that behavior should produce, so the offline run
 * exercises every category and the verifier is checked end to end.
 */
export interface BenchItem {
  question: Question;
  offline: OfflineDirective;
  expected: Category;
}

export const BENCH: BenchItem[] = [
  // ---- Level 1: basic ----
  {
    question: { id: "l1_count_users", nl: "How many users are there in total?", level: 1, ordered: false, goldSql: "SELECT COUNT(*) FROM users" },
    offline: "oracle",
    expected: "correct",
  },
  {
    question: { id: "l1_users_fr", nl: "How many users are from France (country FR)?", level: 1, ordered: false, goldSql: "SELECT COUNT(*) FROM users WHERE country = 'FR'" },
    offline: { mutate: "drop_where" },
    expected: "wrong_result",
  },
  {
    question: { id: "l1_paid_revenue", nl: "What is the total revenue from paid orders?", level: 1, ordered: false, goldSql: "SELECT ROUND(SUM(amount), 2) FROM orders WHERE status = 'paid'" },
    offline: { mutate: "flip_status_paid" },
    expected: "wrong_result",
  },
  {
    question: { id: "l1_distinct_plans", nl: "List the distinct subscription plans.", level: 1, ordered: false, goldSql: "SELECT DISTINCT plan FROM users ORDER BY plan" },
    offline: "oracle",
    expected: "correct",
  },

  // ---- Level 2: analytics ----
  {
    question: { id: "l2_users_by_country", nl: "How many users are there per country?", level: 2, ordered: false, goldSql: "SELECT country, COUNT(*) FROM users GROUP BY country" },
    offline: "oracle",
    expected: "correct",
  },
  {
    question: { id: "l2_distinct_paying_users", nl: "How many distinct users have placed at least one paid order?", level: 2, ordered: false, goldSql: "SELECT COUNT(DISTINCT user_id) FROM orders WHERE status = 'paid'" },
    offline: { mutate: "count_distinct_to_count" },
    expected: "wrong_result",
  },
  {
    question: { id: "l2_avg_paid", nl: "What is the average amount of a paid order?", level: 2, ordered: false, goldSql: "SELECT ROUND(AVG(amount), 2) FROM orders WHERE status = 'paid'" },
    offline: "oracle",
    expected: "correct",
  },
  {
    question: { id: "l2_top3_countries", nl: "What are the top 3 countries by number of users?", level: 2, ordered: true, goldSql: "SELECT country, COUNT(*) c FROM users GROUP BY country ORDER BY c DESC LIMIT 3" },
    offline: "oracle",
    expected: "correct",
  },

  // ---- Level 3: joins ----
  {
    question: { id: "l3_revenue_by_country", nl: "What is the total paid revenue per user country?", level: 3, ordered: false, goldSql: "SELECT u.country, ROUND(SUM(o.amount), 2) FROM orders o JOIN users u ON o.user_id = u.user_id WHERE o.status = 'paid' GROUP BY u.country" },
    offline: "oracle",
    expected: "correct",
  },
  {
    question: { id: "l3_events_by_category", nl: "How many events are there per app category?", level: 3, ordered: false, goldSql: "SELECT a.category, COUNT(*) FROM events e JOIN apps a ON e.app_id = a.app_id GROUP BY a.category" },
    offline: "oracle",
    expected: "correct",
  },
  {
    question: { id: "l3_users_no_order", nl: "How many users have never placed an order?", level: 3, ordered: false, goldSql: "SELECT COUNT(*) FROM users u LEFT JOIN orders o ON u.user_id = o.user_id WHERE o.order_id IS NULL" },
    offline: { mutate: "left_join_to_inner" },
    expected: "wrong_result",
  },
  {
    question: { id: "l3_revenue_per_user", nl: "What is the total order amount per user?", level: 3, ordered: false, goldSql: "SELECT user_id, ROUND(SUM(amount), 2) FROM orders GROUP BY user_id" },
    offline: { mutate: "hallucinate_column" },
    expected: "schema_hallucination",
  },

  // ---- Level 4: temporal ----
  {
    question: { id: "l4_orders_january", nl: "How many orders were placed in January 2025?", level: 4, ordered: false, goldSql: "SELECT COUNT(*) FROM orders WHERE created_at >= DATE '2025-01-01' AND created_at < DATE '2025-02-01'" },
    offline: { mutate: "drop_where" },
    expected: "wrong_result",
  },
  {
    question: { id: "l4_orders_by_month", nl: "How many orders were placed each month, ordered by month?", level: 4, ordered: true, goldSql: "SELECT strftime(created_at, '%Y-%m') ym, COUNT(*) FROM orders GROUP BY ym ORDER BY ym" },
    offline: "oracle",
    expected: "correct",
  },
  {
    question: { id: "l4_running_revenue", nl: "Give the running total of paid revenue by day, ordered by day.", level: 4, ordered: true, goldSql: "SELECT created_at, SUM(SUM(amount)) OVER (ORDER BY created_at) FROM orders WHERE status = 'paid' GROUP BY created_at ORDER BY created_at" },
    offline: "oracle",
    expected: "correct",
  },

  // ---- Level 5: business-logic traps ----
  {
    question: { id: "l5_active_users", nl: "How many distinct users are active, meaning they have at least one event?", level: 5, ordered: false, goldSql: "SELECT COUNT(DISTINCT user_id) FROM events" },
    offline: { mutate: "count_distinct_to_count" },
    expected: "wrong_result",
  },
  {
    question: { id: "l5_top_country_paid", nl: "Which country has the highest total paid revenue? Return the country and its revenue.", level: 5, ordered: true, goldSql: "SELECT u.country, ROUND(SUM(o.amount), 2) rev FROM orders o JOIN users u ON o.user_id = u.user_id WHERE o.status = 'paid' GROUP BY u.country ORDER BY rev DESC LIMIT 1" },
    offline: { mutate: "flip_status_paid" },
    expected: "wrong_result",
  },
  {
    question: { id: "l5_count_orders_syntax", nl: "How many orders are there in total?", level: 5, ordered: false, goldSql: "SELECT COUNT(*) FROM orders" },
    offline: { mutate: "break_syntax" },
    expected: "sql_error",
  },

  // ---- ambiguous ----
  {
    question: { id: "amb_best_apps", nl: "Show me the best apps.", level: 2, ordered: true, ambiguous: true, goldSql: "SELECT app_id, COUNT(DISTINCT user_id) u FROM events GROUP BY app_id ORDER BY u DESC LIMIT 5" },
    offline: "abstain",
    expected: "correct",
  },
  {
    question: { id: "amb_active_users", nl: "How many active users do we have?", level: 2, ordered: false, ambiguous: true, goldSql: "SELECT COUNT(DISTINCT user_id) FROM events" },
    offline: "oracle",
    expected: "ambiguous_question",
  },
];

export const QUESTIONS: Question[] = BENCH.map((b) => b.question);

export function offlineDirectives(): Map<string, OfflineDirective> {
  return new Map(BENCH.map((b) => [b.question.id, b.offline]));
}
