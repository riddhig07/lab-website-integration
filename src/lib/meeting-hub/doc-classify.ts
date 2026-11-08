import type { DocumentKind } from "@/lib/meeting-hub/types";

export function classifyDocument(name: string, folderPath: string): DocumentKind {
  const n = name.toLowerCase();
  const p = folderPath.toLowerCase();
  if (n.includes("agenda")) return "agenda";
  if (p.includes("meeting notes") || n.includes("notes")) return "notes";
  if (n.includes("summary")) return "summary";
  if (n.includes("transcript")) return "transcript";
  if (/\.(mp3|wav|m4a|webm|mp4)$/.test(n)) return "recording";
  if (p.includes("research") || p.includes("literature")) return "research";
  return "other";
}

/** Parse dates like 10_12_2026, 10_5_26, 10/12/2026 from filenames */
export function parseDateFromFilename(name: string): string | null {
  const patterns = [
    /(\d{1,2})[_/-](\d{1,2})[_/-](\d{2,4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
  ];
  for (const re of patterns) {
    const m = name.match(re);
    if (!m) continue;
    if (m[0].includes("-") && m[1].length === 4) {
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    }
    let month = Number(m[1]);
    let day = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

export function suggestMeetingLink(
  name: string,
  folderPath: string,
): { dateKey: string; type: "monday" | "thursday" } | null {
  const dateKey = parseDateFromFilename(name);
  if (!dateKey) return null;
  const d = new Date(`${dateKey}T12:00:00`);
  const dow = d.getDay();
  if (dow === 1) return { dateKey, type: "monday" };
  if (dow === 4) return { dateKey, type: "thursday" };
  if (folderPath.toLowerCase().includes("meeting")) {
    return { dateKey, type: dow < 4 ? "monday" : "thursday" };
  }
  return null;
}
