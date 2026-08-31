/**
 * A markdown subset, just large enough for the guide pages.
 *
 * Deliberately not `marked`: the guides use headings, paragraphs, lists,
 * tables, links, emphasis and inline code, and a dependency that renders the
 * other 90% of CommonMark is not worth auditing for six static files.
 * Anything unsupported is passed through escaped, so a mistake shows up as
 * visible text rather than as broken markup.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/** Inline spans. Runs on already-escaped text, so it can only add markup. */
function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Splits `---` frontmatter off the top. Values are plain scalars — the guides
 * need `title`, `description` and `updated`, not nested YAML.
 */
export function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line.trim());
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { data, body: source.slice(match[0].length) };
}

/**
 * Renders a block-level markdown subset.
 * Returns the HTML plus the `h2` headings, which the template turns into an
 * on-page table of contents and the FAQ page turns into JSON-LD questions.
 */
export function renderMarkdown(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  const headings = [];
  let i = 0;

  const flushList = (tag, isOrdered) => {
    const items = [];
    const pattern = isOrdered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
    while (i < lines.length && pattern.test(lines[i])) {
      items.push(`<li>${inline(pattern.exec(lines[i])[1])}</li>`);
      i += 1;
    }
    out.push(`<${tag}>${items.join('')}</${tag}>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const id = slugify(text);
      if (level === 2) headings.push({ id, text });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushList('ul', false);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushList('ol', true);
      continue;
    }

    // A table: a header row, a separator, then body rows.
    if (line.startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (row) =>
        row
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
      const head = cells(line).map((c) => `<th>${inline(c)}</th>`).join('');
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(`<tr>${cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
        i += 1;
      }
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`,
      );
      continue;
    }

    if (line.startsWith('> ')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quote.push(lines[i].slice(2));
        i += 1;
      }
      out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
      continue;
    }

    // Otherwise a paragraph: consecutive non-blank lines that start no block.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{2,4}\s|>\s|\||\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return { html: out.join('\n'), headings };
}
