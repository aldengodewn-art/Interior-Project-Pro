import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDataDir = path.resolve(__dirname, '../data');

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : defaultDataDir;

fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataDir, 'interior-project.sqlite');

fs.mkdirSync(path.dirname(dbPath), {
  recursive: true
});

console.log(`SQLite database: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) {
    console.error(
      'Failed to open SQLite database:',
      error.message
    );
  } else {
    console.log('SQLite database connected.');
  }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) {
        reject(error);
      } else {
        resolve({
          id: this.lastID,
          changes: this.changes
        });
      }
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
      } else {
        resolve(row);
      }
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
}

export async function initDb() {
  await run(`
    PRAGMA journal_mode = WAL
  `);

  await run(`
    PRAGMA busy_timeout = 5000
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      mode TEXT NOT NULL,
      compare_mode INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      overall_score INTEGER,
      data_json TEXT NOT NULL,
      image_a_name TEXT,
      image_b_name TEXT,
      share_token TEXT
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_analyses_created_at
    ON analyses(created_at)
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_share_token
    ON analyses(share_token)
    WHERE share_token IS NOT NULL
  `);

  console.log('SQLite database initialized.');
}

export async function insertAnalysis(record) {
  await run(
    `
    INSERT INTO analyses (
      id,
      created_at,
      mode,
      compare_mode,
      title,
      overall_score,
      data_json,
      image_a_name,
      image_b_name,
      share_token
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      record.id,
      record.createdAt,
      record.mode,
      record.compareMode ? 1 : 0,
      record.title || null,
      record.overallScore ?? null,
      JSON.stringify(record.data),
      record.imageAName || null,
      record.imageBName || null,
      record.shareToken || null
    ]
  );
}

export async function listAnalyses(limit = 12) {
  const safeLimit = Math.max(
    1,
    Math.min(
      Number(limit) || 12,
      50
    )
  );

  const rows = await all(
    `
    SELECT
      id,
      created_at,
      mode,
      compare_mode,
      title,
      overall_score,
      image_a_name,
      image_b_name,
      share_token
    FROM analyses
    ORDER BY datetime(created_at) DESC
    LIMIT ?
    `,
    [safeLimit]
  );

  return rows.map(normalizeListRow);
}

export async function getAnalysis(id) {
  const row = await get(
    `
    SELECT *
    FROM analyses
    WHERE id = ?
    `,
    [id]
  );

  return normalizeFullRow(row);
}

export async function clearAnalyses() {
  await run(`
    DELETE FROM analyses
  `);
}

export async function deleteAnalysis(id) {
  const result = await run(
    `
    DELETE FROM analyses
    WHERE id = ?
    `,
    [id]
  );

  return result.changes > 0;
}

export async function setShareToken(id, token) {
  await run(
    `
    UPDATE analyses
    SET share_token = ?
    WHERE id = ?
    `,
    [
      token,
      id
    ]
  );
}

export async function getAnalysisByShareToken(token) {
  const row = await get(
    `
    SELECT *
    FROM analyses
    WHERE share_token = ?
    `,
    [token]
  );

  return normalizeFullRow(row);
}

function normalizeListRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    mode: row.mode,
    compareMode: Boolean(row.compare_mode),
    title: row.title,
    overallScore: row.overall_score,
    imageAName: row.image_a_name,
    imageBName: row.image_b_name,
    shareToken: row.share_token
  };
}

function normalizeFullRow(row) {
  if (!row) {
    return null;
  }

  let parsedData = {};

  try {
    parsedData = JSON.parse(row.data_json);
  } catch (error) {
    console.error(
      `Failed to parse analysis ${row.id}:`,
      error.message
    );
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    mode: row.mode,
    compareMode: Boolean(row.compare_mode),
    title: row.title,
    overallScore: row.overall_score,
    imageAName: row.image_a_name,
    imageBName: row.image_b_name,
    shareToken: row.share_token,
    data: parsedData
  };
}