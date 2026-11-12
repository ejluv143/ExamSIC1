# Spec: Paginate `session.attempts` and `session.classScores` (#46, PR 2 of 3)

Status: APPROVED (all four recommendations in "Open questions"); implemented, see the PR. Source: issue #46 ("take a limit/cursor, and the web pages page through them").
PR 1 (#174) already fixed the query cost of `quiz.list`, `quiz.save` and the quadratic `classScores` lookup.
PR 3 will do `admin.listUsers`, `quiz.bank` and `Assets.visible` the same way, reusing the `Page` helper made here.

## Objective

A teacher with a session of hundreds of students, or a class with dozens of sessions, gets each response in bounded
size and time, instead of one response that grows with their whole history. Users: teachers (grading, results,
integrity, class record) and the MCP server's tools.

## What I found (changes the plan, please read)

Every consumer of these two calls wants **all** the rows, because what it shows is computed over the whole set:

| Caller | Needs |
|---|---|
| `teacher/grading/[sessionId]` | only submitted attempts, then filters `isSubmitted` itself |
| `teacher/assessments/.../sessions/[sessionId]` (results) | all attempts: score stats, by-part and by-question tables |
| `.../integrity` and `.../integrity/compare` | all attempts: pairwise comparison needs every pair |
| `session/data.ts` student record (`getAttempts`, lines 84 and 128) | all attempts of the session |
| `records/data/record.ts` (class record) | every linked session: the final grade adds up all of them |
| `apps/mcp` `session-data.ts`, `tools/students.ts` | all attempts / all sessions, to report numbers |

So a cursor alone does not make these pages lighter overall: whoever reads a whole session still reads every page.
What pagination does buy is a hard cap on **each request** (size and database time) and an API that is safe against a
10,000-attempt session. Where a page genuinely needs only part of the set, that part should be asked for.

## Assumptions (correct me)

1. One shared page shape for the contract: payload `{ limit?: 1..200 (default 50), cursor?: string }`, success
   `{ items: T[], nextCursor: string | null }`. The cursor is opaque (base64 of the last row's sort key), keyset, never
   `offset`, so a page does not skip or repeat rows while students are still submitting.
2. `session.attempts` order stays `startedAt, id` (the id breaks ties); `classScores` pages by session
   (`createdAt, id`), each page carrying its sessions' scores whole. Cursors are checked against the actor's ownership
   as the first page is, so a forged cursor cannot reach another teacher's rows.
3. Ownership/permission checks, errors and the "results released" rules do not change.
4. `liveAttempt` and the grading write path read a single attempt and are not touched.
5. The old unpaged call is **removed**, not kept (one contract, no second code path). Every caller listed above is
   updated in this PR, including `apps/mcp`.

## Proposed design

- `packages/contract`: `Page<T>` helper (new, shared with PR 3), and `session.attempts` / `session.classScores` take the
  page payload and return the page shape. New optional filter on `attempts`: `status: "submitted" | "in_progress"`
  (grading asks only for submitted, so it stops downloading unfinished attempts).
- `apps/rpc`: `attemptDetails` takes `{ after, limit }` and selects `limit + 1` rows to know if there is a next page;
  answers/events/code results are still loaded for just that page's attempt ids (already how it works).
  `classScoreData` pages the session rows, then loads parts, attempts and answers for those sessions only.
- `apps/web`: `getAttempts(sessionId)` keeps its signature and becomes a loop over pages, capped (see Q1); the grading
  page pages with a "Load more" button (it is the one page that is a long list a teacher scrolls); the class record
  loads all session pages (see Q2).
- `apps/mcp`: the same loop helper, so its tools keep returning complete numbers.

## Commands

```
Typecheck:   npm run typecheck
Tests:       bun test packages apps/rpc/src apps/web/src      (PGlite tests for the keyset paging)
Dev:         devenv up (API 3001, web 3000)
```

## Project structure

```
packages/contract/src/page.ts           NEW  Page payload/success schemas and the cursor type
packages/contract/src/session.ts        attempts, classScores
apps/rpc/src/platform/cursor.ts         NEW  encode/decode of a cursor, rejects a malformed one as BadRequest
apps/rpc/src/features/session/Repo.ts   attemptDetails, classScoreData take a page
apps/rpc/src/features/session/Reports.ts, Handlers.ts
apps/web/src/features/session/data.ts   getAttempts, getAttemptsPage
apps/web/src/features/records/data/record.ts
apps/web/src/app/teacher/grading/[sessionId]/page.tsx    load more
apps/mcp/src/session-data.ts, tools/students.ts
```

## Testing strategy

- PGlite (`Repo.test.ts`): 0, 1, `limit`, `limit + 1` and 3 × `limit` attempts give the right pages and `nextCursor`;
  a row inserted or submitted between two page calls is neither skipped nor repeated; a cursor from another session or
  another teacher's session is refused; ties on `startedAt` page deterministically.
- Contract/handler tests: default and max limit enforced (201 is refused), malformed cursor is a clean error.
- Browser (Chrome extension): grading page on the session with 46 attempts, with the page size forced low, loads more;
  class record c1 shows the same scores as before (compare with the PR 1 hash of 73 scores).
- Measure: response bytes and DB time for the first page of a 1,000-attempt session, against the current unpaged call.

## Boundaries

- Always: keep every ownership check; page by keyset; cap `limit`; update every caller in the same PR.
- Ask first: removing the unpaged call (assumption 5), any new dependency, changing what the results/integrity pages show.
- Never: use `offset`; return more than `limit` items; let the web loop run unbounded.

## Success criteria

- Each `session.attempts` / `session.classScores` response has at most `limit` items; the first page of a large
  session is measurably smaller and faster than today (numbers in the PR).
- Every page that worked before shows the same data (class record scores identical to today's, results page unchanged).
- `npm run typecheck` and `bun test` pass; grading page has working "Load more".

## Open questions (need your call)

1. **Pages that need everything** (results, integrity, compare, MCP). Options: (a) loop all pages, with a hard cap of
   e.g. 2,000 attempts and a visible "showing first 2,000" notice beyond that (recommended: bounded and honest);
   (b) loop with no cap (same memory as today, only the single request is smaller); (c) rebuild those pages to compute
   from SQL aggregates (right long term, far bigger than this issue).
2. **Class record.** Options: (a) page by session and the record page loads all pages (recommended, simple); (b) only
   fetch sessions linked to record items, a real reduction but it moves the "which sessions count" rule into the API.
3. **Grading page** UI: "Load more" button (recommended) vs numbered pages.
4. **Remove the unpaged call** (assumption 5) vs keep both for a release. I recommend removing: nothing outside this
   repo calls it.
