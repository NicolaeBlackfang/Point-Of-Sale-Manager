import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2, ImageIcon } from 'lucide-react';
import { prepareImage } from '../../utils/productImage';
import { assetUrl } from '../../services/api';

/**
 * Square product-photo picker used by the Operator add/edit product modals.
 *
 * `value`       — pending base64 data URL chosen in this session ('' = none)
 * `existingUrl` — previously stored path (e.g. /uploads/products/x.jpg)
 * `onChange`    — called with the new data URL, or '' when removed
 */
const ImageUploadField = ({ value, existingUrl = '', onChange, required = false, disabled = false }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const previewUrl = value || (existingUrl ? assetUrl(existingUrl) : '');
  const hasExisting = Boolean(existingUrl) && !value;

  const handlePick = async (event) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
    if (!file) return;

    setError('');
    setBusy(true);
    const result = await prepareImage(file);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(result.dataUrl);
  };

  const handleRemove = () => {
    setError('');
    onChange('');
  };

  return (
    <div>
      <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
        <ImagePlus className="h-3.5 w-3.5 text-slate-400" />
        <span>
          Product Photo{required ? <span className="text-red-500"> *</span> : null}
        </span>
        <span className="text-[10px] font-normal text-slate-400">(JPG/PNG/WebP · max 2MB)</span>
      </label>

      <div className="flex items-start gap-3">
        <div className="w-50 h-50 shrink-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Product preview"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-center text-slate-400 px-3">
              <ImageIcon className="h-7 w-7 mx-auto mb-1" />
              <p className="text-[10px]">No photo yet</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePick}
            disabled={disabled || busy}
          />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            className="px-3 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition text-[11px] disabled:opacity-50 flex items-center space-x-1.5"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            <span>{busy ? 'Processing…' : previewUrl ? 'Replace photo' : 'Upload photo'}</span>
          </button>

          {/* Clear only drops a photo picked in this session — stored photos are
              replaced (the API keeps an existing image when none is sent). */}
          {value ? (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={handleRemove}
              className="px-3 py-2 border border-red-200 text-red-600 rounded-xl font-semibold hover:bg-red-50 transition text-[11px] disabled:opacity-50 flex items-center space-x-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{hasExisting ? 'Undo new photo' : 'Clear'}</span>
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-1.5 text-[11px] text-red-600 font-medium">{error}</p>
      ) : null}
    </div>
  );
};

export default ImageUploadField;
