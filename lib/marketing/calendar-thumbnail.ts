import "server-only";
import sharp from "sharp";
import { inspectCreativeImage } from "@/lib/marketing/creative-image";
import { MarketingError } from "@/lib/marketing/domain";

let rendering = false;

/** One bounded native transform per API process; the DB budget covers all instances. */
export async function createCalendarThumbnail(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (rendering) throw new MarketingError("Bộ tạo ảnh thu nhỏ đang bận. Tắt rồi bật lại ảnh thu nhỏ để thử lại.", 429, "thumbnail_busy");
  rendering = true;
  try {
    inspectCreativeImage(bytes, bytes[0] === 137 ? "image/png" : "image/jpeg");
    const output = await sharp(bytes, { failOn: "warning", limitInputPixels: 40000000, sequentialRead: true, pages: 1 })
      .rotate().resize({ width: 160, height: 90, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 65, effort: 0 }).timeout({ seconds: 3 }).toBuffer();
    if (!output.length || output.length > 65536) throw new Error("Thumbnail exceeds output limit");
    return new Uint8Array(output);
  } catch {
    throw new MarketingError("Chưa tạo được ảnh thu nhỏ từ file này. Bạn vẫn có thể mở chi tiết bài.", 422, "thumbnail_unavailable");
  } finally { rendering = false; }
}
