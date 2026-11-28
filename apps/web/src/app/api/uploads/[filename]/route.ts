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
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".opus": "audio/ogg",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(
  request: Request,
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
    // User-uploaded files are served from the app origin, so they must never be able to run
    // script here: a sandbox CSP neuters SVG/HTML payloads, nosniff stops MIME guessing, and
    // anything that is not plain media is forced to download instead of rendering.
    const inlineSafe =
      /^(image\/(png|jpeg|gif|webp)|video\/|audio\/)/.test(contentType) ||
      contentType === "application/pdf";
    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    };
    if (!inlineSafe) {
      headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(safeName)}"`;
    }
    const range = /^bytes=(\d*)-(\d*)$/i.exec(request.headers.get("Range") ?? "");

    if (range && (range[1] || range[2])) {
      const [, first, last] = range;
      const start = first ? Number(first) : Math.max(0, data.length - Number(last));
      const end = first && last ? Math.min(Number(last), data.length - 1) : data.length - 1;
      if (start > end || start >= data.length) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${data.length}` },
        });
      }
      return new NextResponse(data.subarray(start, end + 1), {
        status: 206,
        headers: {
          ...headers,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${data.length}`,
        },
      });
    }

    return new NextResponse(data, {
      status: 200,
      headers: { ...headers, "Content-Length": String(data.length) },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
