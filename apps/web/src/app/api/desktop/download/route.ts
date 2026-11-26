import { NextResponse, type NextRequest } from "next/server";
import {
  getLatestDesktopRelease,
  githubAssetUrl,
  isValidSemver,
  normalizeVersion,
  PORTABLE_FILE_NAME,
} from "@/lib/desktop-release";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const requestedVersion = request.nextUrl.searchParams.get("version");

  let targetVersion: string;
  if (requestedVersion) {
    if (!isValidSemver(requestedVersion)) {
      return NextResponse.json({ error: "Invalid release version." }, { status: 400 });
    }
    targetVersion = normalizeVersion(requestedVersion);
  } else {
    const latest = await getLatestDesktopRelease();
    targetVersion = latest.version;
  }

  const upstreamUrl = githubAssetUrl(targetVersion, PORTABLE_FILE_NAME);
  const range = request.headers.get("range");

  try {
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": "siq-desktop-downloader",
    };
    if (range) {
      upstreamHeaders["Range"] = range;
    }

    const upstream = await fetch(upstreamUrl, {
      redirect: "follow",
      cache: "no-store",
      headers: upstreamHeaders,
      signal: request.signal,
    });

    if (!upstream.ok && upstream.status !== 206) {
      // If user clicked the web header download button without a pinned version, fall back to static CDN build
      if (!requestedVersion) {
        return NextResponse.redirect(
          new URL(`/downloads/${PORTABLE_FILE_NAME}`, request.nextUrl.origin),
          302
        );
      }
      return NextResponse.json(
        { error: `Release v${targetVersion} binary unavailable (${upstream.status}).` },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${PORTABLE_FILE_NAME}"`);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=300");

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    const etag = upstream.headers.get("etag");
    if (etag) headers.set("ETag", etag);

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    if (!requestedVersion) {
      return NextResponse.redirect(
        new URL(`/downloads/${PORTABLE_FILE_NAME}`, request.nextUrl.origin),
        302
      );
    }
    const message = error instanceof Error ? error.message : "Download proxy failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
