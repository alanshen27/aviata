import { DealBoard } from "@/components/DealBoard";
import { ForYou } from "@/components/ForYou";
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
          <a href="#foryou">For you</a>
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
            OSINT finds empty legs. A Transformer learns your trip rhythm —
            home in Singapore, week in China, then recommends the homebound
            seat.
          </p>
          <div className={`${styles.ctaRow} rise rise-delay-3`}>
            <a className={styles.btnPrimary} href="#foryou">
              See my return window
            </a>
            <a className={styles.btnGhost} href="#deals">
              Browse all legs
            </a>
          </div>
        </div>
      </section>

      <ForYou />

      <DealBoard legs={legs} />

      <section className={styles.section} id="models">
        <div className={styles.sectionHead}>
          <h2>How the models work</h2>
          <p>
            Empty-leg detection and personal return timing are separate heads on
            the same aviation OSINT stack.
          </p>
        </div>
        <div className={styles.modelGrid}>
          <div className={styles.modelBlock}>
            <h3>XGBoost + LSTM</h3>
            <p>
              Detect which jets are flying empty from ADS-B features and short
              tail histories.
            </p>
            <ul>
              <li>XGBoost: tabular P(empty_leg)</li>
              <li>LSTM: sequence P(empty_leg)</li>
              <li>Ensemble with rule priors</li>
            </ul>
          </div>
          <div className={styles.modelBlock}>
            <h3>Transformer (For you)</h3>
            <p>
              Encodes your past trips — home, corridor, stay length — and scores
              P(ready_to_return). Matched against live empty legs toward home.
            </p>
            <ul>
              <li>Example: SIN→PVG, median stay 7d</li>
              <li>Around day 7, surface PVG→SIN empty legs</li>
              <li>Train: <code>python ml/train_all.py</code></li>
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
