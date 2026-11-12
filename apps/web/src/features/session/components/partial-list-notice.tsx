import { maxLoaded } from "@examinus/contract/page";

// Said on a page that works out numbers over a session's attempts when the session has more than `maxLoaded`: the numbers
// are for the first ones only.
export function PartialListNotice({ truncated }: { truncated: boolean }) {
  if (!truncated) return null;
  return (
    <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      This session has more than {maxLoaded.toLocaleString()} attempts. The numbers on this page are for the first{" "}
      {maxLoaded.toLocaleString()} to start.
    </p>
  );
}
