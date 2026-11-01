"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveLeg } from "@/lib/listings";
import type { AirportInfo } from "@/lib/airportTable";
import type { Focus } from "./EarthScene";
import { FLEET, classForCategory } from "./PlaneMesh";
import styles from "./spa.module.css";

const EarthScene = dynamic(() => import("./EarthScene").then((m) => m.EarthScene), {
  ssr: false,
  loading: () => <div className={styles.canvasWrap} />,
});
const PlaneChooser = dynamic(() => import("./PlaneChooser").then((m) => m.PlaneChooser), {
  ssr: false,
  loading: () => <div className={styles.canvasWrap} />,
});

type View = "earth" | "fleet" | "alerts";

interface Place {
  id: string;
  label: string;
  lat: number;
  lon: number;
  type: string;
}

interface Me {
  visitorId: string;
  geo: { lat: number; lon: number; city: string | null; country: string | null } | null;
  home: AirportInfo | null;
  nearIds: string[];
}

const RADIUS_KM = 900;

function km(lat1: number, lon1: number, lat2: number, lon2: number) {
  const d = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * d) / 2) ** 2 +
    Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(((lon2 - lon1) * d) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string) {
  if (!iso) return "Flexible";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

function fmtWindow(leg: LiveLeg) {
  return leg.departTo && leg.departTo !== leg.departFrom
    ? `${fmtDate(leg.departFrom)} – ${fmtDate(leg.departTo)}`
    : fmtDate(leg.departFrom);
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function track(body: Record<string, unknown>) {
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

export function SpaApp({ legs }: { legs: LiveLeg[] }) {
  const [view, setView] = useState<View>("earth");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [minSeats, setMinSeats] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [airports, setAirports] = useState<AirportInfo[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((m: Me) => {
        setMe(m);
        if (m.geo) {
          setFocus({
            lat: m.geo.lat,
            lon: m.geo.lon,
            label: m.geo.city ?? "You",
            kind: "you",
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setAirports([]);
      setPlaces([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/airports?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) => setAirports(d.airports ?? []))
        .catch(() => {});
      if (term.length >= 3) {
        fetch(`/api/places?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
          .then((r) => r.json())
          .then((d) => {
            const seen = new Set<string>();
            setPlaces(((d.places ?? []) as Place[]).filter((p) => !seen.has(p.label) && seen.add(p.label)).slice(0, 4));
          })
          .catch(() => {});
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const choosePoint = useCallback((f: Focus, query?: string) => {
    setFocus(f);
    setSelectedId(null);
    setOpen(false);
    setQ("");
    if (f.kind === "search") track({ type: "search", q: query ?? f.label, lat: f.lat, lon: f.lon, label: f.label });
  }, []);

  const onPick = useCallback((lat: number, lon: number) => {
    setSelectedId(null);
    setFocus({ lat, lon, label: `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`, kind: "pin" });
    fetch(`/api/places?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((d) => {
        const label = d.place?.label ?? null;
        if (label) setFocus((f) => (f && f.kind === "pin" && f.lat === lat ? { ...f, label } : f));
        track({ type: "pin", lat, lon, label });
      })
      .catch(() => track({ type: "pin", lat, lon, label: null }));
  }, []);

  const filtered = useMemo(() => {
    let out = legs;
    if (classId) {
      const fc = FLEET.find((f) => f.id === classId);
      if (fc) out = out.filter((l) => l.category.toLowerCase() === fc.category.toLowerCase());
    }
    if (minSeats) out = out.filter((l) => (l.seats ?? 99) >= minSeats);
    return out;
  }, [legs, classId, minSeats]);

  const list = useMemo(() => {
    if (focus) {
      return filtered
        .map((leg) => {
          const dO = km(focus.lat, focus.lon, leg.origin.lat, leg.origin.lon);
          const dD = km(focus.lat, focus.lon, leg.destination.lat, leg.destination.lon);
          return { leg, d: Math.min(dO, dD), dir: dO <= dD ? "from" : "to" };
        })
        .filter((x) => x.d <= RADIUS_KM)
        .sort((a, b) => a.d - b.d || a.leg.departFrom.localeCompare(b.leg.departFrom));
    }
    const near = new Set(me?.nearIds ?? []);
    return filtered
      .map((leg) => ({ leg, d: NaN, dir: "" }))
      .sort((a, b) => Number(near.has(b.leg.id)) - Number(near.has(a.leg.id)));
  }, [filtered, focus, me]);

  const selected = legs.find((l) => l.id === selectedId) ?? null;
  const shown = selected ? legs : list.map((x) => x.leg);

  const select = (leg: LiveLeg) => {
    setSelectedId(leg.id);
    track({ type: "view", legId: leg.id, origin: leg.origin.code, destination: leg.destination.code });
  };

  const heading = focus
    ? focus.kind === "you"
      ? `Near ${focus.label}`
      : focus.label
    : "Everywhere";

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <button type="button" className={styles.brand} onClick={() => { setView("earth"); setSelectedId(null); }}>
          <span className={styles.brandDot} />
          Reposition
        </button>

        <div className={styles.search}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            placeholder="City, airport or place"
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              if (view !== "earth") setView("earth");
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") {
                const a = airports[0];
                const p = places[0];
                if (a) choosePoint({ lat: a.lat, lon: a.lon, label: `${a.city || a.name} (${a.code})`, kind: "search" }, q);
                else if (p) choosePoint({ lat: p.lat, lon: p.lon, label: p.label, kind: "search" }, q);
              }
            }}
          />
          {q && (
            <button type="button" className={styles.clear} onClick={() => setQ("")} aria-label="Clear">
              ×
            </button>
          )}
          {open && (airports.length > 0 || places.length > 0) && (
            <ul className={styles.suggest}>
              {airports.map((a) => (
                <li key={a.code}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choosePoint({ lat: a.lat, lon: a.lon, label: `${a.city || a.name} (${a.code})`, kind: "search" }, q)}
                  >
                    <span className={styles.code}>{a.code}</span>
                    <span>{a.name}</span>
                    <span className={styles.dim}>{a.city}, {a.country}</span>
                  </button>
                </li>
              ))}
              {places.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choosePoint({ lat: p.lat, lon: p.lon, label: p.label, kind: "search" }, q)}
                  >
                    <span className={styles.codePlace}>◎</span>
                    <span>{p.label}</span>
                    <span className={styles.dim}>{p.type.replace(/_/g, " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className={styles.links}>
          <button type="button" className={view === "fleet" ? styles.linkActive : styles.link} onClick={() => setView("fleet")}>
            Fleet
          </button>
          <button type="button" className={view === "alerts" ? styles.linkActive : styles.link} onClick={() => setView("alerts")}>
            Alerts
          </button>
        </nav>
      </header>

      <div className={styles.stage}>
        {view === "fleet" ? <PlaneChooser selectedId={classId} /> : (
          <EarthScene legs={view === "earth" ? shown : []} selected={view === "earth" ? selected : null} focus={view === "earth" ? focus : null} onPick={onPick} />
        )}
      </div>

      <aside className={selected && view === "earth" ? `${styles.panel} ${styles.panelAuto}` : styles.panel}>
        {view === "earth" && !selected && (
          <>
            <div className={styles.panelHead}>
              <div>
                <h1>{heading}</h1>
                <p>
                  {list.length} empty {list.length === 1 ? "leg" : "legs"}
                  {focus ? ` within ${RADIUS_KM} km` : " listed now"}
                </p>
              </div>
              {focus && (
                <button type="button" className={styles.ghost} onClick={() => setFocus(null)}>
                  Show all
                </button>
              )}
            </div>

            <div className={styles.filters}>
              <select value={minSeats} onChange={(e) => setMinSeats(Number(e.target.value))} aria-label="Passengers">
                <option value={0}>Any pax</option>
                {[2, 4, 6, 8, 10, 12, 14].map((n) => (
                  <option key={n} value={n}>{n}+ pax</option>
                ))}
              </select>
              <select value={classId ?? ""} onChange={(e) => setClassId(e.target.value || null)} aria-label="Aircraft class">
                <option value="">Any aircraft</option>
                {FLEET.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>

            <ul className={styles.list}>
              {list.slice(0, 60).map(({ leg, d, dir }) => (
                <li key={leg.id}>
                  <button type="button" className={styles.row} onClick={() => select(leg)}>
                    <div className={styles.rowTop}>
                      <span className={styles.route}>
                        {leg.origin.code} <span className={styles.arrow}>→</span> {leg.destination.code}
                      </span>
                      <span className={styles.price}>{leg.priceText}</span>
                    </div>
                    <div className={styles.rowMeta}>
                      <span>{fmtDate(leg.departFrom)}</span>
                      <span>{fmtDuration(leg.flightMinutes)}</span>
                      <span>{leg.aircraft}</span>
                      {Number.isFinite(d) && d >= 10 && (
                        <span className={styles.dim}>{Math.round(d)} km {dir} here</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
              {list.length === 0 && (
                <li className={styles.empty}>
                  No legs {focus ? `within ${RADIUS_KM} km` : "match"}. Click another spot on the globe or search a city.
                </li>
              )}
            </ul>
            <p className={styles.foot}>Live listings from thelimitlesssky.com · click the globe to pinpoint</p>
          </>
        )}

        {view === "earth" && selected && (
          <div className={styles.detail}>
            <button type="button" className={styles.back} onClick={() => setSelectedId(null)}>
              ← Back
            </button>
            <div className={styles.detailRoute}>
              <div>
                <strong>{selected.origin.code}</strong>
                <span>{selected.origin.city || selected.origin.name}</span>
              </div>
              <div className={styles.detailLine}>
                <span>{fmtDuration(selected.flightMinutes)}</span>
                <i />
                <span>{selected.distanceKm.toLocaleString()} km</span>
              </div>
              <div className={styles.right}>
                <strong>{selected.destination.code}</strong>
                <span>{selected.destination.city || selected.destination.name}</span>
              </div>
            </div>

            <dl className={styles.facts}>
              <div><dt>Departure</dt><dd>{fmtWindow(selected)}</dd></div>
              <div><dt>Aircraft</dt><dd>{selected.aircraft}</dd></div>
              <div><dt>Class</dt><dd>{classForCategory(selected.category)?.label ?? selected.category}</dd></div>
              {selected.seats && <div><dt>Seats</dt><dd>{selected.seats}</dd></div>}
              {selected.operator && <div><dt>Operator</dt><dd>{selected.operator}</dd></div>}
              <div><dt>From</dt><dd>{selected.origin.name}, {selected.origin.country}</dd></div>
              <div><dt>To</dt><dd>{selected.destination.name}, {selected.destination.country}</dd></div>
            </dl>

            <div className={styles.priceBlock}>
              <div>
                <strong>{selected.priceText}</strong>
                {selected.perSeat && selected.currency && (
                  <span>≈ {new Intl.NumberFormat("en", { style: "currency", currency: selected.currency, maximumFractionDigits: 0 }).format(selected.perSeat)} per seat</span>
                )}
                {!selected.priceValue && <span>Quote on request</span>}
              </div>
              <a
                className={styles.book}
                href={selected.bookUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track({ type: "book", legId: selected.id, url: selected.bookUrl })}
              >
                {selected.priceValue ? "Book" : "Request quote"}
              </a>
            </div>
            <p className={styles.foot}>Flight time is an estimate for this aircraft class. Price is the operator&apos;s listing; confirm before booking.</p>
          </div>
        )}

        {view === "fleet" && (
          <>
            <div className={styles.panelHead}>
              <div>
                <h1>Fleet</h1>
                <p>Pick a class to filter the globe</p>
              </div>
            </div>
            <ul className={styles.list}>
              {FLEET.map((f) => {
                const n = legs.filter((l) => l.category.toLowerCase() === f.category.toLowerCase()).length;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      className={classId === f.id ? styles.rowActive : styles.row}
                      onClick={() => setClassId(classId === f.id ? null : f.id)}
                    >
                      <div className={styles.rowTop}>
                        <span className={styles.route}>{f.label}</span>
                        <span className={styles.count}>{n} live</span>
                      </div>
                      <div className={styles.rowMeta}>
                        <span>{f.seats} seats</span>
                        <span>{f.rangeNm} nm</span>
                        <span>{f.cruiseKt} kt</span>
                      </div>
                      <div className={styles.examples}>{f.examples}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className={styles.book} onClick={() => setView("earth")}>
              {classId ? `Show ${FLEET.find((f) => f.id === classId)?.label} legs` : "Back to Earth"}
            </button>
          </>
        )}

        {view === "alerts" && <Alerts home={me?.home ?? null} />}
      </aside>
    </div>
  );
}

function Alerts({ home }: { home: AirportInfo | null }) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"scout" | "radar" | "broker">("radar");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan, origins: home ? [home.code] : [] }),
      });
      const d = await res.json();
      setMsg(res.ok ? `Alerts armed for ${email}${home ? ` around ${home.code}` : ""}.` : d.error ?? "Failed");
      if (res.ok) setEmail("");
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.panelHead}>
        <div>
          <h1>Alerts</h1>
          <p>{home ? `New legs near ${home.city || home.name} (${home.code})` : "New legs near you"}</p>
        </div>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} aria-label="Plan">
          <option value="scout">Scout · free daily digest</option>
          <option value="radar">Radar · $49/mo real-time</option>
          <option value="broker">Broker · $299/mo API</option>
        </select>
        <button type="submit" className={styles.book} disabled={busy}>
          {busy ? "…" : "Get alerts"}
        </button>
        {msg && <p className={styles.foot}>{msg}</p>}
      </form>
    </>
  );
}
