// Client-side product photo pipeline: read a picked file, normalise it to a
// square (centre-crop) at a fixed resolution and return a base64 data URL that
// the API stores on disk. Everything runs in the browser — no FormData/multer.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const NORMALIZED_SIZE = 512;

/**
 * Validates the raw File before any decoding happens.
 * Returns an error message, or null when the file is acceptable.
 */
export function validateImageFile(file) {
  if (!file) return 'Choose an image file.';
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Image must be a JPEG, PNG or WebP file.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image must be 2MB or smaller.';
  }
  return null;
}

/**
 * Centre-crops the image to a square canvas and encodes it as JPEG.
 * The white backdrop keeps transparency (PNG/WebP) readable on paper.
 * Returns a Promise<string> data URL.
 */
export function normalizeToSquare(file, size = NORMALIZED_SIZE) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas is not supported in this browser.'));
          return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - side) / 2;
        const sourceY = (image.naturalHeight - side) / 2;
        ctx.drawImage(image, sourceX, sourceY, side, side, 0, 0, size, size);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        // The server enforces the same 2MB ceiling on the encoded payload.
        if (dataUrl.length > Math.floor((MAX_IMAGE_BYTES * 4) / 3)) {
          reject(new Error('Image is too large after processing. Try a smaller photo.'));
          return;
        }
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read the selected image.'));
    };

    image.src = objectUrl;
  });
}

/**
 * Full pipeline: validate → normalise → data URL.
 * Returns { ok: true, dataUrl } or { ok: false, error }.
 */
export async function prepareImage(file) {
  const fileError = validateImageFile(file);
  if (fileError) return { ok: false, error: fileError };

  try {
    const dataUrl = await normalizeToSquare(file);
    return { ok: true, dataUrl };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not process the image.' };
  }
}
