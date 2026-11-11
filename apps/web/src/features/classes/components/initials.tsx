import clsx from "clsx";

// A round badge with a person's initials.
export function Initials({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={clsx(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary",
        className,
      )}
    >
      {letters || "?"}
    </span>
  );
}
