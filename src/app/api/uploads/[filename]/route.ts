import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { LOCAL_UPLOAD_DIR } from "@/lib/storage";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  const decoded = decodeURIComponent(filename);
  const safeName = path.basename(decoded);

  if (!safeName || safeName !== decoded || safeName.includes("..")) {
    return NextResponse.json({ error: "Invalid filename." }, { status: 400 });
  }

  try {
    const filePath = path.join(LOCAL_UPLOAD_DIR, safeName);
    const data = await readFile(filePath);
    const ext = path.extname(safeName).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
