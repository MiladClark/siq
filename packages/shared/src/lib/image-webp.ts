"use client";

/**
 * Converts static raster images (JPG, PNG, BMP, etc.) into lightweight WebP
 * on the client before upload, preserving animated GIFs and non-image files.
 */
export async function convertImageFileToWebP(
  file: File,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<File> {
  const type = file.type.toLowerCase();
  // Keep animated GIFs, SVGs, and non-images untouched
  if (
    !type.startsWith("image/") ||
    type === "image/gif" ||
    type === "image/svg+xml"
  ) {
    return file;
  }

  const maxWidth = options?.maxWidth ?? 1920;
  const maxHeight = options?.maxHeight ?? 1920;
  const quality = options?.quality ?? 0.84;

  try {
    const bitmap = await createImageBitmap(file);
    let targetW = bitmap.width;
    let targetH = bitmap.height;

    if (targetW > maxWidth || targetH > maxHeight) {
      const ratio = Math.min(maxWidth / targetW, maxHeight / targetH);
      targetW = Math.max(1, Math.round(targetW * ratio));
      targetH = Math.max(1, Math.round(targetH * ratio));
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality)
    );

    if (!blob) return file;
    // If already WebP and converted isn't smaller, keep original
    if (type === "image/webp" && blob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}
