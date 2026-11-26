import { NextResponse, type NextRequest } from "next/server";
import {
  compareSemver,
  getLatestDesktopRelease,
  isValidSemver,
  normalizeVersion,
} from "@/lib/desktop-release";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawCurrent = request.nextUrl.searchParams.get("version") ?? "0.0.0";
  const currentVersion = isValidSemver(rawCurrent) ? normalizeVersion(rawCurrent) : "0.0.0";
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const latest = await getLatestDesktopRelease(forceRefresh);
    const updateAvailable = compareSemver(latest.version, currentVersion) > 0;
    const origin = request.nextUrl.origin;

    return NextResponse.json(
      {
        ok: true,
        currentVersion,
        updateAvailable,
        required: updateAvailable ? latest.required : false,
        latest: {
          version: latest.version,
          // Primary download goes through SIQ's own streaming Range proxy so Iran & restricted
          // networks get reliable fast updates; GitHub Releases URL is provided as automatic fallback.
          downloadUrl: `${origin}/api/desktop/download?version=${encodeURIComponent(latest.version)}`,
          fallbackUrl: latest.downloadUrl,
          checksum: latest.sha256,
          sizeBytes: latest.sizeBytes,
          releaseNotes: latest.releaseNotes,
          releasedAt: latest.releasedAt,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check for updates.";
    return NextResponse.json(
      {
        ok: false,
        currentVersion,
        error: message,
      },
      { status: 502 }
    );
  }
}
