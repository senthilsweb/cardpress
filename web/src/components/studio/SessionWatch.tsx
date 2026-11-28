import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { idleStep, warning, type IdleState } from "@/lib/idle";
import { endedUrl } from "@/lib/session";

/** Keeps the sign-in alive while the app is used, warns before it ends, and goes to sign-in when it has. */
export function SessionWatch() {
  const state = useRef<IdleState>({ used: 0, told: Date.now(), ends: Number.POSITIVE_INFINITY, limit: "idle" });
  const [left, setLeft] = useState<number | null>(null);
  const [limit, setLimit] = useState<"idle" | "max">("idle");
  const stay = useRef<() => void>(() => undefined);

  useEffect(() => {
    let live = true, busy = false;
    const hear = async (use: boolean) => {
      if (busy) return;
      busy = true;
      const asked = Date.now();
      try {
        const t = use ? await api.staySignedIn() : await api.sessionTimes();
        if (!live) return;
        if (use) state.current.told = asked;
        state.current.ends = asked + t.remainingSeconds * 1000;
        state.current.limit = t.limit;
        setLimit(t.limit);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) window.location.assign(endedUrl());
        // anything else (offline, a restart): try again at the next look
      } finally { busy = false; }
    };
    const look = () => {
      const now = Date.now();
      const step = idleStep(state.current, now);
      if (step !== "wait") void hear(step === "tell").then(() => { if (live) setLeft(warning(state.current, Date.now())); });
      else setLeft(warning(state.current, now));
    };
    const used = () => {
      const now = Date.now();
      state.current.used = now;
      if (state.current.ends - now <= 120_000) look(); // near the end, use counts at once
    };
    stay.current = () => { state.current.used = Date.now(); void hear(true).then(() => { if (live) setLeft(warning(state.current, Date.now())); }); };
    const kinds = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    kinds.forEach((k) => window.addEventListener(k, used, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", look);
    const timer = window.setInterval(look, 1000);
    void hear(false);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
      kinds.forEach((k) => window.removeEventListener(k, used, { capture: true }));
    };
  }, []);

  return (
    <Dialog open={left !== null} onOpenChange={(open) => { if (!open) stay.current(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{limit === "max" ? "Your session is ending" : "Stay signed in?"}</DialogTitle>
          <DialogDescription>
            {limit === "max" ? "Sign in again to carry on. Signing out in" : "You will be signed out in"} {left ?? 0} seconds.
          </DialogDescription>
        </DialogHeader>
        {limit === "idle" && <DialogFooter><Button variant="brand" onClick={() => stay.current()}>Stay signed in</Button></DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
