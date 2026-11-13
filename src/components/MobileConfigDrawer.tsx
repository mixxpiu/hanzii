import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface MobileConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footerActionLabel?: string;
}

export function MobileConfigDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footerActionLabel = 'Xong',
}: MobileConfigDrawerProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px] transition-opacity"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-10 flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl"
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-slate-300"
        />

        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-display text-base font-bold text-slate-900 truncate"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-slate-500 truncate">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Đóng ${title}`}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-700 shrink-0"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {children}
        </div>

        <div className="border-t border-slate-100 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[46px] w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {footerActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
