// The only animation: content fades and rises gently when scrolled into view.
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useInView } from '../hooks/useScroll';

export function Reveal({ children, className, delay = 0, as: As = 'div', ...rest }: { children?: ReactNode; className?: string; delay?: number; as?: any; [key: string]: any }) {
  const [ref, inView] = useInView();
  return (
    <As ref={ref} className={clsx('reveal', inView && 'is-in', className)} style={{ '--delay': `${delay}ms` }} {...rest}>
      {children}
    </As>
  );
}
