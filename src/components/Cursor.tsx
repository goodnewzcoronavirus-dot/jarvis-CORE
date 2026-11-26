import { useEffect, useRef } from 'react';

// Custom cursor: a precise dot plus a ring that trails it with easing.
// - grows over anything clickable, and turns into a "+" over empty calendar days
// - takes the bucket color when hovering a task chip
// - shrinks while pressing; follows drags
// - native cursor stays for text fields; disabled on touch and reduced-motion
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || still) return;
    document.documentElement.classList.add('has-cursor');

    let x = -100,
      y = -100,
      rx = -100,
      ry = -100,
      raf = 0,
      visible = false;

    const setState = (target: Element | null) => {
      const r = ring.current;
      if (!r || !target) return;
      const text = target.closest('input:not([type=checkbox]):not([type=radio]):not([type=date]), textarea, select, [contenteditable]');
      const chip = target.closest<HTMLElement>('[data-cursor-color]');
      const day = target.closest('[data-cursor="add"]');
      const hit = target.closest('button, a, [role=button], label, .cal-chip, summary');
      r.classList.toggle('is-text', !!text);
      r.classList.toggle('is-hover', !!hit && !text);
      r.classList.toggle('is-add', !!day && !hit && !text);
      r.style.setProperty('--cc', chip?.dataset.cursorColor ?? '');
      r.classList.toggle('is-chip', !!chip);
      dot.current?.classList.toggle('is-text', !!text);
    };

    const move = (e: MouseEvent | DragEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!visible) {
        rx = x;
        ry = y;
        visible = true;
        ring.current?.classList.add('on');
        dot.current?.classList.add('on');
      }
      if (e.type === 'mousemove') setState(e.target as Element);
    };
    const loop = () => {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    const down = () => ring.current?.classList.add('is-down');
    const up = () => ring.current?.classList.remove('is-down');
    const leave = () => {
      visible = false;
      ring.current?.classList.remove('on');
      dot.current?.classList.remove('on');
    };
    const drag = (e: DragEvent) => {
      ring.current?.classList.add('is-drag');
      move(e);
    };
    const dragEnd = () => ring.current?.classList.remove('is-drag');

    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    document.addEventListener('mouseleave', leave);
    document.addEventListener('dragover', drag);
    document.addEventListener('dragend', dragEnd);
    document.addEventListener('drop', dragEnd);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      document.removeEventListener('mouseleave', leave);
      document.removeEventListener('dragover', drag);
      document.removeEventListener('dragend', dragEnd);
      document.removeEventListener('drop', dragEnd);
      document.documentElement.classList.remove('has-cursor');
    };
  }, []);

  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden="true">
        <span className="cursor-plus">+</span>
      </div>
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
    </>
  );
}
