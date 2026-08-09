// 插件公共工具函数

/**
 * 转义 HTML 特殊字符，防止 XSS
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 转义字符串使其可安全嵌入 JavaScript 单引号字符串字面量
 * @param {string} str
 * @returns {string}
 */
export function escapeJsString(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

const SKIP_PARENT_TYPES = new Set([
  'inlineCode',
  'code',
  'math',
  'inlineMath',
  'html',
  'link',
  'linkReference',
  'definition',
]);

/**
 * 判断父节点类型是否应跳过文本处理（避免在代码块/链接等内部重复处理）
 * @param {string} parentType
 * @returns {boolean}
 */
export function shouldSkipParent(parentType) {
  return SKIP_PARENT_TYPES.has(parentType);
}

/**
 * 生成卡片加载脚本字符串（幂等检查 + astro:page-load 监听 + 统一错误处理）
 * 调用方提供 onSuccess(data) 函数体字符串
 *
 * @param {object} opts
 * @param {string} opts.cardUuid - 卡片元素 UUID（如 "GCabc123"）
 * @param {string} opts.url - 请求地址（已转义）
 * @param {string} opts.onSuccessBody - 收到 JSON 后执行的函数体字符串（变量名为 data）
 * @param {string} opts.errorTag - 错误日志前缀（如 "GITHUB-CARD"）
 * @param {string} opts.errorCtx - 错误日志上下文（如 repo 名，已转义）
 * @returns {string} 完整的 IIFE 脚本字符串
 */
export function generateCardFetcherScript({ cardUuid, url, onSuccessBody, errorTag, errorCtx }) {
  return `
        (function() {
            const fetchCardData = () => {
                const card = document.getElementById('${cardUuid}-card');
                if (!card || card.dataset.loaded === "true") return;

                fetch('${url}', { referrerPolicy: "no-referrer" })
                    .then(response => response.json())
                    .then(data => {
                        ${onSuccessBody}
                    })
                    .catch(err => {
                        const c = document.getElementById('${cardUuid}-card');
                        c?.classList.add("fetch-error");
                        console.warn("[${errorTag}] Error loading ${errorCtx}:", err);
                    });
            };

            fetchCardData();
            document.addEventListener('astro:page-load', fetchCardData);
        })();
        `;
}
