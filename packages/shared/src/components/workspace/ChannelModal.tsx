"use client";

import { apiFetch } from "@/lib/client-api";
import { Folder, Hash, Lock, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useState } from "react";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import { SelectDropdown } from "@siq/shared/components/ui/SelectDropdown";
import type { CategoryItem, ChannelItem, RoleItem } from "@siq/shared/lib/types";

const HEADER_TILE =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-emerald-500/[0.04] text-emerald-300 ring-1 ring-inset ring-emerald-400/30 shadow-[0_10px_24px_-10px_rgb(var(--siq-accent-rgb)/0.8),inset_0_1px_0_rgb(255_255_255/0.12)]";

const FIELD =
  "w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-white/[0.14] focus:border-emerald-500/50 focus:bg-black/35 focus:outline-none focus:ring-4 focus:ring-emerald-500/10";

const LABEL = "block text-xs font-semibold text-zinc-300";

const OPTION_CARD =
  "group flex items-center gap-3 rounded-2xl border px-3 py-3 text-left text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]";
const OPTION_ON =
  "border-emerald-500/50 bg-emerald-500/[0.1] text-emerald-200 ring-4 ring-emerald-500/10 shadow-[0_14px_30px_-16px_rgb(var(--siq-accent-rgb)/0.9)]";
const OPTION_OFF =
  "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-white/[0.15] hover:bg-white/[0.05] hover:text-zinc-200";

function optionIconClass(active: boolean) {
  return `flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
    active
      ? "bg-emerald-500/20 text-emerald-300 shadow-[inset_0_0_0_1px_rgb(var(--siq-accent-rgb)/0.35)]"
      : "bg-white/[0.05] text-zinc-500 group-hover:text-zinc-300"
  }`;
}

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
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="siq-backdrop fixed inset-0 z-[85] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="siq-glass siq-edge-light relative w-full max-w-md overflow-hidden rounded-3xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.035] to-transparent px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={HEADER_TILE}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={type}
                      initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.5, rotate: 30 }}
                      transition={{ type: "spring", stiffness: 520, damping: 28 }}
                      className="flex"
                    >
                      {type === "voice" ? (
                        <Volume2 className="h-4 w-4" />
                      ) : (
                        <Hash className="h-4 w-4" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <h2
                  id="channel-modal-title"
                  className="truncate text-[15px] font-bold tracking-tight text-zinc-50"
                >
                  {editingChannel ? "Edit Channel" : "Create Channel"}
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

            <form
              onSubmit={handleSubmit}
              className="max-h-[78dvh] space-y-5 overflow-y-auto overscroll-contain p-5"
            >
              {!editingChannel && (
                <div className="space-y-2">
                  <span className={LABEL}>Channel type</span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setType("text")}
                      className={`${OPTION_CARD} ${type === "text" ? OPTION_ON : OPTION_OFF}`}
                    >
                      <span className={optionIconClass(type === "text")}>
                        <Hash className="h-4 w-4" />
                      </span>
                      <div>
                        <div>Text</div>
                        <div className="mt-0.5 text-[10px] font-medium text-zinc-500">
                          Chat &amp; files
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setType("voice")}
                      className={`${OPTION_CARD} ${type === "voice" ? OPTION_ON : OPTION_OFF}`}
                    >
                      <span className={optionIconClass(type === "voice")}>
                        <Volume2 className="h-4 w-4" />
                      </span>
                      <div>
                        <div>Voice</div>
                        <div className="mt-0.5 text-[10px] font-medium text-zinc-500">
                          Audio, cam, screen
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="channel-name" className={LABEL}>
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
                  className={FIELD}
                />
              </div>

              {categories.length > 0 && (
                <div className="space-y-2">
                  <label
                    htmlFor="channel-category"
                    className={LABEL}
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

              <div className="space-y-2">
                <label htmlFor="channel-desc" className={LABEL}>
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
                  className={FIELD}
                />
              </div>

              {/* Private Channel Lock Toggle */}
              <div
                className={`rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] duration-300 ${
                  isPrivate
                    ? "border-emerald-500/30 bg-emerald-500/[0.05] shadow-[0_16px_36px_-24px_rgb(var(--siq-accent-rgb)/0.9)]"
                    : "border-white/[0.08] bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ${
                        isPrivate
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-white/[0.05] text-emerald-400"
                      }`}
                    >
                      <Lock className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-zinc-100">Private Channel</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                        Only selected roles and admins can view or join this channel.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPrivate}
                    onClick={() => setIsPrivate((v) => !v)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-[background-color,box-shadow] duration-300 ${
                      isPrivate
                        ? "bg-emerald-500 shadow-[0_0_18px_-4px_rgb(var(--siq-accent-rgb)/0.85)]"
                        : "bg-white/[0.1] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
                    }`}
                  >
                    <span
                      className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.45)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                        isPrivate ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {isPrivate && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-3.5">
                        <p className="siq-section-label !px-0">
                          Allowed Roles
                        </p>
                        {assignableRoles.length === 0 ? (
                          <p className="text-[11px] text-zinc-500">
                            No custom roles yet — only Server Owners and Admins will have access.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {assignableRoles.map((role, index) => {
                              const active = allowedRoleIds.includes(role.id);
                              return (
                                <motion.button
                                  key={role.id}
                                  type="button"
                                  initial={{ opacity: 0, y: 6, scale: 0.94 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  transition={{
                                    delay: Math.min(index, 10) * 0.03,
                                    type: "spring",
                                    stiffness: 480,
                                    damping: 30,
                                  }}
                                  onClick={() => toggleAllowedRole(role.id)}
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-[border-color,background-color,color,box-shadow] duration-200 ${
                                    active
                                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 shadow-[0_0_16px_-6px_rgb(var(--siq-accent-rgb)/0.9)]"
                                      : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200"
                                  }`}
                                >
                                  <span
                                    className="h-2 w-2 rounded-full ring-2 ring-black/30"
                                    style={{ backgroundColor: role.color }}
                                  />
                                  <span>{role.name}</span>
                                </motion.button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex justify-end gap-2 border-t border-white/[0.06] bg-black/30 px-5 py-4 backdrop-blur-md">
                <button
                  type="button"
                  onClick={onClose}
                  className="siq-press rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="siq-cta !rounded-xl px-5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
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
