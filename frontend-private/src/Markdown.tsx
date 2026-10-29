import { Fragment, type ReactNode } from 'react';

// A small Markdown renderer for task descriptions, GitHub issues and the
// assistant's replies. It builds React elements (never HTML strings), so text
// from GitHub or the model can't inject markup. Supports headings, paragraphs,
// lists (with task checkboxes), blockquotes, fenced code, tables, rules, and
// inline code, bold, italic, strikethrough and http(s) links.

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: code spans first so their contents stay literal.
  const pattern =
    /(`+)([^`]+?)\1|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${m.index}`;
    if (m[2] !== undefined) out.push(<code key={k}>{m[2]}</code>);
    else if (m[3] !== undefined) {
      out.push(
        SAFE_URL.test(m[4]) ? (
          <a key={k} href={m[4]} target="_blank" rel="noreferrer noopener">
            {inline(m[3], m.index)}
          </a>
        ) : (
          m[0]
        ),
      );
    } else if (m[5] !== undefined || m[6] !== undefined) out.push(<strong key={k}>{inline(m[5] ?? m[6], m.index)}</strong>);
    else if (m[7] !== undefined) out.push(<del key={k}>{inline(m[7], m.index)}</del>);
    else if (m[8] !== undefined || m[9] !== undefined) out.push(<em key={k}>{inline(m[8] ?? m[9], m.index)}</em>);
    else if (m[10] !== undefined) {
      out.push(
        <a key={k} href={m[10]} target="_blank" rel="noreferrer noopener">
          {m[10]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function blocks(lines: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = i;

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      out.push(
        <pre key={key}>
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6);
      const Tag = `h${level}` as 'h3';
      out.push(<Tag key={key}>{inline(heading[2], key)}</Tag>);
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(<hr key={key} />);
      i++;
      continue;
    }

    if (line.trim().startsWith('>')) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) quoted.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push(<blockquote key={key}>{blocks(quoted)}</blockquote>);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        <div className="md-table" key={key}>
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, j)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {head.map((_, j) => (
                    <td key={j}>{inline(r[j] ?? '', j)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const indent = item[1].length;
      const items: { text: string; children: string[] }[] = [];
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (m && m[1].length <= indent) {
          items.push({ text: m[3], children: [] });
          i++;
        } else if (items.length && lines[i].trim() && /^\s+/.test(lines[i])) {
          // Indented continuation or a nested list.
          items[items.length - 1].children.push(lines[i].slice(Math.min(indent + 2, lines[i].search(/\S/))));
          i++;
        } else break;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      out.push(
        <ListTag key={key}>
          {items.map((it, j) => {
            const task = /^\[([ xX])\]\s+(.*)$/.exec(it.text);
            return (
              <li key={j} className={task ? 'md-task' : undefined}>
                {task ? (
                  <>
                    <input type="checkbox" checked={task[1] !== ' '} readOnly disabled /> {inline(task[2], j)}
                  </>
                ) : (
                  inline(it.text, j)
                )}
                {it.children.length > 0 && blocks(it.children)}
              </li>
            );
          })}
        </ListTag>,
      );
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) &&
      !(para.length && LIST_ITEM.test(lines[i]))
    ) {
      para.push(lines[i++]);
    }
    out.push(
      <p key={key}>
        {para.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l, j)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={`markdown${className ? ` ${className}` : ''}`}>{blocks(text.replace(/\r\n?/g, '\n').split('\n'))}</div>;
}
