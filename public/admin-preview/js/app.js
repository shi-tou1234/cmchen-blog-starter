var defaultContent = "# Markdown 预览器\n\n欢迎使用 Markdown 预览器！在左侧编辑区输入 Markdown 代码，右侧会实时渲染预览。\n\n## 基本语法\n\n**粗体** *斜体* ~~删除线~~\n\n### 代码块\n\n```js\nconsole.log('Hello, Markdown!')\n```\n\n### 列表\n\n- 项目一\n- 项目二\n- 项目三\n\n### 表格\n\n| 名称 | 说明 |\n| --- | --- |\n| Markdown | 轻量标记语言 |\n\n### 公式\n\n行内公式：$a^2+b^2=c^2$\n\n块级公式：\n\n$$\n\\int_a^b f(x)\\,dx\n$$\n\n### 链接\n\n[访问 GitHub](https://github.com)\n\n> 这是一段引用\n\n---\n\n**祝写作愉快！**\n";

var editor, preview, wordCount, themeToggle, themeIcon, loadExampleBtn, exportMdBtn, clearBtn, hljsTheme, returnToAdminBtn;
var sourceView, viewModeBtns, previewTitle;

var currentTheme = 'light';
var autoSaveTimer = null;
var isInitialized = false;
var currentViewMode = 'preview';
var adminReturnUrl = null;

function checkDependencies() {
    var deps = {
        marked: typeof marked !== 'undefined',
        hljs: typeof hljs !== 'undefined',
        katex: typeof katex !== 'undefined',
        renderMathInElement: typeof renderMathInElement !== 'undefined',
        DOMPurify: typeof DOMPurify !== 'undefined'
    };
    
    var missing = Object.keys(deps).filter(function(name) { return !deps[name]; });
    if (missing.length > 0) {
        console.error('缺少依赖:', missing);
        return false;
    }
    return true;
}

function init() {
    if (!checkDependencies()) {
        alert('部分依赖加载失败，请检查网络连接后刷新页面');
        return;
    }

    // embed 模式：后台实时预览用，隐藏编辑器 UI，仅显示预览区，通过 postMessage 接收内容
    var isEmbed = new URLSearchParams(window.location.search).get('embed') === '1';

    editor = document.getElementById('editor');
    preview = document.getElementById('preview');
    wordCount = document.getElementById('word-count');
    themeToggle = document.getElementById('theme-toggle');
    themeIcon = document.getElementById('theme-icon');
    loadExampleBtn = document.getElementById('load-example');
    exportMdBtn = document.getElementById('export-md');
    clearBtn = document.getElementById('clear');
    hljsTheme = document.getElementById('hljs-theme');
    sourceView = document.getElementById('source-view');
    viewModeBtns = document.querySelectorAll('.view-mode-btn');
    previewTitle = document.getElementById('preview-title');
    returnToAdminBtn = document.getElementById('return-to-admin');

    if (!editor || !preview) {
        console.error('DOM 元素获取失败');
        return;
    }

    if (isEmbed) {
        // 隐藏工具栏与编辑区，预览区全宽
        var toolbar = document.querySelector('.toolbar');
        var editorPane = document.querySelector('.editor-pane');
        if (toolbar) toolbar.style.display = 'none';
        if (editorPane) editorPane.style.display = 'none';
        document.body.classList.add('embed-mode');
        // 监听后台推送的预览内容
                window.addEventListener('message', function(ev) {
            var data = ev.data || {};
            if (data.type === 'admin-preview-update' && typeof data.content === 'string') {
                editor.value = data.content;
                updatePreview();
            }
            if (data.theme && (data.theme === 'light' || data.theme === 'dark')) {
                setTheme(data.theme);
            }
        });
        // 绑定视图模式切换（源码/预览）
        if (viewModeBtns && viewModeBtns.length > 0) {
            viewModeBtns.forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var mode = btn.dataset.view;
                    if (mode === currentViewMode) return;
                    setViewMode(mode);
                });
            });
        }
        // embed 模式不锁定滚动，不自动保存，不读取 draft
        editor.value = '';
        updatePreview();
        isInitialized = true;
        return;
    }
    
    try {
        currentTheme = localStorage.getItem('markdown-preview-theme') || 'light';
    } catch (e) {}
    
    setTheme(currentTheme);
    
    var loadedFromAdmin = false;
    try {
        var draftRaw = localStorage.getItem('cmchen_admin_preview_draft');
        if (draftRaw) {
            var draft = JSON.parse(draftRaw);
            if (draft && draft.content) {
                editor.value = draft.content;
                adminReturnUrl = draft.returnUrl || null;
                loadedFromAdmin = true;
            }
        }
    } catch (e) {}
    
    if (!loadedFromAdmin) {
        var savedContent = '';
        try {
            savedContent = localStorage.getItem('markdown-preview-content') || '';
        } catch (e) {}
        editor.value = savedContent || defaultContent;
    } else {
        try {
            localStorage.removeItem('cmchen_admin_preview_draft');
        } catch (e) {}
    }
    
    updatePreview();
    updateWordCount();
    bindEvents();
    lockBodyScroll();
    
    if (loadedFromAdmin && returnToAdminBtn) {
        returnToAdminBtn.style.display = 'flex';
    }
    
    isInitialized = true;
}

function lockBodyScroll() {
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100%';
}

function bindEvents() {
    editor.addEventListener('input', function() {
        updatePreview();
        updateWordCount();
        scheduleAutoSave();
    });

    editor.addEventListener('select', syncSelectionHighlightFromEditor);
    editor.addEventListener('mouseup', syncSelectionHighlightFromEditor);
    editor.addEventListener('keyup', syncSelectionHighlightFromEditor);
    
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            toggleTheme();
        });
    }
    
    if (loadExampleBtn) {
        loadExampleBtn.addEventListener('click', function() {
            if (confirm('确定要加载示例内容吗？当前内容将被替换。')) {
                editor.value = defaultContent;
                updatePreview();
                updateWordCount();
                saveToStorage();
            }
        });
    }
    
    if (exportMdBtn) {
        exportMdBtn.addEventListener('click', function() {
            exportMarkdown();
        });
    }

    if (viewModeBtns.length > 0) {
        viewModeBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var mode = btn.dataset.view;
                if (mode === currentViewMode) return;
                setViewMode(mode);
            });
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            if (confirm('确定要清空所有内容吗？')) {
                editor.value = '';
                updatePreview();
                updateWordCount();
                saveToStorage();
            }
        });
    }
    
    if (returnToAdminBtn) {
        returnToAdminBtn.addEventListener('click', function() {
            returnToAdmin();
        });
    }
    
    var toolBtns = document.querySelectorAll('.tool-btn[data-action]');
    toolBtns.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleToolbarAction(btn.dataset.action);
        });
    });
    
    editor.addEventListener('keydown', handleTabKey);
}

function updatePreview() {
    if (!editor || !preview) return;
    
    if (currentViewMode === 'source' && sourceView) {
        sourceView.value = editor.value;
        return;
    }
    
    try {
        var html = renderMarkdown(editor.value);
        preview.innerHTML = html;
        applyFootnotes(preview);
        applyInlineCustomStyles(preview);
        processTipCards();
        renderMath();
        highlightCode();
        syncSelectionHighlightFromEditor();
    } catch (error) {
        console.error('更新预览失败:', error);
    }
}

function getEditorSelection() {
    if (!editor) return { text: '', start: 0, end: 0 };
    var start = editor.selectionStart || 0;
    var end = editor.selectionEnd || 0;
    if (end <= start) return { text: '', start: start, end: end };
    return {
        text: editor.value.slice(start, end).replace(/\r\n/g, '\n'),
        start: start,
        end: end
    };
}

function clearSelectionHighlights() {
    if (!preview) return;
    var marks = preview.querySelectorAll('.sync-selection-highlight');
    marks.forEach(function(mark) {
        var parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
    });
}

function buildTextIndexMap(root) {
    var nodes = [];
    var text = '';
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node) {
            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
            return node.nodeValue.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });

    var current = walker.nextNode();
    while (current) {
        nodes.push({
            node: current,
            start: text.length,
            end: text.length + current.nodeValue.length
        });
        text += current.nodeValue;
        current = walker.nextNode();
    }

    return { text: text, nodes: nodes };
}

function findNodeOffsetByIndex(indexMap, index, forEnd) {
    var nodes = indexMap.nodes;
    if (nodes.length === 0) return null;

    for (var i = 0; i < nodes.length; i++) {
        var item = nodes[i];
        var inRange = forEnd ? index > item.start && index <= item.end : index >= item.start && index < item.end;
        if (inRange) {
            return { node: item.node, offset: index - item.start };
        }
    }

    var last = nodes[nodes.length - 1];
    return { node: last.node, offset: last.node.nodeValue.length };
}

function normalizeChar(char) {
    if (char === '\r') return '';
    if (char === '\u00A0') return ' ';
    if (char === '\t') return ' ';
    if (/[\u200B\u200C\u200D\uFEFF]/.test(char)) return '';
    return char;
}

function buildNormalizedIndex(text, collapseWhitespace) {
    var normalizedChars = [];
    var normToRawStart = [];
    var normToRawEnd = [];
    var lastWasWhitespace = false;

    for (var i = 0; i < text.length; i++) {
        var rawChar = text[i];
        var normalized = normalizeChar(rawChar);
        if (!normalized) continue;

        var isWhitespace = /\s/.test(normalized);
        if (collapseWhitespace && isWhitespace) {
            if (lastWasWhitespace) {
                var last = normToRawEnd.length - 1;
                if (last >= 0) normToRawEnd[last] = i + 1;
                continue;
            }
            normalizedChars.push(' ');
            normToRawStart.push(i);
            normToRawEnd.push(i + 1);
            lastWasWhitespace = true;
            continue;
        }

        normalizedChars.push(normalized);
        normToRawStart.push(i);
        normToRawEnd.push(i + 1);
        lastWasWhitespace = false;
    }

    return {
        normalizedText: normalizedChars.join(''),
        normToRawStart: normToRawStart,
        normToRawEnd: normToRawEnd
    };
}

function countOccurrencesBefore(text, query, limitIndex) {
    if (!query) return 0;
    var count = 0;
    var from = 0;
    while (from <= limitIndex) {
        var idx = text.indexOf(query, from);
        if (idx < 0 || idx >= limitIndex) break;
        count += 1;
        from = idx + 1;
    }
    return count;
}

function buildSelectionCandidates(selectedText) {
    var raw = String(selectedText || '').replace(/\r\n/g, '\n');
    var trimmed = raw.trim();
    var noNbsp = raw.replace(/\u00A0/g, ' ');
    var collapsed = noNbsp.replace(/[ \t\f\v\u00A0]+/g, ' ');
    var collapsedTrimmed = collapsed.trim();
    return [raw, trimmed, noNbsp, collapsed, collapsedTrimmed]
        .filter(function(item, idx, arr) { return item && arr.indexOf(item) === idx; });
}

function findAllMatchRanges(text, query) {
    var ranges = [];
    if (!text || !query) return ranges;
    var from = 0;
    while (from <= text.length - query.length) {
        var idx = text.indexOf(query, from);
        if (idx < 0) break;
        ranges.push({ start: idx, end: idx + query.length });
        from = idx + 1;
    }
    return ranges;
}

function findMatchRangeWithFallback(rawText, query, occurrenceHint) {
    var exactMatches = findAllMatchRanges(rawText, query);
    if (exactMatches.length > 0) {
        var pick = occurrenceHint < exactMatches.length ? occurrenceHint : 0;
        return exactMatches[pick];
    }

    var rawSoft = buildNormalizedIndex(rawText, false);
    var querySoft = buildNormalizedIndex(query, false);
    if (querySoft.normalizedText) {
        var softMatches = findAllMatchRanges(rawSoft.normalizedText, querySoft.normalizedText);
        if (softMatches.length > 0) {
            var pick2 = occurrenceHint < softMatches.length ? occurrenceHint : 0;
            var matched = softMatches[pick2];
            return {
                start: rawSoft.normToRawStart[matched.start],
                end: rawSoft.normToRawEnd[matched.end - 1]
            };
        }
    }

    var rawLoose = buildNormalizedIndex(rawText, true);
    var queryLoose = buildNormalizedIndex(query, true);
    if (!queryLoose.normalizedText) return null;
    var looseMatches = findAllMatchRanges(rawLoose.normalizedText, queryLoose.normalizedText);
    if (looseMatches.length === 0) return null;

    var pick3 = occurrenceHint < looseMatches.length ? occurrenceHint : 0;
    var matched2 = looseMatches[pick3];
    return {
        start: rawLoose.normToRawStart[matched2.start],
        end: rawLoose.normToRawEnd[matched2.end - 1]
    };
}

function highlightTextInElement(root, query, occurrenceHint) {
    if (!root || !query) return null;

    var indexMap = buildTextIndexMap(root);
    if (!indexMap.text) return null;

    var matchedRange = findMatchRangeWithFallback(indexMap.text, query, occurrenceHint || 0);
    if (!matchedRange) return null;

    var startPos = findNodeOffsetByIndex(indexMap, matchedRange.start, false);
    var endPos = findNodeOffsetByIndex(indexMap, matchedRange.end, true);
    if (!startPos || !endPos) return null;

    var range = document.createRange();
    range.setStart(startPos.node, Math.max(0, startPos.offset));
    range.setEnd(endPos.node, Math.max(0, endPos.offset));

    var wrapper = document.createElement('span');
    wrapper.className = 'sync-selection-highlight';
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    return wrapper;
}

function syncSelectionHighlightFromEditor() {
    if (!preview || !editor) return;

    var selection = getEditorSelection();
    var selected = selection.text;

    clearSelectionHighlights();

    var normalized = selected.trim();
    if (!normalized) return;

    var rawEditorContent = editor.value.replace(/\r\n/g, '\n');
    var occurrenceHint = countOccurrencesBefore(rawEditorContent, selected, selection.start);

    var candidates = buildSelectionCandidates(selected);

    var target = null;
    var codeBlocks = preview.querySelectorAll('pre code');
    for (var i = 0; i < codeBlocks.length && !target; i++) {
        for (var j = 0; j < candidates.length && !target; j++) {
            target = highlightTextInElement(codeBlocks[i], candidates[j], occurrenceHint);
        }
    }

    if (!target) {
        for (var k = 0; k < candidates.length && !target; k++) {
            target = highlightTextInElement(preview, candidates[k], occurrenceHint);
        }
    }

    if (!target) {
        for (var m = 0; m < codeBlocks.length && !target; m++) {
            for (var n = 0; n < candidates.length && !target; n++) {
                target = highlightTextInElement(codeBlocks[m], candidates[n], 0);
            }
        }
    }

    if (!target) {
        for (var p = 0; p < candidates.length && !target; p++) {
            target = highlightTextInElement(preview, candidates[p], 0);
        }
    }

    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
}

function processTipCards() {
    if (!preview) return;
    
    var paragraphs = preview.querySelectorAll('p');
    paragraphs.forEach(function(p) {
        var html = p.innerHTML;
        if (html.includes(':::tip')) {
            var content = html.replace(':::tip', '').replace(':::', '').trim();
            if (content) {
                var tipDiv = document.createElement('div');
                tipDiv.className = 'tip';
                tipDiv.innerHTML = content;
                p.replaceWith(tipDiv);
            } else {
                p.remove();
            }
        }
    });
}

// ===== 自定义样式支持 =====
// 与博客正文渲染保持一致：对应 src/plugins/remark-combined.mjs（下划线/模糊/彩虹/拼音）、
// rehype 指令组件（:::quote/:::tip 等容器、::music/::github 卡片）与 GFM 脚注。

function escText(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// :::容器块与行内指令卡片 → HTML（在 marked 解析前预处理）
function preprocessCustomSyntax(markdown) {
    var text = String(markdown || '');

    // :::type[自定义标题] ... ::: 容器（quote 做成与 Momo/正文一致的引用卡片）
    text = text.replace(/^:::(note|tip|important|warning|caution|quote|derivation)(?:\[([^\]]+)\])?[ \t]*\r?\n([\s\S]*?)\r?\n?:::[ \t]*$/gm,
        function (match, type, customTitle, inner) {
            if (type === 'quote') {
                var quoteInner = inner
                    .replace(/<right>/g, '<span class="quote-right">')
                    .replace(/<\/right>/g, '</span>');
                return '<div class="quote">' + marked.parse(quoteInner) + '</div>';
            }
            if (type === 'derivation') {
                return '<div class="card-placeholder">📐 推导容器 —— 发布到博客后以悬浮浮层展示推导过程</div>';
            }
            var title = customTitle || type.toUpperCase();
            return '<div class="' + type + '"><span class="admonition-title">' + escText(title) + '</span>' + marked.parse(inner) + '</div>';
        });

    // ::music{id="..."} / ::github{repo="..."} 卡片占位
    text = text.replace(/^::music\{id="([^"]*)"\}[ \t]*$/gm,
        '<div class="card-placeholder">🎵 音乐卡片（歌曲 ID: $1）—— 发布到博客后显示播放器</div>');
    text = text.replace(/^::github\{repo="([^"]*)"\}[ \t]*$/gm,
        '<div class="card-placeholder">📦 GitHub 卡片（$1）—— 发布到博客后显示仓库信息</div>');

    return text;
}

// 行内自定义样式：与 remark-combined 相同的正则，递归支持嵌套
function transformInlineText(text) {
    if (!text) return '';
    var regex = /\{(.+?)\}\((.+?)\)|!!(.+?)!!|==(.+?)==|\+\+(.+?)\+\+/g;
    var out = '';
    var lastIndex = 0;
    var match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) out += escText(text.slice(lastIndex, match.index));
        if (match[1] !== undefined && match[2] !== undefined) {
            var base = match[1];
            var reading = match[2];
            var inner = '';
            if (reading.indexOf('|') >= 0) {
                var baseChars = Array.from(base);
                var readings = reading.split('|');
                var maxLen = Math.max(baseChars.length, readings.length);
                for (var i = 0; i < maxLen; i++) {
                    inner += escText(baseChars[i] || '') + '<rt>' + escText(readings[i] || '') + '</rt>';
                }
            } else {
                inner = escText(base) + '<rt>' + escText(reading) + '</rt>';
            }
            out += '<ruby>' + inner + '</ruby>';
        } else if (match[3] !== undefined) {
            out += '<span class="spoiler">' + transformInlineText(match[3]) + '</span>';
        } else if (match[4] !== undefined) {
            out += '<span class="rainbow-text">' + transformInlineText(match[4]) + '</span>';
        } else if (match[5] !== undefined) {
            out += '<span class="underline-text">' + transformInlineText(match[5]) + '</span>';
        }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) out += escText(text.slice(lastIndex));
    return out;
}

// 对已渲染的预览 DOM 应用行内自定义样式（跳过代码块与公式）
function applyInlineCustomStyles(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var targets = [];
    var node;
    while ((node = walker.nextNode())) {
        if (!/\{.+?\}\(.+?\)|!![\s\S]+?!!|==[\s\S]+?==|\+\+[\s\S]+?\+\+/.test(node.nodeValue)) continue;
        var el = node.parentElement;
        if (!el) continue;
        if (el.closest('pre, code, .katex, script, style, .footnotes')) continue;
        targets.push(node);
    }
    targets.forEach(function (textNode) {
        var tpl = document.createElement('template');
        tpl.innerHTML = transformInlineText(textNode.nodeValue);
        textNode.replaceWith(tpl.content);
    });
}

// GFM 脚注：收集 [^n]: 定义、替换 [^n] 引用、在文末生成脚注列表
function applyFootnotes(root) {
    if (!root) return;
    var defs = {};
    var order = [];

    var paras = Array.prototype.slice.call(root.querySelectorAll('p'));
    paras.forEach(function (p) {
        var m = (p.textContent || '').trim().match(/^\[\^(\d+)\]:\s*([\s\S]*)$/);
        if (m) {
            defs[m[1]] = p.innerHTML.replace(/^\s*\[\^\d+\]:\s*/, '');
            if (order.indexOf(m[1]) < 0) order.push(m[1]);
            p.remove();
        }
    });
    if (!order.length) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var refNodes = [];
    var n;
    while ((n = walker.nextNode())) {
        if (/\[\^\d+\]/.test(n.nodeValue)) refNodes.push(n);
    }
    var counters = {};
    refNodes.forEach(function (textNode) {
        var value = textNode.nodeValue;
        var regex = /\[\^(\d+)\]/g;
        var out = '';
        var last = 0;
        var m2;
        while ((m2 = regex.exec(value)) !== null) {
            out += escText(value.slice(last, m2.index));
            var num = m2[1];
            counters[num] = (counters[num] || 0) + 1;
            out += '<sup class="footnote-ref"><a href="#pv-fn-' + num + '" id="pv-fnref-' + num + '-' + counters[num] + '" data-footnote-ref>[' + num + ']</a></sup>';
            last = regex.lastIndex;
        }
        out += escText(value.slice(last));
        var tpl = document.createElement('template');
        tpl.innerHTML = out;
        textNode.replaceWith(tpl.content);
    });

    var section = document.createElement('section');
    section.setAttribute('data-footnotes', '');
    section.className = 'footnotes';
    var heading = document.createElement('h2');
    heading.className = 'sr-only';
    heading.textContent = 'Footnotes';
    section.appendChild(heading);
    var ol = document.createElement('ol');
    order.forEach(function (num) {
        var li = document.createElement('li');
        li.id = 'pv-fn-' + num;
        li.innerHTML = '<p>' + (defs[num] || '') + ' <a href="#pv-fnref-' + num + '-1" data-footnote-backref aria-label="Back to reference ' + num + '" class="data-footnote-backref">↩</a></p>';
        ol.appendChild(li);
    });
    section.appendChild(ol);
    root.appendChild(section);
}

function renderMarkdown(markdown) {
    if (!markdown) return '';
    
    try {
        marked.setOptions({
            breaks: true,
            gfm: true,
            smartLists: true,
            smartypants: true,
            xhtml: false
        });
        
        var renderer = new marked.Renderer();
        
        renderer.code = function(code, language) {
            var validLanguage = language && hljs.getLanguage(language) ? language : 'plaintext';
            return '<pre><code class="hljs language-' + validLanguage + '">' + escapeHtml(code) + '</code></pre>';
        };
        
        renderer.listitem = function(text, task, checked) {
            if (task) {
                return '<li class="task-list-item"><input type="checkbox" ' + (checked ? 'checked' : '') + ' disabled> ' + text + '</li>';
            }
            return '<li>' + text + '</li>';
        };
        
        marked.use({ renderer: renderer });
        
        var html = marked.parse(preprocessCustomSyntax(markdown));
        
        if (typeof DOMPurify !== 'undefined') {
            html = DOMPurify.sanitize(html, {
                ALLOWED_TAGS: [
                    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'strong', 'em', 'del', 'a', 'img', 'blockquote',
                    'ul', 'ol', 'li', 'code', 'pre', 'table', 'thead',
                    'tbody', 'tr', 'th', 'td', 'div', 'span', 'input',
                    'sup', 'sub', 'section', 'ruby', 'rt', 'rp'
                ],
                ALLOWED_ATTR: [
                    'href', 'src', 'alt', 'title', 'class', 'id',
                    'type', 'checked', 'disabled', 'language'
                ],
                ALLOWED_CLASSES: {
                    'div': ['tip', 'katex-display'],
                    '*': [
                        'hljs', 'language-*', 'task-list-item',
                        'underline-text', 'spoiler', 'rainbow-text',
                        'quote', 'quote-right',
                        'note', 'important', 'warning', 'caution', 'admonition-title',
                        'card-placeholder', 'footnotes', 'footnote-ref',
                        'sr-only', 'data-footnote-backref'
                    ]
                }
            });
        }
        
        return html;
    } catch (error) {
        console.error('Markdown 渲染失败:', error);
        return '<p style="color: red;">渲染错误: ' + escapeHtml(error.message) + '</p>';
    }
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderMath() {
    if (typeof renderMathInElement === 'undefined' || !preview) return;
    
    try {
        var mathElements = preview.querySelectorAll('p');
        mathElements.forEach(function(p) {
            var text = p.textContent;
            if (text.trim().startsWith('$$') && text.trim().endsWith('$$')) {
                var formula = text.trim().slice(2, -2).trim();
                var div = document.createElement('div');
                div.className = 'katex-display';
                try {
                    katex.render(formula, div, {
                        throwOnError: false,
                        displayMode: true
                    });
                    p.replaceWith(div);
                } catch (e) {
                    console.error('KaTeX 块级公式渲染失败:', e);
                }
            }
        });
        
        renderMathInElement(preview, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false }
            ],
            throwOnError: false,
            errorColor: '#cc0000',
            strict: false
        });
    } catch (error) {
        console.error('KaTeX 渲染失败:', error);
    }
}

function highlightCode() {
    if (typeof hljs === 'undefined' || !preview) return;
    
    try {
        preview.querySelectorAll('pre code').forEach(function(block) {
            hljs.highlightElement(block);
        });
    } catch (error) {
        console.error('代码高亮失败:', error);
    }
}

function updateWordCount() {
    if (!editor || !wordCount) return;
    wordCount.textContent = editor.value.length + ' 字';
}

function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveToStorage, 1000);
}

function saveToStorage() {
    try {
        if (editor) {
            localStorage.setItem('markdown-preview-content', editor.value);
        }
    } catch (e) {}
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    currentTheme = theme;
    
    if (hljsTheme) {
        if (theme === 'dark') {
            hljsTheme.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
        } else {
            hljsTheme.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
        }
    }
    
    if (themeIcon) {
        if (theme === 'dark') {
            themeIcon.innerHTML = '<path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000 1.41.996.996 0 001.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06z"/>';
        } else {
            themeIcon.innerHTML = '<path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>';
        }
    }
    
    try {
        localStorage.setItem('markdown-preview-theme', theme);
    } catch (e) {}
}

function toggleTheme() {
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
}

function handleToolbarAction(action) {
    if (!editor) return;
    
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    var selectedText = editor.value.substring(start, end);
    var replacement = '';
    var selectStart = 0;
    var selectEnd = 0;
    
    switch (action) {
        case 'heading':
            replacement = '## ' + (selectedText || '标题');
            selectStart = start + 3;
            selectEnd = selectStart + (selectedText ? selectedText.length : 2);
            break;
        case 'bold':
            replacement = '**' + (selectedText || '粗体文本') + '**';
            selectStart = start + 2;
            selectEnd = selectStart + (selectedText ? selectedText.length : 4);
            break;
        case 'italic':
            replacement = '*' + (selectedText || '斜体文本') + '*';
            selectStart = start + 1;
            selectEnd = selectStart + (selectedText ? selectedText.length : 4);
            break;
        case 'strikethrough':
            replacement = '~~' + (selectedText || '删除线文本') + '~~';
            selectStart = start + 2;
            selectEnd = selectStart + (selectedText ? selectedText.length : 5);
            break;
        case 'link':
            replacement = '[' + (selectedText || '链接文本') + '](https://example.com)';
            selectStart = start + 1;
            selectEnd = selectStart + (selectedText ? selectedText.length : 4);
            break;
        case 'image':
            replacement = '![' + (selectedText || '图片描述') + '](图片URL)';
            selectStart = start + 2;
            selectEnd = selectStart + (selectedText ? selectedText.length : 4);
            break;
        case 'code':
            if (selectedText.indexOf('\n') >= 0) {
                replacement = '```\n' + (selectedText || '代码块') + '\n```';
                selectStart = start + 4;
                selectEnd = selectStart + (selectedText ? selectedText.length : 3);
            } else {
                replacement = '`' + (selectedText || '行内代码') + '`';
                selectStart = start + 1;
                selectEnd = selectStart + (selectedText ? selectedText.length : 4);
            }
            break;
        case 'quote':
            replacement = '> ' + (selectedText || '引用文本');
            selectStart = start + 2;
            selectEnd = selectStart + (selectedText ? selectedText.length : 4);
            break;
        case 'list':
            replacement = '- ' + (selectedText || '列表项');
            selectStart = start + 2;
            selectEnd = selectStart + (selectedText ? selectedText.length : 3);
            break;
        case 'ordered-list':
            replacement = '1. ' + (selectedText || '列表项');
            selectStart = start + 3;
            selectEnd = selectStart + (selectedText ? selectedText.length : 3);
            break;
        case 'task-list':
            replacement = '- [ ] ' + (selectedText || '待办事项');
            selectStart = start + 6;
            selectEnd = selectStart + (selectedText ? selectedText.length : 4);
            break;
        case 'table':
            replacement = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容1 | 内容2 | 内容3 |';
            selectStart = start;
            selectEnd = start + replacement.length;
            break;
        case 'formula':
            replacement = '$' + (selectedText || '公式') + '$';
            selectStart = start + 1;
            selectEnd = selectStart + (selectedText ? selectedText.length : 2);
            break;
        case 'horizontal-rule':
            replacement = '\n---\n';
            selectStart = start + replacement.length;
            selectEnd = selectStart;
            break;
        default:
            return;
    }
    
    editor.focus();
    editor.setRangeText(replacement, start, end, 'end');
    
    if (!selectedText) {
        editor.setSelectionRange(selectStart, selectEnd);
    }
    
    updatePreview();
    updateWordCount();
    scheduleAutoSave();
}

function handleTabKey(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        var start = editor.selectionStart;
        var end = editor.selectionEnd;
        
        if (e.shiftKey) {
            var lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
            var currentLine = editor.value.substring(lineStart, end);
            if (currentLine.indexOf('    ') === 0) {
                editor.setRangeText('', lineStart, lineStart + 4, 'end');
            } else if (currentLine.indexOf('\t') === 0) {
                editor.setRangeText('', lineStart, lineStart + 1, 'end');
            }
        } else {
            editor.setRangeText('    ', start, end, 'end');
        }
        
        updatePreview();
        scheduleAutoSave();
    }
}

function setViewMode(mode) {
    currentViewMode = mode;
    viewModeBtns.forEach(function(btn) {
        btn.classList.toggle('view-mode-btn--active', btn.dataset.view === mode);
    });
    if (previewTitle) {
        previewTitle.textContent = mode === 'preview' ? '预览' : '源码';
    }
    if (mode === 'source') {
        if (preview) preview.style.display = 'none';
        if (sourceView) {
            sourceView.style.display = 'block';
            sourceView.value = editor ? editor.value : '';
        }
    } else {
        if (preview) preview.style.display = 'block';
        if (sourceView) sourceView.style.display = 'none';
        updatePreview();
    }
}

function exportMarkdown() {
    if (!editor) return;
    
    var content = editor.value;
    if (!content) {
        alert('没有内容可导出！');
        return;
    }
    
    try {
        var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'markdown-' + new Date().toISOString().slice(0, 10) + '.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败: ' + error.message);
    }
}

function returnToAdmin() {
    if (!editor) return;
    
    var content = editor.value;
    if (!content) {
        alert('没有内容可回填！');
        return;
    }
    
    try {
        localStorage.setItem('cmchen_admin_preview_result', JSON.stringify({
            content: content,
            updatedAt: Date.now()
        }));
        localStorage.setItem('markdown-preview-content', content);
        
        alert('内容已回填到后台，请返回后台页面点击「从预览回填」。');
        
        if (adminReturnUrl) {
            // 只允许相对路径或同源 URL，防止开放重定向
            if (/^\/[^/]/.test(adminReturnUrl) || /^https?:\/\//.test(adminReturnUrl) === false && adminReturnUrl.indexOf('//') !== 0) {
                window.location.href = adminReturnUrl;
            } else {
                // 绝对 URL 需校验同源
                try {
                    var target = new URL(adminReturnUrl, window.location.origin);
                    if (target.origin === window.location.origin) {
                        window.location.href = adminReturnUrl;
                    } else {
                        console.warn('[admin-preview] 拒绝跳转到外部地址:', adminReturnUrl);
                        window.close();
                    }
                } catch (e) {
                    console.warn('[admin-preview] 无效的返回地址:', adminReturnUrl);
                    window.close();
                }
            }
        } else {
            window.close();
        }
    } catch (error) {
        console.error('回填失败:', error);
        alert('回填失败: ' + error.message);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}