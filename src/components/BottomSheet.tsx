import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';

export default function BottomSheet({
  open,
  onClose,
  title,
  showBackButton = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  showBackButton?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-end">
      <div
        className="animate-fade-in absolute inset-0 overscroll-contain bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchMove={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      <div className="animate-sheet-up relative max-h-[90vh] w-full max-w-[430px] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/15 bg-zinc-950/95 pb-8">
        <div className="flex justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-white/20" />
        </div>
        {(title || showBackButton) && (
          <div className="relative flex min-h-11 items-center justify-center px-14 pt-2">
            {showBackButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close comments"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            {title && <h2 className="text-center text-lg font-bold text-white">{title}</h2>}
          </div>
        )}
        <div className="px-6 pt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
