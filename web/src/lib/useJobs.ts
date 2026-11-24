import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { isActive, type Job } from "./jobs";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/**
 * A profile's publish jobs. The list refreshes every few seconds while a job is scheduled or publishing (the server
 * changes those by itself), and when the tab regains focus. Actions throw on failure so the caller can show the reason.
 */
export function useJobs(profileId: string) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [scope, setScope] = useState<"brand" | "all">("brand");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setJobs(await api.listJobs(profileId, scope)); setError(null); }
    catch (e) { setError(message(e)); }
    finally { setLoaded(true); }
  }, [profileId, scope]);

  useEffect(() => { void refresh(); }, [refresh]);

  const active = jobs.some(isActive);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    return () => window.clearInterval(t);
  }, [active, refresh]);
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const act = useCallback(async (fn: () => Promise<unknown>) => { try { await fn(); } finally { await refresh(); } }, [refresh]);

  return {
    jobs, loaded, error, refresh,
    /** Whose posts the list shows: the open brand's, or every brand's. */
    scope, setScope,
    /** Show a job at once, without waiting for the next refresh. */
    add: (j: Job) => setJobs((l) => [j, ...l.filter((x) => x.id !== j.id)]),
    publishNow: (id: string, acceptDuplicate = false) => act(() => api.publishJobNow(id, acceptDuplicate)),
    reschedule: (id: string, scheduledAt: string, timezone: string) => act(() => api.rescheduleJob(id, scheduledAt, timezone)),
    cancel: (id: string) => act(() => api.cancelJob(id)),
    remove: (id: string) => act(() => api.deleteJob(id)),
  };
}

export type JobsStore = ReturnType<typeof useJobs>;
