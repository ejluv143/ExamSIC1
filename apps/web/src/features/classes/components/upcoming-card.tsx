import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Clock } from "lucide-react";
import { formatMonthDay, formatTime, formatWeekday, manilaZone } from "@examinus/copy/time";
import { Badge } from "@/components/ui";

export type UpcomingItem = {
  id: string;
  title: string;
  // "Assignment · 100 points", "Exam", …
  detail: string;
  // When it is due or opens; null for a session with no start time yet.
  at: string | null;
  href: string;
};

// The current time for a server component, which renders once per request (no re-render can change it).
export const requestTime = () => Date.now();

const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: manilaZone }).format(ms);

// How far off a date is, by Manila calendar days, with a tone for how urgent that is.
export function whenLabel(iso: string | null, now = requestTime()): { text: string; tone: "danger" | "warning" | "info" | "neutral" } {
  if (!iso) return { text: "Not scheduled", tone: "neutral" };
  const at = Date.parse(iso);
  const days = Math.round((Date.parse(dayKey(at)) - Date.parse(dayKey(now))) / 86_400_000);
  const time = formatTime(iso);
  if (days < 0) return { text: `${formatMonthDay(iso)}, ${time}`, tone: "neutral" };
  if (days === 0) return { text: `Today, ${time}`, tone: "danger" };
  if (days === 1) return { text: `Tomorrow, ${time}`, tone: "danger" };
  if (days < 7) return { text: `${formatWeekday(iso)}, ${time}`, tone: "warning" };
  return { text: `${formatMonthDay(iso)}, ${time}`, tone: "info" };
}

const tones = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-muted text-muted",
} as const;

// "Upcoming" on the stream's left: what is due or opens next, soonest first, with how soon it is.
export function UpcomingCard({ items, allHref }: { items: UpcomingItem[]; allHref: string }) {
  const now = requestTime();
  const soon = items.filter((i) => i.at && Date.parse(i.at) >= now && Date.parse(i.at) - now < 7 * 86_400_000).length;
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Clock className="size-5 text-primary" aria-hidden /> Upcoming
        </h2>
        {soon > 0 && <Badge tone="danger">{soon} this week</Badge>}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">No work due soon</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 4).map((item) => {
            const when = whenLabel(item.at, now);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="group block rounded-xl bg-primary-soft/60 p-3 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className={clsx("rounded-md px-2 py-0.5 text-xs font-semibold", tones[when.tone])}>{when.text}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
                  </span>
                  <span className="mt-2 block text-sm font-semibold">{item.title}</span>
                  <span className="block text-xs text-muted">{item.detail}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link href={allHref} className="mt-3 block rounded-xl bg-primary-soft/60 py-2 text-center text-sm font-semibold text-primary hover:bg-primary-soft">
        View all work
      </Link>
    </section>
  );
}
