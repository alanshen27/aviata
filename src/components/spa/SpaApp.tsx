"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { AircraftClass, EmptyLegCandidate } from "@/lib/types";
import { AlertSignup } from "@/components/AlertSignup";
import { ForYou } from "@/components/ForYou";
import { FLEET } from "./PlaneChooser";
import styles from "./spa.module.css";

const EarthScene = dynamic(
  () => import("./EarthScene").then((m) => m.EarthScene),
  { ssr: false, loading: () => <div className={styles.canvasWrap} /> },
);

const PlaneChooser = dynamic(
  () => import("./PlaneChooser").then((m) => m.PlaneChooser),
  { ssr: false, loading: () => <div className={styles.canvasWrap} /> },
);

type View = "globe" | "fleet" | "deals" | "foryou" | "pricing";

function code(leg: EmptyLegCandidate, which: "origin" | "destination") {
  const a = leg[which];
  return a.iata ?? a.icao.replace(/^K/, "");
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function SpaApp({ legs }: { legs: EmptyLegCandidate[] }) {
  const [view, setView] = useState<View>("globe");
  const [selectedClass, setSelectedClass] = useState<AircraftClass | null>(
    null,
  );

  const filtered = useMemo(() => {
    if (!selectedClass) return legs;
    return legs.filter((l) => l.aircraftType.aircraftClass === selectedClass);
  }, [legs, selectedClass]);

  const selectedMeta = FLEET.find((f) => f.id === selectedClass) ?? null;

  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <button type="button" className={styles.brand} onClick={() => setView("globe")}>
          REPOSITION
        </button>
        <nav className={styles.tabs}>
          {(
            [
              ["globe", "Earth"],
              ["fleet", "Fleet"],
              ["deals", "Deals"],
              ["foryou", "For you"],
              ["pricing", "Sell"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={view === id ? styles.tabActive : styles.tab}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className={styles.stage}>
        {(view === "globe" || view === "deals") && (
          <>
            <div className={styles.canvasWrap}>
              <EarthScene legs={filtered} selectedClass={selectedClass} />
            </div>
            <p className={styles.hint}>Drag to orbit · scroll to zoom</p>
          </>
        )}

        {view === "fleet" && (
          <>
            <div className={styles.canvasWrap}>
              <PlaneChooser
                selected={selectedClass}
                onSelect={(id) => {
                  setSelectedClass(id);
                }}
              />
            </div>
            <p className={styles.hint}>Click a jet · drag to inspect</p>
          </>
        )}

        {view === "globe" && (
          <div className={styles.hud}>
            <div className={`${styles.hudInner} rise`}>
              <h1 className={styles.brandHuge}>Reposition</h1>
              <p className={styles.headline}>Empty legs on a living earth.</p>
              <p className={styles.sub}>
                OSINT arcs light up when jets ferry empty. Pick a cabin class in
                Fleet, then claim the seat before the desk does.
              </p>
              <div className={styles.ctaRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setView("fleet")}
                >
                  Choose a jet
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setView("deals")}
                >
                  Open deals
                </button>
              </div>
            </div>
          </div>
        )}

        {view === "fleet" && (
          <aside className={styles.panel}>
            <h2>Fleet bay</h2>
            <p className={styles.panelLead}>
              Interactive cabin classes. Selection filters the globe arcs and
              deal board.
            </p>
            <div className={styles.fleetMeta}>
              {FLEET.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={styles.fleetChip}
                  style={{
                    borderColor:
                      selectedClass === f.id ? "rgba(215,161,46,0.5)" : undefined,
                    color: selectedClass === f.id ? "#f0c14b" : undefined,
                  }}
                  onClick={() => setSelectedClass(f.id)}
                >
                  <strong>{f.label}</strong>
                  <span>{f.blurb}</span>
                </button>
              ))}
            </div>
            <div className={styles.ctaRow} style={{ marginTop: "1.1rem" }}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setView("deals")}
                disabled={!selectedClass}
              >
                {selectedMeta
                  ? `See ${selectedMeta.label} deals`
                  : "Select a class"}
              </button>
              {selectedClass && (
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setSelectedClass(null)}
                >
                  Clear
                </button>
              )}
            </div>
          </aside>
        )}

        {view === "deals" && (
          <aside className={styles.panel}>
            <h2>Empty legs</h2>
            <p className={styles.panelLead}>
              {selectedMeta
                ? `Filtered to ${selectedMeta.label.toLowerCase()} · ${filtered.length} matches`
                : `${filtered.length} OSINT-ranked legs on the board`}
            </p>
            <div className={styles.dealList}>
              {filtered.slice(0, 8).map((leg) => (
                <article key={leg.id} className={styles.dealItem}>
                  <div className={styles.dealRoute}>
                    {code(leg, "origin")} → {code(leg, "destination")}
                  </div>
                  <div className={styles.dealMeta}>
                    {leg.aircraftType.name} · {Math.round(leg.confidence * 100)}%
                    empty · {money(leg.estimatedPriceUsd)}
                  </div>
                </article>
              ))}
              {filtered.length === 0 && (
                <p className={styles.dealMeta}>
                  No legs in this class — clear the filter or pick another jet.
                </p>
              )}
            </div>
          </aside>
        )}

        {view === "foryou" && (
          <div
            style={{
              position: "relative",
              zIndex: 3,
              overflow: "auto",
              height: "100vh",
              paddingTop: "4rem",
              background:
                "radial-gradient(800px 400px at 80% 0%, rgba(215,161,46,0.12), transparent), #071018",
            }}
          >
            <ForYou />
          </div>
        )}

        {view === "pricing" && (
          <div
            style={{
              position: "relative",
              zIndex: 3,
              overflow: "auto",
              height: "100vh",
              paddingTop: "4rem",
              background:
                "radial-gradient(800px 400px at 10% 10%, rgba(62,207,172,0.1), transparent), #071018",
            }}
          >
            <AlertSignup />
          </div>
        )}
      </div>
    </div>
  );
}
