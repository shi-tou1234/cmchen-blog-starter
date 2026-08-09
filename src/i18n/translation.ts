import zhCN from "./language/zh-cn.ts";

const translation = zhCN;

function i18nit(_language: string): (key: string, params?: Record<string, string | number>) => string {
	const getValue = (key: string): unknown =>
		key.split('.').reduce<unknown>((acc, k) =>
			acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined,
			translation);

	const t = (key: string, params?: Record<string, string | number>) => {
		const value = getValue(key) as string | undefined;
		if (value === undefined) {
			// 固定中文后钥匙拼错应立即暴露，避免页面上出现钥匙串
			console.error(`[i18n] 翻译键缺失: ${key}`);
			return key;
		}
		return value.replace(/\{(\w+)\}/g, (_, param) => String(params?.[param] ?? param));
	};

	return t;
}

export default i18nit;