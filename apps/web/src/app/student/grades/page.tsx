import type { Metadata } from "next";
import { Button, Card, EmptyState, PageHeader, Table, Td, Th, inputClass } from "@/components/ui";
import { getMyStanding } from "@/features/records/data/standing";
import { fmtGrade } from "@/features/records/components/standing";
import type { Remark } from "@examinus/domain/class-record";

export const metadata: Metadata = { title: "Report of grades" };

const remarkLabel: Record<Remark, string> = { P: "PASSED", F: "FAILED", FA: "FAILED (FA)", DR: "DROPPED" };
const two = (n: number) => n.toFixed(2);

// The student's report of grades, one term at a time, laid out like the registrar's: units, the midterm and final raw
// scores, the course raw score, the transmuted grade and a remark, then the totals and the general weighted average.
// Read-only; every number comes from the class record (see the Grades tab of each class).
export default async function ReportOfGradesPage(props: PageProps<"/student/grades">) {
  const { term: rawTerm } = await props.searchParams;
  const subjects = await getMyStanding();
  const terms = [...new Set(subjects.map((s) => s.class.term))];
  const term = typeof rawTerm === "string" && terms.includes(rawTerm) ? rawTerm : (terms[0] ?? "");
  const rows = subjects.filter((s) => s.class.term === term);

  // General weighted average: each graded subject's grade weighted by its units.
  const graded = rows.filter((s) => s.current && s.class.units > 0);
  const gradedUnits = graded.reduce((n, s) => n + s.class.units, 0);
  const gwa = gradedUnits > 0 ? graded.reduce((n, s) => n + s.sheet.grade * s.class.units, 0) / gradedUnits : null;
  const totalUnits = rows.reduce((n, s) => n + s.class.units, 0);

  return (
    <>
      <PageHeader title="Report of grades" description="Your grades for the term, from your teachers' class records. 1.00 is the highest; 3.00 is passing." />

      {subjects.length === 0 ? (
        <Card>
          <EmptyState title="You're not in any class yet" />
        </Card>
      ) : (
        <>
          <form className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="w-full text-sm sm:w-auto">
              <span className="mb-1 block text-muted">Academic year &amp; term</span>
              <select name="term" defaultValue={term} className={`${inputClass} w-full sm:min-w-64`}>
                {terms.map((t) => (
                  <option key={t} value={t}>
                    {t || "No term set"}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary">
              Show
            </Button>
          </form>

          {/* Phones get a card per subject; wider screens the table. */}
          <ul className="space-y-3 md:hidden">
            {rows.map(({ class: c, current, sheet }) => (
              <li key={c.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-wide text-primary uppercase">{c.courseCode}</p>
                      <p className="font-medium uppercase">{c.title}</p>
                      <p className="text-xs text-muted">{c.units} units</p>
                    </div>
                    {current && (
                      <div className="text-right">
                        <p className="text-2xl font-semibold tabular-nums">{fmtGrade(sheet.grade)}</p>
                        <p className="text-xs font-medium">{remarkLabel[sheet.remark]}</p>
                      </div>
                    )}
                  </div>
                  {current ? (
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                      {[
                        ["MGrd", two(sheet.midterm.rawScore)],
                        ["FGrd", two(sheet.final.rawScore)],
                        ["Grade", two(sheet.rawScore)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-border p-2">
                          <dd className="font-semibold tabular-nums">{value}</dd>
                          <dt className="text-xs text-muted">{label}</dt>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-3 text-sm text-muted">No grades yet.</p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
          <Card className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Descriptive title</Th>
                  <Th className="text-center">Units</Th>
                  <Th className="text-center">MGrd</Th>
                  <Th className="text-center">FGrd</Th>
                  <Th className="text-center">Grade</Th>
                  <Th className="text-center">Final GRD</Th>
                  <Th>Remarks</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ class: c, current, sheet }) => (
                  <tr key={c.id}>
                    <Td className="font-medium whitespace-nowrap">{c.courseCode}</Td>
                    <Td className="uppercase">{c.title}</Td>
                    <Td className="text-center tabular-nums">{c.units}</Td>
                    <Td className="text-center tabular-nums">{current ? two(sheet.midterm.rawScore) : ""}</Td>
                    <Td className="text-center tabular-nums">{current ? two(sheet.final.rawScore) : ""}</Td>
                    <Td className="text-center tabular-nums">{current ? two(sheet.rawScore) : ""}</Td>
                    <Td className="text-center font-semibold tabular-nums">{current ? fmtGrade(sheet.grade) : ""}</Td>
                    <Td className="font-medium">{current ? remarkLabel[sheet.remark] : ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <dl className="mt-5 space-y-1 text-sm sm:ml-auto sm:w-fit">
            <div className="flex gap-2">
              <dt>Total subjects:</dt>
              <dd className="font-semibold tabular-nums">{rows.length}</dd>
            </div>
            <div className="flex gap-2">
              <dt>Total enrolled units:</dt>
              <dd className="font-semibold tabular-nums">{totalUnits}</dd>
            </div>
            <div className="flex gap-2">
              <dt>General weighted average:</dt>
              <dd className="font-semibold tabular-nums">{gwa === null ? "—" : gwa.toFixed(3)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">
            MGrd and FGrd are your midterm and final term scores out of 100, Grade is their average, and Final GRD is that
            average on the school&apos;s 1.00–5.00 scale. Work not yet recorded counts as zero.
          </p>
        </>
      )}
    </>
  );
}
