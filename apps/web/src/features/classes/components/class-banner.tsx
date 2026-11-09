import type { ComponentProps } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CalendarCheck, Clock, DoorOpen, Pencil, Printer, Sheet, Users, Video } from "lucide-react";
import { classColors } from "@examinus/domain/classes";
import type { ClassFormState } from "../actions";
import type { Class } from "../types";
import { ClassCodeChip } from "./class-code-chip";
import { CustomizeAppearance } from "./customize-appearance";

const chip = "inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs font-medium backdrop-blur-sm";
const tool =
  "inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white";

// The top of a class: term, room and schedule chips, the title, the class code and head count, then the meeting
// link and the teacher's tools. It takes the class's colour or header picture.
export function ClassBanner({
  cls,
  base,
  enrolled,
  headerUrl,
  newCode,
  customize,
}: {
  cls: Class & { joinCode?: string };
  base: string;
  enrolled: number;
  headerUrl: string | null;
  newCode: () => Promise<ClassFormState>;
  customize: ComponentProps<typeof CustomizeAppearance>["save"];
}) {
  return (
    <section
      className={clsx(
        "relative mb-5 overflow-hidden rounded-3xl p-5 shadow-md sm:p-7",
        "bg-cover bg-center",
        cls.color || headerUrl ? "text-white" : "bg-gradient-to-br from-primary to-primary-hover text-primary-foreground",
      )}
      style={
        headerUrl
          ? { backgroundImage: `linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,.4)), url("${headerUrl}")` }
          : cls.color
            ? { backgroundImage: `linear-gradient(135deg, ${classColors[cls.color].from}, ${classColors[cls.color].to})` }
            : undefined
      }
    >
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full bg-white/10 sm:size-80" />
      <div aria-hidden className="pointer-events-none absolute right-24 -bottom-24 size-56 rounded-full bg-white/10" />

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          {cls.term && <span className={chip}>{cls.term}</span>}
          {cls.room && (
            <span className={chip}>
              <DoorOpen className="size-3.5" aria-hidden /> {cls.room}
            </span>
          )}
          {cls.schedule && (
            <span className={chip}>
              <Clock className="size-3.5" aria-hidden /> {cls.schedule}
            </span>
          )}
        </div>

        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {cls.courseCode} · {cls.title}
        </h1>
        {cls.section && <p className="mt-1 text-base opacity-90">{cls.section}</p>}

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {cls.joinCode ? <ClassCodeChip code={cls.joinCode} newCode={newCode} /> : null}
            <span className="inline-flex items-center gap-1.5 text-sm opacity-90">
              <Users className="size-4" aria-hidden /> {enrolled} enrolled
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {cls.eroomUrl && (
              <a
                href={cls.eroomUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-white"
              >
                <Video className="size-4" aria-hidden /> Join online room
              </a>
            )}
            <Link href={`${base}/attendance`} className={tool}>
              <CalendarCheck className="size-4" aria-hidden /> <span className="max-sm:sr-only">Attendance</span>
            </Link>
            <Link href={`${base}/record`} className={tool}>
              <Sheet className="size-4" aria-hidden /> <span className="max-sm:sr-only">Class record</span>
            </Link>
            <Link href={`${base}/grade-sheet`} className={tool}>
              <Printer className="size-4" aria-hidden /> <span className="max-sm:sr-only">Grade sheet</span>
            </Link>
            <Link href={`${base}/edit`} className={tool}>
              <Pencil className="size-4" aria-hidden /> <span className="max-sm:sr-only">Edit</span>
            </Link>
            <CustomizeAppearance
              title={`${cls.courseCode} · ${cls.title}`}
              section={cls.section}
              color={cls.color ?? null}
              headerImage={cls.headerImage ?? null}
              headerUrl={headerUrl}
              save={customize}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
