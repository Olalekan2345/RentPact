import type { ReactNode } from "react";

/**
 * Tiny purpose-built renderer for the Constitution's markdown — regular
 * enough (headings, bold clause numbers, bullet lists, hr dividers) that a
 * full markdown dependency isn't worth adding for one document.
 */

function parseInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function ConstitutionDocument({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.trim() === "---") {
      blocks.push(<hr key={key++} className="my-8 border-forest-100" />);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(
        <h1 key={key++} className="font-serif text-4xl text-ink">
          {line.slice(2)}
        </h1>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={key++} className="mt-10 font-serif text-2xl text-forest-600">
          {line.slice(3)}
        </h2>,
      );
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <ul key={key++} className="mt-3 flex list-disc flex-col gap-1.5 pl-6 leading-relaxed text-ink-muted">
          {items.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && lines[i].trim() !== "---" && !lines[i].startsWith("#") && !lines[i].startsWith("- ")) {
      paraLines.push(lines[i]);
      i++;
    }
    const text = paraLines.join(" ");
    const isFooter = text.startsWith("*") && text.endsWith("*") && !text.startsWith("**");
    blocks.push(
      <p key={key++} className={isFooter ? "mt-6 text-sm italic text-ink-soft" : "mt-3 leading-relaxed text-ink-muted"}>
        {parseInline(isFooter ? text.slice(1, -1) : text)}
      </p>,
    );
  }

  return <div className="max-w-none">{blocks}</div>;
}
