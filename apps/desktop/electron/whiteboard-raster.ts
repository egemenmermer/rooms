import {BrowserWindow} from 'electron';

/** Rasterize only native-generated, escaped artwork in an isolated, network-free document. */
export async function whiteboardPng(svg:string):Promise<Buffer>{
 if(svg.length>16_000_000)throw new Error('Whiteboard artwork exceeds export limit.');
 const renderer=new BrowserWindow({show:false,width:1000,height:620,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 renderer.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 renderer.webContents.on('will-navigate',event=>event.preventDefault());
 const html='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; script-src \'none\'; connect-src \'none\'">';
 try{
  await renderer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const source=`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const value:unknown=await renderer.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const image=new Image();const timeout=setTimeout(()=>reject(new Error('Artwork render timed out')),10000);image.onerror=()=>{clearTimeout(timeout);reject(new Error('Artwork cannot be rendered'));};image.onload=()=>{clearTimeout(timeout);const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1240;const context=canvas.getContext('2d');if(!context){reject(new Error('Image export unavailable'));return;}context.drawImage(image,0,0,2000,1240);resolve(canvas.toDataURL('image/png'));};image.src=${JSON.stringify(source)};})`);
  if(typeof value!=='string'||value.length>16_000_000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value))throw new Error('Invalid rendered artwork.');
  const bytes=Buffer.from(value.slice(value.indexOf(',')+1),'base64');
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==2000||bytes.readUInt32BE(20)!==1240)throw new Error('Invalid image dimensions.');
  return bytes;
 }finally{if(!renderer.isDestroyed())renderer.destroy();}
}
