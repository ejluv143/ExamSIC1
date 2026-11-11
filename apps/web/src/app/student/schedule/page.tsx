import type { Metadata } from "next";
import Link from "next/link";
import { ModeBadge } from "@/features/session/components/assessment-bits";
import { Video } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, Table, Td, Th, inputClass } from "@/components/ui";
import { getMySessions } from "@/features/attempt/data";
import { getMyClasses, getMyPeople } from "@/features/classes/data";
import { hasAttemptsLeft } from "@examinus/domain/attempts";
import { formatDay, formatTime } from "@examinus/copy/time";
import { classNames } from "@/features/attempt/components/assessment-row";

export const metadata: Metadata = { title: "Schedule" };

// Opens the class's online room (Meet, Zoom, Teams…) straight away in a new tab.
function EroomButton({ url }: { url: string }) {
  if (!url) return <span className="text-muted">Not set</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Video className="size-3.5" aria-hidden /> Join
    </a>
  );
}

// "TTh 1:00–2:30 PM" → the days ("TTh") and the time ("1:00–2:30 PM").
function dayAndTime(schedule: string) {
  const [day = "", ...time] = schedule.trim().split(/\s+/);
  return { day, time: time.join(" ") };
}

export default async function SchedulePage(props: PageProps<"/student/schedule">) {
  const { term: rawTerm } = await props.searchParams;
  const [classes, items] = await Promise.all([getMyClasses(), getMySessions()]);
  const instructors = await Promise.all(classes.map(async (c) => [c.id, (await getMyPeople(c.id)).teachers.join(", ")] as const));
  const instructorOf = new Map(instructors);
  const terms = [...new Set(classes.map((c) => c.term))];
  const term = typeof rawTerm === "string" && terms.includes(rawTerm) ? rawTerm : (terms[0] ?? "");
  const rows = classes.filter((c) => c.term === term);
  const totalUnits = rows.reduce((n, c) => n + c.units, 0);
  const now = new Date().toISOString();

  // Every future opening and deadline, soonest first, grouped by day.
  const events = items
    .flatMap((i) => [
      ...(i.session.opensAt && i.session.opensAt > now
        ? [{ item: i, at: i.session.opensAt, what: "opens" as const }]
        : []),
      ...(i.session.closesAt && i.session.closesAt > now && hasAttemptsLeft(i.attemptsUsed, i.session.attemptsAllowed)
        ? [{ item: i, at: i.session.closesAt, what: "closes" as const }]
        : []),
    ])
    .sort((x, y) => x.at.localeCompare(y.at));
  const days = Map.groupBy(events, (e) => formatDay(e.at));

  return (
    <>
      <PageHeader title="Your schedule list" description="Your subjects for the term, and when your quizzes and exams open and close (Philippine time)." />
      {classes.length === 0 ? (
        <Card className="mb-6">
          <EmptyState title="You're not in any class yet">Join a class with the code from your teacher.</EmptyState>
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
            {rows.map((c) => {
              const { day, time } = dayAndTime(c.schedule);
              return (
                <li key={c.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/student/classes/${c.id}`} className="text-xs font-semibold tracking-wide text-primary uppercase hover:underline">
                          {c.courseCode}
                        </Link>
                        <p className="font-medium uppercase">{c.title}</p>
                      </div>
                      <Badge>{c.units} units</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted">Section</dt>
                        <dd>{c.section || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Room</dt>
                        <dd>{c.room || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Day</dt>
                        <dd>{day || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Time</dt>
                        <dd>{time || "—"}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs text-muted">Instructor</dt>
                        <dd>{instructorOf.get(c.id) || "—"}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="mb-1 text-xs text-muted">E-room</dt>
                        <dd>
                          <EroomButton url={c.eroomUrl} />
                        </dd>
                      </div>
                    </dl>
                  </Card>
                </li>
              );
            })}
          </ul>
          <Card className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <Th>Course code</Th>
                  <Th>Descriptive title</Th>
                  <Th className="text-center">Units</Th>
                  <Th>Section</Th>
                  <Th>Day</Th>
                  <Th>Time</Th>
                  <Th>Room</Th>
                  <Th>Instructor</Th>
                  <Th>E-room</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const { day, time } = dayAndTime(c.schedule);
                  return (
                    <tr key={c.id}>
                      <Td className="font-medium whitespace-nowrap">
                        <Link href={`/student/classes/${c.id}`} className="hover:underline">
                          {c.courseCode}
                        </Link>
                      </Td>
                      <Td className="uppercase">{c.title}</Td>
                      <Td className="text-center tabular-nums">{c.units}</Td>
                      <Td className="whitespace-nowrap">{c.section}</Td>
                      <Td className="whitespace-nowrap">{day}</Td>
                      <Td className="whitespace-nowrap">{time}</Td>
                      <Td>{c.room}</Td>
                      <Td>{instructorOf.get(c.id)}</Td>
                      <Td>
                        <EroomButton url={c.eroomUrl} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
          <dl className="mt-5 mb-8 space-y-1 text-sm sm:ml-auto sm:w-fit">
            <div className="flex gap-2">
              <dt>Total subjects:</dt>
              <dd className="font-semibold tabular-nums">{rows.length}</dd>
            </div>
            <div className="flex gap-2">
              <dt>Total enrolled units:</dt>
              <dd className="font-semibold tabular-nums">{totalUnits}</dd>
            </div>
          </dl>
        </>
      )}
      <h2 className="mb-2 text-sm font-semibold text-muted">Upcoming quizzes and exams</h2>
      {events.length === 0 ? (
        <Card>
          <EmptyState title="Nothing coming up">New quizzes and exams appear here once your teachers schedule them.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...days].map(([day, dayEvents]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{day}</h2>
              <Card>
                <ul className="divide-y divide-border">
                  {dayEvents.map(({ item: i, at, what }) => (
                    <li key={`${i.session.id}-${what}`} className="flex items-center gap-4 px-5 py-3">
                      <span className="w-20 shrink-0 text-sm font-medium tabular-nums">{formatTime(at)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/student/assessments/${i.session.id}`} className="font-medium hover:underline">
                            {i.quizTitle}
                          </Link>
                          <ModeBadge mode={i.session.mode} />
                        </div>
                        <p className="text-sm text-muted">{classNames(i, classes)}</p>
                      </div>
                      {what === "opens" ? <Badge tone="info">Opens</Badge> : <Badge tone="warning">Closes</Badge>}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
