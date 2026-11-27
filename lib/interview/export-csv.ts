import { RESULT_LABELS, durationLabel, replyLabel, type CandidateReply, type ResultStatus } from "./results.ts";

export interface ExportableCandidate {
  id: string;
  name: string;
  studentId: string;
  department: string;
  year: string;
  track: string;
  submittedAt: string;
  totalScore: number | null;
  reviewedAt: string | null;
  elapsedSeconds: number | null;
  resultStatus: ResultStatus;
  candidateReply: CandidateReply | null;
}

export type ReviewFilterStatus = "all" | "pending" | "in_progress" | "graded";

export function filterCandidates<T extends ExportableCandidate>(
  candidates: readonly T[],
  filter: { status?: ReviewFilterStatus; track?: string; query?: string },
): T[] {
  const status = filter.status ?? "all";
  const track = (filter.track ?? "all").trim();
  const query = (filter.query ?? "").trim().toLowerCase();

  return candidates.filter((c) => {
    if (status === "graded" && c.totalScore === null) return false;
    if (status === "in_progress" && !(c.totalScore === null && c.reviewedAt !== null)) return false;
    if (status === "pending" && !(c.totalScore === null && c.reviewedAt === null)) return false;
    if (track && track !== "all" && c.track !== track) return false;
    if (query) {
      const haystack = `${c.name} ${c.studentId} ${c.department} ${c.year} ${c.track}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function escapeCsvCell(raw: string | number | null | undefined): string {
  const text = raw === null || raw === undefined ? "" : String(raw);
  // Prevent spreadsheet formula injection when opened in Excel.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function candidatesToCsv(candidates: readonly ExportableCandidate[]): string {
  const headers = [
    "姓名",
    "学号",
    "学院/专业",
    "年级",
    "方向题",
    "评分状态",
    "总分",
    "作答用时",
    "提交时间",
    "录取状态",
    "候选人回复",
  ];
  const rows = candidates.map((c) => {
    const scoreStatus = c.totalScore !== null ? "已评分" : c.reviewedAt ? "评分中" : "待评分";
    return [
      c.name,
      c.studentId,
      c.department || "",
      c.year || "",
      c.track || "",
      scoreStatus,
      c.totalScore !== null ? c.totalScore : "",
      durationLabel(c.elapsedSeconds),
      c.submittedAt,
      RESULT_LABELS[c.resultStatus] ?? c.resultStatus,
      replyLabel(c.resultStatus, c.candidateReply),
    ]
      .map(escapeCsvCell)
      .join(",");
  });
  return "\uFEFF" + [headers.map(escapeCsvCell).join(","), ...rows].join("\r\n") + "\r\n";
}
