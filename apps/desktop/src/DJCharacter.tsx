import {useState} from 'react';

/** A failed decorative loop must leave a visible poster and an explicit retry. */
export function DJCharacter(){
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 return <div className="dj-character">
  {failed?<><img src="./dj/recep-dj.png" alt="Recep DJ"/><div className="dj-visual-error" role="status"><span>Animasyon oynatılamadı.</span><button onClick={()=>{setFailed(false);setAttempt(value=>value+1);}}>Yeniden dene</button></div></>:<video key={attempt} src="./dj/recep-dj.webm" poster="./dj/recep-dj.png" autoPlay muted loop playsInline aria-label="Recep DJ animasyonu" onError={()=>setFailed(true)}/>}
 </div>;
}
