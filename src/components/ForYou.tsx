"use client";

import { useEffect, useState } from "react";
import type { FlightRecommendation, ReturnPrediction } from "@/lib/types";
import styles from "@/app/page.module.css";

interface TravelerOption {
  id: string;
  displayName: string;
  homeAirport: string;
  currentAirport?: string;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function code(leg: FlightRecommendation["leg"], which: "origin" | "destination") {
  const a = leg[which];
  return a.iata ?? a.icao.replace(/^K/, "");
}

export function ForYou() {
  const [travelers, setTravelers] = useState<TravelerOption[]>([]);
  const [travelerId, setTravelerId] = useState("trav_sgp_china");
  const [prediction, setPrediction] = useState<ReturnPrediction | null>(null);
  const [recs, setRecs] = useState<FlightRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/recommend?traveler=${travelerId}&python=1`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setTravelers(data.travelers ?? []);
        setPrediction(data.prediction ?? null);
        setRecs(data.recommendations ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setPrediction(null);
          setRecs([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [travelerId]);

  return (
    <section className={styles.section} id="foryou">
      <div className={styles.sectionHead}>
        <h2>For you</h2>
        <p>
          Transformer reads your trip history — home base, corridors, typical
          stay — then matches empty legs when a return window opens (e.g.
          Singapore → China, come home around day 7).
        </p>
      </div>

      <div className={styles.filters}>
        <select
          value={travelerId}
          onChange={(e) => setTravelerId(e.target.value)}
          aria-label="Traveler profile"
        >
          {(travelers.length
            ? travelers
            : [
                {
                  id: "trav_sgp_china",
                  displayName: "Alex Tan",
                  homeAirport: "SIN",
                },
              ]
          ).map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName} · home {t.homeAirport}
              {t.currentAirport ? ` · now ${t.currentAirport}` : ""}
            </option>
          ))}
        </select>
      </div>

      {prediction && (
        <div className={styles.predictionBanner}>
          <div>
            <strong>
              Return intent {Math.round(prediction.returnProbability * 100)}%
            </strong>
            <span className={styles.meta}> · {prediction.backend}</span>
          </div>
          <p className={styles.meta}>{prediction.reason}</p>
        </div>
      )}

      {loading && <p className={styles.meta}>Scoring your pattern…</p>}

      <div className={styles.dealList}>
        {recs.slice(0, 5).map((rec) => (
          <article key={rec.id} className={styles.dealRow}>
            <div>
              <div className={styles.route}>
                {code(rec.leg, "origin")} → {code(rec.leg, "destination")}
              </div>
              <div className={styles.meta}>
                {rec.leg.aircraftType.name} · {rec.leg.registration}
              </div>
              <span className={styles.badge}>{rec.kind.replace(/_/g, " ")}</span>
            </div>
            <div className={styles.scoreStack}>
              <div>
                Match {Math.round(rec.score * 100)}%
                <div className={styles.scoreBar}>
                  <span style={{ width: `${rec.score * 100}%` }} />
                </div>
              </div>
              <div>{rec.reason}</div>
            </div>
            <div className={styles.price}>
              {fmtMoney(rec.leg.estimatedPriceUsd)}
              <small>
                Empty-leg est. · {Math.round(rec.leg.confidence * 100)}% empty
                confidence
              </small>
            </div>
            <div>
              <button className={styles.btnPrimary} type="button">
                Book return
              </button>
            </div>
          </article>
        ))}
        {!loading && recs.length === 0 && (
          <p className={styles.meta}>
            No matching empty legs in the current board for this pattern.
          </p>
        )}
      </div>
    </section>
  );
}
