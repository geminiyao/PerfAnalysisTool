/**
 * db.ts — Prism SQLite helper
 * Opens web/data/prism.sqlite (read-only by default).
 * Resolves the path robustly relative to the repo root so it works
 * whether the caller is run from web/ or from the repo root.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

// __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Resolve the default prism.sqlite path.
 * Walk up from this file's directory until we find a "web/" parent,
 * then append data/prism.sqlite.
 */
export function resolveDbPath(override?: string): string {
  if (override) return path.resolve(override);

  // This file lives at web/server/prism/db.ts
  // Go up 3 levels → repo root, then down into web/data/prism.sqlite
  const webDir = path.resolve(__dirname, '..', '..');
  return path.join(webDir, 'data', 'prism.sqlite');
}

/**
 * Open the Prism database (read-only).
 * @param dbPath Optional override; defaults to web/data/prism.sqlite.
 */
export function openPrismDb(dbPath?: string): Database.Database {
  const resolved = resolveDbPath(dbPath);
  return new Database(resolved, { readonly: true });
}
