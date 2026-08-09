import { visit } from 'unist-util-visit';
import { escapeHtml } from './plugin-utils.mjs';

export function remarkCombined() {
  // 将正则定义移入 processText 内部，或者在每次使用前创建新实例
  function processText(text) {
    if (!text) return [];

    // 关键修复：每个层级使用独立的正则实例，避免 lastIndex 冲突
    const regex = /\{(.+?)\}\((.+?)\)|!!(.+?)!!|==(.+?)==/g;
    const nodes = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // 1. 添加匹配项之前的纯文本
      if (match.index > lastIndex) {
        nodes.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      }

      if (match[1] && match[2]) {
        // --- Ruby 逻辑 ---
        const readingText = match[2];

        let rubyInnerHtml = '';

        if (readingText.includes('|')) {
          const baseChars = Array.from(match[1]);
          const readings = readingText.split('|');
          const maxLength = Math.max(baseChars.length, readings.length);

          for (let i = 0; i < maxLength; i++) {
            const char = escapeHtml(baseChars[i] || '');
            const rt = escapeHtml(readings[i] || '');
            rubyInnerHtml += `${char}<rt>${rt}</rt>`;
          }
        } else {
          rubyInnerHtml = `${escapeHtml(match[1])}<rt>${escapeHtml(readingText)}</rt>`;
        }
        nodes.push({ type: 'html', value: `<ruby>${rubyInnerHtml}</ruby>` });

      } else if (match[3]) {
        // --- Spoiler (!!...!!) 逻辑 ---
        nodes.push({ type: 'html', value: '<span class="spoiler">' });
        nodes.push(...processText(match[3])); // 递归处理
        nodes.push({ type: 'html', value: '</span>' });

      } else if (match[4]) {
        // --- Rainbow (==...==) 逻辑 ---
        nodes.push({ type: 'html', value: '<span class="rainbow-text">' });
        nodes.push(...processText(match[4])); // 递归处理
        nodes.push({ type: 'html', value: '</span>' });
      }

      lastIndex = regex.lastIndex;
    }

    // 3. 处理剩余文本
    if (lastIndex < text.length) {
      nodes.push({ type: 'text', value: text.slice(lastIndex) });
    }

    return nodes.length > 0 ? nodes : [{ type: 'text', value: text }];
  }

  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      // 排除已经被处理过的或空的文本节点
      if (!node.value) return;

      const resultNodes = processText(node.value);
      
      // 只有当内容发生变化时才替换
      if (resultNodes.length > 1 || (resultNodes.length === 1 && resultNodes[0].type !== 'text')) {
        parent.children.splice(index, 1, ...resultNodes);
        // 返回下一个节点的索引，跳过新生成的子节点，防止二次处理
        return index + resultNodes.length;
      }
    });
  };
}