"use client";

import { Hash, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useState } from "react";
import { useSystemNotify } from "@/components/ui/NotificationCenter";
import type { ChannelItem } from "@/lib/types";

interface ChannelModalProps {
  open: boolean;
  defaultType?: "text" | "voice";
  editingChannel?: ChannelItem | null;
  onClose: () => void;
  onSaved: (channel: ChannelItem, isEdit: boolean) => void;
}

export function ChannelModal({
  open,
  defaultType = "text",
  editingChannel = null,
  onClose,
  onSaved,
}: ChannelModalProps) {
  const notify = useSystemNotify();
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">(defaultType);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingChannel) {
      setName(editingChannel.name);
      setType(editingChannel.type);
      setDescription(editingChannel.description ?? "");
    } else {
      setName("");
      setType(defaultType);
      setDescription("");
    }
  }, [open, defaultType, editingChannel]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const isEdit = Boolean(editingChannel);
      const url = isEdit ? `/api/channels/${editingChannel!.id}` : "/api/channels";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit ? { name, description } : { name, type, description };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Channel Error",
          message: data.error ?? "Failed to save channel.",
          source: "Channels",
        });
        setSaving(false);
        return;
      }

      onSaved(data.channel, isEdit);
      onClose();
    } catch {
      notify({
        kind: "error",
        title: "Channel Error",
        message: "Network error while saving channel.",
        source: "Channels",
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
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#121316] shadow-2xl shadow-black/70"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <h2 id="channel-modal-title" className="text-sm font-semibold text-zinc-100">
                {editingChannel ? "Edit channel" : "Create channel"}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              {!editingChannel && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-zinc-300">Channel type</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setType("text")}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                        type === "text"
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-white/[0.08] bg-[#18191E] text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Hash className="h-4 w-4" />
                      <div>
                        <div>Text</div>
                        <div className="text-[10px] font-normal text-zinc-500">
                          Chat &amp; files
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setType("voice")}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                        type === "voice"
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-white/[0.08] bg-[#18191E] text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Volume2 className="h-4 w-4" />
                      <div>
                        <div>Voice</div>
                        <div className="text-[10px] font-normal text-zinc-500">
                          Audio, cam, screen
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="channel-name" className="block text-xs font-medium text-zinc-300">
                  Channel name
                </label>
                <input
                  id="channel-name"
                  type="text"
                  dir="auto"
                  required
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={type === "text" ? "memes or گپ" : "Squad Room"}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="channel-desc" className="block text-xs font-medium text-zinc-300">
                  Topic (optional)
                </label>
                <input
                  id="channel-desc"
                  type="text"
                  dir="auto"
                  maxLength={160}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this channel for?"
                  className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-white/[0.1] px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingChannel ? "Save changes" : "Create channel"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
