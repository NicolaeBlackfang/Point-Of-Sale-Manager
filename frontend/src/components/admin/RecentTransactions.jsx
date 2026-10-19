import React, { useState } from 'react';
import Pagination, { PAGE_SIZE } from '../ui/Pagination';
import { Receipt } from 'lucide-react';

const RecentTransactions = ({ recentSales }) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(Math.ceil(recentSales.length / PAGE_SIZE), 1);
  const page = Math.min(currentPage, totalPages);
  const pageSales = recentSales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center space-x-2 border-b pb-3">
        <Receipt className="h-5 w-5 text-blue-600" />
        <h3 className="font-bold text-slate-800 text-sm">Recent Shift Transactions</h3>
        <span className="text-xs bg-slate-100 font-bold px-2.5 py-0.5 rounded-full text-slate-600 ml-auto">
          {recentSales.length}
        </span>
      </div>

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {recentSales.length === 0 ? (
          <p className="text-xs text-slate-400">No transactions recorded during this session.</p>
        ) : (
          pageSales.map((sale) => (
            <div
              key={sale._id}
              className="p-3 bg-slate-50 border rounded-lg flex justify-between items-center text-xs"
            >
              <div>
                <p className="font-bold text-slate-800">${sale.totalAmount?.toFixed(2)}</p>
                <p className="text-slate-400 text-[10px]">
                  {new Date(sale.createdAt).toLocaleTimeString()} • {sale.paymentMethod}
                </p>
              </div>
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold text-[10px]">
                Completed
              </span>
            </div>
          ))
        )}
      </div>

      {recentSales.length > 0 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={recentSales.length}
          onPageChange={setCurrentPage}
          itemLabel="transactions"
        />
      )}
    </div>
  );
};

export default RecentTransactions;
