import { useEffect } from 'react';

type ToastProps = {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
};

export function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        backgroundColor: bgColor,
        color: 'white',
        padding: '12px 20px',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 250,
        animation: 'slideIn 0.3s ease-out'
      }}
    >
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: 18,
          padding: 0,
          lineHeight: 1
        }}
      >
        ×
      </button>
      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
