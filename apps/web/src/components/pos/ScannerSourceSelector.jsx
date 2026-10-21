import React, { useState, useEffect } from 'react';
import { Camera, Keyboard, RefreshCw, X, CheckCircle2 } from 'lucide-react';

// Modal to choose the POS input source: hardware barcode/QR scanner (default)
// or a connected webcam / built-in camera for on-screen scanning.
const ScannerSourceSelector = ({ isOpen, onClose, mode, cameraId, onSelect }) => {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingCameraId, setPendingCameraId] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const enumerate = async () => {
      setLoading(true);
      setError('');
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          throw new Error('Camera enumeration is not supported in this browser.');
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        if (!cancelled) {
          setCameras(videoInputs);
          setPendingCameraId(cameraId || videoInputs[0]?.deviceId || '');
          if (videoInputs.length === 0) {
            setError('No camera devices detected. Connect a webcam and try again.');
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to list camera devices.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    enumerate();
    return () => {
      cancelled = true;
    };
  }, [isOpen, cameraId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-800">Select Scanner / Camera Source</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose how products are scanned at this terminal.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200/60 text-slate-500 hover:text-slate-800 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Options */}
        <div className="p-5 space-y-3">
          {/* Hardware scanner option */}
          <button
            onClick={() => onSelect({ mode: 'hardware', cameraId: null })}
            className={`w-full flex items-start space-x-3 p-4 rounded-xl border text-left transition ${
              mode === 'hardware'
                ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div
              className={`p-2.5 rounded-lg flex-shrink-0 ${
                mode === 'hardware' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Keyboard className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <span>Hardware Barcode / QR Scanner</span>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold uppercase">
                  Default
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                USB / keyboard-wedge scanners. Input is routed directly into the quick-scan field -
                just scan anywhere on the page.
              </p>
            </div>
            {mode === 'hardware' && (
              <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
            )}
          </button>

          {/* Camera option */}
          <div
            className={`rounded-xl border p-4 transition ${
              mode === 'camera'
                ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-start space-x-3">
              <div
                className={`p-2.5 rounded-lg flex-shrink-0 ${
                  mode === 'camera' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Camera className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">Connected Webcam / Built-in Camera</p>
                <p className="text-xs text-slate-500 mt-1">
                  Scan physical QR codes and barcodes directly through a camera feed.
                </p>
              </div>
              {mode === 'camera' && (
                <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
              )}
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setCameras([]);
                    setError('');
                    setLoading(true);
                    navigator.mediaDevices
                      ?.enumerateDevices?.()
                      .then((devices) => {
                        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
                        setCameras(videoInputs);
                        if (videoInputs.length === 0) {
                          setError('No camera devices detected. Connect a webcam and try again.');
                        } else {
                          setPendingCameraId((prev) => prev || videoInputs[0].deviceId);
                        }
                      })
                      .catch((err) => setError(err.message || 'Failed to list camera devices.'))
                      .finally(() => setLoading(false));
                  }}
                  className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh devices</span>
                </button>
                <button
                  disabled={!pendingCameraId}
                  onClick={() => onSelect({ mode: 'camera', cameraId: pendingCameraId })}
                  className="inline-flex items-center space-x-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Use this camera</span>
                </button>
              </div>

              {loading && <p className="text-xs text-slate-400">Loading camera devices...</p>}
              {error && <p className="text-xs text-red-600">{error}</p>}

              {!loading && cameras.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {cameras.map((cam) => (
                    <label
                      key={cam.deviceId}
                      className={`flex items-center space-x-2.5 p-2.5 rounded-lg border cursor-pointer text-xs transition ${
                        pendingCameraId === cam.deviceId
                          ? 'border-blue-600 bg-blue-50 text-blue-800 font-semibold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="camera-source"
                        className="accent-blue-600"
                        checked={pendingCameraId === cam.deviceId}
                        onChange={() => setPendingCameraId(cam.deviceId)}
                      />
                      <Camera className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                      <span className="truncate">
                        {cam.label || `Camera ${cam.deviceId.slice(0, 8)}...`}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScannerSourceSelector;
