import { visit } from 'unist-util-visit';
import { shouldSkipParent } from './plugin-utils.mjs';

const BRACKET_PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['（', '）'],
  ['【', '】'],
];

const OPENERS = new Set(BRACKET_PAIRS.map(([open]) => open));
const PAIR_MAP = new Map(BRACKET_PAIRS);

const LATEX_COMMAND_PATTERN = /\\[A-Za-z]+/;
const MATH_SYMBOL_PATTERN = /[=^_]|\\[A-Za-z]+|[∑∫√π∞≤≥≠]/;
const LETTER_OR_NUMBER_PATTERN = /[A-Za-z0-9]/;

function looksLikeMathExpression(value) {
  const text = value.trim();
  if (!text) return false;
  if (text.startsWith('$')) return false;
  if (text.startsWith('`')) return false;
  if (text.includes('http://') || text.includes('https://')) return false;

  if (LATEX_COMMAND_PATTERN.test(text)) return true;
  if (!MATH_SYMBOL_PATTERN.test(text)) return false;

  return LETTER_OR_NUMBER_PATTERN.test(text);
}

function parseBracketSegment(text, start) {
  const open = text[start];
  const close = PAIR_MAP.get(open);
  if (!close) return null;

  let depth = 1;
  for (let index = start + 1; index < text.length; index += 1) {
    const current = text[index];
    const previous = text[index - 1];

    if (current === open && previous !== '\\') {
      depth += 1;
      continue;
    }

    if (current === close && previous !== '\\') {
      depth -= 1;
      if (depth === 0) {
        return {
          open,
          close,
          start,
          end: index,
          content: text.slice(start + 1, index),
        };
      }
    }
  }

  return null;
}

function splitTextWithInlineMath(text) {
  const nodes = [];
  let cursor = 0;

  while (cursor < text.length) {
    const char = text[cursor];
    if (!OPENERS.has(char)) {
      cursor += 1;
      continue;
    }

    const segment = parseBracketSegment(text, cursor);
    if (!segment) {
      cursor += 1;
      continue;
    }

    const candidate = segment.content.trim();
    if (!looksLikeMathExpression(candidate)) {
      cursor = segment.end + 1;
      continue;
    }

    if (segment.start > 0) {
      const before = text.slice(0, segment.start);
      if (before) nodes.push({ type: 'text', value: before });
    }

    nodes.push({ type: 'inlineMath', value: candidate });

    const rest = text.slice(segment.end + 1);
    if (rest) {
      const tailNodes = splitTextWithInlineMath(rest);
      nodes.push(...tailNodes);
    }

    return nodes;
  }

  return [{ type: 'text', value: text }];
}

function unwrapSingleBracket(text) {
  const trimmed = text.trim();
  for (const [open, close] of BRACKET_PAIRS) {
    if (trimmed.startsWith(open) && trimmed.endsWith(close)) {
      return trimmed.slice(open.length, trimmed.length - close.length).trim();
    }
  }
  return null;
}

export function remarkAutoMath() {
  return (tree) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      if (!Array.isArray(node.children) || node.children.length !== 1) return;

      const onlyChild = node.children[0];
      if (onlyChild.type !== 'text') return;

      const raw = String(onlyChild.value || '').trim();
      if (!raw) return;

      const unwrapped = unwrapSingleBracket(raw);
      const candidate = unwrapped ?? raw;

      if (!looksLikeMathExpression(candidate)) return;
      if (!LATEX_COMMAND_PATTERN.test(candidate) && candidate.length < 12) return;

      parent.children.splice(index, 1, {
        type: 'math',
        value: candidate,
      });

      return index + 1;
    });

    visit(tree, 'text', (node, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      if (shouldSkipParent(parent.type)) return;

      const value = String(node.value || '');
      if (!value) return;

      const nextNodes = splitTextWithInlineMath(value);
      if (nextNodes.length === 1 && nextNodes[0].type === 'text') return;

      parent.children.splice(index, 1, ...nextNodes);
      return index + nextNodes.length;
    });
  };
}
