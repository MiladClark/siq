"use client";

import { apiFetch, mediaUrl, siteUrl } from "@/lib/client-api";
import {
  Camera,
  Check,
  Clock,
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
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@siq/shared/components/ui/Avatar";
import { ColorPicker } from "@siq/shared/components/ui/ColorPicker";
import { type CropMode, ImageCropModal } from "@siq/shared/components/ui/ImageCropModal";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import { SelectDropdown } from "@siq/shared/components/ui/SelectDropdown";
import {
  type EffectivePermissions,
  PERMISSION_DEFINITIONS,
} from "@siq/shared/lib/permissions";
import { playSound } from "@siq/shared/lib/sounds";
import {
  AVATAR_PALETTE,
  type PublicUser,
  type RoleItem,
  type RolePermissions,
  type ServerDetail,
} from "@siq/shared/lib/types";

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
  onRefreshServers: (updatedServers?: ServerDetail[]) => Promise<void>;
  onServerDeleted: (serverId: string) => void;
}

// --- SIQ Nocturne visual vocabulary (presentation only) ---------------------
const HEADER_TILE =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-emerald-500/[0.04] text-emerald-300 ring-1 ring-inset ring-emerald-400/30 shadow-[0_10px_24px_-10px_rgb(var(--siq-accent-rgb)/0.8),inset_0_1px_0_rgb(255_255_255/0.12)]";
const CARD =
  "rounded-2xl border border-white/[0.07] bg-white/[0.03] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]";
const FIELD =
  "w-full rounded-xl border border-white/[0.09] bg-black/25 text-zinc-100 placeholder:text-zinc-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] transition-[border-color,box-shadow,background-color,opacity] duration-200 hover:border-white/[0.14] focus:border-emerald-500/50 focus:bg-black/35 focus:outline-none focus:ring-4 focus:ring-emerald-500/10";
const LABEL = "block text-xs font-semibold text-zinc-300";
const CTA_BUTTON =
  "siq-cta inline-flex items-center justify-center gap-1.5 !rounded-xl px-5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50";
const ROW_ACTION =
  "siq-icon-btn !h-7 !w-7 !rounded-lg disabled:cursor-not-allowed disabled:opacity-40";
const ROW_ACTION_DANGER =
  "hover:!border-rose-500/40 hover:!bg-rose-500/10 hover:!text-rose-300";
const NAV_ITEM =
  "siq-nav-item group !flex-none whitespace-nowrap !py-2 !text-[13px] font-medium";
const NAV_SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;
const TAB_MOTION = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
};

function staggerIn(index: number) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: {
      delay: 0.03 + Math.min(index, 10) * 0.03,
      type: "spring" as const,
      stiffness: 420,
      damping: 32,
    },
  };
}

function navCountClass() {
  return "ml-auto rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-500 transition-colors group-data-[selected=true]:bg-emerald-500/15 group-data-[selected=true]:text-emerald-300";
}

function SwapIcon({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={swapKey}
        initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.4, rotate: 20 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
        className="flex"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
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
  const settingsDraftRef = useRef<{ serverId: string; initialTab: ServerSettingsTab } | null>(null);
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
    if (!open || !server) {
      settingsDraftRef.current = null;
      setCropJob(null);
      return;
    }
    if (
      settingsDraftRef.current?.serverId === server.id &&
      settingsDraftRef.current.initialTab === initialTab
    ) {
      return;
    }
    settingsDraftRef.current = { serverId: server.id, initialTab };
    setCropJob(null);
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
      const res = await apiFetch(
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

  async function handleCroppedAsset(file: File) {
    if (!server) return;
    const serverName = server.name;
    const mode = cropJob?.mode;
    const draft = settingsDraftRef.current;
    setCropJob(null);
    if (!mode || !draft || !canManageServer || uploadingAsset || savingOverview) return;
    if (!blobReady) {
      notify({
        kind: "warning",
        title: "Storage Not Configured",
        message: "Configure file storage to upload server images.",
        source: serverName,
      });
      return;
    }

    setUploadingAsset(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.attachment?.url) {
        throw new Error(data.error ?? "Failed to upload server image.");
      }

      const url: string = data.attachment.url;
      const response = await apiFetch(`/api/servers/${draft.serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "avatar" ? { iconUrl: url } : { bannerUrl: url }),
      });
      const saved = await response.json();
      if (!response.ok || !saved.server) {
        throw new Error(saved.error ?? "Could not save the server image.");
      }

      if (settingsDraftRef.current === draft) {
        if (mode === "avatar") setSrvIconUrl(saved.server.iconUrl);
        else setSrvBannerUrl(saved.server.bannerUrl);
      }
      await onRefreshServers(saved.servers);
      notify({
        kind: "success",
        title: "Server Image Saved",
        message: mode === "avatar" ? "Server icon updated." : "Server banner updated.",
        source: serverName,
      });
    } catch (error) {
      notify({
        kind: "error",
        title: "Upload Failed",
        message: error instanceof Error ? error.message : "Network error uploading image.",
        source: serverName,
      });
    } finally {
      setUploadingAsset(false);
    }
  }

  async function handleSaveOverview() {
    if (!server || !canManageServer || savingOverview || uploadingAsset) return;
    setSavingOverview(true);
    try {
      const res = await apiFetch(`/api/servers/${server.id}`, {
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
      await onRefreshServers(data.servers);
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

    const res = await apiFetch(`/api/servers/${server.id}`, { method: "DELETE" });
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
      const res = await apiFetch(`/api/servers/${server.id}/roles`, {
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
      const res = await apiFetch(`/api/servers/${server.id}/roles/${activeRole.id}`, {
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

    const res = await apiFetch(`/api/servers/${server.id}/roles/${role.id}`, {
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

    const res = await apiFetch(
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

    const res = await apiFetch(`/api/servers/${server.id}/members/${member.id}/roles`, {
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
      const res = await apiFetch("/api/invites", {
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
    const res = await apiFetch(`/api/invites/${id}`, { method: "DELETE" });
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
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="siq-backdrop fixed inset-0 z-[85] flex items-center justify-center md:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`${server.name} Settings`}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="siq-settings-dialog siq-glass siq-edge-light relative flex h-full w-full max-w-4xl flex-col overflow-hidden md:h-[min(86dvh,680px)] md:flex-row md:rounded-3xl"
            >
              {/* Left Settings Rail */}
              <aside className="flex shrink-0 flex-col border-b border-white/[0.06] bg-black/20 p-3 md:w-56 md:border-r md:border-b-0 md:px-4 md:py-5">
                <div className="mb-2 flex items-center justify-between gap-2 px-1.5 md:mb-5 md:px-1">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-extrabold text-zinc-950"
                      style={{
                        backgroundColor: server.accentColor,
                        boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.3), 0 10px 24px -12px ${server.accentColor}`,
                      }}
                    >
                      {server.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaUrl(server.iconUrl)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        server.name.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <div className="min-w-0">
                      <p dir="auto" className="truncate text-[13px] font-bold tracking-tight text-zinc-50">
                        {server.name}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-zinc-500">
                        Server Settings
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:hidden">
                    {isOwner && <button type="button" onClick={() => void handleDeleteServer()} aria-label="Delete server" className="siq-icon-btn !text-rose-400 hover:!border-rose-500/40 hover:!bg-rose-500/10"><Trash2 className="size-4" /></button>}
                    <button type="button" onClick={onClose} aria-label="Close server settings" className="siq-icon-btn"><X className="size-4" /></button>
                  </div>
                </div>

                <div className="flex gap-1 overflow-x-auto [scrollbar-width:thin] [&>button]:shrink-0 [&>button]:w-auto md:block md:space-y-0.5 md:overflow-visible md:[&>button]:w-full">
                  <button
                    type="button"
                    onClick={() => setTab("overview")}
                    data-selected={tab === "overview"}
                    className={NAV_ITEM}
                  >
                    {tab === "overview" && (
                      <motion.span layoutId="siq-server-settings-nav-highlight" className="siq-nav-highlight" transition={NAV_SPRING} />
                    )}
                    <span className="siq-nav-icon"><Settings className="h-3.5 w-3.5" /></span>
                    <span>Overview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTab("roles")}
                    data-selected={tab === "roles"}
                    className={NAV_ITEM}
                  >
                    {tab === "roles" && (
                      <motion.span layoutId="siq-server-settings-nav-highlight" className="siq-nav-highlight" transition={NAV_SPRING} />
                    )}
                    <span className="siq-nav-icon"><Shield className="h-3.5 w-3.5" /></span>
                    <span>Roles</span>
                    <span className={navCountClass()}>
                      {server.roles.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTab("members")}
                    data-selected={tab === "members"}
                    className={NAV_ITEM}
                  >
                    {tab === "members" && (
                      <motion.span layoutId="siq-server-settings-nav-highlight" className="siq-nav-highlight" transition={NAV_SPRING} />
                    )}
                    <span className="siq-nav-icon"><Users className="h-3.5 w-3.5" /></span>
                    <span>Members</span>
                    <span className={navCountClass()}>
                      {server.memberIds.length}
                    </span>
                  </button>

                  {canManageInvites && (
                    <button
                      type="button"
                      onClick={() => setTab("invites")}
                      data-selected={tab === "invites"}
                      className={NAV_ITEM}
                    >
                      {tab === "invites" && (
                        <motion.span layoutId="siq-server-settings-nav-highlight" className="siq-nav-highlight" transition={NAV_SPRING} />
                      )}
                      <span className="siq-nav-icon"><KeyRound className="h-3.5 w-3.5" /></span>
                      <span>Invites</span>
                    </button>
                  )}
                </div>

                {isOwner && (
                  <div className="mt-auto hidden border-t border-white/[0.06] pt-3 md:block">
                    <button
                      type="button"
                      onClick={() => void handleDeleteServer()}
                      className="siq-press group flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-rotate-12 group-hover:scale-110" />
                      <span>Delete Server</span>
                    </button>
                  </div>
                )}
              </aside>

              {/* Right Content */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent px-4 py-3 md:h-16 md:px-7 md:py-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={tab}
                        initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.6, rotate: 20 }}
                        transition={{ type: "spring", stiffness: 520, damping: 30 }}
                        className={`${HEADER_TILE} !hidden md:!flex`}
                      >
                        {tab === "overview" ? (
                          <Settings className="h-4 w-4" />
                        ) : tab === "roles" ? (
                          <Shield className="h-4 w-4" />
                        ) : tab === "members" ? (
                          <Users className="h-4 w-4" />
                        ) : (
                          <KeyRound className="h-4 w-4" />
                        )}
                      </motion.span>
                    </AnimatePresence>
                    <h2 className="truncate text-[15px] font-bold capitalize tracking-tight text-zinc-50 md:text-lg">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={tab}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                          className="inline-block"
                        >
                          {tab === "overview"
                            ? "Server Overview"
                            : tab === "roles"
                              ? "Roles & Permissions"
                              : tab === "members"
                                ? "Server Members"
                                : "Server Invites"}
                        </motion.span>
                      </AnimatePresence>
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close server settings"
                    className="siq-icon-btn shrink-0 !hidden md:!inline-flex"
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

                <AnimatePresence mode="wait" initial={false}>
                {/* TAB: OVERVIEW */}
                {tab === "overview" && (
                  <motion.div
                    key="overview"
                    {...TAB_MOTION}
                    className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 md:px-7 md:py-6"
                  >
                    {/* Banner + Icon Card */}
                    <div className={`${CARD} overflow-hidden`}>
                      <div
                        className="relative h-32 w-full"
                        style={
                          !srvBannerUrl
                            ? {
                                background: `radial-gradient(120% 140% at 0% 0%, ${srvColor}66 0%, transparent 60%), linear-gradient(135deg, ${srvColor}38 0%, transparent 100%)`,
                              }
                            : {
                                backgroundImage: `url(${mediaUrl(srvBannerUrl)})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }
                        }
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/45 to-transparent"
                        />
                        {canManageServer && (
                          <div className="absolute right-3 top-3 flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={uploadingAsset || savingOverview}
                              onClick={() => bannerInputRef.current?.click()}
                              className="siq-press inline-flex items-center gap-1.5 rounded-xl border border-white/[0.15] bg-black/55 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-100 backdrop-blur-md hover:border-emerald-500/50 hover:bg-black/75 hover:text-emerald-300 disabled:opacity-40"
                            >
                              <ImagePlus className="h-3.5 w-3.5" />
                              <span>{srvBannerUrl ? "Change Banner" : "Add Banner"}</span>
                            </button>
                            {srvBannerUrl && (
                              <button
                                type="button"
                                disabled={uploadingAsset || savingOverview}
                                onClick={() => setSrvBannerUrl(null)}
                                className="siq-press rounded-xl border border-white/[0.15] bg-black/55 p-1.5 text-zinc-300 backdrop-blur-md hover:border-rose-500/50 hover:bg-rose-500/80 hover:text-white disabled:opacity-40"
                                title="Remove banner"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-end justify-between px-4 pb-4">
                        <div className="relative z-10 -mt-8 flex items-end gap-3.5">
                          <div className="relative">
                            <div
                              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] border-4 border-[#17181f] text-base font-extrabold text-zinc-950 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.85)] transition-[background-color] duration-300"
                              style={
                                !srvIconUrl ? { backgroundColor: srvColor } : undefined
                              }
                            >
                              {srvIconUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={mediaUrl(srvIconUrl)}
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
                                disabled={uploadingAsset || savingOverview}
                                onClick={() => iconInputRef.current?.click()}
                                title="Upload server icon"
                                className="siq-press absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.15] bg-black/70 text-zinc-200 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.9)] backdrop-blur-md hover:border-emerald-500/60 hover:text-emerald-300"
                              >
                                <Camera className="h-3 w-3" />
                              </button>
                            )}
                          </div>

                          <div className="relative z-10 pb-1">
                            <p dir="auto" className="text-base font-bold tracking-tight text-zinc-50 drop-shadow-sm">
                              {srvName.trim() || server.name}
                            </p>
                            <p className="text-[11px] text-zinc-400 drop-shadow-sm">
                              {uploadingAsset
                                ? "Uploading WebP image..."
                                : "Images auto-convert to crisp WebP"}
                            </p>
                          </div>
                        </div>

                        {canManageServer && srvIconUrl && (
                          <button
                            type="button"
                            disabled={uploadingAsset || savingOverview}
                            onClick={() => setSrvIconUrl(null)}
                            className="siq-press rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            Remove icon
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className={LABEL}>
                          Server Name
                        </label>
                        <input
                          type="text"
                          dir="auto"
                          disabled={!canManageServer}
                          value={srvName}
                          onChange={(e) => setSrvName(e.target.value)}
                          maxLength={48}
                          className={`${FIELD} px-3.5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60`}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className={LABEL}>
                          Server Tag (Badge)
                        </label>
                        <input
                          type="text"
                          disabled={!canManageServer}
                          value={srvTag}
                          onChange={(e) => setSrvTag(e.target.value.toUpperCase())}
                          maxLength={6}
                          placeholder="SIQ"
                          className={`${FIELD} px-3.5 py-2.5 text-sm font-semibold uppercase tracking-wider placeholder:font-normal placeholder:normal-case placeholder:tracking-normal disabled:cursor-not-allowed disabled:opacity-60`}
                        />
                      </div>
                    </div>

                    <ColorPicker
                      label="Accent color"
                      value={srvColor}
                      onChange={setSrvColor}
                      presets={AVATAR_PALETTE}
                      disabled={!canManageServer}
                    />

                    {canManageServer && (
                      <div className="flex justify-end border-t border-white/[0.06] pt-5">
                        <button
                          type="button"
                          disabled={savingOverview || uploadingAsset || srvName.trim().length < 2}
                          onClick={() => void handleSaveOverview()}
                          className={CTA_BUTTON}
                        >
                          <Save className="h-3.5 w-3.5" />
                          <span>{savingOverview ? "Saving..." : "Save Changes"}</span>
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* TAB: ROLES */}
                {tab === "roles" && (
                  <motion.div
                    key="roles"
                    {...TAB_MOTION}
                    className="flex min-h-0 flex-1 flex-col md:flex-row"
                  >
                    {/* Role list column */}
                    <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-black/15 p-2.5 md:w-52 md:flex-col md:items-stretch md:gap-3 md:border-r md:border-b-0 md:p-3">
                      {canManageRoles && (
                        <button
                          type="button"
                          disabled={creatingRole}
                          onClick={() => void handleCreateRole()}
                          className={`${CTA_BUTTON} shrink-0 !px-3 md:w-full`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{creatingRole ? "Adding..." : "Create Role"}</span>
                        </button>
                      )}
                      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:block md:space-y-0.5 md:overflow-x-hidden md:overflow-y-auto">
                        {sortedRoles.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRoleId(r.id)}
                            data-selected={selectedRoleId === r.id}
                            className="siq-nav-item !flex-none max-w-[152px] !py-2 !text-[13px] font-medium md:w-full md:max-w-none"
                          >
                            {selectedRoleId === r.id && (
                              <motion.span
                                layoutId="siq-server-settings-role-highlight"
                                className="siq-nav-highlight"
                                transition={NAV_SPRING}
                              />
                            )}
                            <span className="siq-nav-icon">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full transition-shadow duration-200"
                                style={{
                                  backgroundColor: r.color,
                                  boxShadow: selectedRoleId === r.id ? `0 0 10px ${r.color}` : undefined,
                                }}
                              />
                            </span>
                            <span dir="auto" className="truncate">
                              {r.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Role editor column */}
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 md:px-6 md:py-5">
                      {activeRole ? (
                        <motion.div
                          key={activeRole.id}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="space-y-6"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <label className={LABEL}>
                                Role Name
                              </label>
                              <input
                                type="text"
                                dir="auto"
                                disabled={!canManageRoles || activeRole.isDefault}
                                value={roleName}
                                onChange={(e) => setRoleName(e.target.value)}
                                maxLength={32}
                                className={`${FIELD} px-3.5 py-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-55`}
                              />
                            </div>
                            {canManageRoles && !activeRole.isDefault && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteRole(activeRole)}
                                title="Delete role"
                                className={`siq-icon-btn mt-6 !h-[38px] !w-[38px] !rounded-xl ${ROW_ACTION_DANGER}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          <ColorPicker
                            key={activeRole.id}
                            label="Role color"
                            value={roleColor}
                            onChange={setRoleColor}
                            presets={ROLE_COLORS}
                            disabled={!canManageRoles}
                          />

                          <div className="space-y-2.5 border-t border-white/[0.06] pt-5">
                            <p className="siq-section-label !px-0">
                              Permissions
                            </p>
                            <div className={`${CARD} divide-y divide-white/[0.05] overflow-hidden`}>
                              {PERMISSION_DEFINITIONS.map((def, index) => {
                                const enabled = Boolean(rolePerms[def.key]);
                                return (
                                  <motion.div
                                    key={def.key}
                                    {...staggerIn(index)}
                                    className={`flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-200 hover:bg-white/[0.025] ${
                                      enabled ? "bg-emerald-500/[0.03]" : ""
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-zinc-200">
                                        {def.label}
                                      </p>
                                      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
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
                                      className={`relative h-6 w-11 shrink-0 rounded-full transition-[background-color,box-shadow] duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                                        enabled
                                          ? "bg-emerald-500 shadow-[0_0_18px_-4px_rgb(var(--siq-accent-rgb)/0.85)]"
                                          : "bg-white/[0.1] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
                                      }`}
                                    >
                                      <span
                                        className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.45)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                                          enabled ? "translate-x-5" : "translate-x-0"
                                        }`}
                                      />
                                    </button>
                                  </motion.div>
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
                                className={CTA_BUTTON}
                              >
                                <Save className="h-3.5 w-3.5" />
                                <span>{savingRole ? "Saving..." : "Save Role"}</span>
                              </button>
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        <p className="py-12 text-center text-xs text-zinc-500">
                          Select a role to view or configure permissions.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* TAB: MEMBERS */}
                {tab === "members" && (
                  <motion.div
                    key="members"
                    {...TAB_MOTION}
                    className="flex min-h-0 flex-1 flex-col p-4 md:px-7 md:py-6"
                  >
                    <div className="relative mb-4">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        dir="auto"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search members..."
                        className={`${FIELD} py-2.5 pl-10 pr-3 text-xs placeholder:!text-zinc-500`}
                      />
                    </div>

                    <div className={`${CARD} flex-1 divide-y divide-white/[0.05] overflow-y-auto`}>
                      {serverMembersList.map((member, index) => {
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
                          <motion.div
                            key={member.id}
                            {...staggerIn(index)}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors duration-200 hover:bg-white/[0.025]"
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
                                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-inset ring-amber-500/30 shadow-[0_0_14px_-6px_rgb(245_158_11/0.9)]"
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
                                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-zinc-200"
                                >
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: r.color, boxShadow: `0 0 8px ${r.color}` }}
                                  />
                                  <span>{r.name}</span>
                                  {canManageRoles && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleToggleMemberRole(member.id, r.id)
                                      }
                                      aria-label={`Remove ${r.name}`}
                                      className="siq-press -mr-1 rounded-full p-0.5 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
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
                                    className={`siq-icon-btn !h-6 !w-6 !rounded-full hover:!border-emerald-500/40 hover:!text-emerald-300 ${
                                      pickerOpen
                                        ? "!border-emerald-500/45 !bg-emerald-500/15 !text-emerald-300"
                                        : ""
                                    }`}
                                  >
                                    <Plus
                                      className={`h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                                        pickerOpen ? "rotate-45" : ""
                                      }`}
                                    />
                                  </button>

                                  <AnimatePresence>
                                  {pickerOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.92, y: -4 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                      transition={{ type: "spring", stiffness: 520, damping: 34 }}
                                      className="siq-glass absolute right-0 top-8 z-30 w-44 origin-top-right rounded-xl p-1.5"
                                    >
                                      {unassignedRoles.map((r) => (
                                        <button
                                          key={r.id}
                                          type="button"
                                          onClick={() => {
                                            setRoleMenuMemberId(null);
                                            void handleToggleMemberRole(member.id, r.id);
                                          }}
                                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.07] hover:text-white"
                                        >
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{ backgroundColor: r.color }}
                                          />
                                          <span className="truncate">{r.name}</span>
                                        </button>
                                      ))}
                                    </motion.div>
                                  )}
                                  </AnimatePresence>
                                </div>
                              )}

                              {canKickMembers &&
                                !isSrvOwner &&
                                member.id !== currentUser.id && (
                                  <button
                                    type="button"
                                    onClick={() => void handleKickMember(member)}
                                    title="Kick from server"
                                    className={`${ROW_ACTION} ml-1 ${ROW_ACTION_DANGER}`}
                                  >
                                    <UserX className="h-3.5 w-3.5" />
                                  </button>
                                )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* TAB: INVITES */}
                {tab === "invites" && canManageInvites && (
                  <motion.div
                    key="invites"
                    {...TAB_MOTION}
                    className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 md:px-7 md:py-6"
                  >
                    <div className={`${CARD} p-4`}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="srv-invite-max-uses"
                            className="block text-[11px] font-semibold text-zinc-400"
                          >
                            Max uses
                          </label>
                          <SelectDropdown
                            id="srv-invite-max-uses"
                            ariaLabel="Max uses"
                            value={String(maxUses)}
                            onChange={(v) => setMaxUses(Number(v))}
                            icon={<Users className="h-3.5 w-3.5" />}
                            options={[
                              { value: "1", label: "1 use", badge: "Single" },
                              { value: "5", label: "5 uses" },
                              { value: "10", label: "10 uses" },
                              { value: "25", label: "25 uses" },
                              { value: "100", label: "100 uses" },
                            ]}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label
                            htmlFor="srv-invite-expiry"
                            className="block text-[11px] font-semibold text-zinc-400"
                          >
                            Expires after
                          </label>
                          <SelectDropdown
                            id="srv-invite-expiry"
                            ariaLabel="Expires after"
                            value={expiresInDays === null ? "never" : String(expiresInDays)}
                            onChange={(v) => setExpiresInDays(v === "never" ? null : Number(v))}
                            icon={<Clock className="h-3.5 w-3.5" />}
                            options={[
                              { value: "1", label: "24 hours" },
                              { value: "7", label: "7 days", badge: "Default" },
                              { value: "30", label: "30 days" },
                              { value: "never", label: "Never expires" },
                            ]}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={creatingInvite}
                        onClick={() => void handleCreateInvite()}
                        className={`${CTA_BUTTON} mt-3.5 w-full py-2.5`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>
                          {creatingInvite ? "Generating..." : "Create Server Invite"}
                        </span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {loadingInvites ? (
                        <div className="siq-skeleton h-16 rounded-xl" />
                      ) : invites.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] py-10 text-center text-xs text-zinc-500">
                          No invite links created for {server.name} yet.
                        </p>
                      ) : (
                        invites.map((inv, index) => {
                          const expired =
                            inv.expiresAt !== null &&
                            new Date(inv.expiresAt).getTime() < Date.now();
                          const exhausted = inv.usesCount >= inv.maxUses;
                          const inactive = inv.revoked || expired || exhausted;
                          const joinUrl =
                            typeof window !== "undefined"
                              ? siteUrl(`/join/${inv.code}`)
                              : `/join/${inv.code}`;

                          return (
                            <motion.div key={inv.id} {...staggerIn(index)}>
                            <div
                              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-[border-color,background-color,opacity] duration-200 ${
                                inactive
                                  ? "border-white/[0.05] bg-black/20 opacity-55"
                                  : "border-white/[0.08] bg-white/[0.035] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] hover:border-white/[0.14] hover:bg-white/[0.05]"
                              }`}
                            >
                              <div className="min-w-0">
                                <code className="font-mono text-xs font-bold tracking-wider text-zinc-50">
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
                                  className={ROW_ACTION}
                                >
                                  <SwapIcon swapKey={copiedId === `c-${inv.id}` ? "done" : "idle"}>
                                    {copiedId === `c-${inv.id}` ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </SwapIcon>
                                </button>
                                <button
                                  type="button"
                                  disabled={inactive}
                                  onClick={() => void copyText(joinUrl, `l-${inv.id}`)}
                                  title="Copy invite link"
                                  className={ROW_ACTION}
                                >
                                  <SwapIcon swapKey={copiedId === `l-${inv.id}` ? "done" : "idle"}>
                                    {copiedId === `l-${inv.id}` ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                                    ) : (
                                      <Link2 className="h-3.5 w-3.5" />
                                    )}
                                  </SwapIcon>
                                </button>
                                {!inv.revoked && (
                                  <button
                                    type="button"
                                    onClick={() => void handleRevokeInvite(inv.id)}
                                    title="Revoke"
                                    className={`${ROW_ACTION} ${ROW_ACTION_DANGER}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            </motion.div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>
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
