const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// Product images are normalised to a square by the client before upload, so
// the server only has to police type, integrity and size.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'products');
const PUBLIC_PREFIX = '/uploads/products/';

// Detect the real container type from magic bytes so a renamed/mislabelled
// file (e.g. an HTML document declared as image/png) can never be stored.
function sniffMime(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/**
 * Validate a base64 data-URL product image.
 * Returns { ok: true, mime, buffer } on success or { ok: false, error }.
 */
function parseImagePayload(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, error: 'A product image is required.' };
  }

  const match = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(input.trim());
  if (!match) {
    return { ok: false, error: 'Image must be sent as a base64 data URL.' };
  }

  const declared = match[1].toLowerCase();
  if (!ALLOWED_MIME[declared]) {
    return { ok: false, error: 'Image must be a JPEG, PNG or WebP file.' };
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) {
    return { ok: false, error: 'Image could not be decoded.' };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image must be 2MB or smaller.' };
  }

  const sniffed = sniffMime(buffer);
  if (!sniffed) {
    return { ok: false, error: 'File content is not a valid image.' };
  }
  if (sniffed !== declared) {
    return { ok: false, error: 'Image type does not match its file content.' };
  }

  return { ok: true, mime: sniffed, buffer };
}

// Writes the decoded bytes to disk and returns the public URL path.
async function saveProductImage(buffer, mime) {
  const extension = ALLOWED_MIME[mime];
  if (!extension) {
    throw new Error('Unsupported image type.');
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.${extension}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return PUBLIC_PREFIX + filename;
}

// Best-effort cleanup of a replaced/removed image. Never throws — an orphaned
// file must not fail the product update that triggered it.
async function removeProductImage(imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith(PUBLIC_PREFIX)) return;
  const filename = path.basename(imageUrl);
  if (!filename || filename.startsWith('.')) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIR, filename));
  } catch {
    /* already gone */
  }
}

module.exports = {
  MAX_IMAGE_BYTES,
  ALLOWED_MIME,
  PUBLIC_PREFIX,
  sniffMime,
  parseImagePayload,
  saveProductImage,
  removeProductImage,
};
