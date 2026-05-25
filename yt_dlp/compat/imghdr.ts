// Source: yt_dlp/compat/imghdr.py
// Port note: file reads use Bun.file(); byte-header detection remains synchronous when bytes are provided.

export type ImageType = "webp" | "png" | "jpeg" | "gif";

export function detectImageType(header: Uint8Array): ImageType | null {
  if (
    startsWith(header, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(header.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "webp";
  }
  if (startsWith(header, [0x89, 0x50, 0x4e, 0x47])) {
    return "png";
  }
  if (startsWith(header, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  if (startsWith(header, [0x47, 0x49, 0x46])) {
    return "gif";
  }
  return null;
}

export async function what(
  file?: string | null,
  header?: Uint8Array,
): Promise<ImageType | null> {
  const bytes =
    header ??
    new Uint8Array(
      await Bun.file(file ?? "")
        .slice(0, 12)
        .arrayBuffer(),
    );
  return detectImageType(bytes);
}

function startsWith(data: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => data[index] === byte);
}
