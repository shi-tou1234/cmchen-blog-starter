import { cleanPostText } from './post-preview';

function extractReadableCounts(content: string) {
  const cleaned = cleanPostText(content);

  const cjkChars = (cleaned.match(/[\u3400-\u9FFF]/g) || []).length;
  const latinWords = (cleaned.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length;

  return { cjkChars, latinWords };
}

export function estimateReadingMinutes(content: string): number {
  if (!content) return 1;

  const { cjkChars, latinWords } = extractReadableCounts(content);

  const cjkMinutes = cjkChars / 300;
  const latinMinutes = latinWords / 200;
  const minutes = Math.ceil(cjkMinutes + latinMinutes);

  return Math.max(1, minutes);
}

export function estimateWordCount(content: string): number {
  if (!content) return 0;

  const { cjkChars, latinWords } = extractReadableCounts(content);
  return cjkChars + latinWords;
}
