import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { ArrowRight, X } from 'lucide-react';

export default function Dialog({ title, eyebrow, children, onClose, onBack }: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const drag = useRef<{ y: number; time: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const dialog = ref.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      clearTimeout(timer.current);
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  useEffect(() => {
    if (ref.current?.open) heading.current?.focus({ preventScroll: true });
  }, [title]);
  const dismiss = () => {
    if (closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    timer.current = setTimeout(onClose, 220);
  };
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(max-width: 700px)').matches || closing) return;
    setEntered(true);
    drag.current = { y: event.clientY, time: event.timeStamp };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const distance = Math.max(0, event.clientY - drag.current.y);
    const velocity = distance / Math.max(1, event.timeStamp - drag.current.time);
    drag.current = null;
    if (distance > 96 || (distance > 28 && velocity > 0.65)) dismiss();
    else setOffset(0);
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-entered={entered}
      className={'dialog' + (closing ? ' is-closing' : '') + (offset && !closing ? ' is-dragging' : '')}
      style={{ '--sheet-offset': offset + 'px' } as CSSProperties}
      onAnimationEnd={event => { if (event.target === ref.current) setEntered(true); }}
      onCancel={event => { event.preventDefault(); dismiss(); }}
      onClick={event => { if (event.target === ref.current) dismiss(); }}
    >
      <div className="sheet-grab-area" aria-hidden="true"
        onPointerDown={startDrag}
        onPointerMove={event => { if (drag.current) setOffset(Math.max(0, event.clientY - drag.current.y)); }}
        onPointerUp={endDrag}
        onPointerCancel={() => { drag.current = null; setOffset(0); }}
      ><span /></div>
      <div className="dialog-top">
        <div className="dialog-heading">
          {onBack && <button type="button" className="text-button sheet-back" onClick={onBack}><ArrowRight size={15} />חזרה לפרטים</button>}
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
        </div>
        <button type="button" className="icon-button dialog-close" aria-label="סגירה" autoFocus onClick={dismiss}><X size={20} /></button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
