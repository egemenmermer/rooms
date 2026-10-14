const $=id=>document.getElementById(id);
let releases=[],selected=null;
const codeInput=$('code'),inviteCaret=$('invite-caret');
let composing=false;
function updateInviteCaret(){
 inviteCaret.hidden=composing||codeInput.readOnly||codeInput.selectionStart!==codeInput.selectionEnd;
 if(inviteCaret.hidden)return;
 const position=codeInput.selectionStart??codeInput.value.length;
 const cell=inviteCaret.getBoundingClientRect().width;
 inviteCaret.style.left=(position*cell-codeInput.scrollLeft)+'px';
}
function focusInvite(){
 if(!$('locked').hidden){codeInput.focus({preventScroll:true});updateInviteCaret();}
}
for(const event of ['input','keyup','click','focus','blur','scroll'])codeInput.addEventListener(event,updateInviteCaret);
codeInput.addEventListener('compositionstart',()=>{composing=true;updateInviteCaret();});
codeInput.addEventListener('compositionend',()=>{composing=false;updateInviteCaret();});
document.addEventListener('selectionchange',()=>{if(document.activeElement===codeInput)updateInviteCaret();});
window.addEventListener('resize',updateInviteCaret);
window.addEventListener('pageshow',()=>{if(document.activeElement===document.body||document.activeElement===codeInput)focusInvite();});
focusInvite();
document.querySelector('.terminal').addEventListener('click',event=>{
 if(event.button!==0||$('locked').hidden||event.target.closest('input,button,a,summary'))return;
 const selection=window.getSelection();
 if(selection&&!selection.isCollapsed)return;
 focusInvite();
});

const date=value=>new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Amsterdam'}).format(new Date(value));
const shortDate=value=>new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Amsterdam'}).format(new Date(value));
const size=value=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value/1024/1024)+' MB';
async function api(path,options={}){const response=await fetch('/distribution/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers},credentials:'same-origin',cache:'no-store'});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'Servise erişilemiyor.'),{status:response.status});return result;}
function locked(message=''){$('portal').hidden=true;$('locked').hidden=false;$('logout').hidden=true;$('address').textContent='rooms — -zsh — 80×24';$('login-status').textContent=message;$('login-status').className='feedback error';$('footer-command').textContent='';$('download-status').textContent='';selected=null;focusInvite();}
function packageDetails(item){
 selected=item;
 const windows=item.platform==='Windows';
 $('download-meta').textContent=(windows?'Windows · x64 · EXE':'macOS 14+ · Apple Silicon · DMG')+' · '+size(item.size);
 $('installation').textContent=windows?'EXE dosyasını aç → Kurulumu tamamla → ROOMS’u aç.':'DMG’yi aç → ROOMS’u Applications’a sürükle → Applications’tan aç.';
 $('signature-note').textContent=windows&&!item.signed?'İmzasız arkadaş test paketi. Windows yayıncı uyarısı gösterebilir. Güncellemeler yeni EXE ile kurulur.':'';
 $('metadata').replaceChildren(...Object.entries({'sürüm':item.version,'platform':windows?'Windows':'macOS 14+','mimari':item.arch,'boyut':size(item.size),'SHA-256':item.sha256}).flatMap(([key,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;return [dt,dd];}));
 $('notes').replaceChildren(...item.notes.map(note=>{const li=document.createElement('li');li.textContent=note;return li;}));
}
async function download(item,event){
 event.preventDefault();packageDetails(item);
 const filename='ROOMS-'+(item.platform==='Windows'?item.version:(item.id||item.version))+(item.platform==='Windows'?'-windows-x64-setup.exe':'-arm64.dmg');
 $('footer-command').textContent='download '+filename;$('download-status').textContent='İndirme yetkisi kontrol ediliyor…';
 try{
  const response=await fetch(item.downloadUrl,{method:'HEAD',credentials:'same-origin',cache:'no-store'});
  if(!response.ok){const result=await response.json();throw Object.assign(new Error(result.error||'İndirme başlatılamadı.'),{status:response.status});}
  const link=document.createElement('a');link.href=item.downloadUrl;link.download=filename;document.body.append(link);link.click();link.remove();
  $('download-status').textContent=(item.platform==='Windows'?'EXE':'DMG')+' indirme isteği tarayıcıya gönderildi.';
 }catch(error){if(error.status===401)locked(error.message);else $('download-status').textContent=error.message;}
}
function select(item,index){
 $('release-heading').textContent=index===0?'SON SÜRÜM':'SÜRÜM DETAYI';$('inspect-command').textContent=index===0?'./latest':'inspect '+item.version;
 $('release-title').textContent='ROOMS '+item.version;$('release-date').textContent=date(item.date);$('release-badge').textContent=index===0?'GÜNCEL':'ARŞİV';
 const preferred=/Windows/i.test(navigator.userAgent)?'Windows':'macOS';packageDetails(item.files.find(file=>file.platform===preferred)||item.files[0]);
 $('downloads').replaceChildren(...['Windows','macOS'].map(platform=>{
  const file=item.files.find(value=>value.platform===platform),label=platform==='Windows'?'Windows indir':'Mac indir';
  if(!file){const button=document.createElement('button');button.type='button';button.disabled=true;button.textContent=label;button.title='Bu sürüm için '+platform+' paketi yok';return button;}
  const column=document.createElement('div');column.className='platform-download';const link=document.createElement('a');link.href=file.downloadUrl;link.textContent=label+' ↓';link.addEventListener('click',event=>void download(file,event));const detail=document.createElement('small');detail.textContent=platform==='Windows'?'Windows · x64 · EXE':'macOS 14+ · Apple Silicon';const packageSize=document.createElement('small');packageSize.textContent=size(file.size);column.append(link,detail,packageSize);if(platform==='Windows'&&!file.signed){const warning=document.createElement('small');warning.textContent='İmzasız test paketi';column.append(warning);}return column;
 }));
 [...$('release-list').children].forEach((row,i)=>row.setAttribute('aria-pressed',String(i===index)));
 $('footer-command').textContent=index===0?'':'inspect '+item.version;$('download-status').textContent='';
}
async function load(){
 const result=await api('releases');const grouped=new Map();for(const file of result.releases){let item=grouped.get(file.version);if(!item){item={version:file.version,date:file.date,files:[]};grouped.set(file.version,item);}item.files.push(file);}releases=[...grouped.values()];
 $('locked').hidden=true;$('portal').hidden=false;$('logout').hidden=false;$('address').textContent='rooms — -zsh — 80×24';
 $('release-count').textContent=releases.length+' sürüm';$('empty').hidden=releases.length>0;$('release-body').hidden=releases.length===0;
 $('release-list').replaceChildren(...releases.map((item,index)=>{const row=document.createElement('button');row.className='release-row';row.type='button';row.setAttribute('aria-pressed','false');row.setAttribute('aria-label','ROOMS '+item.version+' sürümünü incele');for(const [i,value]of [item.version,shortDate(item.date),item.files.map(file=>file.platform==='macOS'?'Mac':'Windows').join(' / '),index===0?'güncel':'arşiv'].entries()){const span=document.createElement('span');span.textContent=value;if(i===3)span.className='badge';row.append(span);}row.addEventListener('click',()=>select(item,index));return row;}));
 if(releases.length)select(releases[0],0);
}
$('invite-form').addEventListener('submit',async event=>{event.preventDefault();$('enter').disabled=true;$('code').readOnly=true;updateInviteCaret();$('login-status').className='feedback';$('login-status').textContent='> davet doğrulanıyor…';try{await api('login',{method:'POST',body:JSON.stringify({code:$('code').value.trim()})});$('login-status').className='feedback success';$('login-status').textContent='✓ erişim verildi';$('code').value='';await load();$('logout').focus();}catch(error){locked(error.message);$('code').focus();}finally{$('enter').disabled=false;$('code').readOnly=false;updateInviteCaret();}});
$('logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST',body:'{}'});locked();$('code').focus();}catch(error){$('download-status').textContent=error.message;}});
load().catch(error=>{locked(error.status===401?'':error.message);$('code').focus();});
