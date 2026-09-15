import type { Profile } from "./types";

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
