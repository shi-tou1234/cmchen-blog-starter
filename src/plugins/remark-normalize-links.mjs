import { visit } from 'unist-util-visit';
import { shouldSkipParent } from './plugin-utils.mjs';

const LINK_PATTERN = /\[([^\]]+)]\s*[（(]\s*(https?:\/\/[^\s）)]+)\s*[）)]/g;
const LABEL_PREFIX_PATTERN = /\[([^\]]+)]\s*[（(]\s*$/;
const TRAILING_PUNCTUATION_PATTERN = /[\s）)】】》》。！？；，、]+$/;

function splitTextWithLinks(value) {
  const nodes = [];
  let lastIndex = 0;
  let match;

  while ((match = LINK_PATTERN.exec(value)) !== null) {
    const [raw, text, url] = match;
    const start = match.index;

    if (start > lastIndex) {
      nodes.push({ type: 'text', value: value.slice(lastIndex, start) });
    }

    nodes.push({
      type: 'link',
      url,
      title: null,
      children: [{ type: 'text', value: text.trim() }],
    });

    lastIndex = start + raw.length;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: 'text', value: value.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', value }];
}

function trimLinkUrl(url) {
  const raw = String(url || '');
  const trimmed = raw.trim();
  const cleaned = trimmed.replace(TRAILING_PUNCTUATION_PATTERN, '');
  const tail = trimmed.slice(cleaned.length);
  return {
    cleaned: cleaned || trimmed,
    tail,
  };
}

function cleanLeadingClosing(text) {
  return String(text || '').replace(/^[\s）)】》]+/, '');
}

function mergeTextNodes(nodes) {
  const result = [];
  for (const node of nodes) {
    if (node.type === 'text' && result.length > 0 && result[result.length - 1].type === 'text') {
      result[result.length - 1].value += node.value;
      continue;
    }
    result.push(node);
  }
  return result;
}

function normalizeParagraphLinks(paragraph) {
  if (!Array.isArray(paragraph.children) || paragraph.children.length === 0) return;

  const nextChildren = [...paragraph.children];

  for (let i = 0; i < nextChildren.length; i += 1) {
    const current = nextChildren[i];
    if (!current || current.type !== 'link') continue;

    const before = nextChildren[i - 1];
    const after = nextChildren[i + 1];
    const linkText = Array.isArray(current.children) && current.children[0]?.type === 'text'
      ? String(current.children[0].value || '')
      : '';
    const hasAutoLinkText = linkText && (linkText === current.url || linkText.startsWith('http://') || linkText.startsWith('https://'));

    const { cleaned, tail } = trimLinkUrl(current.url);
    current.url = cleaned;

    let convertedFromLabel = false;
    if (before?.type === 'text') {
      const matched = String(before.value || '').match(LABEL_PREFIX_PATTERN);
      if (matched?.[1]) {
        const label = matched[1].trim();
        before.value = String(before.value).replace(LABEL_PREFIX_PATTERN, '');
        current.children = [{ type: 'text', value: label }];
        convertedFromLabel = true;
      }
    }

    if (hasAutoLinkText && !convertedFromLabel) {
      current.children = [{ type: 'text', value: current.url }];
    }

    if (tail) {
      let remainTail = tail;
      if (convertedFromLabel) {
        remainTail = cleanLeadingClosing(remainTail);
      }

      if (remainTail) {
        if (after?.type === 'text') {
          after.value = `${remainTail}${after.value}`;
        } else {
          nextChildren.splice(i + 1, 0, { type: 'text', value: remainTail });
        }
      }
    }

    if (after?.type === 'text' && convertedFromLabel) {
      after.value = cleanLeadingClosing(after.value);
    }
  }

  paragraph.children = mergeTextNodes(nextChildren).filter((node) => !(node.type === 'text' && !String(node.value || '')));
}

export function remarkNormalizeLinks() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      if (shouldSkipParent(parent.type)) return;

      const value = String(node.value || '');
      if (!value || !value.includes('[')) return;

      LINK_PATTERN.lastIndex = 0;
      if (!LINK_PATTERN.test(value)) return;

      LINK_PATTERN.lastIndex = 0;
      const nextNodes = splitTextWithLinks(value);
      parent.children.splice(index, 1, ...nextNodes);
      return index + nextNodes.length;
    });

    visit(tree, 'paragraph', (node) => {
      normalizeParagraphLinks(node);
    });
  };
}
