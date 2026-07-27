import type { NarrativeBlock, ReportOutlineItem } from '../../shared/report-bundle.js';

export function parseMarkdownOutline(markdown: string): ReportOutlineItem[] {
  const outline: ReportOutlineItem[] = [];
  const seen = new Map<string, number>();
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const title = match[2].trim();
    if (level > 3) continue;
    let id = slugify(title);
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;
    outline.push({ id, title, level });
  }
  return outline;
}

export function parseUnitySingleNarrative(markdown: string): {
  headline: string;
  summaryBullets: string[];
  caveats: string[];
  hotspotNarratives: Record<string, string>;
  sections: NarrativeBlock[];
} {
  const headline = extractBlockquoteParagraph(markdown, 0) ?? '';
  const caveats = extractBlockquoteParagraphs(markdown).slice(1);

  const summarySection = extractSection(markdown, /## 二、核心结论/);
  const summaryBullets = summarySection
    ? summarySection
        .split('\n')
        .filter(line => line.trim().startsWith('- **'))
        .map(line => line.replace(/^-\s*/, '').trim())
    : [];

  const hotspotNarratives: Record<string, string> = {};
  const hotspotRegex = /### 热点 #(\d+)：([^\n]+)\n([\s\S]*?)(?=\n### |\n## |\n---|$)/g;
  let match: RegExpExecArray | null;
  while ((match = hotspotRegex.exec(markdown)) !== null) {
    const [, num, title, body] = match;
    hotspotNarratives[`hotspot-${num}`] = body.trim();
    hotspotNarratives[title.trim()] = body.trim();
  }

  const sections: NarrativeBlock[] = [];
  const sectionRegex = /^## ([^\n]+)\n([\s\S]*?)(?=^## |\n---\n*$)/gm;
  while ((match = sectionRegex.exec(markdown)) !== null) {
    const title = match[1].trim();
    const content = match[2].trim();
    if (!content || title.includes('概览')) continue;
    sections.push({
      id: slugify(title),
      title,
      content: stripTablesAndCodeBlocks(content),
    });
  }

  return { headline, summaryBullets, caveats, hotspotNarratives, sections };
}

function extractBlockquoteParagraph(markdown: string, index: number): string | undefined {
  return extractBlockquoteParagraphs(markdown)[index];
}

function extractBlockquoteParagraphs(markdown: string): string[] {
  const lines = markdown.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('> ')) {
      current.push(line.slice(2).trim());
      continue;
    }
    if (line.startsWith('>')) {
      current.push(line.slice(1).trim());
      continue;
    }
    if (current.length > 0) {
      paragraphs.push(current.join(' ').trim());
      current = [];
    }
  }
  if (current.length > 0) paragraphs.push(current.join(' ').trim());
  return paragraphs.filter(Boolean);
}

function extractSection(markdown: string, heading: RegExp): string | undefined {
  const idx = markdown.search(heading);
  if (idx < 0) return undefined;
  const rest = markdown.slice(idx);
  const end = rest.search(/\n## |\n---/);
  return end > 0 ? rest.slice(rest.indexOf('\n') + 1, end).trim() : rest.slice(rest.indexOf('\n') + 1).trim();
}

function stripTablesAndCodeBlocks(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\|.+\|$/gm, '')
    .replace(/^\|[-| :]+\|$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slugify(title: string): string {
  return title
    .replace(/§\d+/g, '')
    .replace(/[、，。：]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
