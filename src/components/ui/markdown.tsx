import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe Markdown renderer for model output. Builds React elements
 * from text (no HTML injection). Supports paragraphs, bullet and numbered
 * lists, **bold**, *italic*, `code`, fenced code blocks, simple tables and
 * #-headings.
 */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={key++}>{body.join("\n")}</pre>);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <table key={key++}>
          <thead>
            <tr>{head.map((h, j) => <th key={j}>{inline(h, `th${j}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `td${ri}-${ci}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(<h4 key={key++}>{inline(heading[1], `h${key}`)}</h4>);
      i++;
      continue;
    }
    if (/^\s*(?:[-*•])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*(?:[-*•])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*(?:[-*•])\s+/, ""));
      blocks.push(
        <ul key={key++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `li${key}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={key++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `ol${key}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i]) && !lines[i].trim().startsWith("```") && !/^#{1,6}\s/.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={key++}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 ? <br /> : null}
            {inline(p, `p${key}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="prose-output">{blocks}</div>;
}
