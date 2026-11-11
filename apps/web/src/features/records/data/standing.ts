import "server-only";
import type { MyScore } from "@examinus/contract/attempt";
import { assignmentSession, studentStandings, type ClassRecord, type StandingSession } from "@examinus/domain/class-record";
import { read } from "@/lib/api/helpers";
import { me } from "@/features/classes/data";

// The student's grade in each subject so far, from the class record. Only their own scores leave here.
// The arithmetic is `studentStanding` in `@examinus/domain/class-record`, shared with the mobile app.
export async function getMyStanding() {
  const { user, myClasses } = await me({ enrollment: ["read"] });
  const [scores, meetingsByClass, recordByClass, assignmentsByClass] = await Promise.all([
    read((api) => api["attempt.myScores"]()) as Promise<readonly MyScore[]>,
    // Their own attendance and class record in each class (the API leaves out classmates').
    Promise.all(myClasses.map((cls) => read((api) => api["attendance.mine"]({ classId: cls.id })))),
    Promise.all(myClasses.map((cls) => read((api) => api["classRecord.mine"]({ classId: cls.id })))),
    // Their assignments worth points: each counts once it is past due or turned in, and its score once it is returned.
    Promise.all(myClasses.map((cls) => read((api) => api["work.recordMine"]({ classId: cls.id })))),
  ]);
  const now = Date.now();
  const assignments: (StandingSession & { readonly classId: string })[] = myClasses.flatMap((cls, i) =>
    assignmentsByClass[i]!.map((a) => ({
      ...assignmentSession(a),
      classId: cls.id,
      closed: a.dueAt !== null && Date.parse(a.dueAt) <= now,
      attempted: a.turnedIn,
      score: a.score,
    })),
  );

  return studentStandings({
    classes: myClasses,
    studentId: user.studentId,
    scores: [...scores, ...assignments],
    meetings: meetingsByClass,
    records: recordByClass as (ClassRecord | null)[],
  });
}
