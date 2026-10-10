import type { CSSProperties } from 'react';

/** Uses the approved package's original vector paths with inherited semantic color. */
export function ReferenceIcon({ name, size = 20 }: { name: string; size?: number }) {
  const safeName = /^[a-z][a-z-]*$/.test(name) ? name : 'info';
  const style: CSSProperties = {
    width: size, height: size, flexShrink: 0, display: 'inline-block',
    backgroundColor: 'currentColor',
    mask: `url('./reference-brand/icons/${safeName}.svg') center / contain no-repeat`,
    WebkitMask: `url('./reference-brand/icons/${safeName}.svg') center / contain no-repeat`,
  };
  return <span aria-hidden="true" className="reference-icon" style={style}/>;
}
