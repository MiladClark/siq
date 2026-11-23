import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import type { MessageAttachment } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), ".local-uploads");

export function isVercelBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function isLocalStorageEnabled(): boolean {
  return (
    process.env.LOCAL_STORAGE === "true" ||
    (process.env.NODE_ENV !== "production" && !isVercelBlobConfigured())
  );
}

export function isBlobStorageConfigured(): boolean {
  return isVercelBlobConfigured() || isLocalStorageEnabled();
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
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File is too large. Maximum size is 15 MB.");
  }

  const safeName = sanitizeFilename(file.name);
  const contentType = file.type || "application/octet-stream";

  if (isVercelBlobConfigured()) {
    const key = `siq-uploads/${userId}/${Date.now()}-${safeName}`;
    const blob = await put(key, file, {
      access: "public",
      contentType,
    });

    return {
      url: blob.url,
      name: file.name || safeName,
      contentType,
      size: file.size,
    };
  }

  if (isLocalStorageEnabled()) {
    await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(LOCAL_UPLOAD_DIR, storedName), buffer);

    return {
      url: `/api/uploads/${encodeURIComponent(storedName)}`,
      name: file.name || safeName,
      contentType,
      size: file.size,
    };
  }

  throw new Error(
    "File storage is not configured yet. Enable Vercel Blob in Vercel Storage (BLOB_READ_WRITE_TOKEN)."
  );
}
