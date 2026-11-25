"use client";

import { apiFetch } from "@/lib/client-api";
import { FolderPlus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useState } from "react";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import type { CategoryItem } from "@siq/shared/lib/types";

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
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label={editingCategory ? "Rename category" : "Create category"}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.17, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-white/[0.1] bg-[#121316] shadow-2xl shadow-black/75"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-2">
                <FolderPlus className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  {editingCategory ? "Rename Category" : "Create Category"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div className="space-y-1.5">
                <label htmlFor="cat-name" className="block text-xs font-medium text-zinc-300">
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
                  className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-white/[0.1] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
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
