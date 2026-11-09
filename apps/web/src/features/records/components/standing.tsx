import clsx from "clsx";
import { Badge, Card } from "@/components/ui";
import type { getMyStanding } from "@/features/records/data/standing";
import { attendancePolicy } from "@examinus/domain/attendance";
import { passingGrade, transmutationTable, type Remark } from "@examinus/domain/class-record";

export type Subject = Awaited<ReturnType<typeof getMyStanding>>[number];
export type Term = Subject["terms"]["midterm"];

export const remarkBadge: Record<Remark, { tone: "success" | "danger" | "warning" | "neutral"; label: string }> = {
  P: { tone: "success", label: "Passing" },
  F: { tone: "danger", label: "Failing so far" },
  FA: { tone: "danger", label: "Too many absences" },
  DR: { tone: "neutral", label: "Dropped" },
};

export const fmtGrade = (g: number) => g.toFixed(2);

export function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 flex-1 rounded-full bg-primary-soft">
      <div
        className={clsx("h-full rounded-full", pct < 50 ? "bg-warning" : "bg-primary")}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export function TermBreakdown({ label, term }: { label: string; term: Term }) {
  if (!term.started) {
    return (
      <div>
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="mt-1 text-sm text-muted">Nothing recorded yet.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="text-sm text-muted">
          Grade <span className="font-semibold text-foreground tabular-nums">{fmtGrade(term.grade)}</span> · raw{" "}
          <span className="tabular-nums">{term.rawScore}</span> · {term.weightSoFar}% of the term recorded
        </p>
      </div>
      <ul className="mt-3 space-y-3">
        {term.categories.map((c) => (
          <li key={c.name} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">{c.name}</span>
              <Badge>{c.weight}%</Badge>
              <span className="ml-auto text-muted tabular-nums">
                {c.result ? (
                  <>
                    {c.result.raw} / {c.result.max} ·{" "}
                    <span className="font-medium text-foreground">{c.result.weighted}</span> of {c.weight}
                  </>
                ) : (
                  "Not yet"
                )}
              </span>
            </div>
            {c.result && (
              <div className="mt-2 flex items-center gap-2">
                <Bar pct={c.result.max ? (c.result.raw / c.result.max) * 100 : 0} />
              </div>
            )}
            {c.items.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {c.items.map((i) => (
                  <li key={i.title} className="flex justify-between gap-3">
                    <span className="truncate">{i.title}</span>
                    <span className="shrink-0 tabular-nums">
                      {i.pending ? "Being graded" : !i.recorded ? "Not yet" : i.score === null ? "0 (missed)" : `${i.score} / ${i.maxScore}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Absences this term: {term.absences}
      </p>
    </div>
  );
}

// Absences (lates converted) against the drop limit, in a small line under the grade.
export function AttendanceLine({ attendance: a }: { attendance: Subject["attendance"] }) {
  if (a.held === 0) return null;
  return (
    <p
      className={clsx(
        "mt-1 text-xs tabular-nums",
        a.standing === "drop" ? "font-medium text-danger" : a.standing === "warning" ? "font-medium text-warning" : "text-muted",
      )}
    >
      {a.effectiveAbsences} of {attendancePolicy.dropAtAbsences} absences allowed used
      {a.late > 0 && ` · ${a.late} ${a.late === 1 ? "late" : "lates"}`}
    </p>
  );
}


const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// One class's grades for its student, read-only: the current grade and its raw percent, each term's categories with
// every item's score, and the student's own attendance. Nothing here can be edited.
type SheetTerm = Subject["sheet"]["midterm"];

// A score out of its share, with a thin bar under it that fills as the share is earned.
function ScoreCell({ earned, of }: { earned: number; of: number }) {
  const share = of > 0 ? Math.min(100, (earned / of) * 100) : 0;
  return (
    <div className="ml-auto w-full max-w-40 min-w-16">
      <p className="text-right whitespace-nowrap tabular-nums">
        <span className="font-medium">{earned}</span>
        <span className="text-muted"> / {of}</span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary-soft" role="presentation">
        <div className={clsx("h-full rounded-full", share < 50 ? "bg-warning" : "bg-primary")} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

function GradePill({ grade }: { grade: number }) {
  return (
    <span className={clsx("inline-block min-w-14 rounded-full px-3 py-1 text-center text-sm font-semibold tabular-nums", grade <= passingGrade ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
      {fmtGrade(grade)}
    </span>
  );
}

// The school's final grade sheet, one table: each ADW category, the totals and the grade for the midterm and the final
// term side by side, then the course average. ADW (60) plus the major exam (40) is each term's raw score, the course raw
// score is the average of the two, and the transmutation table turns each into a grade. Unrecorded work counts as zero.
function GradeSheet({ sheet }: { sheet: Subject["sheet"] }) {
  const terms: [string, SheetTerm][] = [
    ["Midterm", sheet.midterm],
    ["Final term", sheet.final],
  ];
  // Category names in order (midterm first), so a category is in one row for both terms.
  const names = [...new Set(terms.flatMap(([, t]) => t.categories.filter((c) => !c.isExam).map((c) => c.name)))];
  const cell = (t: SheetTerm, name: string) => t.categories.find((c) => c.name === name && !c.isExam);
  const th = "px-3 py-3 sm:px-4 text-xs font-medium tracking-wide text-muted uppercase";
  const td = "px-3 py-3 sm:px-4";
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 p-5 pb-4">
        <div>
          <h2 className="font-semibold">Grade sheet</h2>
          <p className="mt-1 text-xs text-muted">Work not yet recorded counts as zero, as on the final grade sheet.</p>
        </div>
        <Badge tone={remarkBadge[sheet.remark].tone}>{remarkBadge[sheet.remark].label}</Badge>
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-y border-border bg-surface-muted/60">
            <tr>
              <th scope="col" className={th}>
                Category
              </th>
              {terms.map(([label]) => (
                <th key={label} scope="col" className={clsx(th, "text-right")}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {names.map((name) => (
              <tr key={name} className="transition-colors hover:bg-surface-muted/40">
                <th scope="row" className={clsx(td, "font-normal")}>
                  {name}
                </th>
                {terms.map(([label, t]) => {
                  const c = cell(t, name);
                  return (
                    <td key={label} className={td}>
                      {c ? <ScoreCell earned={c.weighted} of={c.weight} /> : <p className="text-right text-muted">—</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-primary-soft/40 font-medium">
              <th scope="row" className={td}>
                Total ADW
              </th>
              {terms.map(([label, t]) => (
                <td key={label} className={clsx(td, "text-right tabular-nums")}>
                  {t.adw} <span className="font-normal text-muted">/ 60</span>
                </td>
              ))}
            </tr>
            <tr className="transition-colors hover:bg-surface-muted/40">
              <th scope="row" className={clsx(td, "font-normal")}>
                Major exam
              </th>
              {terms.map(([label, t]) => (
                <td key={label} className={td}>
                  <ScoreCell earned={t.exam} of={40} />
                </td>
              ))}
            </tr>
            <tr className="bg-primary-soft/40 font-semibold">
              <th scope="row" className={td}>
                Total
              </th>
              {terms.map(([label, t]) => (
                <td key={label} className={clsx(td, "text-right tabular-nums")}>
                  {t.rawScore}%
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={clsx(td, "font-semibold")}>
                Grade
              </th>
              {terms.map(([label, t]) => (
                <td key={label} className={clsx(td, "text-right")}>
                  <GradePill grade={t.grade} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-primary-soft/60 px-5 py-4">
        <div>
          <p className="text-sm font-medium">Course average</p>
          <p className="text-xs text-muted">(Midterm + Final term) / 2</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tabular-nums">{sheet.rawScore}%</span>
          <GradePill grade={sheet.grade} />
        </div>
      </div>
    </Card>
  );
}

export function ClassGrades({ subject }: { subject: Subject }) {
  const { current, terms, attendance: a } = subject;
  const attended = a.present + a.late;
  const stats = [
    { label: "Present", value: a.present },
    { label: "Late", value: a.late },
    { label: "Absent", value: a.absent },
    { label: "Excused", value: a.excused },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Current grade</p>
            <p className="text-4xl font-semibold tabular-nums">{current ? fmtGrade(current.grade) : "—"}</p>
          </div>
          {current ? (
            <div className="text-right">
              <Badge tone={remarkBadge[current.remark].tone}>{remarkBadge[current.remark].label}</Badge>
              <p className="mt-1 text-sm text-muted tabular-nums">Raw score {current.rawScore}%</p>
            </div>
          ) : (
            <Badge>No grades yet</Badge>
          )}
        </div>
        {current && (
          <div className="mt-3">
            <Bar pct={current.rawScore} />
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Read-only: your teacher&apos;s class record sets these scores.</p>
      </Card>

      <GradeSheet sheet={subject.sheet} />

      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Attendance</h2>
          <p className="text-sm text-muted tabular-nums">
            {a.held === 0 ? "No meetings yet" : `${pct(attended, a.held)}% attended · ${a.held} ${a.held === 1 ? "meeting" : "meetings"}`}
          </p>
        </div>
        {a.held > 0 && (
          <>
            <div className="mt-3">
              <Bar pct={pct(attended, a.held)} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg border border-border p-3">
                  <dd className="text-2xl font-semibold tabular-nums">{s.value}</dd>
                  <dt className="text-xs text-muted">{s.label}</dt>
                </div>
              ))}
            </dl>
            <AttendanceLine attendance={a} />
          </>
        )}
      </Card>

      <Card className="grid gap-6 p-5 lg:grid-cols-2">
        <TermBreakdown label="Midterm" term={terms.midterm} />
        <TermBreakdown label="Finals" term={terms.final} />
      </Card>

      <details className="rounded-xl border border-border bg-surface p-5 text-sm">
        <summary className="cursor-pointer font-medium">How your grade is computed</summary>
        <div className="mt-3 space-y-3 text-muted">
          <p>
            This follows the school&apos;s final grade sheet. Each term (midterm and final term) is worth 100 points:
            activities and daily work (ADW) are worth 60 and the major exam is worth 40. The default ADW split is Quizzes 20,
            Assignments 20, Major project 10 and Attendance / Participation 10; your teacher can change the split to match the
            learning plan, as long as the ADW total stays 60.
          </p>
          <p>
            For each ADW category, the points you earned are divided by the total points possible, then multiplied by the
            category&apos;s share of the term (for example, 45 of 50 in Quizzes counts as 45 ÷ 50 × 20 = 18). A category
            never counts for more than its share, so extra credit is cut off at the share. The major exam is your score
            divided by its total, times 40.
          </p>
          <p>
            Term raw score = total ADW + major exam. The term grade is that raw score looked up in the transmutation table
            below. The course raw score is the average of the midterm and final term raw scores, and the course grade is that
            average looked up in the same table. Work that isn&apos;t recorded yet counts as zero in the Grade sheet card.
            The grade at the top only counts work that has been recorded, so it shows how you are doing so far.
          </p>
          <p>
            A grade of {fmtGrade(passingGrade)} or better is passing (P) and anything lower is failing (F). Too many absences
            on a failing grade is FA.
          </p>
          <p className="font-medium text-foreground">Transmutation table</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {transmutationTable.map(([min, grade], i) => (
              <div key={grade} className="flex justify-between gap-2 tabular-nums">
                <span>{i === 0 ? `${min}–100` : `${min}–${transmutationTable[i - 1]![0] - 1}`}</span>
                <span className="font-medium text-foreground">{fmtGrade(grade)}</span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
