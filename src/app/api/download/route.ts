import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { LOCAL_UPLOAD_DIR } from "@/lib/storage";

function isAllowedRemoteUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".public.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

function safeDownloadFilename(name: string): string {
  const cleaned = path.basename(name).replace(/[\r\n"]/g, "_").trim();
  return cleaned || "download";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url") ?? "";
  const requestedName = searchParams.get("name") ?? "download";
  const fileName = safeDownloadFilename(requestedName);
  const encodedFileName = encodeURIComponent(fileName);

  // Local dev uploads (/api/uploads/<filename>)
  if (targetUrl.startsWith("/api/uploads/")) {
    const storedName = path.basename(decodeURIComponent(targetUrl.slice("/api/uploads/".length)));
    if (!storedName || storedName.includes("..")) {
      return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
    }
    try {
      const data = await readFile(path.join(LOCAL_UPLOAD_DIR, storedName));
      return new NextResponse(data, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodedFileName}`,
        },
      });
    } catch {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }
  }

  // Vercel Blob public URLs
  if (isAllowedRemoteUrl(targetUrl)) {
    try {
      const upstream = await fetch(targetUrl);
      if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: "Could not fetch file." }, { status: 502 });
      }
      return new NextResponse(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodedFileName}`,
        },
      });
    } catch {
      return NextResponse.json({ error: "Failed to stream download." }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Unsupported download URL." }, { status: 400 });
}
