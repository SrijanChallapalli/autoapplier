import type { Profile } from "./types";

// Starter profile — every field is an empty placeholder you fill in on the
// Profile page. Nothing here is ever treated as a real accomplishment by the
// tailoring logic — the agent only ever rephrases what you actually enter under
// experience/projects.
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
    degree: "B.S.",
    graduationDate: "",
    gpa: "",

    authorization: {
      workAuthorization: "Authorized to work in the U.S.",
      requiresSponsorshipNow: false,
      requiresSponsorshipFuture: false,
    },

    preferences: {
      roles: [
        "Software Engineer Intern",
        "Machine Learning Intern",
        "Data Science Intern",
        "AI Engineer Intern",
      ],
      interests: ["AI/ML", "software engineering", "data science", "backend"],
      locations: ["Remote"],
      willingToRelocate: true,
      excludeKeywords: [
        "active security clearance",
        "10+ years",
        "principal",
        "staff engineer",
        "director",
      ],
      seniority: "internship",
    },

    skills: [
      "Python",
      "JavaScript",
      "TypeScript",
      "React",
      "Node.js",
      "SQL",
      "Git",
    ],

    experience: [],
    projects: [],

    resumes: [
      {
        id: "resume_general",
        label: "General SWE",
        fileName: "Resume_SWE.pdf",
        focus: ["software engineering", "full stack", "python", "react"],
        notes: "Default resume for general software engineering roles.",
      },
      {
        id: "resume_aiml",
        label: "AI / ML",
        fileName: "Resume_ML.pdf",
        focus: ["machine learning", "ai", "pytorch", "data science", "nlp"],
        notes: "Emphasizes ML coursework and projects.",
      },
    ],

    savedAnswers: {
      "authorized to work": "Yes",
      "require sponsorship": "No",
      "willing to relocate": "Yes",
    },

    updatedAt: new Date().toISOString(),
  };
}
