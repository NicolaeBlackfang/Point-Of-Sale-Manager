import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const QRScanner = ({ onScanSuccess }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        onScanSuccess(decodedText);
      },
      (error) => {
        // Suppress repetitive frame scan error logs
      }
    );

    return () => {
      scanner.clear().catch((err) => console.error('Failed to clear scanner:', err));
    };
  }, [onScanSuccess]);

  return <div id="reader" className="w-full overflow-hidden rounded-lg border"></div>;
};

export default QRScanner;