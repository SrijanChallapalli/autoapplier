"use client";

import { useEffect, useState } from "react";
import type {
  Profile,
  Project,
  ResumeVariant,
  WorkExperience,
} from "@/lib/types";

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

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setP);
  }, []);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!p) return;
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    const saved = await res.json();
    setP(saved);
    setBusy(false);
    setToast("Profile saved — all job matches recomputed");
    setTimeout(() => setToast(null), 3000);
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
