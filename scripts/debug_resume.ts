import { readFile } from "fs/promises";
import { extractResumeText, parseResumeStructured } from "../src/lib/resume";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/debug_resume.ts <path-to-resume.pdf>");
    process.exit(1);
  }
  const buf = await readFile(path);
  const text = await extractResumeText(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    "resume.pdf",
    "application/pdf",
  );
  console.log("=== EXTRACTED TEXT LENGTH:", text.length, "| LINES:", text.split("\n").length, "===");
  console.log("=== FIRST 3000 CHARS (raw) ===");
  console.log(JSON.stringify(text.slice(0, 3000)));
  console.log("\n=== PARSED ===");
  const p = parseResumeStructured(text);
  console.log("name:", p.fullName, "| email:", p.email, "| location:", p.location);
  console.log("university:", p.university, "| major:", p.major, "| grad:", p.graduationDate);
  console.log("skills:", (p.skills || []).length);
  console.log("experience:", (p.experience || []).length, JSON.stringify(p.experience, null, 2));
  console.log("projects:", (p.projects || []).length, JSON.stringify(p.projects, null, 2));
}
main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
