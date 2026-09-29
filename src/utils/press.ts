/**
 * 按压手感：给「本来就能点」的元素统一追加的类。
 * 按下缩到 0.98、150ms 过渡；配合 Tailwind 扫描（类名以字面量写在本文件里，不会被摇掉）。
 * 用法：import { PRESS } from "@utils/press"，再把类名拼进元素的 class。
 */
export const PRESS = "transition-transform duration-150 active:scale-[0.98]";
