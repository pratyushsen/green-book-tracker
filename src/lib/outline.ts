/**
 * Parse a user-supplied book outline. Nothing about the real book is built in —
 * the user pastes their own structure.
 *
 * Text format (one item per line):
 *   # 1 | Chapter title        <- chapter ("#" prefix; optional "number |")
 *   - Topic title              <- topic ("-", "*", "•" or indented line)
 *   Plain unindented line       <- also a chapter
 *
 * JSON format:
 *   [{ "number": "1", "title": "…", "topics": ["…", "…"] }]
 */
export interface OutlineChapter {
  number: string | null;
  title: string;
  topics: string[];
}

function splitNumber(raw: string): { number: string | null; title: string } {
  const pipe = raw.match(/^([^|]{1,12})\|\s*(.+)$/);
  if (pipe) return { number: pipe[1].trim() || null, title: pipe[2].trim() };
  const lead = raw.match(/^(?:chapter\s+)?(\d+(?:\.\d+)*)[.):\-–]?\s+(.+)$/i);
  if (lead) return { number: lead[1], title: lead[2].trim() };
  return { number: null, title: raw.trim() };
}

export function parseOutline(input: string): { chapters: OutlineChapter[]; errors: string[] } {
  const text = input.trim();
  const errors: string[] = [];
  if (!text) return { chapters: [], errors };

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : parsed.chapters;
      if (!Array.isArray(arr)) throw new Error("Expected an array of chapters");
      const chapters = arr
        .filter((c: unknown) => c && typeof c === "object" && typeof (c as { title?: unknown }).title === "string")
        .map((c: { number?: unknown; title: string; topics?: unknown }) => ({
          number: c.number != null ? String(c.number) : null,
          title: c.title.trim(),
          topics: Array.isArray(c.topics)
            ? c.topics
                .map((t: unknown) => (typeof t === "string" ? t : (t as { title?: string })?.title ?? ""))
                .map((t: string) => t.trim())
                .filter(Boolean)
            : [],
        }))
        .filter((c: OutlineChapter) => c.title);
      return { chapters, errors };
    } catch (e) {
      return { chapters: [], errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }

  const chapters: OutlineChapter[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const isTopic = /^\s+\S/.test(line) || /^\s*[-*•]\s+/.test(line);
    const clean = line.replace(/^\s*(#+|[-*•])\s*/, "").trim();
    if (!clean) return;
    if (isTopic && !/^\s*#/.test(line)) {
      const current = chapters.at(-1);
      if (!current) {
        errors.push(`Line ${i + 1}: topic "${clean}" appears before any chapter`);
        return;
      }
      current.topics.push(clean);
    } else {
      chapters.push({ ...splitNumber(clean), topics: [] });
    }
  });
  return { chapters, errors };
}
