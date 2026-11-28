"use client";

import { apiFetch } from "@/lib/client-api";
import { FolderPlus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useState } from "react";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import type { CategoryItem } from "@siq/shared/lib/types";

const HEADER_TILE =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-emerald-500/[0.04] text-emerald-300 ring-1 ring-inset ring-emerald-400/30 shadow-[0_10px_24px_-10px_rgb(var(--siq-accent-rgb)/0.8),inset_0_1px_0_rgb(255_255_255/0.12)]";

const FIELD =
  "w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-white/[0.14] focus:border-emerald-500/50 focus:bg-black/35 focus:outline-none focus:ring-4 focus:ring-emerald-500/10";

interface CategoryModalProps {
  open: boolean;
  serverId: string | null;
  editingCategory?: CategoryItem | null;
  onClose: () => void;
  onSaved: (category: CategoryItem, isEdit: boolean) => void;
}

export function CategoryModal({
  open,
  serverId,
  editingCategory = null,
  onClose,
  onSaved,
}: CategoryModalProps) {
  const notify = useSystemNotify();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editingCategory?.name ?? "");
  }, [open, editingCategory]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!serverId || !name.trim() || saving) return;
    setSaving(true);
    try {
      const isEdit = Boolean(editingCategory);
      const url = isEdit
        ? `/api/servers/${serverId}/categories/${editingCategory!.id}`
        : `/api/servers/${serverId}/categories`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Category Error",
          message: data.error ?? "Failed to save category.",
          source: "Categories",
        });
        return;
      }

      if (data.category) {
        onSaved(data.category, isEdit);
      }
      onClose();
    } catch {
      notify({
        kind: "error",
        title: "Category Error",
        message: "Network error saving category.",
        source: "Categories",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="siq-backdrop fixed inset-0 z-[85] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingCategory ? "Rename category" : "Create category"}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="siq-glass siq-edge-light relative w-full max-w-sm overflow-hidden rounded-3xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.035] to-transparent px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={HEADER_TILE}>
                  <FolderPlus className="h-4 w-4" />
                </span>
                <h2 className="truncate text-[15px] font-bold tracking-tight text-zinc-50">
                  {editingCategory ? "Rename Category" : "Create Category"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="siq-icon-btn shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div className="space-y-2">
                <label htmlFor="cat-name" className="block text-xs font-semibold text-zinc-300">
                  Category name
                </label>
                <input
                  id="cat-name"
                  type="text"
                  dir="auto"
                  required
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. MAN CAVE, GAMING, ARCHIVE"
                  className={FIELD}
                />
              </div>

              <div className="-mx-5 -mb-5 flex justify-end gap-2 border-t border-white/[0.06] bg-black/20 px-5 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="siq-press rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="siq-cta !rounded-xl px-5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingCategory ? "Rename" : "Create"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
