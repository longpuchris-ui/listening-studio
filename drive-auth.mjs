import {DriveStore} from './drive-core.mjs';
let credential=null,client=null,pending=false,db,authEpoch=0,makeClient;
const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('listening-drive-identifiers',1);r.onupgradeneeded=()=>r.result.createObjectStore('ids');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function operation(mode,fn){db??=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('ids',mode),r=fn(tx.objectStore('ids'));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error)})}
const ids={get:key=>operation('readonly',s=>s.get(key)),put:(key,value)=>operation('readwrite',s=>s.put(value,key))};
const store=new DriveStore({credential:()=>credential,ids});
let config={clientId:'',allowedDomain:'apps.ntpc.edu.tw'},error='';
try{config=await(await fetch(new URL('./drive-config.json',import.meta.url))).json()}catch{error='無法讀取Google設定。'}
const bridge=window.StudioDrive={store,ready:false,configured:false,account:null,error:'',api:(p,o)=>store.api(p,o),asset:id=>store.asset(id),authorize(){if(!client||pending)return;pending=true;const epoch=++authEpoch;client=makeClient(epoch);try{client.requestAccessToken({prompt:'select_account'})}catch{pending=false;credential=null;bridge.account=null;bridge.error='無法開啟Google授權視窗，請重新點選；本機內容保留。';window.dispatchEvent(new Event('studio-drive-account'));window.dispatchEvent(new Event('studio-drive-ready'))}},disconnect(){authEpoch++;pending=false;credential=null;bridge.account=null;window.dispatchEvent(new Event('studio-drive-account'))}};
if(config.clientId&&/^[\w-]+\.apps\.googleusercontent\.com$/.test(config.clientId)){
 bridge.configured=true;const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
 script.onerror=()=>{bridge.error='Google登入元件無法載入，請檢查網路。';window.dispatchEvent(new Event('studio-drive-ready'))};
 script.onload=()=>{makeClient=epoch=>google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope:'openid email https://www.googleapis.com/auth/drive.file',include_granted_scopes:false,
  error_callback:()=>{if(epoch!==authEpoch)return;pending=false;credential=null;bridge.account=null;window.dispatchEvent(new Event('studio-drive-account'));bridge.error='授權視窗未完成，請重新點選；本機內容保留。';window.dispatchEvent(new Event('studio-drive-ready'))},
  callback:async response=>{if(epoch!==authEpoch)return;try{
   if(typeof response.access_token!=='string'||!response.access_token||!Number.isFinite(Number(response.expires_in))||Number(response.expires_in)<=5)throw Error('Google授權回應不完整，請重新授權。');
   if(response.error||!google.accounts.oauth2.hasGrantedAllScopes(response,'openid','email','https://www.googleapis.com/auth/drive.file'))throw Error('尚未授權所需的私人Drive檔案存取。');
   const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+response.access_token}});if(!r.ok)throw Error('無法確認Google帳號。');const user=await r.json();if(epoch!==authEpoch)return;
   if(typeof user.sub!=='string'||!user.sub||typeof user.email!=='string'||user.email_verified!==true)throw Error('Google帳號資料不完整或電子郵件尚未驗證。');
   const normalizedEmail=user.email.trim().toLowerCase();
   // Convenience check only. A static page cannot enforce an organization security boundary.
   if(user.hd!=='apps.ntpc.edu.tw'&&normalizedEmail!=='longpuchris@gmail.com')throw Error('此試版限 apps.ntpc.edu.tw 教育帳號及本人測試帳號 longpuchris@gmail.com；這是前端篩選，非後端安全門禁。');
   // Pause and detach the current row before allowing any token for another owner.
   if(bridge.account&&bridge.account.sub!==user.sub)await window.StudioSync?.detach();
   if(epoch!==authEpoch)return;credential={owner:user.sub,token:response.access_token,expiresAt:Date.now()+Number(response.expires_in||0)*1000};bridge.account=user;bridge.error='';window.dispatchEvent(new Event('studio-drive-account'));
  }catch(e){if(epoch!==authEpoch)return;credential=null;bridge.account=null;window.dispatchEvent(new Event('studio-drive-account'));bridge.error=e.message;window.dispatchEvent(new Event('studio-drive-ready'))}finally{if(epoch===authEpoch)pending=false}}
 });client=makeClient(authEpoch);bridge.ready=true;window.dispatchEvent(new Event('studio-drive-ready'))};document.head.append(script);
}else bridge.error=error||'尚未設定Google OAuth Client ID，私人Drive同步尚未啟用。';
await import('./drive-ui.js');
