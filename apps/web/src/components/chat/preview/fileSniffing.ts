import { DOCX_MIMETYPE, resolveFileMimetype } from "./textFileTypes.js";

/**
 * Client-side magic-byte sniffing for attachments. The server can't inspect
 * file contents (they are encrypted before upload - see docs/ARCHITECTURE.md),
 * so the sender's browser is the only place a renamed file can be caught:
 * a .zip renamed to .mp4 or .jpg must not render as media, count against
 * media limits, or preview as an image/video. The sniffed type overrides
 * the extension claim whenever the two disagree across a trust boundary
 * (archive vs media vs document), and only for the first bytes - the same
 * UX-level guard Signal/WhatsApp clients apply, not a security boundary.
 */

/** Byte offsets that identify a container in the first 16 bytes. */
function sniff(bytes: Uint8Array): string | null {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length)).replace(/\0+$/, "");

  if (bytes.length >= 8 && ascii(0, 4) === "PK\x03\x04") return "application/zip";
  if (bytes.length >= 6 && ascii(0, 6) === "7z\xbc\xaf\x27\x1c") return "application/x-7z-compressed";
  if (bytes.length >= 7 && ascii(0, 7) === "Rar!\x1a\x07\x00") return "application/vnd.rar";
  if (bytes.length >= 2 && bytes[0]! === 0x1f && bytes[1]! === 0x8b) return "application/gzip";
  if (bytes.length >= 8 && bytes[0]! === 0x89 && ascii(1, 7) === "PNG\r\n\x1a\n") return "image/png";
  if (bytes.length >= 3 && bytes[0]! === 0xff && bytes[1]! === 0xd8 && bytes[2]! === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["avif", "avis", "heic", "heif", "mif1", "msf1"].includes(brand)) return "image/avif";
    if (brand === "M4A ") return "audio/mp4";
    if (brand === "qt  ") return "video/quicktime";
    // isom, iso2, mp41, mp42, M4V, avc1, dash, ...
    return "video/mp4";
  }
  if (bytes.length >= 4 && bytes[0]! === 0x1a && bytes[1]! === 0x45 && bytes[2]! === 0xdf && bytes[3]! === 0xa3) {
    // EBML header - both WebM and MKV; treat as WebM since that's what
    // browsers play.
    return "video/webm";
  }
  if (bytes.length >= 4 && ascii(0, 4) === "OggS") return "audio/ogg";
  if (bytes.length >= 4 && ascii(0, 4) === "fLaC") return "audio/flac";
  if (bytes.length >= 3 && ascii(0, 3) === "ID3") return "audio/mpeg";
  if (bytes.length >= 2 && (bytes[0]! === 0xff && (bytes[1]! & 0xe0) === 0xe0)) return "audio/mpeg";
  if (bytes.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  if (bytes.length >= 2 && ascii(0, 2) === "BM") return "image/bmp";
  if (bytes.length >= 2 && ascii(0, 2) === "MZ") return "application/x-msdownload";
  if (bytes.length >= 4 && bytes[0]! === 0x7f && ascii(1, 4) === "ELF") return "application/x-elf";
  if (bytes.length >= 16 && ascii(0, 15) === "SQLite format 3") return "application/vnd.sqlite3";
  return null;
}

type Family = "image" | "video" | "audio" | "archive" | "document" | "other";

function familyOf(mimetype: string): Family {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  if (
    mimetype === "application/zip" ||
    mimetype === "application/x-7z-compressed" ||
    mimetype === "application/vnd.rar" ||
    mimetype === "application/gzip" ||
    mimetype === "application/x-msdownload" ||
    mimetype === "application/x-elf"
  ) {
    return "archive";
  }
  if (mimetype === "application/pdf" || mimetype === DOCX_MIMETYPE) return "document";
  return "other";
}

/**
 * Resolves the effective mimetype for an attachment whose first bytes are
 * known. When the magic bytes contradict the extension/browser claim in a
 * meaningful way (a renamed archive posing as media, or a real image
 * renamed to .zip), the bytes win - everything else keeps the claim.
 */
export function resolveFileMimetypeWithBytes(
  declaredMimetype: string,
  filename: string,
  bytes: Uint8Array,
): string {
  const claimed = resolveFileMimetype(declaredMimetype, filename);
  const sniffed = sniff(bytes);
  if (!sniffed) return claimed;

  // DOCX/XLSX are ZIP containers with a different internal layout - the
  // extension claim is correct there and must not be downgraded to zip.
  if (claimed === DOCX_MIMETYPE && sniffed === "application/zip") return claimed;

  const claimedFamily = familyOf(claimed);
  const sniffedFamily = familyOf(sniffed);
  // Either direction of media<->archive mismatch is resolved by the bytes:
  // a renamed archive must not pass as media, and a real image/video
  // renamed to an archive extension still renders as media.
  const claimMatters =
    claimedFamily === "image" || claimedFamily === "video" || claimedFamily === "audio" || claimedFamily === "archive";
  const sniffMatters = sniffedFamily === "archive" || sniffedFamily === "image" || sniffedFamily === "video";
  if (claimMatters && sniffMatters && claimedFamily !== sniffedFamily) return sniffed;

  return claimed;
}

/** True when the magic bytes contradict a media claim - used to warn the
 *  sender that the file they attached is not what its extension says. */
export function hasSpoofedMediaClaim(
  declaredMimetype: string,
  filename: string,
  bytes: Uint8Array,
): { claimed: string; actual: string } | null {
  const claimed = resolveFileMimetype(declaredMimetype, filename);
  const sniffed = sniff(bytes);
  if (!sniffed) return null;
  const claimedFamily = familyOf(claimed);
  const sniffedFamily = familyOf(sniffed);
  if (
    (claimedFamily === "image" || claimedFamily === "video" || claimedFamily === "audio") &&
    sniffedFamily !== claimedFamily &&
    (sniffedFamily === "archive" || sniffedFamily === "document" || sniffedFamily === "other")
  ) {
    return { claimed, actual: sniffed };
  }
  return null;
}
