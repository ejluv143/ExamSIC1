import Link from "next/link";
import clsx from "clsx";
import { BarChart3, ClipboardList, MessagesSquare, Users, type LucideIcon } from "lucide-react";

export const classTabs = [
  { id: "stream", label: "Stream", icon: MessagesSquare },
  { id: "classwork", label: "Classwork", icon: ClipboardList },
  { id: "people", label: "People", icon: Users },
] as const;
export type ClassTab = (typeof classTabs)[number]["id"];

const base = "inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap";

// The pill bar under the banner. Grades is its own page (the class record), so it links away from the tabs.
export function ClassTabs({ active, base: href }: { active: ClassTab; base: string }) {
  const tabs: { id: string; label: string; icon: LucideIcon; to: string }[] = [
    ...classTabs.map((t) => ({ ...t, to: t.id === "stream" ? href : `${href}?tab=${t.id}` })),
    { id: "grades", label: "Grades", icon: BarChart3, to: `${href}/record` },
  ];
  return (
    <nav
      aria-label="Class sections"
      className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1.5 shadow-sm"
    >
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.to}
          aria-current={active === t.id ? "page" : undefined}
          className={clsx(
            base,
            active === t.id ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground",
          )}
        >
          <t.icon className="size-4" aria-hidden /> {t.label}
        </Link>
      ))}
    </nav>
  );
}
