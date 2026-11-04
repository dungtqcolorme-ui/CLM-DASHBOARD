import "server-only";
import { createHash } from "node:crypto";
import { MarketingError } from "@/lib/marketing/domain";

/** Header/envelope validation, not malware scanning or full raster decoding.
 * Storage has image-only MIME; previews remain browser raster decodes.
 */
export function inspectCreativeImage(value: Uint8Array, mime: string) {
  const bytes = Buffer.from(value.buffer,value.byteOffset,value.byteLength);
  const fail = (): never => { throw new MarketingError("File ảnh PNG/JPEG không hợp lệ hoặc vượt giới hạn.",400,"invalid_image"); };
  if (!bytes.length || bytes.length > 8388608) fail();
  let width = 0, height = 0;
  if (mime === "image/png") {
    if (bytes.length < 45 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii",12,16) !== "IHDR" || bytes.readUInt32BE(bytes.length-12) !== 0 || bytes.toString("ascii",bytes.length-8,bytes.length-4) !== "IEND") fail();
    width=bytes.readUInt32BE(16); height=bytes.readUInt32BE(20);
  } else if (mime === "image/jpeg") {
    if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length-2] !== 255 || bytes[bytes.length-1] !== 217) fail();
    let offset=2;
    while (offset+4 <= bytes.length) {
      if (bytes[offset++] !== 255) fail();
      while (bytes[offset] === 255) offset++;
      const marker=bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset+2 > bytes.length) fail();
      const length=bytes.readUInt16BE(offset); if (length < 2 || offset+length > bytes.length) fail();
      if ([0xc0,0xc1,0xc2].includes(marker)) { if (length < 8) fail(); height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);break; }
      offset+=length;
    }
  } else fail();
  if (width < 16 || height < 16 || width > 12000 || height > 12000 || width*height > 40000000) fail();
  return {width,height,byte_size:bytes.length,reported_sha256:createHash("sha256").update(bytes).digest("hex")};
}
