/**
 * Seeds sample job postings so you can explore the UI immediately.
 *
 * By DEFAULT the profile is left BLANK — this is a real first-run: build your
 * profile (or upload your resume) to get real matches. A blank profile means
 * resume autofill fills a clean slate instead of colliding with demo data.
 *
 * Pass --demo (or SEED_DEMO=1) to also seed a fictional "Alex Demo" profile and
 * a few prepared applications, for a fully-populated showcase.
 *
 * Run with:  npm run seed          (sample jobs only, blank profile)
 *            npm run seed -- --demo (full demo profile + applications)
 * Safe to re-run; it overwrites profile/jobs/applications in ./data.
 */
import { saveProfile, saveJobs, upsertApplication, newId } from "../src/lib/store";
import { defaultProfile } from "../src/lib/defaultProfile";
import { parseJob } from "../src/lib/parse";
import { matchJob } from "../src/lib/matching";
import { prepareApplication } from "../src/lib/prepare";
import type { Job, Profile } from "../src/lib/types";

// A fictional demo candidate so the seeded dashboard looks realistic without
// containing anyone's real information. Replace via the Profile page.
function demoProfile(): Profile {
  const p = defaultProfile();
  p.fullName = "Alex Demo";
  p.email = "alex@example.com";
  p.location = "Austin, TX";
  p.university = "State University";
  p.major = "Computer Science";
  p.graduationDate = "2027-05";
  p.gpa = "3.8";
  p.linkedin = "https://linkedin.com/in/example";
  p.github = "https://github.com/example";
  p.skills = [
    "Python", "JavaScript", "TypeScript", "React", "Node.js", "SQL",
    "PyTorch", "pandas", "NumPy", "scikit-learn", "Git", "Docker", "AWS",
  ];
  p.experience = [
    {
      id: newId("exp"),
      company: "Campus Research Lab",
      title: "Undergraduate Research Assistant",
      startDate: "2025-01",
      endDate: "Present",
      bullets: [
        "Built data pipelines in Python (pandas, NumPy) to process 2M+ records",
        "Trained and evaluated classification models with scikit-learn and PyTorch",
        "Presented findings to a research group of 12",
      ],
      tags: ["python", "machine learning", "data science"],
    },
    {
      id: newId("exp"),
      company: "Local Startup",
      title: "Software Engineering Intern",
      startDate: "2024-06",
      endDate: "2024-08",
      bullets: [
        "Shipped React + Node.js features used by ~5k monthly users",
        "Wrote REST APIs and PostgreSQL queries; added CI with GitHub Actions",
      ],
      tags: ["react", "node.js", "sql", "full stack"],
    },
  ];
  p.projects = [
    {
      id: newId("proj"),
      name: "ResumeRank",
      description: "An LLM tool that scores resumes against job descriptions",
      link: "https://github.com/example/resumerank",
      bullets: [
        "Next.js + TypeScript app with an embeddings-based matcher",
        "Used LLMs and vector search over job descriptions",
      ],
      tags: ["typescript", "next.js", "llms", "ai"],
    },
  ];
  return p;
}

// Compact sample postings covering strong matches, edge cases, and clear rejects.
const SAMPLES: { company: string; title: string; text: string; url?: string }[] = [
  {
    company: "Nimbus AI",
    title: "Machine Learning Engineering Intern",
    url: "https://nimbus.ai/careers/ml-intern",
    text: `Machine Learning Engineering Intern at Nimbus AI
Location: Remote (US)
We are looking for an ML intern to help build model training pipelines.
Requirements:
- Currently pursuing a degree in Computer Science or related field
- Experience with Python and PyTorch
- Familiarity with pandas, NumPy, and scikit-learn
Nice to have:
- Experience with LLMs or transformers
- Docker, AWS
This is a summer internship. Visa sponsorship is available.`,
  },
  {
    company: "Orbital Systems",
    title: "Software Engineer Intern",
    url: "https://orbital.dev/jobs/swe-intern",
    text: `Software Engineer Intern
Orbital Systems — Austin, TX (Hybrid)
Build full-stack features across our web platform.
Requirements:
- Pursuing a BS/MS in CS
- Proficiency in JavaScript/TypeScript and React
- Experience with Node.js and SQL databases
- Familiarity with Git
Preferred qualifications:
- Docker, CI/CD
Compensation: $40/hour`,
  },
  {
    company: "DataForge",
    title: "Data Science Intern",
    url: "https://dataforge.io/careers/ds-intern",
    text: `Data Science Intern — DataForge (Remote)
Help our analytics team build models and dashboards.
Requirements:
- Python, pandas, SQL
- Coursework in statistics or machine learning
Nice to have: Tableau, Spark
Please describe why you want to work at DataForge in 300 words.
What are your salary expectations?`,
  },
  {
    company: "SecureGov Solutions",
    title: "Software Engineer",
    text: `Software Engineer at SecureGov Solutions — Reston, VA
Requirements:
- Active TS/SCI security clearance required
- U.S. citizenship required
- 5+ years of professional software development
- C++ and Java`,
  },
  {
    company: "Hyperion Labs",
    title: "Senior Backend Engineer",
    text: `Senior Backend Engineer — Hyperion Labs
We need a senior engineer to lead our platform team.
- 8+ years of backend experience
- Expert in Go and Kubernetes
- Prior staff or principal experience preferred`,
  },
  {
    company: "BrightPath",
    title: "AI Engineer Intern",
    url: "https://brightpath.com/ai-intern",
    text: `AI Engineer Intern at BrightPath — Remote
Work on LLM-powered product features.
Requirements:
- Python and JavaScript/TypeScript
- Interest in AI/ML and LLMs
- React a plus
Preferred: LangChain, vector databases
Summer 2026 internship.`,
  },
  {
    company: "QuantEdge",
    title: "Quantitative Developer Intern",
    text: `Quantitative Developer Intern — QuantEdge (New York, NY)
Requirements:
- Strong programming in C++ or Python
- 3+ years of experience with low-latency systems
- Advanced degree in a quantitative field preferred`,
  },
  {
    company: "Cloudbase",
    title: "Frontend Engineer Intern",
    url: "https://cloudbase.com/jobs/fe-intern",
    text: `Frontend Engineer Intern — Cloudbase (Remote)
Build delightful UIs with React and TypeScript.
Requirements:
- React, TypeScript, HTML, CSS
- Familiarity with REST APIs
Nice to have: Next.js, Tailwind CSS`,
  },
];

async function main() {
  const demo = process.argv.includes("--demo") || process.env.SEED_DEMO === "1";

  // The real profile we persist: blank by default so resume autofill starts
  // clean, or the fictional demo candidate when --demo is passed.
  const profile = demo ? demoProfile() : defaultProfile();
  await saveProfile(profile);

  // Match the sample jobs against whatever profile we saved, so the scores you
  // see always reflect the profile in the app (0 matches while blank — that's
  // honest; they recompute the moment you build your profile).
  const jobs: Job[] = SAMPLES.map((s) => {
    const job = parseJob({ text: s.text, url: s.url, company: s.company, title: s.title });
    job.match = matchJob(job, { profile });
    return job;
  });
  await saveJobs(jobs);

  // Only pre-prepare applications in demo mode; a real first-run has none.
  let preparedCount = 0;
  if (demo) {
    const prepared = jobs
      .filter((j) => j.match?.recommended && j.match?.eligible)
      .slice(0, 5);
    for (const job of prepared) {
      await upsertApplication(prepareApplication(job, profile));
    }
    preparedCount = prepared.length;
  }

  const matched = jobs.filter((j) => j.match?.recommended && j.match?.eligible).length;
  if (demo) {
    console.log(`Seeded demo profile for ${profile.fullName}.`);
  } else {
    console.log("Seeded a blank profile — build it or upload your resume on the Profile page.");
  }
  console.log(`Seeded ${jobs.length} sample jobs; ${matched} matched; prepared ${preparedCount} applications.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
