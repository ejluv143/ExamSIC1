// SQL questions: checking a student's query and comparing its rows with the teacher's answer.
// Shared by the server (grading) and the browser (the Run button).

export type SqlValue = string | number | null | Uint8Array;
export type SqlResult = { columns: string[]; rows: SqlValue[][] };

// Results bigger than this are cut off for display; grading compares only this many rows.
export const maxRows = 200;

// Strips comments and splits a script into statements at semicolons outside quotes. Good enough for CREATE, INSERT,
// UPDATE, DELETE and SELECT; it doesn't understand a CREATE TRIGGER body, so don't use it on setup SQL.
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < sql.length; ) {
    const c = sql[i]!;
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === c && sql[j + 1] !== c)) j += sql[j] === c ? 2 : 1;
      cur += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      cur += " ";
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 2;
      cur += " ";
    } else if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const preparing = /^(create|insert|replace|update|delete|drop|alter)\b/i;
const reading = /^(select|with)\b/i;

// A script a student or teacher may run: any CREATE / INSERT / UPDATE / DELETE / ALTER / DROP statements to build
// their own tables, then one final SELECT (or WITH … SELECT) whose rows are compared. Each run gets a fresh
// in-memory database, so nothing is kept. ATTACH, PRAGMA and the like are not allowed.
export function checkQuery(sql: string): string | null {
  const statements = splitStatements(sql);
  if (statements.length === 0) return "Write a query first.";
  const last = statements[statements.length - 1]!;
  if (!reading.test(last)) return "End with a SELECT query (it can start with WITH).";
  if (statements.slice(0, -1).some((s) => !preparing.test(s)))
    return "Before the final SELECT you can only use CREATE, INSERT, UPDATE, DELETE, ALTER or DROP.";
  return null;
}

// Setup SQL written for MySQL starts with CREATE DATABASE / USE, which SQLite doesn't have. A SQLite database is
// already the one database, so those lines are dropped.
export function cleanSetup(setup: string): string {
  return setup.replace(/(?<=^|;)\s*(?:create\s+database|drop\s+database|use)\b[^;]*;/gi, "");
}

const cell = (v: SqlValue) =>
  v === null ? "NULL" : v instanceof Uint8Array ? "(blob)" : typeof v === "number" ? String(Number(v.toFixed(6))) : v;

// A plain-text table for logs and the teacher's review.
export function formatTable(r: SqlResult): string {
  if (r.columns.length === 0) return "(no result)";
  const lines = [r.columns.join(" | "), ...r.rows.map((row) => row.map(cell).join(" | "))];
  if (r.rows.length === 0) lines.push("(no rows)");
  return lines.join("\n");
}

// Same rows with the same values; column names don't matter (aliases differ). Floats match to 6 decimals.
export function sameResult(actual: SqlResult, expected: SqlResult, orderMatters: boolean): boolean {
  if (actual.columns.length !== expected.columns.length || actual.rows.length !== expected.rows.length) return false;
  const key = (row: SqlValue[]) => JSON.stringify(row.map(cell));
  const a = actual.rows.map(key);
  const e = expected.rows.map(key);
  if (!orderMatters) {
    a.sort();
    e.sort();
  }
  return a.every((x, i) => x === e[i]);
}
