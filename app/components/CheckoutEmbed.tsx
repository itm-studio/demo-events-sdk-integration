'use client';

import { useEffect, useCallback } from 'react';

interface CheckoutEmbedProps {
  momentName: string;
  embedUrl: string;
  onClose: () => void;
}

export function CheckoutEmbed({ momentName, embedUrl, onClose }: CheckoutEmbedProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (
        !event.origin.endsWith('.itm.studio') &&
        !event.origin.endsWith('.itm-staging.studio')
      )
        return;
      if (event.data?.type === 'ITM_PURCHASE_SUCCESS') {
        console.log('Purchase completed!', event.data);
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('message', handleMessage);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('message', handleMessage);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown, handleMessage]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h3>{momentName}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <iframe
            src={embedUrl}
            allow="payment"
            title={`RSVP for ${momentName}`}
          />
        </div>
      </div>
    </div>
  );
}
