import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE = 5;

const buildPages = (current, total) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('…');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push('…');
  pages.push(total);
  return pages;
};

const Pagination = ({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  itemLabel = 'items',
}) => {
  if (!totalPages || totalPages <= 1) return null;

  const current = Math.min(Math.max(currentPage, 1), totalPages);
  const start = (current - 1) * PAGE_SIZE + 1;
  const end = Math.min(current * PAGE_SIZE, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500 gap-3">
      <span>
        Showing <strong className="text-slate-800">{start}</strong> to{' '}
        <strong className="text-slate-800">{end}</strong> of{' '}
        <strong className="text-slate-800">{totalItems}</strong> {itemLabel}
      </span>
      <div className="flex items-center space-x-1">
        <button
          onClick={() => onPageChange(current - 1)}
          disabled={current === 1}
          aria-label="Previous page"
          className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {buildPages(current, totalPages).map((page, index) =>
          page === '…' ? (
            <span key={`gap-${index}`} className="px-1.5 text-slate-400 select-none">
              …
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              aria-current={page === current ? 'page' : undefined}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                page === current
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {page}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(current + 1)}
          disabled={current === totalPages}
          aria-label="Next page"
          className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
