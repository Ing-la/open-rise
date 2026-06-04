'use client';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmText = '确认', cancelText = '取消', onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={onCancel}
    >
      <div
        className="relative w-[360px] max-w-[calc(100vw-48px)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Hand-drawn border ── */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 360 240"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <rect x="6" y="6" width="348" height="228" rx="16" fill="#FFFFFF" />
          <rect x="6" y="6" width="348" height="228" rx="16" fill="none" stroke="#2C2C2C" strokeWidth="2.5" filter="url(#tremble)" />
        </svg>

        <div className="relative z-10 p-6">
          <h3 className="font-hand text-xl text-oxblood mb-3">{title}</h3>
          <p className="font-mono text-sm text-oxblood/70 whitespace-pre-wrap leading-relaxed mb-6">{message}</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="relative px-4 py-1.5 font-hand text-sm cursor-pointer select-none"
              type="button"
            >
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 80 32" preserveAspectRatio="none" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="78" height="30" rx="7" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
              </svg>
              <span className="relative text-oxblood">{cancelText}</span>
            </button>
            <button
              onClick={onConfirm}
              className="relative px-4 py-1.5 font-hand text-sm cursor-pointer select-none"
              type="button"
            >
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 80 32" preserveAspectRatio="none" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="78" height="30" rx="7" fill="#2C2C2C" />
                <rect x="1" y="1" width="78" height="30" rx="7" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
              </svg>
              <span className="relative text-white">{confirmText}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
