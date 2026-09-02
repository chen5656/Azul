/**
 * Rendering one guide page from its markdown source.
 *
 * Shared so the static build (`scripts/seo-build.mjs`) and the dev-server
 * middleware (`seo/devGuides.mjs`) cannot drift: a guide must look the same
 * during `vite dev` as it does in `dist/`.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, renderMarkdown } from './markdown.mjs';
import { guidePage, absolute } from './template.mjs';
import { ORIGIN, SITE_NAME, guidePath, legalPath } from './site.mjs';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'content');

export const GUIDES_DIR = join(CONTENT_DIR, 'guides');
export const LEGAL_DIR = join(CONTENT_DIR, 'legal');

export function breadcrumbs(path, title) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: ORIGIN },
      { '@type': 'ListItem', position: 2, name: 'Guide', item: absolute('/guide') },
      ...(path === '/guide'
        ? []
        : [{ '@type': 'ListItem', position: 3, name: title, item: absolute(path) }]),
    ],
  };
}

/**
 * Turns `## question` + the HTML that follows into FAQPage entities. The answer
 * text is the rendered block with tags stripped, so the markup and the
 * structured data can never drift apart.
 */
export function faqStructuredData(html) {
  const parts = html.split(/<h2 id="[^"]*">/).slice(1);
  const entities = parts
    .map((part) => {
      const [question, ...rest] = part.split('</h2>');
      const answer = rest
        .join('</h2>')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!question || !answer) return null;
      return {
        '@type': 'Question',
        name: question.replace(/<[^>]+>/g, '').trim(),
        acceptedAnswer: { '@type': 'Answer', text: answer },
      };
    })
    .filter(Boolean);
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities };
}

/** `'rules'` -> the complete HTML document for `/guide/rules`. */
export async function renderGuide(slug) {
  const source = await readFile(join(GUIDES_DIR, `${slug}.md`), 'utf8');
  const { data, body } = parseFrontmatter(source);
  if (!data.title || !data.description) {
    throw new Error(`seo: content/guides/${slug}.md needs a title and a description`);
  }
  const path = guidePath(slug);
  const { html, headings } = renderMarkdown(body);
  const structuredData = [breadcrumbs(path, data.title)];
  if (data.faq === 'true') structuredData.push(faqStructuredData(html));

  return {
    path,
    html: guidePage({
      path,
      title: data.title,
      description: data.description,
      headings,
      html,
      updated: data.updated ?? new Date().toISOString().slice(0, 10),
      structuredData,
    }),
  };
}

/**
 * `'privacy'` -> the complete HTML document for `/privacy`.
 *
 * `updated` is required rather than defaulted to today's date: a policy that
 * silently restamps itself on every deploy tells the reader nothing about when
 * the terms they are agreeing to last changed.
 */
export async function renderLegal(slug) {
  const source = await readFile(join(LEGAL_DIR, `${slug}.md`), 'utf8');
  const { data, body } = parseFrontmatter(source);
  if (!data.title || !data.description || !data.updated) {
    throw new Error(`seo: content/legal/${slug}.md needs a title, a description and an updated date`);
  }
  const path = legalPath(slug);
  const { html, headings } = renderMarkdown(body);

  return {
    path,
    html: guidePage({
      path,
      title: data.title,
      description: data.description,
      headings,
      html,
      updated: data.updated,
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: SITE_NAME, item: ORIGIN },
            { '@type': 'ListItem', position: 2, name: data.title, item: absolute(path) },
          ],
        },
      ],
      crumbs: [],
    }),
  };
}
