import Link from "next/link";

// Public landing page. Lives at "/" and renders full-bleed (no app sidebar —
// see AppShell). The application itself starts at /dashboard.
// NOTE: once the auth branch lands, /login will front the app; the CTAs here
// point at /dashboard so the flow stays functional until then.

export default function LandingPage() {
  return (
    <div className="landing">
      {/* --- Top navigation --- */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" className="lp-brand">
            <span className="lp-brand-mark">A</span>
            AutoApplier
          </Link>
          <nav className="lp-nav-links">
            <a href="#how">How it works</a>
            <a href="#formula">The formula</a>
            <a href="#playbook">Playbook</a>
          </nav>
          <div className="lp-nav-cta">
            <Link href="/dashboard" className="lp-btn lp-btn-ghost">
              Log in
            </Link>
            <Link href="/dashboard" className="lp-btn lp-btn-primary">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* --- Hero --- */}
      <section className="lp-hero">
        <span className="lp-eyebrow">Your job-search co-pilot</span>
        <h1 className="lp-h1">
          Apply to the <span className="lp-grad">right</span> internships —
          <br />
          without the copy-paste grind.
        </h1>
        <p className="lp-lead">
          AutoApplier finds real openings, reads every job description, ranks
          them against your background with an explainable score, and prepares
          submission-ready applications. You review and hit submit — it never
          invents experience or applies behind your back.
        </p>
        <div className="lp-hero-cta">
          <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-lg">
            Get started free →
          </Link>
          <a href="#how" className="lp-btn lp-btn-ghost lp-btn-lg">
            See how it works
          </a>
        </div>
        <p className="lp-hero-note">
          No auto-submit · No invented skills · Every point of every score is
          explained
        </p>

        {/* A small mock of the dashboard headline to anchor the promise. */}
        <div className="lp-hero-card">
          <div className="lp-hero-card-bar">
            <span className="lp-dot lp-dot-red" />
            <span className="lp-dot lp-dot-amber" />
            <span className="lp-dot lp-dot-green" />
          </div>
          <div className="lp-hero-card-body">
            <div className="lp-hero-headline">
              8 jobs found today. 5 matched your profile. 2 applications are
              ready to submit, 3 require your approval, and 0 need you to answer
              a question.
            </div>
            <div className="lp-hero-stats">
              <div className="lp-hero-stat">
                <div className="lp-hero-stat-n">5</div>
                <div className="lp-hero-stat-l">Matched</div>
              </div>
              <div className="lp-hero-stat">
                <div className="lp-hero-stat-n" style={{ color: "var(--green)" }}>
                  2
                </div>
                <div className="lp-hero-stat-l">Ready</div>
              </div>
              <div className="lp-hero-stat">
                <div className="lp-hero-stat-n" style={{ color: "var(--amber)" }}>
                  3
                </div>
                <div className="lp-hero-stat-l">Need approval</div>
              </div>
              <div className="lp-hero-stat">
                <div className="lp-hero-stat-n" style={{ color: "var(--red)" }}>
                  0
                </div>
                <div className="lp-hero-stat-l">Need input</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- What it does / how it works --- */}
      <section id="how" className="lp-section">
        <div className="lp-section-head">
          <span className="lp-eyebrow">How it works</span>
          <h2 className="lp-h2">Five steps, one pipeline</h2>
          <p className="lp-sub">
            AutoApplier automates the repetitive parts of applying — never the
            judgment calls.
          </p>
        </div>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <div className="lp-step" key={s.title}>
              <div className="lp-step-num">{i + 1}</div>
              <div className="lp-step-ico">{s.icon}</div>
              <h3 className="lp-step-title">{s.title}</h3>
              <p className="lp-step-body">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- The formula --- */}
      <section id="formula" className="lp-section lp-section-alt">
        <div className="lp-section-head">
          <span className="lp-eyebrow">The formula</span>
          <h2 className="lp-h2">
            How we score a job for the highest-return application
          </h2>
          <p className="lp-sub">
            Every match gets a transparent 0–100 score. It&apos;s deterministic:
            the same inputs always produce the same number, and each point is
            tied to a reason you can read. Here&apos;s exactly how the points are
            earned.
          </p>
        </div>

        <div className="lp-formula">
          <div className="lp-formula-bars">
            {FORMULA.map((f) => (
              <div className="lp-formula-row" key={f.label}>
                <div className="lp-formula-label">
                  <span className="lp-formula-weight">{f.weight}</span>
                  {f.label}
                </div>
                <div className="lp-formula-track">
                  <div
                    className="lp-formula-fill"
                    style={{ width: `${f.pct}%`, background: f.color }}
                  />
                </div>
                <div className="lp-formula-desc">{f.desc}</div>
              </div>
            ))}
          </div>
          <p className="lp-formula-note">
            <strong>Then:</strong> a learning adjustment of up to ±10 nudges the
            score toward roles you&apos;ve approved before and away from ones
            you&apos;ve dismissed. <strong>High confidence</strong> needs a
            strong score (72+) with no open concerns; anything ineligible drops
            to <strong>Low</strong> so it never wastes your time.
          </p>
        </div>

        <div className="lp-gates">
          <h3 className="lp-gates-title">
            Hard gates — a role is filtered out before scoring if it
          </h3>
          <div className="lp-gates-grid">
            {GATES.map((g) => (
              <div className="lp-gate" key={g}>
                <span className="lp-gate-x">✕</span>
                {g}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- ATS / highest-return tips --- */}
      <section className="lp-section">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Beating the ATS</span>
          <h2 className="lp-h2">
            The highest-return application is a well-matched one
          </h2>
          <p className="lp-sub">
            An Applicant Tracking System ranks you on how well your resume
            echoes the job&apos;s required skills. AutoApplier optimizes for the
            same signal — before you ever hit submit.
          </p>
        </div>
        <div className="lp-ats">
          {ATS.map((a) => (
            <div className="lp-ats-card" key={a.title}>
              <div className="lp-ats-ico">{a.icon}</div>
              <div>
                <h3 className="lp-ats-title">{a.title}</h3>
                <p className="lp-ats-body">{a.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --- Playbook / best way to use it --- */}
      <section id="playbook" className="lp-section lp-section-alt">
        <div className="lp-section-head">
          <span className="lp-eyebrow">The playbook</span>
          <h2 className="lp-h2">The best way to use AutoApplier</h2>
          <p className="lp-sub">
            Fifteen minutes of setup, then a five-minute daily loop.
          </p>
        </div>
        <ol className="lp-playbook">
          {PLAYBOOK.map((p, i) => (
            <li className="lp-play" key={p.title}>
              <div className="lp-play-num">{i + 1}</div>
              <div>
                <h3 className="lp-play-title">{p.title}</h3>
                <p className="lp-play-body">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Control / trust --- */}
      <section className="lp-section">
        <div className="lp-trust">
          <h2 className="lp-h2">You stay in control of every submission</h2>
          <p className="lp-sub lp-trust-sub">
            AutoApplier prepares; you decide. It flags anything unusual — salary
            questions, essays, legal or eligibility questions — for you instead
            of guessing, and it never enters credentials or clicks submit on
            your behalf.
          </p>
          <div className="lp-trust-grid">
            {TRUST.map((t) => (
              <div className="lp-trust-item" key={t}>
                <span className="lp-check">✓</span>
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Final CTA --- */}
      <section className="lp-cta">
        <h2 className="lp-cta-h">Stop retyping. Start applying smarter.</h2>
        <p className="lp-cta-sub">
          Build your profile once, then let AutoApplier surface and prepare the
          openings worth your time.
        </p>
        <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-lg">
          Get started free →
        </Link>
      </section>

      {/* --- Footer --- */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <Link href="/" className="lp-brand">
            <span className="lp-brand-mark">A</span>
            AutoApplier
          </Link>
          <span className="lp-footer-note">
            A personal job-application assistant — finds, ranks, and prepares.
            You submit.
          </span>
        </div>
      </footer>
    </div>
  );
}

const STEPS = [
  {
    icon: "🔎",
    title: "Find real jobs",
    body: "Pull current openings from ~30 companies via their official public ATS APIs — Greenhouse, Ashby, Lever. No scraping, no keys. Or paste a posting yourself.",
  },
  {
    icon: "📄",
    title: "Parse every posting",
    body: "Each JD becomes structured signal: required vs. nice-to-have skills, minimum years, clearance, sponsorship, salary, and seniority.",
  },
  {
    icon: "📊",
    title: "Match & rank",
    body: "Score each role 0–100 against your profile with High / Medium / Low confidence. Ineligible roles sink with a clear, readable reason.",
  },
  {
    icon: "⚙️",
    title: "Prepare applications",
    body: "Auto-fill every standard question from your profile, auto-select the best resume variant, and build a pre-submission summary you can trust.",
  },
  {
    icon: "🚀",
    title: "You review & submit",
    body: "Approve, tweak, or answer the flagged questions — then submit yourself. AutoApplier tracks status, resume used, and follow-ups.",
  },
];

const FORMULA = [
  {
    weight: "50",
    label: "Required-skill coverage",
    pct: 100,
    color: "var(--primary)",
    desc: "The share of the job's required skills your profile can back up — the single biggest lever, and what an ATS keys on.",
  },
  {
    weight: "25",
    label: "Interest & role alignment",
    pct: 50,
    color: "#7c3aed",
    desc: "How often your stated interests and target roles appear in the description.",
  },
  {
    weight: "15",
    label: "Location fit",
    pct: 30,
    color: "#9333ea",
    desc: "Remote-preferred, a preferred metro, or open to relocating — versus a location that doesn't fit.",
  },
  {
    weight: "10",
    label: "Nice-to-have skills",
    pct: 20,
    color: "var(--green)",
    desc: "A bonus when you also cover the role's nice-to-have skills.",
  },
];

const GATES = [
  "Requires an active security clearance you don't hold",
  "Offers no sponsorship when you need it",
  "Is too senior, or demands more years than you have",
  "Matches one of your excluded keywords",
  "Sits outside your target countries",
];

const ATS = [
  {
    icon: "🎯",
    title: "Match the required skills first",
    body: "Skill coverage is 50% of the score for a reason — it's the same overlap an ATS ranks you on. AutoApplier shows exactly which required skills you match and which you're missing, so you apply where you'll actually rank.",
  },
  {
    icon: "🧩",
    title: "Let it pick the right resume",
    body: "It auto-selects the resume variant whose focus best overlaps the posting, so the version you send already speaks the role's language.",
  },
  {
    icon: "✍️",
    title: "Close the gaps honestly",
    body: "Missing skills are surfaced, never fabricated. Add the ones you genuinely have to your profile and the match — and your ranking — climbs. It only ever rephrases what's true.",
  },
];

const PLAYBOOK = [
  {
    title: "Build your profile from your resume",
    body: "Upload a PDF or text resume and AutoApplier extracts your skills as suggestions to confirm. Add your real experience, projects, and preferences — it's the ground truth every score is built on.",
  },
  {
    title: "Set your preferences & guardrails",
    body: "Seniority, target roles and interests, locations and relocation, sponsorship needs, and exclude keywords. These drive both the hard gates and the score's weighting.",
  },
  {
    title: "Fetch live jobs",
    body: "One click pulls fresh openings from the curated company list — or add your own targets on the Settings page by dropping in a company's board slug.",
  },
  {
    title: "Prepare your top matches",
    body: "Let AutoApplier prep the strongest recommended roles in a batch. Each becomes a ready-to-review packet with questions auto-filled and a resume chosen.",
  },
  {
    title: "Review the flags, then submit",
    body: "Handle anything flagged for your input, do the final submit yourself, and mark it applied. Approving and dismissing teaches it what you actually want — future scores get sharper.",
  },
];

const TRUST = [
  "Never invents skills or experience",
  "Never auto-submits an application",
  "Never enters your credentials",
  "Explains every point of every score",
  "Flags unusual questions instead of guessing",
  "Your data stays yours",
];
