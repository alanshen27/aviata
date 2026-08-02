"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/app/page.module.css";

interface JobRow {
  id?: string;
  name: string;
  state: string;
  progress?: number | object;
  failedReason?: string;
  finishedOn?: number;
}

const QUICK_JOBS = [
  { name: "ingest:full", label: "Ingest open data", data: { limit: 5000 } },
  {
    name: "recommend:traveler",
    label: "Recommend (SGP)",
    data: { traveler: "trav_sgp_china", preferPython: true },
  },
  {
    name: "score:leg",
    label: "Score TEB→OPF",
    data: {
      icao24: "a12bc3",
      registration: "N425QS",
      typecode: "C68A",
      origin: "TEB",
      destination: "OPF",
      groundTimeHours: 3.5,
      priorOrigin: "ASE",
      priorDestination: "TEB",
      oneWayRatio7d: 0.71,
      preferPython: true,
    },
  },
  { name: "collect:opensky", label: "Collect OpenSky", data: {} },
] as const;

export function JobsPanel() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Queue unavailable");
        setJobs([]);
        return;
      }
      setError(null);
      setJobs(data.jobs ?? []);
    } catch {
      setError("Could not reach /api/jobs");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  async function enqueue(name: string, data: object, label: string) {
    setBusy(name);
    setToast(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setToast(payload.error ?? "Enqueue failed");
        return;
      }
      setToast(`Queued ${label} · id ${payload.job.id}`);
      await refresh();
    } catch {
      setToast("Network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.section} id="jobs">
      <div className={styles.sectionHead}>
        <h2>BullMQ jobs</h2>
        <p>
          Next.js enqueues work; a Redis-backed worker runs ingest, scoring, and
          recommendations off the request path.
        </p>
      </div>

      <div className={styles.filters}>
        {QUICK_JOBS.map((j) => (
          <button
            key={j.name + j.label}
            type="button"
            className={styles.btnGhost}
            disabled={busy === j.name}
            onClick={() => void enqueue(j.name, j.data, j.label)}
          >
            {busy === j.name ? "Queuing…" : j.label}
          </button>
        ))}
        <button type="button" className={styles.btnPrimary} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {error && (
        <p className={styles.meta}>
          {error}. Start Redis, then <code>npm run worker</code>.
        </p>
      )}
      {toast && <p className={styles.toast}>{toast}</p>}

      <div className={styles.dealList}>
        {jobs.slice(0, 12).map((job) => (
          <article key={String(job.id)} className={styles.dealRow}>
            <div>
              <div className={styles.route}>{job.name}</div>
              <div className={styles.meta}>id {job.id}</div>
            </div>
            <div className={styles.scoreStack}>
              <span className={styles.badge}>{job.state}</span>
              {job.failedReason && (
                <div className={styles.meta}>{job.failedReason.slice(0, 160)}</div>
              )}
            </div>
            <div className={styles.meta}>
              {typeof job.progress === "number" ? `${job.progress}%` : "—"}
            </div>
            <div className={styles.meta}>
              {job.finishedOn
                ? new Date(job.finishedOn).toLocaleTimeString()
                : "pending"}
            </div>
          </article>
        ))}
        {!error && jobs.length === 0 && (
          <p className={styles.meta}>No jobs yet — queue an ingest or score run.</p>
        )}
      </div>
    </section>
  );
}
