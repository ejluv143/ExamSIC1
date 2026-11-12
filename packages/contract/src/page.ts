// Lists read a page at a time (`Page`, `PageRequest`). Shared by the RPC groups that page.
import { Schema } from "effect";

// A list read a page at a time. `cursor` is what the previous page's `nextCursor` said (omit it for the first page);
// it is opaque, so a client only passes it back. `limit` defaults to `defaultPageSize` and stops at `maxPageSize`.
export const defaultPageSize = 50;
export const maxPageSize = 200;
export const PageRequest = {
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: maxPageSize }))),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
};
// One page: its items, and the cursor of the next page (null on the last one).
export const Page = <S extends Schema.Top>(item: S) =>
  Schema.Struct({ items: Schema.Array(item), nextCursor: Schema.NullOr(Schema.String) });

// The most a caller that needs a whole list (a results page, a report) reads before it stops and says so.
export const maxLoaded = 2000;

// Reads page after page until the list ends or `cap` items are in, whichever comes first. `truncated` says there was more.
export async function allPages<T>(
  fetchPage: (page: { limit: number; cursor?: string }) => Promise<{ items: readonly T[]; nextCursor: string | null }>,
  cap: number = maxLoaded,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let cursor: string | null = null;
  while (items.length < cap) {
    const page: { items: readonly T[]; nextCursor: string | null } = await fetchPage({ limit: maxPageSize, ...(cursor === null ? {} : { cursor }) });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor === null) return { items, truncated: false };
  }
  return { items: items.slice(0, cap), truncated: true };
}
