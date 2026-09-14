// ---------------------------------------------------------------------------
// Domain model for AutoApplier
// ---------------------------------------------------------------------------

export type ID = string;

// --- Profile / knowledge base ----------------------------------------------
// Everything the agent knows about the user so it never has to re-ask.

export interface WorkExperience {
  id: ID;
  company: string;
  title: string;
  location?: string;
  startDate?: string; // "2024-06" or free text
  endDate?: string; // "2024-08" or "Present"
  bullets: string[]; // accomplishments — the raw material for tailoring
  tags?: string[]; // e.g. ["backend", "python", "ml"]
}

export interface Project {
  id: ID;
  name: string;
  description: string;
  link?: string;
  bullets: string[];
  tags?: string[];
}

export interface ResumeVariant {
  id: ID;
  label: string; // e.g. "Backend / Systems", "AI-ML", "General SWE"
  fileName?: string; // path or filename the user keeps this resume under
  focus: string[]; // keywords this resume emphasizes — used for auto-selection
  notes?: string;
}

export interface Preferences {
  roles: string[]; // e.g. ["Software Engineer Intern", "ML Intern"]
  interests: string[]; // e.g. ["AI/ML", "distributed systems", "data"]
  locations: string[]; // preferred locations, "Remote" allowed
  willingToRelocate: boolean;
  minSalary?: number; // annual, USD; optional
  excludeKeywords: string[]; // hard filters, e.g. ["clearance", "senior", "10+ years"]
  seniority: "internship" | "new-grad" | "junior" | "any";
}

export interface Authorization {
  workAuthorization: string; // e.g. "U.S. Citizen", "F-1 / OPT", "Authorized to work in the US"
  requiresSponsorshipNow: boolean;
  requiresSponsorshipFuture: boolean;
}

export interface Profile {
  // identity / contact
  fullName: string;
  email: string;
  phone?: string;
  location?: string; // current location
  linkedin?: string;
  github?: string;
  portfolio?: string;

  // education
  university: string;
  major: string;
  degree?: string; // e.g. "B.S."
  graduationDate?: string; // "2027-05"
  gpa?: string;

  authorization: Authorization;
  preferences: Preferences;

  skills: string[];
  experience: WorkExperience[];
  projects: Project[];
  resumes: ResumeVariant[];

  // Free-form answers the agent has learned to reuse for standard questions.
  // Keyed by a normalized question, e.g. "why do you want to work here" is NOT
  // stored here (too company-specific); things like "years of experience with
  // python" are.
  savedAnswers: Record<string, string>;

  updatedAt: string;
}

// --- Jobs -------------------------------------------------------------------

export type JobSource = "paste" | "url" | "scraper" | "import";

export interface Job {
  id: ID;
  company: string;
  title: string;
  location?: string;
  remote?: boolean;
  url?: string;
  description: string; // raw job description text
  // Parsed signal extracted from the description:
  requiredSkills: string[];
  niceToHaveSkills: string[];
  minYearsExperience?: number;
  requiresClearance?: boolean;
  requiresCitizenship?: boolean;
  sponsorshipOffered?: boolean | null; // null = unknown
  salaryText?: string;
  seniority?: "internship" | "new-grad" | "junior" | "mid" | "senior" | "unknown";

  source: JobSource;
  createdAt: string;

  // Set once the matcher has run:
  match?: MatchResult;
  // Set to true once the user has explicitly dismissed / rejected this job.
  dismissed?: boolean;
  dismissReason?: string;
}

// --- Matching ---------------------------------------------------------------

export type Confidence = "high" | "medium" | "low";

export interface MatchResult {
  score: number; // 0-100 overall fit
  confidence: Confidence;
  recommended: boolean; // should we prepare an application?
  eligible: boolean; // does the user meet hard requirements?
  reasons: string[]; // why it's a good match ("strengths")
  concerns: string[]; // gaps / things to review
  blockers: string[]; // hard disqualifiers (empty => eligible)
  matchedSkills: string[];
  missingSkills: string[];
  suggestedResumeId?: ID;
  computedAt: string;
}

// --- Applications -----------------------------------------------------------

export type ApplicationStatus =
  | "draft" // being prepared
  | "ready" // high confidence, ready to submit
  | "needs_review" // medium confidence
  | "needs_input" // low confidence, waiting on the user
  | "submitted"
  | "screening"
  | "interviewing"
  | "offer"
  | "rejected"
  | "withdrawn";

export interface AnswerField {
  question: string;
  answer: string;
  source: "profile" | "saved" | "inferred" | "user"; // provenance
  unusual: boolean; // flagged for human review (essay/legal/salary/unclear)
}

export interface InterviewStage {
  name: string; // "Recruiter screen", "Technical", "Onsite", ...
  date?: string;
  notes?: string;
  outcome?: "pending" | "passed" | "failed";
}

export interface Recruiter {
  name?: string;
  email?: string;
  linkedin?: string;
}

export interface Application {
  id: ID;
  jobId: ID;
  // Denormalized snapshot so the tracker reads cleanly even if the job changes:
  company: string;
  title: string;
  location?: string;
  jobUrl?: string;

  status: ApplicationStatus;
  confidence: Confidence;

  resumeId?: ID;
  resumeLabel?: string;

  answers: AnswerField[];
  openQuestions: string[]; // things the agent needs the user to answer

  // Why the agent thinks this is a good match (for the review summary):
  matchSummary: string;
  keyRequirements: string[];

  recruiter?: Recruiter;
  interviewStages: InterviewStage[];

  createdAt: string;
  updatedAt: string;
  dateApplied?: string;
  followUpDate?: string;
  notes?: string;
}

// --- Settings ---------------------------------------------------------------

export type Ats = "greenhouse" | "ashby" | "lever";

export interface CompanyBoard {
  name: string;
  ats: Ats;
  token: string;
}

export interface Settings {
  // Company boards to pull live jobs from. Empty => use the built-in defaults.
  companies: CompanyBoard[];
  // Only pull internship / early-career roles.
  internOnly: boolean;
  // Optional keyword filter applied to titles/descriptions on fetch.
  fetchKeywords: string[];
  updatedAt: string;
}

// --- Learning ---------------------------------------------------------------
// Lightweight signal captured from user actions to nudge future matching.

export interface PreferenceSignal {
  id: ID;
  kind: "approved" | "rejected" | "interview" | "response";
  jobTitle: string;
  company: string;
  tags: string[]; // job tags that got the signal
  weight: number; // + for positive, - for negative
  createdAt: string;
}
