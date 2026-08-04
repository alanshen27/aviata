"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { AircraftClass, EmptyLegCandidate } from "@/lib/types";
import { AlertSignup } from "@/components/AlertSignup";
import { ForYou } from "@/components/ForYou";
import {
  FLEET,
  PERSONNEL_OPTIONS,
  fleetForPersonnel,
} from "./PlaneMesh";
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
  const [personnel, setPersonnel] = useState<number>(6);
  const [selectedClass, setSelectedClass] = useState<AircraftClass | null>(
    null,
  );

  const visibleFleet = useMemo(
    () => fleetForPersonnel(personnel),
    [personnel],
  );

  // Drop selection if the jet no longer fits the party size.
  useEffect(() => {
    if (
      selectedClass &&
      !visibleFleet.some((f) => f.id === selectedClass)
    ) {
      setSelectedClass(null);
    }
  }, [visibleFleet, selectedClass]);

  const filtered = useMemo(() => {
    return legs.filter((l) => {
      const seats = l.aircraftType.typicalSeats;
      if (seats < personnel) return false;
      if (selectedClass && l.aircraftType.aircraftClass !== selectedClass) {
        return false;
      }
      return true;
    });
  }, [legs, personnel, selectedClass]);

  const selectedMeta = FLEET.find((f) => f.id === selectedClass) ?? null;

  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <button
          type="button"
          className={styles.brand}
          onClick={() => setView("globe")}
        >
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
        {/* Both canvases stay mounted (unmounting a WebGL canvas can
            permanently lose the context on software renderers); the
            inactive one is hidden and its frameloop paused. */}
        <div
          className={styles.canvasWrap}
          style={{
            visibility:
              view === "globe" || view === "deals" ? "visible" : "hidden",
          }}
        >
          <EarthScene
            legs={filtered}
            selectedClass={selectedClass}
            active={view === "globe" || view === "deals"}
          />
        </div>
        <div
          className={styles.canvasWrap}
          style={{ visibility: view === "fleet" ? "visible" : "hidden" }}
        >
          <PlaneChooser
            selected={selectedClass}
            personnel={personnel}
            options={visibleFleet}
            onSelect={(id) => setSelectedClass(id)}
            active={view === "fleet"}
          />
        </div>
        {(view === "globe" || view === "deals") && (
          <p className={styles.hint}>Drag to orbit · scroll to zoom</p>
        )}
        {view === "fleet" && (
          <p className={styles.hint}>
            Filter by personnel · click a jet that fits
          </p>
        )}

        {view === "globe" && (
          <div className={styles.hud}>
            <div className={`${styles.hudInner} rise`}>
              <h1 className={styles.brandHuge}>Reposition</h1>
              <p className={styles.headline}>Empty legs on a living earth.</p>
              <p className={styles.sub}>
                Dial party size in Fleet — only jets with enough seats stay on
                the bay, then the globe and deals follow.
              </p>
              <div className={styles.ctaRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setView("fleet")}
                >
                  Choose by personnel
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

        {(view === "fleet" || view === "deals") && (
          <aside className={styles.panel}>
            <h2>{view === "fleet" ? "Fleet bay" : "Empty legs"}</h2>
            <p className={styles.panelLead}>
              {view === "fleet"
                ? "Set personnel count — 3D jets update to cabins that fit your party."
                : selectedMeta
                  ? `${selectedMeta.label} · ≥${personnel} pax · ${filtered.length} matches`
                  : `≥${personnel} pax · ${filtered.length} legs on the board`}
            </p>

            <div className={styles.personnelBlock}>
              <div className={styles.personnelLabel}>
                <span>Personnel</span>
                <strong>
                  {personnel} {personnel === 1 ? "person" : "people"}
                </strong>
              </div>
              <div className={styles.personnelRow}>
                {PERSONNEL_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={
                      personnel === n ? styles.paxChipActive : styles.paxChip
                    }
                    onClick={() => setPersonnel(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {view === "fleet" && (
              <>
                <div className={styles.fleetMeta}>
                  {visibleFleet.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={styles.fleetChip}
                      style={{
                        color:
                          selectedClass === f.id ? "#dcc28a" : undefined,
                      }}
                      onClick={() => setSelectedClass(f.id)}
                    >
                      <span>
                        <strong>{f.label}</strong>
                        <div style={{ color: "#8b929c", fontSize: "0.82rem" }}>
                          {f.blurb}
                        </div>
                      </span>
                      <span className={styles.seatPill}>{f.seats} seats</span>
                    </button>
                  ))}
                  {visibleFleet.length === 0 && (
                    <p className={styles.dealMeta}>
                      Nothing seats {personnel}+ — try a smaller party.
                    </p>
                  )}
                </div>
                <div className={styles.ctaRow} style={{ marginTop: "1.1rem" }}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => setView("deals")}
                  >
                    {selectedMeta
                      ? `See ${selectedMeta.seats}-seat deals`
                      : `See ${personnel}+ pax deals`}
                  </button>
                  {selectedClass && (
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => setSelectedClass(null)}
                    >
                      Clear jet
                    </button>
                  )}
                </div>
              </>
            )}

            {view === "deals" && (
              <div className={styles.dealList}>
                {filtered.slice(0, 8).map((leg) => (
                  <article key={leg.id} className={styles.dealItem}>
                    <div className={styles.dealRoute}>
                      {code(leg, "origin")} → {code(leg, "destination")}
                    </div>
                    <div className={styles.dealMeta}>
                      {leg.aircraftType.name} · {leg.aircraftType.typicalSeats}{" "}
                      seats · {Math.round(leg.confidence * 100)}% empty ·{" "}
                      {money(leg.estimatedPriceUsd)}
                    </div>
                  </article>
                ))}
                {filtered.length === 0 && (
                  <p className={styles.dealMeta}>
                    No legs seat {personnel}+ with this filter — lower personnel
                    or clear the jet.
                  </p>
                )}
              </div>
            )}
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
                "radial-gradient(800px 400px at 80% 0%, rgba(200,168,96,0.08), transparent), #0b0e13",
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
                "radial-gradient(800px 400px at 10% 10%, rgba(154,168,184,0.06), transparent), #0b0e13",
            }}
          >
            <AlertSignup />
          </div>
        )}
      </div>
    </div>
  );
}
