"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

export type HeaderPanelKind = "search" | "pins" | "notifications" | "invite" | "voice";

export function HeaderPanel({
  kind,
  label,
  style,
  children,
}: {
  kind: HeaderPanelKind;
  label: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <motion.section
      id={`workspace-header-${kind}`}
      data-header-panel={kind}
      data-tauri-drag-region="false"
      role="dialog"
      aria-label={label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      className="siq-header-panel"
      style={style}
    >
      {children}
    </motion.section>
  );
}
