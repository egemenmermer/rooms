import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,FileText,RefreshCw,X} from 'lucide-react';
import type {AgentArtifactPreview} from '@rooms/agent-contracts';
import {useCommunity} from './community';
import {uiError} from './i18n';

/** Plain text only: output never becomes HTML, embedded media, or an external resource. */
export function ArtifactPreview({taskId,artifactId,onClose,notify}:{taskId:string;artifactId:string;onClose():void;notify(message:string):void}){
 const {user,serverUrl,status}=useCommunity();
 return <ScopedPreview key={`${user?.id??''}:${serverUrl}:${status}:${taskId}:${artifactId}`} taskId={taskId} artifactId={artifactId} onClose={onClose} notify={notify}/>;
}
function ScopedPreview({taskId,artifactId,onClose,notify}:{taskId:string;artifactId:string;onClose():void;notify(message:string):void}){
 const [result,setResult]=useState<AgentArtifactPreview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[downloading,setDownloading]=useState(false),[revision,setRevision]=useState(0);
 const alive=useRef(true),epoch=useRef(0),downloadLock=useRef(false);
 const fixture=import.meta.env.DEV&&new URLSearchParams(location.search).has('fixture');
 useEffect(()=>{
  alive.current=true;const request=++epoch.current;setResult(null);setError('');setLoading(true);
  if(fixture){setError('Yerel örnekte dosya erişimi kapalı.');setLoading(false);return;}
  if(!window.rooms?.agent.previewArtifact){setError('Önizleme için masaüstü bağlantısı gerekli.');setLoading(false);return;}
  void window.rooms.agent.previewArtifact(taskId,artifactId).then(value=>{if(alive.current&&epoch.current===request)setResult(value);}).catch(failure=>{if(alive.current&&epoch.current===request)setError(uiError(failure));}).finally(()=>{if(alive.current&&epoch.current===request)setLoading(false);});
  const invalidate=()=>{epoch.current++;setResult(null);setError('Dosya erişimi yeniden doğrulanmalı.');setLoading(false);};
  window.addEventListener('rooms:community-management-invalidated',invalidate);window.addEventListener('rooms:channel-access-invalidated',invalidate);
  return()=>{alive.current=false;epoch.current++;window.removeEventListener('rooms:community-management-invalidated',invalidate);window.removeEventListener('rooms:channel-access-invalidated',invalidate);};
 },[taskId,artifactId,fixture,revision]);
 const download=async()=>{if(fixture||downloadLock.current||!window.rooms?.agent)return;downloadLock.current=true;setDownloading(true);setError('');const request=epoch.current;try{const saved=await window.rooms.agent.downloadArtifact(taskId,artifactId);if(alive.current&&request===epoch.current)notify(saved?'Dosya kaydedildi.':'Kaydetme iptal edildi.');}catch(failure){if(alive.current&&request===epoch.current)setError(uiError(failure));}finally{downloadLock.current=false;if(alive.current)setDownloading(false);}};
 const reason=result?.state==='too-large'?'Metin önizlemesi 256 KiB ile sınırlı.':result?.state==='unsupported'?'Bu dosya türü metin olarak önizlenemiyor.':result?.state==='unavailable'?'Dosyaya ulaşılamıyor.':'';
 return <section className="artifact-preview" aria-label="Dosya önizlemesi" aria-busy={loading}>
  <header><FileText size={16}/><strong>{result?.artifact?.name??'Dosya önizlemesi'}</strong><button className="icon-button" aria-label="Önizlemeyi kapat" onClick={onClose}><X size={18}/></button></header>
  {loading?<div className="artifact-preview-state" role="status">Önizleme açılıyor…</div>:result?.state==='text'?<pre className="artifact-preview-document">{result.text}</pre>:<div className="artifact-preview-state"><FileText size={30}/><h3>Önizleme açılamadı</h3><p>{error||reason}</p><button className="button secondary small" disabled={fixture} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={15}/>Yeniden dene</button></div>}
  {error&&result?.state==='text'&&<p className="artifact-preview-error" role="alert">{error}</p>}
  <footer><span>{result?.artifact?`${(result.artifact.size/1024).toFixed(1)} KB`:''}</span><button className="button primary small" disabled={fixture||downloading||!window.rooms?.agent||result?.state==='unavailable'||!result} onClick={()=>void download()}><ArrowDownToLine size={16}/>{downloading?'Kaydediliyor…':'Dosyayı indir'}</button></footer>
 </section>;
}
