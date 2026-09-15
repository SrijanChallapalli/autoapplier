"use client";

import { useEffect, useState } from "react";
import type {
  Profile,
  Project,
  ResumeVariant,
  WorkExperience,
} from "@/lib/types";
import type { ExtractedProfile } from "@/lib/ai";

function commaList(arr: string[]): string {
  return arr.join(", ");
}
function parseList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [resume, setResume] = useState<{
    fileName: string;
    skills: string[];
    links: string[];
    chars: number;
    phone?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
    extracted?: ExtractedProfile | null;
    aiUsed?: boolean;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setP);
  }, []);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function persist(profile: Profile): Promise<Profile> {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    return res.json();
  }

  async function save() {
    if (!p) return;
    setBusy(true);
    const saved = await persist(p);
    setP(saved);
    setBusy(false);
    flash("Profile saved — all job matches recomputed");
  }

  async function uploadResume(file: File) {
    setUploading(true);
    setResume(null);
    setReviewing(false);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/profile/resume", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (data.skills || data.extracted) {
      setResume(data);
      setReviewing(true); // open the review-and-confirm panel
    } else {
      flash(data.error ?? "Couldn't read that file");
    }
  }

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  }

  // Build the merged profile the review panel will apply on confirm.
  function buildMerged(): Profile | null {
    if (!p || !resume) return null;
    const ex = resume.extracted ?? {};
    const next: Profile = { ...p };

    // Contact / education — fill only empty fields so we never clobber edits.
    const rec = next as unknown as Record<string, unknown>;
    const fillEmpty = (key: keyof Profile, val?: string) => {
      if (val && !String(rec[key as string] ?? "").trim()) {
        rec[key as string] = val;
      }
    };
    fillEmpty("fullName", ex.fullName);
    fillEmpty("email", ex.email || resume.links.find((l) => l.includes("@")));
    fillEmpty("phone", ex.phone || resume.phone);
    fillEmpty("location", ex.location);
    fillEmpty("linkedin", ex.linkedin || resume.linkedin);
    fillEmpty("github", ex.github || resume.github);
    fillEmpty("portfolio", ex.portfolio || resume.portfolio);
    fillEmpty("university", ex.university);
    fillEmpty("major", ex.major);
    fillEmpty("degree", ex.degree);
    fillEmpty("graduationDate", ex.graduationDate);
    fillEmpty("gpa", ex.gpa);

    // Skills — merge (deduped).
    const have = new Set(p.skills.map((s) => s.toLowerCase()));
    const newSkills = [...(ex.skills ?? []), ...resume.skills].filter(
      (s) => s && !have.has(s.toLowerCase()) && (have.add(s.toLowerCase()), true),
    );
    next.skills = [...p.skills, ...newSkills];

    // Experience — append entries not already present (by title+company).
    const haveExp = new Set(
      p.experience.map((e) => `${e.title}::${e.company}`.toLowerCase()),
    );
    const addedExp: WorkExperience[] = (ex.experience ?? [])
      .filter((e) => e.title || e.company)
      .filter((e) => !haveExp.has(`${e.title ?? ""}::${e.company ?? ""}`.toLowerCase()))
      .map((e, i) => ({
        id: `exp_${Date.now()}_${i}`,
        title: e.title ?? "",
        company: e.company ?? "",
        startDate: e.startDate,
        endDate: e.endDate,
        bullets: e.bullets ?? [],
      }));
    next.experience = [...p.experience, ...addedExp];

    // Projects — append entries not already present (by name).
    const haveProj = new Set(p.projects.map((pr) => pr.name.toLowerCase()));
    const addedProj: Project[] = (ex.projects ?? [])
      .filter((pr) => pr.name)
      .filter((pr) => !haveProj.has((pr.name ?? "").toLowerCase()))
      .map((pr, i) => ({
        id: `proj_${Date.now()}_${i}`,
        name: pr.name ?? "",
        description: pr.description ?? "",
        link: pr.link,
        bullets: pr.bullets ?? [],
      }));
    next.projects = [...p.projects, ...addedProj];

    return next;
  }

  async function confirmAutofill() {
    const merged = buildMerged();
    if (!merged) return;
    setBusy(true);
    const saved = await persist(merged);
    setP(saved);
    setBusy(false);
    setReviewing(false);
    setResume(null);
    flash("Profile filled from your resume and saved");
  }

  if (!p) return <p className="muted">Loading…</p>;

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 className="page-title">Your profile</h1>
          <p className="page-sub">
            The assistant reuses everything here so you never re-answer the same
            question. It only ever rephrases what you enter — never invents.
          </p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>

      {/* Resume import */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Import from resume
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Upload a PDF or text resume and we&apos;ll read the whole thing —
          contact, education, experience, projects, and skills — then let you
          review before saving. Nothing is invented; everything comes from your
          file.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label
            className="btn"
            style={{ cursor: "pointer", display: "inline-block" }}
          >
            {uploading ? "Reading…" : "Choose resume (PDF / .txt)"}
            <input
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadResume(f);
                e.target.value = "";
              }}
            />
          </label>
          {resume && !reviewing && (
            <span className="muted">{resume.fileName} imported</span>
          )}
        </div>

        {reviewing && resume?.extracted && (
          <ResumeReview
            data={resume}
            current={p}
            onConfirm={confirmAutofill}
            onCancel={() => {
              setReviewing(false);
              setResume(null);
            }}
            busy={busy}
          />
        )}
      </div>

      {/* Identity */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Contact
        </div>
        <div className="grid-2">
          <Field label="Full name" v={p.fullName} on={(v) => set("fullName", v)} />
          <Field label="Email" v={p.email} on={(v) => set("email", v)} />
          <Field label="Phone" v={p.phone ?? ""} on={(v) => set("phone", v)} />
          <Field
            label="Current location"
            v={p.location ?? ""}
            on={(v) => set("location", v)}
          />
          <Field
            label="LinkedIn"
            v={p.linkedin ?? ""}
            on={(v) => set("linkedin", v)}
          />
          <Field label="GitHub" v={p.github ?? ""} on={(v) => set("github", v)} />
          <Field
            label="Portfolio"
            v={p.portfolio ?? ""}
            on={(v) => set("portfolio", v)}
          />
        </div>
      </div>

      {/* Education */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Education
        </div>
        <div className="grid-2">
          <Field
            label="University"
            v={p.university}
            on={(v) => set("university", v)}
          />
          <Field label="Major" v={p.major} on={(v) => set("major", v)} />
          <Field
            label="Degree"
            v={p.degree ?? ""}
            on={(v) => set("degree", v)}
          />
          <Field
            label="Graduation (YYYY-MM)"
            v={p.graduationDate ?? ""}
            on={(v) => set("graduationDate", v)}
          />
          <Field label="GPA" v={p.gpa ?? ""} on={(v) => set("gpa", v)} />
        </div>
      </div>

      {/* Authorization */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Work authorization
        </div>
        <Field
          label="Work authorization"
          v={p.authorization.workAuthorization}
          on={(v) =>
            set("authorization", {
              ...p.authorization,
              workAuthorization: v,
            })
          }
        />
        <div className="checkbox-row" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            id="spNow"
            checked={p.authorization.requiresSponsorshipNow}
            onChange={(e) =>
              set("authorization", {
                ...p.authorization,
                requiresSponsorshipNow: e.target.checked,
              })
            }
          />
          <label htmlFor="spNow" style={{ margin: 0 }}>
            Requires sponsorship now
          </label>
        </div>
        <div className="checkbox-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            id="spFuture"
            checked={p.authorization.requiresSponsorshipFuture}
            onChange={(e) =>
              set("authorization", {
                ...p.authorization,
                requiresSponsorshipFuture: e.target.checked,
              })
            }
          />
          <label htmlFor="spFuture" style={{ margin: 0 }}>
            Will require sponsorship in the future
          </label>
        </div>
      </div>

      {/* Preferences */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Preferences (used for matching)
        </div>
        <div className="field">
          <label>Seniority</label>
          <select
            value={p.preferences.seniority}
            onChange={(e) =>
              set("preferences", {
                ...p.preferences,
                seniority: e.target
                  .value as Profile["preferences"]["seniority"],
              })
            }
          >
            <option value="internship">Internship</option>
            <option value="new-grad">New grad</option>
            <option value="junior">Junior</option>
            <option value="any">Any</option>
          </select>
        </div>
        <ListField
          label="Target roles"
          v={p.preferences.roles}
          on={(v) => set("preferences", { ...p.preferences, roles: v })}
        />
        <ListField
          label="Interests"
          v={p.preferences.interests}
          on={(v) => set("preferences", { ...p.preferences, interests: v })}
        />
        <ListField
          label="Preferred locations (use 'Remote' too)"
          v={p.preferences.locations}
          on={(v) => set("preferences", { ...p.preferences, locations: v })}
        />
        <ListField
          label="Target countries — only show jobs here (blank = anywhere)"
          v={p.preferences.countries ?? []}
          on={(v) => set("preferences", { ...p.preferences, countries: v })}
        />
        <ListField
          label="Exclude keywords (hard filters)"
          v={p.preferences.excludeKeywords}
          on={(v) =>
            set("preferences", { ...p.preferences, excludeKeywords: v })
          }
        />
        <div className="checkbox-row" style={{ marginTop: 4 }}>
          <input
            type="checkbox"
            id="relocate"
            checked={p.preferences.willingToRelocate}
            onChange={(e) =>
              set("preferences", {
                ...p.preferences,
                willingToRelocate: e.target.checked,
              })
            }
          />
          <label htmlFor="relocate" style={{ margin: 0 }}>
            Willing to relocate
          </label>
        </div>
      </div>

      {/* Skills */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Skills
        </div>
        <ListField
          label="Skills (comma separated)"
          v={p.skills}
          on={(v) => set("skills", v)}
        />
      </div>

      {/* Experience */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Work experience
        </div>
        {p.experience.map((exp, i) => (
          <ExperienceEditor
            key={exp.id}
            exp={exp}
            onChange={(next) => {
              const arr = [...p.experience];
              arr[i] = next;
              set("experience", arr);
            }}
            onRemove={() =>
              set(
                "experience",
                p.experience.filter((_, j) => j !== i),
              )
            }
          />
        ))}
        <button
          className="btn btn-sm"
          onClick={() =>
            set("experience", [
              ...p.experience,
              {
                id: `exp_${Date.now()}`,
                company: "",
                title: "",
                bullets: [],
              },
            ])
          }
        >
          + Add experience
        </button>
      </div>

      {/* Projects */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Projects
        </div>
        {p.projects.map((proj, i) => (
          <ProjectEditor
            key={proj.id}
            proj={proj}
            onChange={(next) => {
              const arr = [...p.projects];
              arr[i] = next;
              set("projects", arr);
            }}
            onRemove={() =>
              set(
                "projects",
                p.projects.filter((_, j) => j !== i),
              )
            }
          />
        ))}
        <button
          className="btn btn-sm"
          onClick={() =>
            set("projects", [
              ...p.projects,
              {
                id: `proj_${Date.now()}`,
                name: "",
                description: "",
                bullets: [],
              },
            ])
          }
        >
          + Add project
        </button>
      </div>

      {/* Resumes */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Resume variants
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          The assistant auto-selects the resume whose focus keywords best match
          each job.
        </p>
        {p.resumes.map((r, i) => (
          <ResumeEditor
            key={r.id}
            r={r}
            onChange={(next) => {
              const arr = [...p.resumes];
              arr[i] = next;
              set("resumes", arr);
            }}
            onRemove={() =>
              set(
                "resumes",
                p.resumes.filter((_, j) => j !== i),
              )
            }
          />
        ))}
        <button
          className="btn btn-sm"
          onClick={() =>
            set("resumes", [
              ...p.resumes,
              { id: `resume_${Date.now()}`, label: "", focus: [] },
            ])
          }
        >
          + Add resume
        </button>
      </div>

      <button
        className="btn btn-primary"
        onClick={save}
        disabled={busy}
        style={{ marginTop: 8 }}
      >
        {busy ? "Saving…" : "Save profile"}
      </button>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

interface ReviewData {
  fileName?: string;
  aiUsed?: boolean;
  chars?: number;
  extracted?: ExtractedProfile | null;
}

function ResumeReview({
  data,
  current,
  onConfirm,
  onCancel,
  busy,
}: {
  data: ReviewData;
  current: Profile;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const ex = data.extracted ?? {};
  const contact: { label: string; val?: string; had: boolean }[] = [
    { label: "Name", val: ex.fullName, had: !!current.fullName },
    { label: "Email", val: ex.email, had: !!current.email },
    { label: "Phone", val: ex.phone, had: !!current.phone },
    { label: "Location", val: ex.location, had: !!current.location },
    { label: "LinkedIn", val: ex.linkedin, had: !!current.linkedin },
    { label: "GitHub", val: ex.github, had: !!current.github },
    { label: "Portfolio", val: ex.portfolio, had: !!current.portfolio },
    { label: "University", val: ex.university, had: !!current.university },
    { label: "Major", val: ex.major, had: !!current.major },
    { label: "Graduation", val: ex.graduationDate, had: !!current.graduationDate },
    { label: "GPA", val: ex.gpa, had: !!current.gpa },
  ].filter((r) => r.val);

  const haveSkills = new Set(current.skills.map((s) => s.toLowerCase()));
  const newSkills = (ex.skills ?? []).filter(
    (s) => !haveSkills.has(s.toLowerCase()),
  );

  return (
    <div
      style={{
        border: "1px solid var(--primary)",
        borderRadius: 10,
        padding: 14,
        marginTop: 14,
        background: "var(--primary-soft)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <strong>Review what we found in {data.fileName ?? "your resume"}</strong>
        <span className="badge neutral">
          {data.aiUsed ? "AI + text parse" : "text parse"}
        </span>
      </div>
      <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
        Confirm to fill your profile and save. Empty fields get filled; anything
        you&apos;ve already entered is kept; roles/projects are added. You can
        still edit everything afterward.
      </p>

      {contact.length > 0 && (
        <>
          <div className="section-label">Contact &amp; education</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {contact.map((r) => (
                <tr key={r.label}>
                  <td
                    style={{
                      padding: "3px 8px 3px 0",
                      color: "var(--text-muted)",
                      width: 120,
                      verticalAlign: "top",
                    }}
                  >
                    {r.label}
                  </td>
                  <td style={{ padding: "3px 0" }}>
                    {r.val}
                    {r.had && (
                      <span className="faint" style={{ marginLeft: 8, fontSize: 12 }}>
                        (keeping your current value)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {newSkills.length > 0 && (
        <>
          <div className="section-label">Skills to add ({newSkills.length})</div>
          <div className="chips">
            {newSkills.map((s) => (
              <span key={s} className="chip match">
                {s}
              </span>
            ))}
          </div>
        </>
      )}

      {(ex.experience?.length ?? 0) > 0 && (
        <>
          <div className="section-label">
            Experience to add ({ex.experience!.length})
          </div>
          {ex.experience!.map((e, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>
                {[e.title, e.company].filter(Boolean).join(" · ") || "Role"}
                {(e.startDate || e.endDate) && (
                  <span className="faint" style={{ marginLeft: 8, fontWeight: 400 }}>
                    {[e.startDate, e.endDate].filter(Boolean).join(" – ")}
                  </span>
                )}
              </div>
              {e.bullets && e.bullets.length > 0 && (
                <ul className="clean" style={{ fontSize: 13 }}>
                  {e.bullets.slice(0, 4).map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}

      {(ex.projects?.length ?? 0) > 0 && (
        <>
          <div className="section-label">
            Projects to add ({ex.projects!.length})
          </div>
          {ex.projects!.map((pr, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{pr.name || "Project"}</span>
              {pr.description && (
                <span className="muted"> — {pr.description}</span>
              )}
            </div>
          ))}
        </>
      )}

      {!data.aiUsed && (
        <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Tip: add an AI key in Settings for more accurate experience/project
          parsing on complex resumes.
        </p>
      )}

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {busy ? "Saving…" : "Confirm & fill my profile"}
        </button>
        <button className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  v,
  on,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}

function ListField({
  label,
  v,
  on,
}: {
  label: string;
  v: string[];
  on: (v: string[]) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        value={commaList(v)}
        onChange={(e) => on(parseList(e.target.value))}
      />
    </div>
  );
}

function ExperienceEditor({
  exp,
  onChange,
  onRemove,
}: {
  exp: WorkExperience;
  onChange: (e: WorkExperience) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div className="grid-2">
        <Field
          label="Title"
          v={exp.title}
          on={(v) => onChange({ ...exp, title: v })}
        />
        <Field
          label="Company"
          v={exp.company}
          on={(v) => onChange({ ...exp, company: v })}
        />
        <Field
          label="Start"
          v={exp.startDate ?? ""}
          on={(v) => onChange({ ...exp, startDate: v })}
        />
        <Field
          label="End"
          v={exp.endDate ?? ""}
          on={(v) => onChange({ ...exp, endDate: v })}
        />
      </div>
      <div className="field">
        <label>Bullets (one per line)</label>
        <textarea
          value={exp.bullets.join("\n")}
          onChange={(e) =>
            onChange({
              ...exp,
              bullets: e.target.value.split("\n").filter(Boolean),
            })
          }
        />
      </div>
      <button className="btn btn-sm btn-danger" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function ProjectEditor({
  proj,
  onChange,
  onRemove,
}: {
  proj: Project;
  onChange: (p: Project) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div className="grid-2">
        <Field
          label="Name"
          v={proj.name}
          on={(v) => onChange({ ...proj, name: v })}
        />
        <Field
          label="Link"
          v={proj.link ?? ""}
          on={(v) => onChange({ ...proj, link: v })}
        />
      </div>
      <Field
        label="Description"
        v={proj.description}
        on={(v) => onChange({ ...proj, description: v })}
      />
      <div className="field">
        <label>Bullets (one per line)</label>
        <textarea
          value={proj.bullets.join("\n")}
          onChange={(e) =>
            onChange({
              ...proj,
              bullets: e.target.value.split("\n").filter(Boolean),
            })
          }
        />
      </div>
      <button className="btn btn-sm btn-danger" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function ResumeEditor({
  r,
  onChange,
  onRemove,
}: {
  r: ResumeVariant;
  onChange: (r: ResumeVariant) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div className="grid-2">
        <Field
          label="Label"
          v={r.label}
          on={(v) => onChange({ ...r, label: v })}
        />
        <Field
          label="File name"
          v={r.fileName ?? ""}
          on={(v) => onChange({ ...r, fileName: v })}
        />
      </div>
      <ListField
        label="Focus keywords"
        v={r.focus}
        on={(v) => onChange({ ...r, focus: v })}
      />
      <button className="btn btn-sm btn-danger" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}
