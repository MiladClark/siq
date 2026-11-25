"use client";

import { apiFetch } from "@/lib/client-api";
import { Folder, Hash, Lock, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useState } from "react";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import { SelectDropdown } from "@siq/shared/components/ui/SelectDropdown";
import type { CategoryItem, ChannelItem, RoleItem } from "@siq/shared/lib/types";

interface ChannelModalProps {
  open: boolean;
  serverId?: string | null;
  defaultType?: "text" | "voice";
  defaultCategoryId?: string | null;
  categories?: CategoryItem[];
  roles?: RoleItem[];
  editingChannel?: ChannelItem | null;
  onClose: () => void;
  onSaved: (channel: ChannelItem, isEdit: boolean) => void;
}

export function ChannelModal({
  open,
  serverId = null,
  defaultType = "text",
  defaultCategoryId = null,
  categories = [],
  roles = [],
  editingChannel = null,
  onClose,
  onSaved,
}: ChannelModalProps) {
  const notify = useSystemNotify();
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">(defaultType);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowedRoleIds, setAllowedRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const assignableRoles = roles
    .filter((r) => !r.isDefault)
    .sort((a, b) => b.position - a.position);

  useEffect(() => {
    if (!open) return;
    if (editingChannel) {
      setName(editingChannel.name);
      setType(editingChannel.type);
      setDescription(editingChannel.description ?? "");
      setCategoryId(editingChannel.categoryId ?? "");
      setIsPrivate(Boolean(editingChannel.isPrivate));
      setAllowedRoleIds(editingChannel.allowedRoleIds ?? []);
    } else {
      setName("");
      setType(defaultType);
      setDescription("");
      setCategoryId(defaultCategoryId ?? "");
      setIsPrivate(false);
      setAllowedRoleIds([]);
    }
  }, [open, defaultType, defaultCategoryId, editingChannel]);

  function toggleAllowedRole(roleId: string) {
    setAllowedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const isEdit = Boolean(editingChannel);
      const url = isEdit ? `/api/channels/${editingChannel!.id}` : "/api/channels";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit
        ? {
            name,
            description,
            categoryId: categoryId || null,
            isPrivate,
            allowedRoleIds: isPrivate ? allowedRoleIds : [],
          }
        : {
            serverId: serverId ?? undefined,
            categoryId: categoryId || null,
            name,
            type,
            description,
            isPrivate,
            allowedRoleIds: isPrivate ? allowedRoleIds : [],
          };

      const res = await apiFetch(url, {
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
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
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
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.1] bg-[#121316] shadow-2xl shadow-black/70"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <h2 id="channel-modal-title" className="text-sm font-semibold text-zinc-100">
                {editingChannel ? "Edit Channel" : "Create Channel"}
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

            <form
              onSubmit={handleSubmit}
              className="max-h-[78dvh] space-y-4 overflow-y-auto p-5"
            >
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

              {categories.length > 0 && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="channel-category"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Category
                  </label>
                  <SelectDropdown
                    id="channel-category"
                    ariaLabel="Channel category"
                    value={categoryId}
                    onChange={setCategoryId}
                    icon={<Folder className="h-3.5 w-3.5" />}
                    options={[
                      { value: "", label: "No category", badge: "Top-level" },
                      ...categories.map((cat) => ({
                        value: cat.id,
                        label: cat.name,
                      })),
                    ]}
                  />
                </div>
              )}

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

              {/* Private Channel Lock Toggle */}
              <div className="rounded-xl border border-white/[0.08] bg-[#0E0F12] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-100">Private Channel</p>
                      <p className="text-[11px] text-zinc-500">
                        Only selected roles and admins can view or join this channel.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPrivate}
                    onClick={() => setIsPrivate((v) => !v)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      isPrivate ? "bg-emerald-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        isPrivate ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {isPrivate && (
                  <div className="mt-3 space-y-1.5 border-t border-white/[0.07] pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Allowed Roles
                    </p>
                    {assignableRoles.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">
                        No custom roles yet — only Server Owners and Admins will have access.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {assignableRoles.map((role) => {
                          const active = allowedRoleIds.includes(role.id);
                          return (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => toggleAllowedRole(role.id)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                                active
                                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                                  : "border-white/[0.08] bg-[#18191E] text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: role.color }}
                              />
                              <span>{role.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
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
                  {saving ? "Saving..." : editingChannel ? "Save Changes" : "Create Channel"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
