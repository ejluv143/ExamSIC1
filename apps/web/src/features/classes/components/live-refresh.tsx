"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps a page with something live on it current: asks the server for a fresh render every few seconds (only while
// the tab is showing), so a session that starts or ends shows up without a reload.
export function LiveRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
