import { z } from "zod";

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

export const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, "Username or email is required.").optional(),
  username: z.string().trim().toLowerCase().optional(),
  password: z.string().min(1, "Password is required."),
}).refine((d) => Boolean((d.identifier || d.username)?.trim()), {
  message: "Username or email is required.",
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  avatarColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color hex.")
    .optional(),
  avatarUrl: z
    .string()
    .refine(
      (val) =>
        val.startsWith("/api/uploads/") ||
        val.startsWith("https://") ||
        val.startsWith("http://"),
      "Invalid avatar URL."
    )
    .nullable()
    .optional(),
});

export const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(50).default(5),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(7),
});

export const createChannelSchema = z.object({
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
});

export const attachmentSchema = z.object({
  url: z
    .string()
    .min(1)
    .refine(
      (val) =>
        val.startsWith("/api/uploads/") ||
        val.startsWith("https://") ||
        val.startsWith("http://"),
      "Invalid attachment URL."
    ),
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
