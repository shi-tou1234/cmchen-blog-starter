export function cleanPostText(input: string): string {
  return String(input || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~\-|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(input: string, limit: number): string {
  const text = String(input || "").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text;
}

export function buildPostPreview(description: string, body: string, limit = 80): string {
  const desc = String(description || "").trim();
  if (desc) return truncateText(desc, limit);

  const cleaned = cleanPostText(body || "");
  if (!cleaned) {
    return "点击查看文章详情内容。";
  }

  return truncateText(cleaned, limit);
}
