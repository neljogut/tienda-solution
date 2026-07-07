import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface BarcodeScannerProps {
  onResult: (decodedText: string) => void;
  onClose: () => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onResult, onClose }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
      },
      false
    );

    scanner.render(
      (decodedText) => {
        scanner.clear();
        onResult(decodedText);
      },
      (error) => {
        // Ignoring scan errors as they happen constantly when no code is focused
      }
    );

    return () => {
      scanner.clear().catch(e => console.error("Failed to clear scanner", e));
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl relative">
        <div className="p-4 flex justify-between items-center border-b">
          <h3 className="font-bold text-slate-800">Escanear Código</h3>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div id="qr-reader" className="w-full min-h-[300px]"></div>
      </div>
    </div>
  );
};
