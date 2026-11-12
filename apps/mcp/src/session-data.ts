// A session's quiz, attempts and roster, loaded for the tools. The numbers come from @examinus/domain/results.
import type { RosterStudent } from "@examinus/domain/classes";
import { latestByStudent } from "@examinus/domain/results";
import { allPages } from "@examinus/contract/page";
import { api } from "./api.ts";

// `withNames: false` skips the roster lookup when only scores are needed.
export async function loadSession(sessionId: string, withNames = true) {
  const [detail, attempts] = await Promise.all([
    api((a) => a["session.get"]({ sessionId })),
    allPages((page) => api((a) => a["session.attempts"]({ sessionId, ...page }))).then((r) => r.items),
  ]);
  const questions = detail.quiz.parts.flatMap((p) => p.questions);
  const ids = [...new Set([...detail.studentIds, ...attempts.map((d) => d.studentId)])];
  const roster = withNames && ids.length > 0 ? await api((a) => a["class.students"]({ studentIds: ids })) : [];
  const names = new Map<string, RosterStudent>(roster.map((s) => [s.id, s]));
  const latest = latestByStudent(attempts);
  return { detail, session: detail.session, attempts, questions, ids, names, latest };
}
