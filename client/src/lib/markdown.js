function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline formatting only: bold, italic, and [text](url) links (http/https/mailto
 * only). Escapes the source first, then inserts a fixed set of whitelisted tags —
 * safe to dangerouslySetInnerHTML without a separate sanitizer since no raw HTML
 * from the source ever survives. */
export function renderMarkdownInline(text) {
  let html = escapeHtml(text || '');
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_, label, url) => {
      const external = !url.startsWith('mailto:');
      return `<a href="${url}"${external ? ' target="_blank" rel="noreferrer"' : ''}>${label}</a>`;
    }
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  return html;
}

/** Block-level markdown: paragraphs (blank-line separated), "- "/"* " bullet
 * lists, plus the inline formatting above. Enough for admin-authored trip
 * copy without pulling in a markdown dependency. */
export function renderMarkdown(source) {
  const lines = (source || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let listItems = null;
  let paraLines = [];

  const flushPara = () => {
    if (paraLines.length) {
      blocks.push(`<p>${paraLines.map(renderMarkdownInline).join('<br />')}</p>`);
      paraLines = [];
    }
  };
  const flushList = () => {
    if (listItems) {
      blocks.push(`<ul>${listItems.map((i) => `<li>${renderMarkdownInline(i)}</li>`).join('')}</ul>`);
      listItems = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bullet = /^[-*]\s+(.*)/.exec(line);
    if (bullet) {
      flushPara();
      listItems = listItems || [];
      listItems.push(bullet[1]);
    } else if (line === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      paraLines.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks.join('');
}
