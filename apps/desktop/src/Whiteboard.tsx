import { useEffect, useRef, useState } from 'react';
import { Check, Download, Eraser, Pencil, Plus, Trash2, Type, Image, Undo2, MousePointer2, Square, Circle, FolderOpen } from 'lucide-react';
import { Modal } from '@rooms/design';
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
  const [tool, setTool] = useState<'select' | 'pen' | 'text' | 'erase' | 'rectangle' | 'ellipse'>('select');
  const [exportOpen,setExportOpen]=useState(false),[selected,setSelected]=useState<string|null>(null);
  const [color, setColor] = useState(colors[0]), [note, setNote] = useState('');
  const [points, setPoints] = useState<[number, number][]>([]);
  const [history, setHistory] = useState<Edit[]>([]), [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const path = useRef<[number, number][]>([]), drawing = useRef(false), locked = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const fixture=import.meta.env.DEV&&new URLSearchParams(location.search).has('fixture');
  const readOnly=fixture||!userId||activity.status!=='connected';
  const busy = activity.busy || working || readOnly;
  const board = activity.room?.whiteboard ?? [];
  useEffect(()=>{let active=true;if(import.meta.env.DEV){const query=new URLSearchParams(location.search);if(query.get('fixture')==='S54')void import('./dev/games-fixture').then(f=>{if(!active)return;const meta=f.getGamesFixtureMetadata('S54',query.get('variant')||'default');setExportOpen(meta.ui.modal==='board-export');setTool(meta.ui.boardTool);if(meta.ui.undoElementId){const element=board.find(item=>item.id===meta.ui.undoElementId&&item.authorId===userId);if(element){setSelected(element.id);setHistory([{kind:'add',element}]);}}});}return()=>{active=false;};},[roomId,userId,activity.room?.roomId]);
  const point = (e: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const box = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, (e.clientX - box.left) / box.width * 1000)), Math.max(0, Math.min(620, (e.clientY - box.top) / box.height * 620))];
  };
  async function run(work: () => Promise<void>) {
    if (fixture || !userId || locked.current || activity.busy || activity.status !== 'connected') return;
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
    const saved = await window.rooms.activity.exportBoard(roomId, 'png');
    if (alive.current) {setMessage(saved ? 'Tahta PNG olarak kaydedildi.' : 'Kaydetme iptal edildi.');if(saved)setExportOpen(false);}
  });
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{const target=event.target;if(event.repeat||event.altKey||event.defaultPrevented||target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select,button,[role=dialog]'))||exportOpen||busy)return;
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo();return;}
      if(event.metaKey||event.ctrlKey)return;
      const keys:Record<string,typeof tool>={v:'select',p:'pen',r:'rectangle',o:'ellipse',t:'text'};if(keys[event.key.toLowerCase()]){event.preventDefault();setTool(keys[event.key.toLowerCase()]);}
    };window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  },[busy,exportOpen,history,board]);
  useEffect(()=>{if(busy){drawing.current=false;path.current=[];setPoints([]);}},[busy]);
  return <div className="whiteboard">
    <div className="whiteboard-toolbar">
      <div className="segmented small">{([
        ['select','Seç · V',MousePointer2], ['pen', 'Kalem · P', Pencil], ['rectangle','Dikdörtgen · R',Square], ['ellipse','Daire · O',Circle], ['text', 'Metin ekle · T', Type], ['erase', 'Öğe sil', Eraser],
      ] as const).map(([value, label, Icon]) => <button disabled={busy} key={value} aria-label={label} aria-pressed={tool === value} className={tool === value ? 'selected' : ''} onClick={() => setTool(value)}><Icon size={17}/></button>)}</div>
      <div className="board-colors">{colors.map(c => <button disabled={busy} key={c} aria-label={`Çizim rengi ${c}`} aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)}>{color === c && <Check size={12}/>}</button>)}</div>
      <span>{working||activity.busy?'Gönderiliyor…':readOnly?fixture?'Yerel örnek · Düzenleme kapalı':'Bağlantı bekleniyor':'Ortak tahta'}</span>
      <div className="board-actions">
        <button className="button secondary small" disabled={busy || !history.length} title={history.length ? 'Bu oturumdaki son kendi işlemini geri al' : 'Bu oturumda geri alınacak kendi işlemin yok'} onClick={undo}><Undo2 size={15}/>Geri al</button>
        <button className="button secondary small" disabled={busy || !board.length || !window.rooms?.activity?.exportBoard} title={!board.length ? 'Önce tahtaya bir çizim veya not ekle' : 'Tahtanın güncel görüntüsünü PNG olarak kaydet'} onClick={()=>setExportOpen(true)}><Download size={15}/>Dışa aktar</button>
      </div>
    </div>
    {tool === 'text' && <form className="board-note-form" onSubmit={e => {
      e.preventDefault(); if (!note.trim()) return;
      const element: BoardElement = { id: crypto.randomUUID(), kind: 'text', points: [[60, 80 + board.length % 8 * 55]], text: note.trim(), color, width: 2, authorId: userId };
      void run(() => add(element, true));
    }}><input value={note} disabled={busy} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="Tahtaya bir not bırak…" aria-label="Beyaz tahta notu"/><button className="button primary small" disabled={busy || !note.trim()}><Plus size={15}/>Not ekle</button></form>}
    <svg className={`board-canvas tool-${tool} ${readOnly?'readonly':''}`} tabIndex={0} viewBox="0 0 1000 620" role="img" aria-label="Ortak çizim tahtası"
      onPointerDown={e => { if (!['pen','rectangle','ellipse'].includes(tool) || busy || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; path.current = [point(e)]; setPoints([...path.current]); }}
      onPointerMove={e => { if (!drawing.current || path.current.length >= 499) return; if(tool==='pen')path.current.push(point(e));else path.current=[path.current[0],point(e)]; setPoints([...path.current]); }}
      onPointerUp={e => { if (!drawing.current) return; drawing.current = false; const stroke = tool==='pen'?[...path.current, point(e)].slice(0, 500):[path.current[0],point(e)]; setPoints([]); path.current = []; void run(() => add({ id: crypto.randomUUID(), kind: tool==='rectangle'?'rectangle':tool==='ellipse'?'ellipse':'stroke', points: stroke, color, width: 3, authorId: userId })); }}
      onPointerCancel={() => { drawing.current = false; path.current = []; setPoints([]); }}>
      <defs><pattern id="board-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#ffffff12"/></pattern></defs><rect width="1000" height="620" fill="url(#board-dots)"/>
      {board.map(item => <g key={item.id} className={`${tool === 'erase' && item.authorId === userId ? 'erasable' : ''} ${selected===item.id?'selected':''}`} onClick={() => { if(tool==='select')setSelected(item.id);if (tool === 'erase' && !busy) remove(item); }}>{item.kind === 'text' ? <text x={item.points[0][0]} y={item.points[0][1]} fill={item.color} fontSize="20">{item.text}</text> : item.kind==='rectangle'||item.kind==='ellipse'?<BoardShape kind={item.kind} points={item.points} color={item.color} width={item.width}/>: <polyline points={item.points.map(p => p.join(',')).join(' ')} stroke={item.color} strokeWidth={item.width} fill="none" strokeLinecap="round" strokeLinejoin="round"/>}</g>)}
      {points.length > 0 && (tool==='rectangle'||tool==='ellipse'?<BoardShape kind={tool} points={points} color={color} width={3}/>:<polyline points={points.map(p => p.join(',')).join(' ')} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round"/>)}
    </svg>
    {!board.length && <div className="board-empty"><Pencil size={28}/><span>İlk çizgi senden.</span><small>Kalemle çiz veya metin aracıyla bir not ekle.</small></div>}
    <div className="board-status"><span>{readOnly?'Düzenleme kapalı':'Değişiklikler sunucu yanıtıyla paylaşılır'}</span><span>⌘Z yalnızca kendi işlemini geri alır.</span><span>{board.length} öğe</span></div>{selected&&<div className="board-selected-actions"><button className="button secondary small" disabled={busy||board.find(item=>item.id===selected)?.authorId!==userId} onClick={()=>{const element=board.find(item=>item.id===selected);if(element)remove(element);}}>Seçili öğeyi sil</button><button className="text-button" onClick={()=>setSelected(null)}>Seçimi kaldır</button></div>}<div className="board-accessible-list">{board.map((item, i) => <button key={item.id} disabled={busy || item.authorId !== userId} title={item.authorId !== userId ? 'Yalnızca kendi çizimini veya notunu silebilirsin' : 'Öğeyi sil'} onClick={() => remove(item)}><Trash2 size={12}/>{item.kind === 'text' ? item.text : `Çizim ${i + 1}`} öğesini sil</button>)}</div>
    <div className="board-bottom"><div><strong>{board.length?'Ortak tahta':'İlk fikri sen bırak.'}</strong><p>Çiz, bir şekil ekle veya kısa bir not bırak.</p></div><button className="button secondary" disabled title="Kayıtlı tahta arşivi bu bağlantıda henüz uygulanmadı"><FolderOpen size={15}/>Kayıtlı board’lar</button></div>
    {exportOpen&&<Modal title="Board’u PNG olarak indir" className="rt-modal rt-board-export" onClose={()=>setExportOpen(false)}><div className="rt-modal-body"><div className="rt-export-preview"><Image size={30}/><h3>whiteboard.png</h3><p>2000 × 1240 px · Tahta içeriği</p></div><p>Araç çubuğu ve katılımcı imleçleri dışa aktarılmaz. Çizimler ve metinler tek bir görsel dosyada saklanır.</p><div className="rt-export-background"><span>Arka plan</span><strong>Koyu · Noktalı zemin</strong></div>{message&&<p role="status">{message}</p>}</div><footer><button className="button secondary" onClick={()=>setExportOpen(false)}>Vazgeç</button><button className="button primary" disabled={busy||!board.length||!window.rooms?.activity?.exportBoard} onClick={exportBoard}><Download size={15}/>PNG indir</button></footer></Modal>}
    {message && <p className="board-feedback" role="status">{message}</p>}
  </div>;
}

function BoardShape({kind,points,color,width}:{kind:'rectangle'|'ellipse';points:[number,number][];color:string;width:number}) {if(points.length<2)return null;const [first,last]=[points[0],points[points.length-1]],x=Math.min(first[0],last[0]),y=Math.min(first[1],last[1]),w=Math.abs(first[0]-last[0]),h=Math.abs(first[1]-last[1]);return kind==='rectangle'?<rect x={x} y={y} width={w} height={h} rx={8} fill="none" stroke={color} strokeWidth={width}/>:<ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} fill="none" stroke={color} strokeWidth={width}/>;}
