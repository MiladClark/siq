import { put } from "@vercel/blob";
import type { MessageAttachment } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export function isBlobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[^\w.\-\u0600-\u06FF ]+/g, "_")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "attachment";
}

export async function uploadChatAttachment(
  file: File,
  userId: string
): Promise<MessageAttachment> {
  if (!isBlobStorageConfigured()) {
    throw new Error(
      "File storage is not configured yet. Enable Vercel Blob in Vercel Storage (BLOB_READ_WRITE_TOKEN)."
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File is too large. Maximum size is 15 MB.");
  }

  const safeName = sanitizeFilename(file.name);
  const key = `siq-uploads/${userId}/${Date.now()}-${safeName}`;

  const blob = await put(key, file, {
    access: "public",
    contentType: file.type || "application/octet-stream",
  });

  return {
    url: blob.url,
    name: file.name || safeName,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  };
}
