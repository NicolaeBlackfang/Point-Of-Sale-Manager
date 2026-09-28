import React from 'react';
import { Printer, CheckCircle } from 'lucide-react';

const ReceiptModal = ({ sale, onClose }) => {
  if (!sale) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white max-w-md w-full rounded-xl p-6 space-y-4 shadow-2xl">
        <div className="text-center space-y-1 border-b pb-4">
          <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-800">Transaction Complete</h2>
          <p className="text-xs text-slate-500">Receipt ID: {sale.transactionId}</p>
          <p className="text-xs text-slate-500">{sale.storeAddress}</p>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between border-b pb-2">
            <span>Cashier: {sale.cashier?.roleTakerName || 'N/A'}</span>
            <span>Branch: #{sale.branchNumber}</span>
          </div>

          <div className="space-y-1">
            {sale.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-slate-700">
                <span>{item.name} (x{item.quantity})</span>
                <span>${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t pt-2 flex justify-between font-bold text-sm text-slate-800">
            <span>Total Paid</span>
            <span>${sale.totalAmount.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <button
            onClick={() => window.print()}
            className="flex items-center space-x-1 bg-slate-800 text-white px-4 py-2 rounded text-xs hover:bg-slate-900"
          >
            <Printer className="h-4 w-4" />
            <span>Print Receipt</span>
          </button>
          <button
            onClick={onClose}
            className="bg-blue-600 text-white px-4 py-2 rounded text-xs hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;