import type { Db } from "../db.js";

/**
 * Deterministic synthetic dataset, generated SQL-side with range() + hash() so
 * it is fully reproducible with no RNG state in TypeScript. The shape echoes a
 * SaaS-usage product (users, apps, usage events) plus orders, which gives real
 * joins, group-bys, window functions, dates, and the ingredients for the
 * business-logic traps (status filters, revenue, distinct counts, date bounds).
 *
 * This is a data-intensive LOCAL evaluation on 100k+ row datasets, not a claim
 * of BigQuery-scale. The point is realism and reproducibility, not raw volume.
 */

export interface DatasetSizes {
  users: number;
  apps: number;
  events: number;
  orders: number;
}

export const DEFAULT_SIZES: DatasetSizes = {
  users: 5000,
  apps: 40,
  events: 100000,
  orders: 15000,
};

export function schemaDescription(): string {
  return [
    "users(user_id BIGINT, country VARCHAR, signup_date DATE, plan VARCHAR)  -- plan in ('free','pro','team')",
    "apps(app_id BIGINT, name VARCHAR, category VARCHAR)",
    "events(event_id BIGINT, user_id BIGINT, app_id BIGINT, event_type VARCHAR, ts TIMESTAMP)  -- event_type in ('view','click','edit','share','delete')",
    "orders(order_id BIGINT, user_id BIGINT, amount DOUBLE, status VARCHAR, created_at DATE)  -- status in ('paid','refunded','pending')",
  ].join("\n");
}

export async function createDataset(db: Db, sizes: DatasetSizes = DEFAULT_SIZES): Promise<void> {
  await db.run(`CREATE TABLE users AS
    SELECT
      i AS user_id,
      (['FR','US','DE','UK','ES'])[CAST((hash(i * 7) % 5) + 1 AS INTEGER)] AS country,
      DATE '2025-01-01' + CAST(hash(i * 13) % 365 AS INTEGER) AS signup_date,
      (['free','pro','team'])[CAST((hash(i * 17) % 3) + 1 AS INTEGER)] AS plan
    FROM range(${sizes.users}) AS t(i)`);

  await db.run(`CREATE TABLE apps AS
    SELECT
      i AS app_id,
      'app_' || CAST(i AS VARCHAR) AS name,
      (['crm','analytics','comms','design','devtools','finance'])[CAST((hash(i * 3) % 6) + 1 AS INTEGER)] AS category
    FROM range(${sizes.apps}) AS t(i)`);

  await db.run(`CREATE TABLE events AS
    SELECT
      i AS event_id,
      CAST(hash(i * 2 + 1) % ${sizes.users} AS BIGINT) AS user_id,
      CAST(hash(i * 5 + 2) % ${sizes.apps} AS BIGINT) AS app_id,
      (['view','click','edit','share','delete'])[CAST((hash(i * 11) % 5) + 1 AS INTEGER)] AS event_type,
      TIMESTAMP '2025-01-01 00:00:00' + to_seconds(CAST(hash(i * 19) % 15552000 AS BIGINT)) AS ts
    FROM range(${sizes.events}) AS t(i)`);

  await db.run(`CREATE TABLE orders AS
    SELECT
      i AS order_id,
      CAST(hash(i * 23 + 3) % ${sizes.users} AS BIGINT) AS user_id,
      ROUND(5 + (hash(i * 29) % 20000) / 100.0, 2) AS amount,
      (['paid','paid','paid','refunded','pending'])[CAST((hash(i * 31) % 5) + 1 AS INTEGER)] AS status,
      DATE '2025-01-01' + CAST(hash(i * 37) % 180 AS INTEGER) AS created_at
    FROM range(${sizes.orders}) AS t(i)`);
}
