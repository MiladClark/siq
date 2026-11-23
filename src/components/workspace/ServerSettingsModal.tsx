"use client";

import {
  Camera,
  Check,
  Copy,
  Crown,
  ImagePlus,
  KeyRound,
  Link2,
  Plus,
  Save,
  Search,
  Settings,
  Shield,
  Trash2,
  UserX,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { type CropMode, ImageCropModal } from "@/components/ui/ImageCropModal";
import { useSystemNotify } from "@/components/ui/NotificationCenter";
import {
  type EffectivePermissions,
  PERMISSION_DEFINITIONS,
} from "@/lib/permissions";
import { playSound } from "@/lib/sounds";
import {
  AVATAR_PALETTE,
  type PublicUser,
  type RoleItem,
  type RolePermissions,
  type ServerDetail,
} from "@/lib/types";

export type ServerSettingsTab = "overview" | "roles" | "members" | "invites";

interface InviteRow {
  id: string;
  code: string;
  maxUses: number;
  usesCount: number;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

interface ServerSettingsModalProps {
  open: boolean;
  initialTab?: ServerSettingsTab;
  server: ServerDetail | null;
  currentUser: PublicUser;
  members: PublicUser[];
  permissions: EffectivePermissions;
  blobReady: boolean;
  onClose: () => void;
  onRefreshServers: () => Promise<void>;
  onServerDeleted: (serverId: string) => void;
}

const ROLE_COLORS = [
  "#10B981",
  "#0EA5E9",
  "#F59E0B",
  "#F43F5E",
  "#14B8A6",
  "#EAB308",
  "#EC4899",
  "#84CC16",
  "#F97316",
  "#94A3B8",
];

export function ServerSettingsModal({
  open,
  initialTab = "overview",
  server,
  currentUser,
  members,
  permissions,
  blobReady,
  onClose,
  onRefreshServers,
  onServerDeleted,
}: ServerSettingsModalProps) {
  const notify = useSystemNotify();
  const [tab, setTab] = useState<ServerSettingsTab>(initialTab);

  // Overview state
  const [srvName, setSrvName] = useState("");
  const [srvTag, setSrvTag] = useState("");
  const [srvColor, setSrvColor] = useState<string>(AVATAR_PALETTE[0]);
  const [srvIconUrl, setSrvIconUrl] = useState<string | null>(null);
  const [srvBannerUrl, setSrvBannerUrl] = useState<string | null>(null);
  const [savingOverview, setSavingOverview] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [cropJob, setCropJob] = useState<{ file: File; mode: CropMode } | null>(null);
  const iconInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  // Roles state
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState("#10B981");
  const [rolePerms, setRolePerms] = useState<RolePermissions>({});
  const [savingRole, setSavingRole] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);

  // Members state
  const [memberSearch, setMemberSearch] = useState("");
  const [roleMenuMemberId, setRoleMenuMemberId] = useState<string | null>(null);

  // Invites state
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [maxUses, setMaxUses] = useState(10);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(7);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canManageServer = permissions.administrator || permissions.manageServer;
  const canManageRoles = permissions.administrator || permissions.manageRoles;
  const canKickMembers = permissions.administrator || permissions.kickMembers;
  const canManageInvites =
    permissions.administrator || permissions.manageServer || permissions.createInvites;
  const isOwner = Boolean(
    server && (server.ownerId === currentUser.id || currentUser.role === "admin")
  );

  useEffect(() => {
    if (!open || !server) return;
    setTab(initialTab);
    setSrvName(server.name);
    setSrvTag(server.tag ?? "");
    setSrvColor(server.accentColor);
    setSrvIconUrl(server.iconUrl);
    setSrvBannerUrl(server.bannerUrl);
    setMemberSearch("");
    setRoleMenuMemberId(null);

    const sortedRoles = [...server.roles].sort((a, b) => b.position - a.position);
    const first = sortedRoles[0] ?? null;
    setSelectedRoleId(first?.id ?? null);
  }, [open, initialTab, server]);

  // Keep role editor synced when selectedRoleId or server.roles changes
  const activeRole: RoleItem | null =
    server?.roles.find((r) => r.id === selectedRoleId) ?? null;

  useEffect(() => {
    if (!activeRole) return;
    setRoleName(activeRole.name);
    setRoleColor(activeRole.color);
    setRolePerms({ ...(activeRole.permissions ?? {}) });
  }, [activeRole]);

  const loadInvites = useCallback(async () => {
    if (!server) return;
    setLoadingInvites(true);
    try {
      const res = await fetch(
        `/api/invites?serverId=${encodeURIComponent(server.id)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingInvites(false);
    }
  }, [server]);

  useEffect(() => {
    if (open && tab === "invites" && canManageInvites) {
      void loadInvites();
    }
  }, [open, tab, canManageInvites, loadInvites]);

  if (!server) return null;

  async function handleCroppedAsset(result: { file: File; previewUrl: string }) {
    const mode = cropJob?.mode;
    setCropJob(null);
    if (!mode || !server) return;
    if (!blobReady) {
      notify({
        kind: "warning",
        title: "Storage Not Configured",
        message: "Vercel Blob storage is required to upload server images.",
        source: server.name,
      });
      return;
    }

    setUploadingAsset(true);
    try {
      const fd = new FormData();
      fd.append("file", result.file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.attachment?.url) {
        notify({
          kind: "error",
          title: "Upload Failed",
          message: data.error ?? "Failed to upload server image.",
          source: server.name,
        });
        return;
      }
      if (mode === "avatar") {
        setSrvIconUrl(data.attachment.url);
      } else {
        setSrvBannerUrl(data.attachment.url);
      }
      URL.revokeObjectURL(result.previewUrl);
    } catch {
      notify({
        kind: "error",
        title: "Upload Failed",
        message: "Network error uploading image.",
        source: server.name,
      });
    } finally {
      setUploadingAsset(false);
    }
  }

  async function handleSaveOverview() {
    if (!server || !canManageServer || savingOverview) return;
    setSavingOverview(true);
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: srvName.trim(),
          tag: srvTag.trim().toUpperCase() || null,
          accentColor: srvColor,
          iconUrl: srvIconUrl,
          bannerUrl: srvBannerUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Server Settings",
          message: data.error ?? "Failed to update server.",
          source: server.name,
        });
        return;
      }
      await onRefreshServers();
      notify({
        kind: "success",
        title: "Server Saved",
        message: "Server branding updated.",
        source: srvName.trim() || server.name,
      });
    } catch {
      notify({
        kind: "error",
        title: "Server Settings",
        message: "Network error saving server.",
        source: server.name,
      });
    } finally {
      setSavingOverview(false);
    }
  }

  async function handleDeleteServer() {
    if (!server || !isOwner) return;
    const confirmed = window.confirm(
      `Permanently delete "${server.name}" and all its channels and messages? This cannot be undone.`
    );
    if (!confirmed) return;

    const res = await fetch(`/api/servers/${server.id}`, { method: "DELETE" });
    if (res.ok) {
      onServerDeleted(server.id);
      onClose();
    } else {
      const data = await res.json().catch(() => ({}));
      notify({
        kind: "error",
        title: "Delete Server",
        message: data.error ?? "Could not delete server.",
        source: server.name,
      });
    }
  }

  async function handleCreateRole() {
    if (!server || !canManageRoles || creatingRole) return;
    setCreatingRole(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Role",
          color: ROLE_COLORS[server.roles.length % ROLE_COLORS.length],
          permissions: {
            sendMessages: true,
            connectVoice: true,
            streamScreen: true,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Create Role",
          message: data.error ?? "Could not create role.",
          source: server.name,
        });
        return;
      }
      await onRefreshServers();
      if (data.role?.id) {
        setSelectedRoleId(data.role.id);
      }
    } catch {
      notify({
        kind: "error",
        title: "Create Role",
        message: "Network error creating role.",
        source: server.name,
      });
    } finally {
      setCreatingRole(false);
    }
  }

  async function handleSaveRole() {
    if (!server || !activeRole || !canManageRoles || savingRole) return;
    setSavingRole(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/roles/${activeRole.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: activeRole.isDefault ? undefined : roleName.trim(),
          color: roleColor,
          permissions: rolePerms,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Save Role",
          message: data.error ?? "Failed to save role.",
          source: server.name,
        });
        return;
      }
      await onRefreshServers();
      notify({
        kind: "success",
        title: "Role Saved",
        message: `Updated ${activeRole.isDefault ? "@everyone" : roleName.trim()}.`,
        source: server.name,
      });
    } catch {
      notify({
        kind: "error",
        title: "Save Role",
        message: "Network error saving role.",
        source: server.name,
      });
    } finally {
      setSavingRole(false);
    }
  }

  async function handleDeleteRole(role: RoleItem) {
    if (!server || role.isDefault || !canManageRoles) return;
    const confirmed = window.confirm(`Delete role "${role.name}"?`);
    if (!confirmed) return;

    const res = await fetch(`/api/servers/${server.id}/roles/${role.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await onRefreshServers();
      const fallback = server.roles.find((r) => r.id !== role.id);
      setSelectedRoleId(fallback?.id ?? null);
    } else {
      const data = await res.json().catch(() => ({}));
      notify({
        kind: "error",
        title: "Delete Role",
        message: data.error ?? "Could not delete role.",
        source: server.name,
      });
    }
  }

  async function handleToggleMemberRole(targetUserId: string, roleId: string) {
    if (!server || !canManageRoles) return;
    const currentIds = server.memberRoleIds[targetUserId] ?? [];
    const nextIds = currentIds.includes(roleId)
      ? currentIds.filter((id) => id !== roleId)
      : [...currentIds, roleId];

    const res = await fetch(
      `/api/servers/${server.id}/members/${targetUserId}/roles`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds: nextIds }),
      }
    );
    if (res.ok) {
      await onRefreshServers();
    } else {
      const data = await res.json().catch(() => ({}));
      notify({
        kind: "error",
        title: "Assign Role",
        message: data.error ?? "Failed to update member roles.",
        source: server.name,
      });
    }
  }

  async function handleKickMember(member: PublicUser) {
    if (!server || !canKickMembers) return;
    const confirmed = window.confirm(`Kick ${member.displayName} from ${server.name}?`);
    if (!confirmed) return;

    const res = await fetch(`/api/servers/${server.id}/members/${member.id}/roles`, {
      method: "DELETE",
    });
    if (res.ok) {
      await onRefreshServers();
      notify({
        kind: "info",
        title: "Member Kicked",
        message: `${member.displayName} was removed from ${server.name}.`,
        source: server.name,
      });
    } else {
      const data = await res.json().catch(() => ({}));
      notify({
        kind: "error",
        title: "Kick Member",
        message: data.error ?? "Could not kick member.",
        source: server.name,
      });
    }
  }

  async function handleCreateInvite() {
    if (!server || !canManageInvites || creatingInvite) return;
    setCreatingInvite(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: server.id,
          maxUses,
          expiresInDays,
        }),
      });
      const data = await res.json();
      if (res.ok && data.invite) {
        setInvites((prev) => [data.invite, ...prev]);
      } else {
        notify({
          kind: "error",
          title: "Invites",
          message: data.error ?? "Could not create invite.",
          source: server.name,
        });
      }
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleRevokeInvite(id: string) {
    const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
    if (res.ok) {
      setInvites((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, revoked: true } : inv))
      );
    }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    playSound("copy");
    setCopiedId(key);
    setTimeout(() => setCopiedId((curr) => (curr === key ? null : curr)), 1600);
  }

  const sortedRoles = [...server.roles].sort((a, b) => b.position - a.position);
  const customRoles = sortedRoles.filter((r) => !r.isDefault);
  const serverMembersList = members
    .filter((m) => server.memberIds.includes(m.id))
    .filter((m) => {
      const q = memberSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        m.displayName.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q)
      );
    });

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-3 backdrop-blur-[2px] md:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`${server.name} Settings`}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[min(86dvh,680px)] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[#121316] shadow-2xl shadow-black/80"
            >
              {/* Left Settings Rail */}
              <aside className="flex w-52 shrink-0 flex-col border-r border-white/[0.07] bg-[#0E0F12] p-3">
                <div className="mb-3 px-2.5 pt-1">
                  <p dir="auto" className="truncate text-xs font-bold text-zinc-100">
                    {server.name}
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Server Settings
                  </p>
                </div>

                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setTab("overview")}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                      tab === "overview"
                        ? "bg-white/[0.08] text-zinc-100"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                    }`}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Overview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTab("roles")}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                      tab === "roles"
                        ? "bg-white/[0.08] text-zinc-100"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                    }`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span>Roles</span>
                    <span className="ml-auto text-[10px] tabular-nums text-zinc-500">
                      {server.roles.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTab("members")}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                      tab === "members"
                        ? "bg-white/[0.08] text-zinc-100"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>Members</span>
                    <span className="ml-auto text-[10px] tabular-nums text-zinc-500">
                      {server.memberIds.length}
                    </span>
                  </button>

                  {canManageInvites && (
                    <button
                      type="button"
                      onClick={() => setTab("invites")}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                        tab === "invites"
                          ? "bg-white/[0.08] text-zinc-100"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>Invites</span>
                    </button>
                  )}
                </div>

                {isOwner && (
                  <div className="mt-auto border-t border-white/[0.07] pt-3">
                    <button
                      type="button"
                      onClick={() => void handleDeleteServer()}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Server</span>
                    </button>
                  </div>
                )}
              </aside>

              {/* Right Content */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
                  <h2 className="text-sm font-semibold capitalize text-zinc-100">
                    {tab === "overview"
                      ? "Server Overview"
                      : tab === "roles"
                        ? "Roles & Permissions"
                        : tab === "members"
                          ? "Server Members"
                          : "Server Invites"}
                  </h2>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close server settings"
                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Hidden file pickers for WebP cropping */}
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) setCropJob({ file: f, mode: "avatar" });
                  }}
                />
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) setCropJob({ file: f, mode: "banner" });
                  }}
                />

                {/* TAB: OVERVIEW */}
                {tab === "overview" && (
                  <div className="flex-1 space-y-5 overflow-y-auto p-6">
                    {/* Banner + Icon Card */}
                    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0F12]">
                      <div
                        className="relative h-28 w-full"
                        style={
                          !srvBannerUrl
                            ? {
                                background: `linear-gradient(135deg, ${srvColor}40 0%, #0E0F12 100%)`,
                              }
                            : {
                                backgroundImage: `url(${srvBannerUrl})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }
                        }
                      >
                        {canManageServer && (
                          <div className="absolute right-3 top-3 flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={uploadingAsset}
                              onClick={() => bannerInputRef.current?.click()}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-black/65 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 backdrop-blur-xs hover:bg-black/85"
                            >
                              <ImagePlus className="h-3.5 w-3.5" />
                              <span>{srvBannerUrl ? "Change Banner" : "Add Banner"}</span>
                            </button>
                            {srvBannerUrl && (
                              <button
                                type="button"
                                onClick={() => setSrvBannerUrl(null)}
                                className="rounded-lg bg-black/65 p-1.5 text-zinc-300 hover:bg-rose-500/80 hover:text-white"
                                title="Remove banner"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-end justify-between px-4 pb-4">
                        <div className="-mt-8 flex items-end gap-3.5">
                          <div className="relative">
                            <div
                              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-[#0E0F12] text-base font-bold text-zinc-950"
                              style={
                                !srvIconUrl ? { backgroundColor: srvColor } : undefined
                              }
                            >
                              {srvIconUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={srvIconUrl}
                                  alt={srvName}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                (srvName.trim() || "SQ").slice(0, 2).toUpperCase()
                              )}
                            </div>
                            {canManageServer && (
                              <button
                                type="button"
                                disabled={uploadingAsset}
                                onClick={() => iconInputRef.current?.click()}
                                title="Upload server icon"
                                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.15] bg-[#18191E] text-zinc-200 hover:border-emerald-500/60 hover:text-emerald-300"
                              >
                                <Camera className="h-3 w-3" />
                              </button>
                            )}
                          </div>

                          <div className="pb-1">
                            <p dir="auto" className="text-sm font-bold text-zinc-100">
                              {srvName.trim() || server.name}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {uploadingAsset
                                ? "Uploading WebP image..."
                                : "Images auto-convert to crisp WebP"}
                            </p>
                          </div>
                        </div>

                        {canManageServer && srvIconUrl && (
                          <button
                            type="button"
                            onClick={() => setSrvIconUrl(null)}
                            className="text-[11px] text-zinc-500 hover:text-rose-400"
                          >
                            Remove icon
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-zinc-300">
                          Server Name
                        </label>
                        <input
                          type="text"
                          dir="auto"
                          disabled={!canManageServer}
                          value={srvName}
                          onChange={(e) => setSrvName(e.target.value)}
                          maxLength={48}
                          className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none disabled:opacity-60"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-zinc-300">
                          Server Tag (Badge)
                        </label>
                        <input
                          type="text"
                          disabled={!canManageServer}
                          value={srvTag}
                          onChange={(e) => setSrvTag(e.target.value.toUpperCase())}
                          maxLength={6}
                          placeholder="SIQ"
                          className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2 text-sm font-semibold uppercase tracking-wider text-zinc-100 placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="block text-xs font-medium text-zinc-300">
                        Accent Color
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {AVATAR_PALETTE.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            disabled={!canManageServer}
                            onClick={() => setSrvColor(hex)}
                            style={{ backgroundColor: hex }}
                            className={`h-7 w-7 rounded-full transition-transform ${
                              srvColor === hex
                                ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#121316]"
                                : "opacity-75 hover:opacity-100"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {canManageServer && (
                      <div className="flex justify-end border-t border-white/[0.07] pt-4">
                        <button
                          type="button"
                          disabled={savingOverview || srvName.trim().length < 2}
                          onClick={() => void handleSaveOverview()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          <span>{savingOverview ? "Saving..." : "Save Changes"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: ROLES */}
                {tab === "roles" && (
                  <div className="flex min-h-0 flex-1">
                    {/* Role list column */}
                    <div className="flex w-48 shrink-0 flex-col border-r border-white/[0.07] bg-[#0E0F12]/60 p-3">
                      {canManageRoles && (
                        <button
                          type="button"
                          disabled={creatingRole}
                          onClick={() => void handleCreateRole()}
                          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{creatingRole ? "Adding..." : "Create Role"}</span>
                        </button>
                      )}
                      <div className="flex-1 space-y-1 overflow-y-auto">
                        {sortedRoles.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRoleId(r.id)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                              selectedRoleId === r.id
                                ? "bg-white/[0.09] text-zinc-100"
                                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                            }`}
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: r.color }}
                            />
                            <span dir="auto" className="truncate">
                              {r.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Role editor column */}
                    <div className="flex-1 overflow-y-auto p-5">
                      {activeRole ? (
                        <div className="space-y-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-1.5">
                              <label className="block text-xs font-medium text-zinc-300">
                                Role Name
                              </label>
                              <input
                                type="text"
                                dir="auto"
                                disabled={!canManageRoles || activeRole.isDefault}
                                value={roleName}
                                onChange={(e) => setRoleName(e.target.value)}
                                maxLength={32}
                                className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-xs font-semibold text-zinc-100 focus:border-emerald-500/60 focus:outline-none disabled:opacity-55"
                              />
                            </div>
                            {canManageRoles && !activeRole.isDefault && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteRole(activeRole)}
                                title="Delete role"
                                className="mt-6 rounded-lg border border-white/[0.08] bg-[#18191E] p-2 text-zinc-400 hover:border-rose-500/40 hover:text-rose-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          <div className="space-y-2">
                            <span className="block text-xs font-medium text-zinc-300">
                              Role Color
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {ROLE_COLORS.map((hex) => (
                                <button
                                  key={hex}
                                  type="button"
                                  disabled={!canManageRoles}
                                  onClick={() => setRoleColor(hex)}
                                  style={{ backgroundColor: hex }}
                                  className={`h-6 w-6 rounded-full transition-transform ${
                                    roleColor === hex
                                      ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#121316]"
                                      : "opacity-75 hover:opacity-100"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2 border-t border-white/[0.07] pt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                              Permissions
                            </p>
                            <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-[#0E0F12]">
                              {PERMISSION_DEFINITIONS.map((def) => {
                                const enabled = Boolean(rolePerms[def.key]);
                                return (
                                  <div
                                    key={def.key}
                                    className="flex items-center justify-between gap-4 px-3.5 py-2.5"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-zinc-200">
                                        {def.label}
                                      </p>
                                      <p className="text-[11px] text-zinc-500">
                                        {def.description}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={enabled}
                                      disabled={!canManageRoles}
                                      onClick={() =>
                                        setRolePerms((prev) => ({
                                          ...prev,
                                          [def.key]: !prev[def.key],
                                        }))
                                      }
                                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                                        enabled ? "bg-emerald-500" : "bg-zinc-700"
                                      }`}
                                    >
                                      <span
                                        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                                          enabled ? "translate-x-4" : "translate-x-0"
                                        }`}
                                      />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {canManageRoles && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                disabled={savingRole}
                                onClick={() => void handleSaveRole()}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
                              >
                                <Save className="h-3.5 w-3.5" />
                                <span>{savingRole ? "Saving..." : "Save Role"}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="py-12 text-center text-xs text-zinc-500">
                          Select a role to view or configure permissions.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: MEMBERS */}
                {tab === "members" && (
                  <div className="flex min-h-0 flex-1 flex-col p-5">
                    <div className="relative mb-4">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        dir="auto"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search members..."
                        className="w-full rounded-lg border border-white/[0.08] bg-[#0E0F12] py-2 pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>

                    <div className="flex-1 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/[0.07] bg-[#0E0F12]">
                      {serverMembersList.map((member) => {
                        const assignedIds = server.memberRoleIds[member.id] ?? [];
                        const assignedRoles = customRoles.filter((r) =>
                          assignedIds.includes(r.id)
                        );
                        const unassignedRoles = customRoles.filter(
                          (r) => !assignedIds.includes(r.id)
                        );
                        const isSrvOwner = server.ownerId === member.id;
                        const pickerOpen = roleMenuMemberId === member.id;

                        return (
                          <div
                            key={member.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar
                                name={member.displayName}
                                color={member.avatarColor}
                                avatarUrl={member.avatarUrl}
                                size="md"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    dir="auto"
                                    className="truncate text-xs font-semibold text-zinc-100"
                                  >
                                    {member.displayName}
                                  </span>
                                  {isSrvOwner && (
                                    <span
                                      title="Server Owner"
                                      className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
                                    >
                                      <Crown className="h-2.5 w-2.5" />
                                      Owner
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-zinc-500">
                                  @{member.username}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {assignedRoles.map((r) => (
                                <span
                                  key={r.id}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#18191E] px-2 py-0.5 text-[11px] font-medium text-zinc-200"
                                >
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: r.color }}
                                  />
                                  <span>{r.name}</span>
                                  {canManageRoles && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleToggleMemberRole(member.id, r.id)
                                      }
                                      aria-label={`Remove ${r.name}`}
                                      className="text-zinc-500 hover:text-rose-400"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </span>
                              ))}

                              {canManageRoles && unassignedRoles.length > 0 && (
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRoleMenuMemberId((curr) =>
                                        curr === member.id ? null : member.id
                                      )
                                    }
                                    title="Assign role"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.1] bg-[#18191E] text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-300"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>

                                  {pickerOpen && (
                                    <div className="absolute right-0 top-7 z-30 w-40 rounded-xl border border-white/[0.1] bg-[#14151A] p-1 shadow-2xl shadow-black/80">
                                      {unassignedRoles.map((r) => (
                                        <button
                                          key={r.id}
                                          type="button"
                                          onClick={() => {
                                            setRoleMenuMemberId(null);
                                            void handleToggleMemberRole(member.id, r.id);
                                          }}
                                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                                        >
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{ backgroundColor: r.color }}
                                          />
                                          <span className="truncate">{r.name}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {canKickMembers &&
                                !isSrvOwner &&
                                member.id !== currentUser.id && (
                                  <button
                                    type="button"
                                    onClick={() => void handleKickMember(member)}
                                    title="Kick from server"
                                    className="ml-1 rounded-md border border-white/[0.08] bg-[#18191E] p-1.5 text-zinc-400 hover:border-rose-500/40 hover:text-rose-400"
                                  >
                                    <UserX className="h-3.5 w-3.5" />
                                  </button>
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB: INVITES */}
                {tab === "invites" && canManageInvites && (
                  <div className="flex-1 space-y-4 overflow-y-auto p-6">
                    <div className="rounded-xl border border-white/[0.07] bg-[#0E0F12] p-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-zinc-400">
                            Max uses
                          </label>
                          <select
                            value={maxUses}
                            onChange={(e) => setMaxUses(Number(e.target.value))}
                            className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                          >
                            <option value={1}>1 use</option>
                            <option value={5}>5 uses</option>
                            <option value={10}>10 uses</option>
                            <option value={25}>25 uses</option>
                            <option value={100}>100 uses</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-zinc-400">
                            Expires after
                          </label>
                          <select
                            value={expiresInDays === null ? "never" : String(expiresInDays)}
                            onChange={(e) =>
                              setExpiresInDays(
                                e.target.value === "never" ? null : Number(e.target.value)
                              )
                            }
                            className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                          >
                            <option value="1">24 hours</option>
                            <option value="7">7 days</option>
                            <option value="30">30 days</option>
                            <option value="never">Never expires</option>
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={creatingInvite}
                        onClick={() => void handleCreateInvite()}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>
                          {creatingInvite ? "Generating..." : "Create Server Invite"}
                        </span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {loadingInvites ? (
                        <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
                      ) : invites.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/[0.1] py-8 text-center text-xs text-zinc-500">
                          No invite links created for {server.name} yet.
                        </p>
                      ) : (
                        invites.map((inv) => {
                          const expired =
                            inv.expiresAt !== null &&
                            new Date(inv.expiresAt).getTime() < Date.now();
                          const exhausted = inv.usesCount >= inv.maxUses;
                          const inactive = inv.revoked || expired || exhausted;
                          const joinUrl =
                            typeof window !== "undefined"
                              ? `${window.location.origin}/join/${inv.code}`
                              : `/join/${inv.code}`;

                          return (
                            <div
                              key={inv.id}
                              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                                inactive
                                  ? "border-white/[0.05] bg-[#0E0F12]/50 opacity-55"
                                  : "border-white/[0.08] bg-[#18191E]"
                              }`}
                            >
                              <div className="min-w-0">
                                <code className="font-mono text-xs font-semibold tracking-wider text-zinc-100">
                                  {inv.code}
                                </code>
                                <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500">
                                  {inv.usesCount}/{inv.maxUses} used
                                  {inv.expiresAt
                                    ? ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`
                                    : " · never expires"}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  disabled={inactive}
                                  onClick={() => void copyText(inv.code, `c-${inv.id}`)}
                                  title="Copy code"
                                  className="rounded-md border border-white/[0.08] bg-[#121316] p-1.5 text-zinc-300 hover:text-white disabled:opacity-40"
                                >
                                  {copiedId === `c-${inv.id}` ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={inactive}
                                  onClick={() => void copyText(joinUrl, `l-${inv.id}`)}
                                  title="Copy invite link"
                                  className="rounded-md border border-white/[0.08] bg-[#121316] p-1.5 text-zinc-300 hover:text-white disabled:opacity-40"
                                >
                                  {copiedId === `l-${inv.id}` ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  ) : (
                                    <Link2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                {!inv.revoked && (
                                  <button
                                    type="button"
                                    onClick={() => void handleRevokeInvite(inv.id)}
                                    title="Revoke"
                                    className="rounded-md border border-white/[0.08] bg-[#121316] p-1.5 text-zinc-400 hover:border-rose-500/40 hover:text-rose-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ImageCropModal
        file={cropJob?.file ?? null}
        mode={cropJob?.mode ?? "avatar"}
        onCancel={() => setCropJob(null)}
        onCropped={(res) => void handleCroppedAsset(res)}
      />
    </>
  );
}
