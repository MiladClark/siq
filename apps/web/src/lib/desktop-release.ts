export const GITHUB_REPO = "MiladClark/siq";
export const PORTABLE_FILE_NAME = "SIQ-Windows-Portable.exe";
export const LATEST_MANIFEST_FILE_NAME = "latest.json";

export interface DesktopReleaseManifest {
  version: string;
  fileName: string;
  sha256: string;
  sizeBytes: number | null;
  required: boolean;
  releaseNotes: string | null;
  releasedAt: string | null;
  downloadUrl: string;
}

const FALLBACK_MANIFEST: DesktopReleaseManifest = {
  version: "0.1.0",
  fileName: PORTABLE_FILE_NAME,
  sha256: "3ff85f96754807b2fecfe69dd33f52426b89c9f680967aeb3f6dde80b2bed951",
  sizeBytes: null,
  required: false,
  releaseNotes: null,
  releasedAt: null,
  downloadUrl: `https://github.com/${GITHUB_REPO}/releases/download/v0.1.0/${PORTABLE_FILE_NAME}`,
};

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/i;

export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

export function isValidSemver(raw: string): boolean {
  return SEMVER_RE.test(normalizeVersion(raw));
}

export function compareSemver(aRaw: string, bRaw: string): number {
  const parse = (v: string) => {
    const clean = normalizeVersion(v);
    const [core, pre = ""] = clean.split("-", 2);
    const nums = core.split(".").map((n) => parseInt(n, 10) || 0);
    return { major: nums[0] ?? 0, minor: nums[1] ?? 0, patch: nums[2] ?? 0, pre };
  };
  const a = parse(aRaw);
  const b = parse(bRaw);
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  if (!a.pre && b.pre) return 1;
  if (a.pre && !b.pre) return -1;
  return a.pre.localeCompare(b.pre);
}

export function githubAssetUrl(version: string, fileName = PORTABLE_FILE_NAME): string {
  const clean = normalizeVersion(version);
  return `https://github.com/${GITHUB_REPO}/releases/download/v${clean}/${fileName}`;
}

let cachedManifest: { value: DesktopReleaseManifest; expiresAt: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000;

export async function getLatestDesktopRelease(forceRefresh = false): Promise<DesktopReleaseManifest> {
  const now = Date.now();
  if (!forceRefresh && cachedManifest && cachedManifest.expiresAt > now) {
    return cachedManifest.value;
  }

  // Primary: static release asset latest.json (zero GitHub API rate-limit risk)
  try {
    const url = `https://github.com/${GITHUB_REPO}/releases/latest/download/${LATEST_MANIFEST_FILE_NAME}`;
    const res = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "siq-update-service",
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const json = (await res.json()) as Partial<DesktopReleaseManifest>;
      const version = typeof json.version === "string" ? normalizeVersion(json.version) : "";
      const sha256 = typeof json.sha256 === "string" ? json.sha256.trim().toLowerCase() : "";
      if (isValidSemver(version) && SHA256_RE.test(sha256)) {
        const fileName =
          typeof json.fileName === "string" && json.fileName.endsWith(".exe")
            ? json.fileName
            : PORTABLE_FILE_NAME;
        const manifest: DesktopReleaseManifest = {
          version,
          fileName,
          sha256,
          sizeBytes: typeof json.sizeBytes === "number" && json.sizeBytes > 0 ? json.sizeBytes : null,
          required: Boolean(json.required),
          releaseNotes: typeof json.releaseNotes === "string" ? json.releaseNotes : null,
          releasedAt: typeof json.releasedAt === "string" ? json.releasedAt : null,
          downloadUrl: githubAssetUrl(version, fileName),
        };
        cachedManifest = { value: manifest, expiresAt: now + CACHE_TTL_MS };
        return manifest;
      }
    }
  } catch {
    // Fall through to GitHub Releases API or bundled fallback
  }

  // Fallback: GitHub Releases latest API (in case an older release doesn't have latest.json yet)
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "siq-update-service",
        Accept: "application/vnd.github+json",
      },
    });
    if (res.ok) {
      const release = (await res.json()) as {
        tag_name?: string;
        body?: string;
        published_at?: string;
        assets?: Array<{
          name?: string;
          size?: number;
          digest?: string;
          browser_download_url?: string;
        }>;
      };
      const version = release.tag_name ? normalizeVersion(release.tag_name) : "";
      const exeAsset = release.assets?.find((a) => a.name === PORTABLE_FILE_NAME);
      const rawDigest = exeAsset?.digest?.replace(/^sha256:/i, "").trim().toLowerCase() ?? "";
      const sha256 = SHA256_RE.test(rawDigest)
        ? rawDigest
        : version === FALLBACK_MANIFEST.version
          ? FALLBACK_MANIFEST.sha256
          : "";

      if (isValidSemver(version) && exeAsset && sha256) {
        const manifest: DesktopReleaseManifest = {
          version,
          fileName: PORTABLE_FILE_NAME,
          sha256,
          sizeBytes: typeof exeAsset.size === "number" ? exeAsset.size : null,
          required: false,
          releaseNotes: release.body?.trim() || null,
          releasedAt: release.published_at ?? null,
          downloadUrl: exeAsset.browser_download_url || githubAssetUrl(version),
        };
        cachedManifest = { value: manifest, expiresAt: now + CACHE_TTL_MS };
        return manifest;
      }
    }
  } catch {
    // Fall back to static manifest
  }

  cachedManifest = { value: FALLBACK_MANIFEST, expiresAt: now + 60_000 };
  return FALLBACK_MANIFEST;
}
