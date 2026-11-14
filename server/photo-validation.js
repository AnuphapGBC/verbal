export const MAX_PROFILE_PHOTO_BYTES = 200 * 1024;
const formats = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class PhotoValidationError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Buffer's base64 decoder is deliberately permissive; reject non-canonical input first.
export function decodeProfilePhoto(image) {
  if (typeof image !== 'string') throw new PhotoValidationError(422, 'Choose a JPEG, PNG, or WebP photo.');
  if (image.length > Math.ceil(MAX_PROFILE_PHOTO_BYTES / 3) * 4 + 64) {
    throw new PhotoValidationError(413, 'Your prepared photo must be 200 KB or smaller.');
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || !formats.has(match[1]) || match[2].length % 4 !== 0) {
    throw new PhotoValidationError(422, 'Choose a valid JPEG, PNG, or WebP photo.');
  }
  const [, mime, encoded] = match;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_PROFILE_PHOTO_BYTES) throw new PhotoValidationError(413, 'Your prepared photo must be 200 KB or smaller.');
  if (!bytes.length || bytes.toString('base64') !== encoded) throw new PhotoValidationError(422, 'This photo has invalid image data.');
  const valid = mime === 'image/jpeg'
    ? bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
    : mime === 'image/png'
      ? bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR'
      : bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16)) && bytes.readUInt32LE(4) === bytes.length - 8;
  if (!valid) throw new PhotoValidationError(422, 'This file does not match its image format. Choose another photo.');
  const dimensions = imageDimensions(bytes, mime);
  if (!dimensions || dimensions.some(size => !size || size > 2048)) {
    throw new PhotoValidationError(422, 'Choose a valid photo up to 2048 pixels wide and high.');
  }
  return { mime, bytes };
}

function imageDimensions(bytes, mime) {
  if (mime === 'image/png') {
    if (bytes.length < 33 || bytes.readUInt32BE(8) !== 13) return null;
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (mime === 'image/webp') {
    const type = bytes.toString('ascii', 12, 16);
    if (type === 'VP8X' && bytes.length >= 30) return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
    if (type === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    if (type === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 1, 0x2a]))) {
      return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
    }
    return null;
  }
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return length >= 8 ? [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)] : null;
    }
    offset += length;
  }
  return null;
}
