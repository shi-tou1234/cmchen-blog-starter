// remark-typst.mjs
import { visit } from 'unist-util-visit';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { escapeHtml } from './plugin-utils.mjs';

// 惰性初始化编译器：首次渲染 typst 代码块时才 create，失败时降级输出，绝不中断构建
let _compiler;
let _initFailed = false;

async function getCompiler() {
  if (_compiler) return _compiler;
  if (_initFailed) return undefined;
  try {
    _compiler = NodeCompiler.create();
    return _compiler;
  } catch (e) {
    _initFailed = true;
    console.warn('[remark-typst] NodeCompiler 初始化失败，typst 代码块将以纯文本输出:', e);
    return undefined;
  }
}

export function remarkTypst() {
  return async (tree) => {
    const instances = [];

    // 1. 收集所有 typst 代码块
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang === 'typst') {
        instances.push({ node, index, parent });
      }
    });

    // 2. 惰性初始化编译器
    const compiler = await getCompiler();

    // 3. 异步并行渲染
    for (const { node, index, parent } of instances) {
      try {
        // 编译器初始化失败时，将 typst 代码块降级为普通 pre 代码块输出
        if (!compiler) {
          parent.children[index] = {
            type: 'html',
            value: `<pre class="typst-fallback"><code>${escapeHtml(node.value)}</code></pre>`,
          };
          continue;
        }

        const title = node.meta ? node.meta.trim() : '';
        // 先转义 HTML 特殊字符，再处理 *斜体* 标记
        const escapedTitle = escapeHtml(title);
        const formattedTitle = escapedTitle.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // 编译为 SVG 字符串
        const svg = await compiler.svg({
          mainFileContent: node.value,
        });

        // 将代码块替换为 raw 类型的 HTML 节点
        parent.children[index] = {
          type: 'html',
          value: `<div class="typst-render">
          ${svg}
          <div class="typst-title">${formattedTitle}</div>
          </div>`,
        };
      } catch (e) {
        console.error('Typst compilation failed:', e);
      }
    }
  };
}
