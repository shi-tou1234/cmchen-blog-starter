/**
 * 简单字符串哈希（djb2 变种），用于生成确定性整数（如随机颜色、SVG 池选择）
 * 同一输入始终返回同一结果
 */
export function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
