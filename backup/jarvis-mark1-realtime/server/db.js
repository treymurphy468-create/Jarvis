import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'jarvis.db');

let db;
let SQL;

export async function initDatabase() {
  SQL = await initSqlJs();
  if (existsSync(dbPath)) {
    db = new SQL.Database(readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      emoji TEXT DEFAULT '📝',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT,
      key TEXT,
      value TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pending_actions (
      id TEXT PRIMARY KEY,
      action_type TEXT,
      message TEXT,
      payload TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  persist();
  return db;
}

export function persist() {
  if (db) writeFileSync(dbPath, Buffer.from(db.export()));
}

export function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function queryAll(sql, params = []) {
  const stmt = getDb().prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function runSql(sql, params = []) {
  getDb().run(sql, params);
  persist();
  const changes = getDb().getRowsModified();
  const lastId = queryAll('SELECT last_insert_rowid() as id')[0]?.id;
  return { changes, lastInsertRowid: lastId };
}
