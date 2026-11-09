"use client";

import { useActionState, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import type { ClassFormState } from "../actions";

type Action = () => Promise<ClassFormState>;

// The class code as a chip on the banner: copy it, or make a new one (the old one stops working).
export function ClassCodeChip({ code, newCode }: { code: string; newCode: Action }) {
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(newCode, undefined);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  const icon =
    "inline-flex size-7 items-center justify-center rounded-md hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white";
  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-black/20 py-1.5 pr-1.5 pl-3 backdrop-blur-sm">
      <span className="text-xs opacity-80">Class code</span>
      <span className="font-mono text-sm font-semibold tracking-[0.15em]">{code}</span>
      <button type="button" onClick={copy} className={icon} aria-label={copied ? "Code copied" : "Copy class code"} title="Copy code">
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm("Make a new code? The current one stops working.")) e.preventDefault();
        }}
      >
        <button type="submit" disabled={pending} className={icon} aria-label="Make a new class code" title="New code">
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
        </button>
      </form>
      {state?.error && (
        <span role="alert" className="basis-full text-xs text-white">
          {state.error}
        </span>
      )}
    </div>
  );
}
