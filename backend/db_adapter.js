'use strict';

// Thin wrapper around Node's built-in SQLite engine (node:sqlite, Node 22.5+).
// Real SQLite everywhere - there is no fake/in-memory-JS fallback any more.
const { DatabaseSync } = require('node:sqlite');

function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

module.exports = { openDatabase };
