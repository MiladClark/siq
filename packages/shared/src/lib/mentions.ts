const messageToken = /^ {0,3}(?<fence>`{3,})(?<info>[^`\r\n]*)\r?\n(?<code>[\s\S]*?)^ {0,3}\k<fence>`*[ \t]*(?=\r?$)|(?<link>https?:\/\/[^\s`]+)|(?<!`)`(?<inline>[^`\r\n]+)`(?!`)|(?<mention>(?<![\p{L}\p{N}\p{M}_@.-])@[a-z0-9_-]{1,32}(?![\p{L}\p{N}\p{M}_@-]))/gimu;

type MessagePart =
  | { kind: "text" | "link" | "mention" | "inline-code"; text: string }
  | { kind: "code"; text: string; language: string; filename: string };

export function splitMessageText(text: string) {
  const parts: MessagePart[] = [];
  let offset = 0;
  for (const match of text.matchAll(messageToken)) {
    const start = match.index;
    if (start > offset) parts.push({ kind: "text", text: text.slice(offset, start) });
    const { code, info, inline, link } = match.groups!;
    if (code !== undefined) {
      const [language, ...filename] = info.trim().split(":");
      parts.push({
        kind: "code",
        text: code.replace(/\r?\n$/, ""),
        language: language.trim(),
        filename: filename.join(":").trim(),
      });
    } else if (inline !== undefined) {
      parts.push({ kind: "inline-code", text: inline });
    } else {
      parts.push({ kind: link ? "link" : "mention", text: match[0] });
    }
    offset = start + match[0].length;
  }
  if (offset < text.length) parts.push({ kind: "text", text: text.slice(offset) });
  return parts;
}

export function mentionsUsername(text: string, username: string) {
  const handle = `@${username.toLowerCase()}`;
  return splitMessageText(text).some(
    (part) => part.kind === "mention" && part.text.toLowerCase() === handle
  );
}

export function getMentionDraft(text: string, caret: number) {
  const beforeCaret = text.slice(0, caret);
  const match = beforeCaret.match(/(?<![\p{L}\p{N}\p{M}_@.-])@([a-z0-9_-]{0,32})$/iu);
  if (!match || /https?:\/\/[^\s]*$/i.test(beforeCaret)) return null;

  const suffix = text.slice(caret).match(/^[a-z0-9_-]*/i)?.[0] ?? "";
  return { start: caret - match[0].length, end: caret + suffix.length, query: match[1].toLowerCase() };
}
