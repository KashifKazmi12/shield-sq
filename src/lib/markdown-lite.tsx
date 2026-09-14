import type { ReactNode } from "react";

// Minimal, dependency-free renderer for the small subset of markdown LLMs
// commonly emit in short answers: **bold**, `code`, and "* "/"- " bullet
// lists. Never uses dangerouslySetInnerHTML — everything stays as React
// text nodes, so there's no HTML-injection surface even though the source
// text is untrusted model output.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((p) => p !== "");
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

const BULLET_RE = /^[*-]\s+/;

export function renderMarkdownLite(content: string): ReactNode {
  const blocks = content.trim().split(/\n{2,}/);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const isList = lines.length > 0 && lines.every((l) => BULLET_RE.test(l.trim()));

    if (isList) {
      return (
        <ul key={blockIndex} className="ai-chat-md-list">
          {lines.map((line, i) => (
            <li key={i}>{renderInline(line.trim().replace(BULLET_RE, ""), `${blockIndex}-${i}`)}</li>
          ))}
        </ul>
      );
    }

    return (
      <p key={blockIndex} className="ai-chat-md-p">
        {lines.map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {renderInline(line, `${blockIndex}-${i}`)}
          </span>
        ))}
      </p>
    );
  });
}
