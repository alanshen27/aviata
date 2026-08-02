"use client";

import { useState } from "react";
import { PLANS } from "@/lib/pricing";
import type { PlanId } from "@/lib/types";
import styles from "@/app/page.module.css";

export function AlertSignup() {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<PlanId>("radar");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setToast(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "Signup failed");
        return;
      }
      if (data.checkout) {
        setToast(
          `Reserved ${plan} for ${email}. Checkout placeholder: $${data.checkout.amountUsd}/mo.`,
        );
      } else {
        setToast(`Scout digest armed for ${email}.`);
      }
      setEmail("");
    } catch {
      setToast("Network error — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.section} id="pricing">
      <div className={styles.sectionHead}>
        <h2>Sell the signal</h2>
        <p>
          Free board for discovery. Paid Radar/Broker plans monetize faster
          OSINT detections before public empty-leg desks list them.
        </p>
      </div>

      <div className={styles.plans}>
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={`${styles.plan} ${p.id === "radar" ? styles.planFeatured : ""}`}
          >
            <h3>{p.name}</h3>
            <p className={styles.meta}>{p.blurb}</p>
            <div className={styles.planPrice}>
              {p.priceMonthlyUsd === 0 ? "Free" : `$${p.priceMonthlyUsd}`}
              {p.priceMonthlyUsd > 0 && <span>/mo</span>}
            </div>
            <ul>
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button
              type="button"
              className={p.id === "radar" ? styles.btnPrimary : styles.btnGhost}
              onClick={() => setPlan(p.id)}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>

      <form className={styles.alertForm} onSubmit={onSubmit}>
        <input
          type="email"
          required
          placeholder="you@brokerage.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
        />
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as PlanId)}
          aria-label="Plan"
        >
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className={styles.btnPrimary} type="submit" disabled={pending}>
          {pending ? "Working…" : "Subscribe"}
        </button>
      </form>
      {toast && <p className={styles.toast}>{toast}</p>}
    </section>
  );
}
