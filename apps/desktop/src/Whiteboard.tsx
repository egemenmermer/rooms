import { useEffect, useRef, useState } from 'react';
import { Check, Download, Eraser, Pencil, Plus, Trash2, Type, Undo2 } from 'lucide-react';
import type { ActivityCommand, BoardElement } from '@rooms/activity-protocol';
import type { useActivityRoom } from './activity';
import { uiError } from './i18n';

type Edit = { kind: 'add' | 'remove'; element: BoardElement };
const colors = ['#B8CDFF', '#65BC94', '#E7B96F', '#E57B7B', '#F4F6F8'];
const put = ({ authorId: _author, ...element }: BoardElement): ActivityCommand => ({ type: 'whiteboard.put', element });

/** Local undo history is bounded and keyed by the parent to room and identity. */
export default function Whiteboard({ roomId, userId, activity }: {
  roomId: string; userId: string; activity: ReturnType<typeof useActivityRoom>;
}) {
  const [tool, setTool] = useState<'pen' | 'text' | 'erase'>('pen');
  const [color, setColor] = useState(colors[0]), [note, setNote] = useState('');
  const [points, setPoints] = useState<[number, number][]>([]);
  const [history, setHistory] = useState<Edit[]>([]), [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const path = useRef<[number, number][]>([]), drawing = useRef(false), locked = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const busy = activity.busy || working || activity.status !== 'connected';
  const board = activity.room?.whiteboard ?? [];
  const point = (e: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const box = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, (e.clientX - box.left) / box.width * 1000)), Math.max(0, Math.min(620, (e.clientY - box.top) / box.height * 620))];
  };
  async function run(work: () => Promise<void>) {
    if (locked.current || activity.busy || activity.status !== 'connected') return;
    locked.current = true; setWorking(true); setMessage('');
    try { await work(); } catch (error) { if (alive.current) setMessage(uiError(error)); }
    finally { locked.current = false; if (alive.current) setWorking(false); }
  }
  async function add(element: BoardElement, clearNote = false) {
    await activity.send(put(element));
    if (!alive.current) return;
    setHistory(h => [...h.slice(-49), { kind: 'add', element }]);
    if (clearNote) setNote('');
  }
  const remove = (element: BoardElement) => {
    if (element.authorId !== userId) return;
    void run(async () => {
      await activity.send({ type: 'whiteboard.remove', elementId: element.id });
      if (alive.current) setHistory(h => [...h.slice(-49), { kind: 'remove', element }]);
    });
  };
  const undo = () => void run(async () => {
    const edit = history.at(-1); if (!edit) return;
    let restored: BoardElement | undefined;
    if (edit.kind === 'add') {
      const current = board.find(item => item.id === edit.element.id);
      if (current && (current.authorId !== edit.element.authorId || current.kind !== edit.element.kind || current.color !== edit.element.color || current.width !== edit.element.width || current.text !== edit.element.text || JSON.stringify(current.points) !== JSON.stringify(edit.element.points))) {
        throw new Error('Bu öğe başka bir oturumda değiştirildi. Güncel öğeyi silmek için silgi aracını kullan.');
      }
      if (current) await activity.send({ type: 'whiteboard.remove', elementId: current.id });
    } else {
      // A fresh ID never overwrites a concurrent restoration from another device.
      restored = { ...edit.element, id: crypto.randomUUID() };
      await activity.send(put(restored));
    }
    if (alive.current) setHistory(h => h.slice(0, -1).map(entry => restored && entry.element.id === edit.element.id ? { ...entry, element: restored } : entry));
  });
  const exportBoard = () => void run(async () => {
    if (!window.rooms?.activity?.exportBoard) throw new Error('A native desktop application is required.');
    const saved = await window.rooms.activity.exportBoard(roomId);
    if (alive.current) setMessage(saved ? 'Tahta SVG olarak kaydedildi.' : 'Kaydetme iptal edildi.');
  });
  return <div className="whiteboard">
    <div className="whiteboard-toolbar">
      <div className="segmented small">{([
        ['pen', 'Kalem', Pencil], ['text', 'Metin ekle', Type], ['erase', 'Öğe sil', Eraser],
      ] as const).map(([value, label, Icon]) => <button key={value} aria-label={label} aria-pressed={tool === value} className={tool === value ? 'selected' : ''} onClick={() => setTool(value)}><Icon size={17}/></button>)}</div>
      <div className="board-colors">{colors.map(c => <button key={c} aria-label={`Çizim rengi ${c}`} aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)}>{color === c && <Check size={12}/>}</button>)}</div>
      <span>{busy ? 'Kaydediliyor…' : 'Değişiklikler odanızla paylaşılır'}</span>
      <div className="board-actions">
        <button className="button secondary small" disabled={busy || !history.length} title={history.length ? 'Bu oturumdaki son kendi işlemini geri al' : 'Bu oturumda geri alınacak kendi işlemin yok'} onClick={undo}><Undo2 size={15}/>Geri al</button>
        <button className="button secondary small" disabled={busy || !board.length || !window.rooms?.activity?.exportBoard} title={!board.length ? 'Önce tahtaya bir çizim veya not ekle' : 'Tahtanın güncel görüntüsünü SVG olarak kaydet'} onClick={exportBoard}><Download size={15}/>Kaydet</button>
      </div>
    </div>
    {tool === 'text' && <form className="board-note-form" onSubmit={e => {
      e.preventDefault(); if (!note.trim()) return;
      const element: BoardElement = { id: crypto.randomUUID(), kind: 'text', points: [[60, 80 + board.length % 8 * 55]], text: note.trim(), color, width: 2, authorId: userId };
      void run(() => add(element, true));
    }}><input value={note} disabled={busy} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="Tahtaya bir not bırak…" aria-label="Beyaz tahta notu"/><button className="button primary small" disabled={busy || !note.trim()}><Plus size={15}/>Not ekle</button></form>}
    <svg className={`board-canvas tool-${tool}`} viewBox="0 0 1000 620" role="img" aria-label="Ortak çizim tahtası"
      onPointerDown={e => { if (tool !== 'pen' || busy || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; path.current = [point(e)]; setPoints([...path.current]); }}
      onPointerMove={e => { if (!drawing.current || path.current.length >= 499) return; path.current.push(point(e)); setPoints([...path.current]); }}
      onPointerUp={e => { if (!drawing.current) return; drawing.current = false; const stroke = [...path.current, point(e)].slice(0, 500); setPoints([]); path.current = []; void run(() => add({ id: crypto.randomUUID(), kind: 'stroke', points: stroke, color, width: 3, authorId: userId })); }}
      onPointerCancel={() => { drawing.current = false; path.current = []; setPoints([]); }}>
      <defs><pattern id="board-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#ffffff12"/></pattern></defs><rect width="1000" height="620" fill="url(#board-dots)"/>
      {board.map(item => <g key={item.id} className={tool === 'erase' && item.authorId === userId ? 'erasable' : ''} onClick={() => { if (tool === 'erase' && !busy) remove(item); }}>{item.kind === 'text' ? <text x={item.points[0][0]} y={item.points[0][1]} fill={item.color} fontSize="20">{item.text}</text> : <polyline points={item.points.map(p => p.join(',')).join(' ')} stroke={item.color} strokeWidth={item.width} fill="none" strokeLinecap="round" strokeLinejoin="round"/>}</g>)}
      {points.length > 0 && <polyline points={points.map(p => p.join(',')).join(' ')} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round"/>}
    </svg>
    {!board.length && <div className="board-empty"><Pencil size={28}/><span>İlk çizgi senden.</span><small>Kalemle çiz veya metin aracıyla bir not ekle.</small></div>}
    <div className="board-accessible-list">{board.map((item, i) => <button key={item.id} disabled={busy || item.authorId !== userId} title={item.authorId !== userId ? 'Yalnızca kendi çizimini veya notunu silebilirsin' : 'Öğeyi sil'} onClick={() => remove(item)}><Trash2 size={12}/>{item.kind === 'text' ? item.text : `Çizim ${i + 1}`} öğesini sil</button>)}</div>
    {message && <p className="board-feedback" role="status">{message}</p>}
  </div>;
}
