import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Centered modal with a brand-gradient header. Closes on backdrop click / Esc. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  accent = 'linear-gradient(120deg, #6366F1 0%, #8B5CF6 48%, #EC4899 100%)',
  children,
  maxWidth = 760,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm anim-fade sm:p-6"
      onClick={onClose}
    >
      <div
        className="my-auto w-full overflow-hidden rounded-2xl bg-white shadow-pop anim-pop"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-5 py-4 text-white" style={{ background: accent }}>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/35"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <div className="pr-8">
            <div className="text-[16px] font-bold leading-tight">{title}</div>
            {subtitle && <div className="mt-0.5 text-[12.5px] font-medium text-white/85">{subtitle}</div>}
          </div>
        </div>
        <div className="fdc-scroll max-h-[calc(100vh-180px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
