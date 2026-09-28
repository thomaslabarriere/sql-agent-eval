import { createRequire } from "node:module";
import type * as NodeSqlite from "node:sqlite";

// Vite 5 (under vitest) does not know the `node:sqlite` builtin and fails to
// resolve a static import of it, so it is loaded through require instead.
const require = createRequire(import.meta.url);
export const { DatabaseSync } = require("node:sqlite") as typeof NodeSqlite;
