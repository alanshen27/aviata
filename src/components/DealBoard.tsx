"use client";

import { useMemo, useState } from "react";
import type { EmptyLegCandidate } from "@/lib/types";
import styles from "@/app/page.module.css";

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function airportCode(leg: EmptyLegCandidate, which: "origin" | "destination") {
  const a = leg[which];
  return a.iata ?? a.icao.replace(/^K/, "");
}

export function DealBoard({ legs }: { legs: EmptyLegCandidate[] }) {
  const [origin, setOrigin] = useState("");
  const [minConf, setMinConf] = useState(0.35);

  const filtered = useMemo(() => {
    return legs.filter((leg) => {
      if (leg.confidence < minConf) return false;
      if (!origin.trim()) return true;
      const code = origin.trim().toUpperCase();
      return (
        leg.origin.iata === code ||
        leg.origin.icao === code ||
        leg.origin.icao === `K${code}`
      );
    });
  }, [legs, origin, minConf]);

  return (
    <section className={styles.section} id="deals">
      <div className={styles.sectionHead}>
        <h2>Live empty-leg board</h2>
        <p>
          Ranked by the OSINT ensemble — XGBoost on tabular ADS-B features, LSTM
          on recent leg sequences, plus rule priors.
        </p>
      </div>

      <div className={styles.filters}>
        <input
          placeholder="Origin (e.g. TEB)"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          aria-label="Filter by origin"
        />
        <select
          value={minConf}
          onChange={(e) => setMinConf(Number(e.target.value))}
          aria-label="Minimum confidence"
        >
          <option value={0}>All scores</option>
          <option value={0.35}>Confidence ≥ 35%</option>
          <option value={0.5}>Confidence ≥ 50%</option>
          <option value={0.65}>Confidence ≥ 65%</option>
        </select>
      </div>

      <div className={styles.dealList}>
        {filtered.map((leg) => (
          <article key={leg.id} className={styles.dealRow}>
            <div>
              <div className={styles.route}>
                {airportCode(leg, "origin")} → {airportCode(leg, "destination")}
              </div>
              <div className={styles.meta}>
                {leg.aircraftType.name} · {leg.registration}
                <br />
                {fmtWhen(leg.estimatedDeparture)} · {Math.round(leg.distanceNm)}{" "}
                nm
              </div>
              {leg.signals.slice(0, 3).map((s) => (
                <span key={s} className={styles.badge}>
                  {s.replace(/_/g, " ")}
                </span>
              ))}
            </div>
            <div className={styles.scoreStack}>
              <div>
                Ensemble {Math.round(leg.confidence * 100)}%
                <div className={styles.scoreBar}>
                  <span style={{ width: `${leg.confidence * 100}%` }} />
                </div>
              </div>
              <div>{leg.notes}</div>
            </div>
            <div className={styles.price}>
              {fmtMoney(leg.estimatedPriceUsd)}
              <small>
                ~{leg.discountPct}% under {fmtMoney(leg.fullCharterUsd)} charter
              </small>
            </div>
            <div>
              <button className={styles.btnPrimary} type="button">
                Claim seat
              </button>
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <p className={styles.meta}>No legs match these filters.</p>
        )}
      </div>
    </section>
  );
}
