// Minimal HTML → text for job descriptions coming from ATS APIs.
// Greenhouse returns entity-escaped HTML (e.g. "&lt;p&gt;"), so we decode
// entities, strip tags, and normalize whitespace.

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
    if (code[0] === "#") {
      const num =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    }
    return NAMED[code] ?? m;
  });
}

export function htmlToText(input: string): string {
  if (!input) return "";
  // Greenhouse content is escaped once; decode so tags become real tags.
  let s = decodeEntities(input);
  // Turn block boundaries into newlines so lists/paragraphs stay readable.
  s = s
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  // Decode again for entities that were inside the HTML text nodes.
  s = decodeEntities(s);
  return s
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
