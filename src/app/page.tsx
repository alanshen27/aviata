import { DealBoard } from "@/components/DealBoard";
import { AlertSignup } from "@/components/AlertSignup";
import { getLegs } from "@/lib/store";
import styles from "./page.module.css";

export default async function Home() {
  const legs = await getLegs();

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.navBrand}>REPOSITION</div>
        <nav className={styles.navLinks}>
          <a href="#deals">Deals</a>
          <a href="#models">Models</a>
          <a href="#pricing">Pricing</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroAtmosphere} aria-hidden />
        <div className={styles.runwayLights} aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className={styles.heroInner}>
          <h1 className={`${styles.brandMark} rise`}>Reposition</h1>
          <p className={`${styles.headline} rise rise-delay-1`}>
            Empty legs, detected from the open sky.
          </p>
          <p className={`${styles.subhead} rise rise-delay-2`}>
            OSINT from ADS-B tracks private jets. XGBoost and LSTM classifiers
            score which legs are empty — then you sell the seats before the
            brokers do.
          </p>
          <div className={`${styles.ctaRow} rise rise-delay-3`}>
            <a className={styles.btnPrimary} href="#deals">
              See detected legs
            </a>
            <a className={styles.btnGhost} href="#pricing">
              Sell alerts
            </a>
          </div>
        </div>
      </section>

      <DealBoard legs={legs} />

      <section className={styles.section} id="models">
        <div className={styles.sectionHead}>
          <h2>How the classifiers work</h2>
          <p>
            Two models read the same OSINT feature bus. Train them in{" "}
            <code>ml/</code> on synthetic labels, then swap in operator-confirmed
            empty legs as ground truth.
          </p>
        </div>
        <div className={styles.modelGrid}>
          <div className={styles.modelBlock}>
            <h3>XGBoost</h3>
            <p>
              Tabular booster over distance, ground time, FBO scores, asymmetry,
              turnaround flags, and one-way history. Best at crisp, explainable
              empty-leg cues from a single candidate leg.
            </p>
            <ul>
              <li>Input: 18 engineered OSINT features</li>
              <li>Output: P(empty_leg)</li>
              <li>Train: <code>python ml/train_all.py</code></li>
            </ul>
          </div>
          <div className={styles.modelBlock}>
            <h3>LSTM</h3>
            <p>
              Sequence model over the last few legs for a tail number. Catches
              ferry patterns that only show up across time — Nice→Paris→Geneva,
              not a simple A↔B return.
            </p>
            <ul>
              <li>Input: 4 × 18 feature steps</li>
              <li>Output: sequence P(empty_leg)</li>
              <li>Ensemble: 45% XGB + 35% LSTM + 20% heuristics</li>
            </ul>
          </div>
        </div>
      </section>

      <AlertSignup />

      <footer className={styles.footer}>
        Demo uses synthetic ADS-B-derived legs. OpenSky live collect is research
        licensed only — get a commercial feed (or operator FMS hooks) before you
        charge customers. Not affiliated with any operator.
      </footer>
    </main>
  );
}
