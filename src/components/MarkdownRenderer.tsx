import React from 'react';

function isSafeHref(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Image: ![alt](url)
    const imgMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      const safe = isSafeHref(imgMatch[2]);
      if (safe) {
        tokens.push(
          <img
            key={key++}
            src={safe}
            alt={imgMatch[1]}
            referrerPolicy="no-referrer"
            className="my-6 rounded-lg border border-[#1C241E]/10 max-h-[480px] w-auto object-cover"
          />,
        );
      }
      remaining = remaining.slice(imgMatch[0].length);
      continue;
    }

    // Link: [label](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const safe = isSafeHref(linkMatch[2]);
      if (safe) {
        const isExternal = safe.startsWith('http');
        tokens.push(
          <a
            key={key++}
            href={safe}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="text-[#214029] underline decoration-[#214029]/40 underline-offset-4 hover:decoration-[#214029]"
          >
            {renderInline(linkMatch[1])}
          </a>,
        );
      } else {
        tokens.push(linkMatch[1]);
      }
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Inline code: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      tokens.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-[#EAE6DC] font-mono text-[0.875em] text-[#1C241E]"
        >
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold: **text**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      tokens.push(
        <strong key={key++} className="font-semibold text-[#162118]">
          {renderInline(boldMatch[1])}
        </strong>,
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      tokens.push(
        <em key={key++} className="italic">
          {renderInline(italicMatch[1])}
        </em>,
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Consume plain text up to next special token
    const nextSpecial = remaining.slice(1).search(/[!\[`*]/) + 1;
    if (nextSpecial <= 0) {
      tokens.push(remaining);
      break;
    }
    tokens.push(remaining.slice(0, nextSpecial));
    remaining = remaining.slice(nextSpecial);
  }

  return tokens;
}

interface MarkdownRendererProps {
  content: string;
  dropCap?: boolean;
}

export function MarkdownRenderer({ content, dropCap = true }: MarkdownRendererProps) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let firstParagraphRendered = false;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const langLabel = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <pre
          key={blockKey++}
          className="my-6 p-4 rounded-lg bg-[#1A231C] text-[#E9ECE6] font-mono text-sm overflow-x-auto leading-relaxed"
          aria-label={langLabel || 'Code'}
        >
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      if (level === 1) {
        blocks.push(
          <h2 key={blockKey++} className="font-display text-2xl sm:text-3xl font-semibold text-[#1C241E] mt-10 mb-4">
            {renderInline(text)}
          </h2>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={blockKey++} className="font-display text-2xl font-semibold text-[#1C241E] mt-9 mb-3.5">
            {renderInline(text)}
          </h2>,
        );
      } else if (level === 3) {
        blocks.push(
          <h3 key={blockKey++} className="font-display text-xl font-semibold text-[#1C241E] mt-7 mb-3">
            {renderInline(text)}
          </h3>,
        );
      } else {
        blocks.push(
          <h4 key={blockKey++} className="font-display text-lg font-semibold text-[#1C241E] mt-6 mb-2">
            {renderInline(text)}
          </h4>,
        );
      }
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={blockKey++} className="my-8 border-t border-[#1C241E]/15" />);
      i++;
      continue;
    }

    // Blockquote (editorial pull quote without thick left accent bar)
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={blockKey++}
          className="my-8 py-5 px-2 border-y border-[#1C241E]/15 font-display italic text-xl sm:text-2xl text-[#243227] leading-relaxed"
        >
          {renderInline(quoteLines.join(' '))}
        </blockquote>,
      );
      continue;
    }

    // Markdown Table
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])
    ) {
      const parseRow = (rowLine: string) =>
        rowLine
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const headers = parseRow(line);
      i += 2; // skip header & separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(parseRow(lines[i]));
        i++;
      }

      blocks.push(
        <div key={blockKey++} className="my-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-[#1C241E]/15">
            <thead>
              <tr className="bg-[#EAE6DC]">
                {headers.map((h, idx) => (
                  <th
                    key={idx}
                    className="text-left px-3.5 py-2.5 font-semibold text-[#1C241E] border-b border-[#1C241E]/15"
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rIdx) => (
                <tr key={rIdx} className="border-b border-[#1C241E]/10">
                  {r.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2.5 text-[#2E3A30] tabular-nums">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={blockKey++} className="my-5 pl-6 list-disc space-y-2 text-[#263228] leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={blockKey++} className="my-5 pl-6 list-decimal space-y-2 text-[#263228] leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Standalone image line
    const soloImg = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (soloImg) {
      const safe = isSafeHref(soloImg[2]);
      if (safe) {
        blocks.push(
          <figure key={blockKey++} className="my-7">
            <img
              src={safe}
              alt={soloImg[1]}
              referrerPolicy="no-referrer"
              className="w-full max-h-[500px] object-cover rounded-xl border border-[#1C241E]/10"
            />
            {soloImg[1] && (
              <figcaption className="mt-2 text-xs text-[#546357] italic">
                {soloImg[1]}
              </figcaption>
            )}
          </figure>,
        );
      }
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('```') &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    const useDropCap = dropCap && !firstParagraphRendered;
    firstParagraphRendered = true;
    blocks.push(
      <p
        key={blockKey++}
        className={`my-5 text-[17px] leading-[1.82] text-[#243026] ${
          useDropCap ? 'editorial-dropcap' : ''
        }`}
      >
        {renderInline(paraLines.join(' '))}
      </p>,
    );
  }

  return <div className="max-w-none">{blocks}</div>;
}
