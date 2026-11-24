"use client";

import { Fragment, useEffect, useState } from "react";
import type { BundledLanguage, ThemedToken } from "shiki/bundle/web";
import { AnimatedIconButton } from "@/components/ui/AnimatedIcon";
import { CheckIcon, CopyIcon } from "@/components/ui/animated-icons";
import { playSound } from "@/lib/sounds";

export function ChatCodeBlock({ code, language, filename, lineNumbers = false }: {
  code: string;
  language: string;
  filename: string;
  lineNumbers?: boolean;
}) {
  const [highlight, setHighlight] = useState<{ code: string; language: string; lines: ThemedToken[][] } | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (!language || !code) return;
    let active = true;
    const lang = language.toLowerCase() as BundledLanguage;
    async function highlightCode() {
      try {
        const { codeToTokensBase, bundledLanguages } = await import("shiki/bundle/web");
        if (!active || !Object.hasOwn(bundledLanguages, lang)) return;
        const lines = await codeToTokensBase(code, { lang, theme: "github-dark-default" });
        if (active) setHighlight({ code, language, lines });
      } catch {
        // Plain text is rendered while the highlighter is unavailable.
      }
    }
    void highlightCode();
    return () => { active = false; };
  }, [code, language]);

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      playSound("copy");
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const lines = highlight?.code === code && highlight.language === language ? highlight.lines : null;
  return (
    <div dir="ltr" className="my-1.5 min-w-0 overflow-hidden rounded-xl border border-white/[0.1] bg-[#0d0f13] text-left">
      <div className="flex min-h-9 items-center gap-2 border-b border-white/[0.08] bg-[#17191e] px-2.5">
        <span className="max-w-[60%] shrink-0 truncate rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-300">
          {language || "text"}
        </span>
        {filename && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400" title={filename}>{filename}</span>}
        <AnimatedIconButton
          icon={copyStatus === "copied" ? CheckIcon : CopyIcon}
          iconSize={14}
          title="Copy code"
          aria-label="Copy code"
          onClick={() => void copyCode()}
          className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.05]"
        >
          <span aria-live="polite">{copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy"}</span>
        </AnimatedIconButton>
      </div>
      <pre tabIndex={0} className="max-h-80 overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre text-zinc-200 focus-visible:outline-emerald-400">
        <code>
          {(lines ?? code.split(/\r?\n/)).map((line, index) => (
            <Fragment key={index}>
              {index > 0 && "\n"}
              {lineNumbers && <span aria-hidden="true" className="mr-3 inline-block w-[2ch] text-right text-zinc-500 select-none">{index + 1}</span>}
              {typeof line === "string" ? line : line.map((token, tokenIndex) => (
                <span key={tokenIndex} style={{ color: token.color }}>{token.content}</span>
              ))}
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}
