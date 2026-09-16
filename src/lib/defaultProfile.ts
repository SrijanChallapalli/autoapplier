import type {
  Authorization,
  Preferences,
  Profile,
  Project,
  ResumeVariant,
  WorkExperience,
} from "./types";

// A blank profile. Nothing personal is pre-filled — you build your profile by
// uploading your resume (Profile page) and setting your preferences. Only
// functional search defaults (seniority, remote, open-to-relocate) are set, and
// you can change those. The tailoring logic never invents content; it only ever
// works from what you actually enter or import.
export function defaultProfile(): Profile {
  return {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",

    university: "",
    major: "",
    degree: "",
    graduationDate: "",
    gpa: "",

    authorization: {
      workAuthorization: "",
      requiresSponsorshipNow: false,
      requiresSponsorshipFuture: false,
    },

    preferences: {
      roles: [],
      interests: [],
      locations: ["Remote"],
      countries: [],
      willingToRelocate: true,
      excludeKeywords: [],
      seniority: "internship",
    },

    skills: [],
    experience: [],
    projects: [],
    resumes: [],

    savedAnswers: {},

    updatedAt: new Date().toISOString(),
  };
}

// --- Defensive normalization ------------------------------------------------
// Coerce arbitrary/untrusted input (a PUT body, a stored file that predates a
// field, an LLM-produced object) into a structurally valid Profile. This is
// the single guarantee the rest of the app relies on: every array is an array
// and every nested object exists, so the matcher and tailoring never crash on
// `profile.skills.map(...)` and a malformed request can't corrupt the store.

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}
function optStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
}
function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normExperience(v: unknown, i: number): WorkExperience {
  const o = isObj(v) ? v : {};
  return {
    id: str(o.id, `exp_${i}`),
    company: str(o.company),
    title: str(o.title),
    location: optStr(o.location),
    startDate: optStr(o.startDate),
    endDate: optStr(o.endDate),
    bullets: strArray(o.bullets),
    tags: Array.isArray(o.tags) ? strArray(o.tags) : undefined,
  };
}
function normProject(v: unknown, i: number): Project {
  const o = isObj(v) ? v : {};
  return {
    id: str(o.id, `proj_${i}`),
    name: str(o.name),
    description: str(o.description),
    link: optStr(o.link),
    bullets: strArray(o.bullets),
    tags: Array.isArray(o.tags) ? strArray(o.tags) : undefined,
  };
}
function normResume(v: unknown, i: number): ResumeVariant {
  const o = isObj(v) ? v : {};
  return {
    id: str(o.id, `res_${i}`),
    label: str(o.label, "Resume"),
    fileName: optStr(o.fileName),
    focus: strArray(o.focus),
    notes: optStr(o.notes),
  };
}

const SENIORITIES = new Set(["internship", "new-grad", "junior", "any"]);

export function normalizeProfile(input: unknown): Profile {
  const base = defaultProfile();
  if (!isObj(input)) return base;

  const auth = isObj(input.authorization) ? input.authorization : {};
  const authorization: Authorization = {
    workAuthorization: str(auth.workAuthorization),
    requiresSponsorshipNow: bool(auth.requiresSponsorshipNow, false),
    requiresSponsorshipFuture: bool(auth.requiresSponsorshipFuture, false),
  };

  const pref = isObj(input.preferences) ? input.preferences : {};
  const seniority = SENIORITIES.has(str(pref.seniority))
    ? (str(pref.seniority) as Preferences["seniority"])
    : base.preferences.seniority;
  const minSalary =
    typeof pref.minSalary === "number" && Number.isFinite(pref.minSalary)
      ? pref.minSalary
      : undefined;
  const preferences: Preferences = {
    roles: strArray(pref.roles),
    interests: strArray(pref.interests),
    locations: strArray(pref.locations),
    countries: strArray(pref.countries),
    willingToRelocate: bool(pref.willingToRelocate, base.preferences.willingToRelocate),
    minSalary,
    excludeKeywords: strArray(pref.excludeKeywords),
    seniority,
  };

  const savedAnswers: Record<string, string> = {};
  if (isObj(input.savedAnswers)) {
    for (const [k, val] of Object.entries(input.savedAnswers)) {
      if (typeof val === "string") savedAnswers[k] = val;
    }
  }

  return {
    fullName: str(input.fullName),
    email: str(input.email),
    phone: str(input.phone),
    location: str(input.location),
    linkedin: str(input.linkedin),
    github: str(input.github),
    portfolio: str(input.portfolio),

    university: str(input.university),
    major: str(input.major),
    degree: str(input.degree),
    graduationDate: str(input.graduationDate),
    gpa: str(input.gpa),

    authorization,
    preferences,

    skills: strArray(input.skills),
    experience: Array.isArray(input.experience)
      ? input.experience.map(normExperience)
      : [],
    projects: Array.isArray(input.projects) ? input.projects.map(normProject) : [],
    resumes: Array.isArray(input.resumes) ? input.resumes.map(normResume) : [],

    resumeText: optStr(input.resumeText),

    savedAnswers,

    updatedAt: str(input.updatedAt, base.updatedAt),
  };
}
