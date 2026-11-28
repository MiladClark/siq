import { z } from "zod";

const mediaUrlSchema = z
  .string()
  .refine(
    (val) =>
      val.startsWith("/api/uploads/") ||
      val.startsWith("https://") ||
      val.startsWith("http://"),
    "Invalid media URL."
  );

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(24, "Username must be at most 24 characters.")
  .regex(/^[a-z0-9_-]+$/, "Use lowercase letters, numbers, underscores, or hyphens.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.")
  .max(255, "Email is too long.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required.")
  .max(40, "Display name must be at most 40 characters.");

export const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters.")
  .max(128, "Password is too long.");

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  inviteCode: z.string().trim().max(32).optional().default(""),
});

export const loginSchema = z
  .object({
    identifier: z.string().trim().toLowerCase().min(1, "Username or email is required.").optional(),
    username: z.string().trim().toLowerCase().optional(),
    password: z.string().min(1, "Password is required."),
    rememberMe: z.boolean().optional(),
  })
  .refine((d) => Boolean((d.identifier || d.username)?.trim()), {
    message: "Username or email is required.",
  });

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  avatarColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color hex.")
    .optional(),
  avatarUrl: mediaUrlSchema.nullable().optional(),
  bannerUrl: mediaUrlSchema.nullable().optional(),
  bio: z.string().trim().max(220, "Bio must be at most 220 characters.").nullable().optional(),
  presenceStatus: z.enum(["online", "idle", "dnd", "invisible"]).optional(),
  customActivity: z
    .string()
    .trim()
    .max(120, "Activity must be at most 120 characters.")
    .nullable()
    .optional(),
});

export const createInviteSchema = z.object({
  serverId: z.string().uuid().optional(),
  maxUses: z.number().int().min(1).max(100).default(10),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(7),
});

export const createChannelSchema = z.object({
  serverId: z.string().uuid().optional(),
  categoryId: z.string().uuid().nullable().optional().default(null),
  name: z
    .string()
    .trim()
    .min(1, "Channel name is required.")
    .max(40, "Channel name must be at most 40 characters."),
  type: z.enum(["text", "voice"]),
  description: z
    .string()
    .trim()
    .max(160, "Description must be at most 160 characters.")
    .optional()
    .default(""),
  isPrivate: z.boolean().optional().default(false),
  allowedRoleIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Channel name is required.")
    .max(40, "Channel name must be at most 40 characters.")
    .optional(),
  description: z
    .string()
    .trim()
    .max(160, "Description must be at most 160 characters.")
    .nullable()
    .optional(),
  categoryId: z.string().uuid().nullable().optional(),
  isPrivate: z.boolean().optional(),
  allowedRoleIds: z.array(z.string().uuid()).optional(),
});

const attachmentUrlSchema = z
  .string()
  .max(1000)
  .refine((val) => {
    if (val.startsWith("/api/uploads/")) return true;
    try {
      const parsed = new URL(val);
      return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com");
    } catch {
      return false;
    }
  }, "Attachments must be uploaded through SIQ.");

export const attachmentSchema = z.object({
  url: attachmentUrlSchema,
  name: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  size: z.number().int().min(0).max(25 * 1024 * 1024),
});

export const createMessageSchema = z
  .object({
    content: z.string().max(4000, "Message is too long (max 4000 characters).").default(""),
    replyToId: z.string().uuid().nullable().optional().default(null),
    attachments: z.array(attachmentSchema).max(6).optional().default([]),
  })
  .refine((data) => data.content.trim().length > 0 || data.attachments.length > 0, {
    message: "Message cannot be empty.",
  });

export const updateMessageSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, "Message cannot be empty.")
      .max(4000, "Message is too long (max 4000 characters).")
      .optional(),
    pinned: z.boolean().optional(),
  })
  .refine((d) => d.content !== undefined || d.pinned !== undefined, {
    message: "Nothing to update.",
  });

export const toggleReactionSchema = z.object({
  emoji: z.string().trim().min(1, "Emoji is required.").max(32, "Invalid emoji."),
});

export const createServerSchema = z.object({
  name: z.string().trim().min(2, "Server name must be at least 2 characters.").max(64),
  tag: z
    .string()
    .trim()
    .toUpperCase()
    .max(6, "Tag must be at most 6 characters.")
    .nullable()
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .default("#10B981"),
  iconUrl: mediaUrlSchema.nullable().optional().default(null),
  bannerUrl: mediaUrlSchema.nullable().optional().default(null),
});

export const updateServerSchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  tag: z.string().trim().toUpperCase().max(6).nullable().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  iconUrl: mediaUrlSchema.nullable().optional(),
  bannerUrl: mediaUrlSchema.nullable().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(48),
});

export const rolePermissionsSchema = z.object({
  administrator: z.boolean().optional(),
  manageServer: z.boolean().optional(),
  manageChannels: z.boolean().optional(),
  manageRoles: z.boolean().optional(),
  createInvites: z.boolean().optional(),
  kickMembers: z.boolean().optional(),
  muteMembers: z.boolean().optional(),
  manageMessages: z.boolean().optional(),
  sendMessages: z.boolean().optional(),
  connectVoice: z.boolean().optional(),
  streamScreen: z.boolean().optional(),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Role name is required.").max(48),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid role color.")
    .optional()
    .default("#10B981"),
  permissions: rolePermissionsSchema.optional().default({}),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(48).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  position: z.number().int().min(0).max(1000).optional(),
  permissions: rolePermissionsSchema.optional(),
});

export const friendRequestSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Username is required.").max(32),
});

export const openDmSchema = z.object({
  targetUserId: z.string().uuid("Invalid user ID."),
});
