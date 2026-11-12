// The cursor of a paged list: where the next page starts, as the last row's sort key. Keyset paging (not offset), so a row
// added or changed while someone pages through is never skipped or shown twice. Opaque to clients: they pass it back.

/** A sort key: the row's time (ISO, millisecond precision) and its id, which breaks ties. */
export type PageKey = readonly [at: string, id: string];

export const encodeCursor = ([at, id]: PageKey): string => Buffer.from(JSON.stringify([at, id])).toString("base64url");

/** The key a cursor carries, or null when it is not one this API made. */
export const decodeCursor = (cursor: string): PageKey | null => {
  try {
    const key: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (!Array.isArray(key) || key.length !== 2) return null;
    const [at, id] = key;
    if (typeof at !== "string" || typeof id !== "string" || Number.isNaN(Date.parse(at))) return null;
    return [at, id];
  } catch {
    return null;
  }
};

/** Rows read with one more than the limit: the page, and the cursor of the next one when that extra row exists. */
export const pageOf = <T>(rows: readonly T[], limit: number, key: (row: T) => PageKey): { items: T[]; nextCursor: string | null } => {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? encodeCursor(key(items[items.length - 1]!)) : null };
};
