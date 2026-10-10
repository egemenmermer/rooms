import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function IconButton({ label, children, className='', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" {...props} className={`icon-button ${className}`} aria-label={label} title={label}>{children}</button>;
}
export function Avatar({ name, size='normal', tone }: { name: string; size?: 'small' | 'normal' | 'large'; tone?: string }) {
  const tones=['sand','lavender','sage','blue']; const color=tone ?? tones[name.charCodeAt(0)%tones.length];
  return <span className={`avatar ${size} ${color}`} aria-label={name}><span>{name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span></span>;
}
export function AvatarStack({ names=[] }: { names?: string[] }) {
  return <span className="avatar-stack">{names.map(n=><Avatar name={n} size="small" key={n}/>)}</span>;
}
export function Modal({ title, children, onClose, className='' }: { title: string; children: ReactNode; onClose(): void; className?: string }) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=> {
    const previous=document.activeElement as HTMLElement | null;
    const focusable=()=> Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"]') ?? []);
    (ref.current?.querySelector<HTMLElement>('input,textarea,select') ?? focusable()[0])?.focus();
    const handler=(event: KeyboardEvent)=> {
      if(event.key==='Escape'){ event.preventDefault(); event.stopPropagation(); onClose(); }
      if(event.key==='Tab'){ const elements=focusable(); const first=elements[0]; const last=elements.at(-1); if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();} else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();} }
    };
    document.addEventListener('keydown',handler,true); return()=>{document.removeEventListener('keydown',handler,true);previous?.focus();};
  },[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`modal glass ${className}`}><div className="modal-heading"><div><span className="eyebrow">ROOMS / SİZE ÖZEL BİR YER</span><h2>{title}</h2></div><IconButton label="Pencereyi kapat" onClick={onClose}><X size={18}/></IconButton></div>{children}</div></div>;
}
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h2>{title}</h2><div className="empty-description">{children}</div>{action}</div>;
}
export function Toggle({ value, onChange, label, disabled = false }: { value: boolean; onChange(value: boolean): void; label: string; disabled?: boolean }) {
  return <button className={`toggle ${value?'on':''}`} role="switch" disabled={disabled} aria-checked={value} aria-label={label} onClick={()=>onChange(!value)}><span/></button>;
}
