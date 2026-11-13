import {DriveStore} from './drive-core.mjs?v=100';
let credential=null,client=null,pending=false,db,authEpoch=0,makeClient,waitTimer,deadlineTimer,profileController,connectionTimer,connectionFault=false;
// Quiet renewal: Google tokens last ~1 h. Near expiry (or after a 401) the next click inside the app asks Google for a
// new token for the SAME account (prompt:'' + login_hint), at most once per token, so it can never loop.
const RENEW_WINDOW=5*60*1000;let renewing=false,renewTriedToken=null,needRenew=false,renewTimer,renewMessage='';
const expiring=()=>!!credential&&!!bridge.account&&credential.expiresAt-Date.now()<RENEW_WINDOW;
function renewState(){const tried=!!credential&&renewTriedToken===credential.token;return{needed:!!credential&&!!bridge.account&&(needRenew||expiring()),renewing,tried,message:renewMessage,expiresAt:credential?.expiresAt||0}}
function connectionState(){const valid=!!credential&&!!bridge.account&&credential.expiresAt>Date.now()+5000,r=renewState();return {connected:navigator.onLine&&!pending&&valid&&!connectionFault,renew:r,label:!navigator.onLine?'離線':pending?'正在確認連接':renewing?'正在續期Google授權':!valid?(credential&&bridge.account&&!r.tried?'授權已到期 · 點畫面任一處續期':(credential||bridge.account?'需重新授權':'尚未連接')):connectionFault?'連接尚未確認，請重試':r.needed&&!r.tried?'授權即將到期 · 下次點選時自動續期':'已連接Google（非專案同步狀態）'}}
function refreshConnection(){clearTimeout(connectionTimer);const now=Date.now(),next=[credential?.expiresAt-RENEW_WINDOW-now,credential?.expiresAt-5000-now].filter(x=>x>0);if(next.length)connectionTimer=setTimeout(refreshConnection,Math.min(Math.min(...next)+1,2147483647));window.dispatchEvent(new Event('studio-drive-connection'))}
function progress(stage,message){refreshConnection();bridge.authStage=stage;bridge.authMessage=message;window.dispatchEvent(new Event('studio-drive-ready'))}
function clearWait(){clearTimeout(waitTimer);clearTimeout(deadlineTimer);waitTimer=deadlineTimer=undefined}
function cancelWaiting(message='已取消本頁等待；不代表撤銷Google授權。本機內容保留，可關閉Google視窗後重試。'){authEpoch++;pending=false;clearWait();profileController?.abort();profileController=null;credential=null;bridge.account=null;progress('idle',message);window.dispatchEvent(new Event('studio-drive-account'))}
const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('listening-drive-identifiers',1);r.onupgradeneeded=()=>r.result.createObjectStore('ids');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function operation(mode,fn){db??=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('ids',mode),r=fn(tx.objectStore('ids'));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error)})}
const ids={get:key=>operation('readonly',s=>s.get(key)),put:(key,value)=>operation('readwrite',s=>s.put(value,key))};
const store=new DriveStore({credential:()=>credential,ids});
let config={clientId:'',allowedDomain:'apps.ntpc.edu.tw'},error='';
try{config=await(await fetch(new URL('./drive-config.json',import.meta.url))).json()}catch{error='無法讀取Google設定。'}
const bridge=window.StudioDrive={connectionState,renewState,renew:()=>renew(),renewBlocked:()=>false,store,ready:false,configured:false,account:null,error:'',authStage:'idle',authMessage:'',cancelWaiting,api:(p,o)=>store.api(p,o),asset:id=>store.asset(id),authorize(){if(!client||pending)return;clearTimeout(renewTimer);renewing=false;pending=true;bridge.error='';const epoch=++authEpoch;progress('waiting','等待Google視窗完成。若Google頁面空白，請關閉該視窗回本站查看狀態；也可用Safari或Chrome直接開啟本站。');waitTimer=setTimeout(()=>{if(epoch===authEpoch&&pending)progress('waiting','尚未收到Google授權回應，不代表已連接。可繼續等待，或取消本頁等待後關閉Google視窗再試。')},20000);deadlineTimer=setTimeout(()=>{if(epoch===authEpoch&&pending)cancelWaiting('本頁等待已逾時，尚未收到Google授權回應；不代表Google拒絕。請關閉原Google視窗，再自行點選連接重試。')},120000);try{client=makeClient(epoch);client.requestAccessToken({prompt:'select_account'})}catch{clearWait();pending=false;progress('idle','');credential=null;bridge.account=null;bridge.error='無法開啟Google授權視窗，請重新點選；本機內容保留。';window.dispatchEvent(new Event('studio-drive-account'));window.dispatchEvent(new Event('studio-drive-ready'))}},disconnect(){authEpoch++;pending=false;renewing=false;clearTimeout(renewTimer);clearWait();profileController?.abort();profileController=null;progress('idle','');credential=null;bridge.account=null;window.dispatchEvent(new Event('studio-drive-account'))}};
window.addEventListener('online',refreshConnection);window.addEventListener('offline',refreshConnection);window.addEventListener('studio-drive-account',refreshConnection);window.addEventListener('pageshow',refreshConnection);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshConnection()});
const originalRequest=store.request.bind(store);store.request=async(...args)=>{const ownerCredential=credential;try{const result=await originalRequest(...args);if(credential===ownerCredential){connectionFault=false;refreshConnection()}return result}catch(e){if(credential===ownerCredential&&ownerCredential&&e.status===401)needRenew=true;if(credential===ownerCredential&&![404,409,401].includes(e.status)){connectionFault=true}if(credential===ownerCredential)refreshConnection();throw e}};
function renewDone(ok,message=''){clearTimeout(renewTimer);renewing=false;renewMessage=ok?'':message;if(ok){needRenew=false;connectionFault=false}refreshConnection();window.dispatchEvent(new Event(ok?'studio-drive-renewed':'studio-drive-connection'))}
// Must be called inside a user gesture (popup). Same account only; a different account is ignored, never switched to.
function renew(){
 if(!makeClient||!credential||!bridge.account||pending||renewing||renewTriedToken===credential.token)return false;
 renewTriedToken=credential.token;renewing=true;renewMessage='';const epoch=++authEpoch,account={sub:bridge.account.sub,email:bridge.account.email};
 renewTimer=setTimeout(()=>{if(epoch===authEpoch&&renewing){authEpoch++;renewDone(false,'續期等待逾時；請按「重新授權」，本機內容保留。')}},90000);
 try{makeClient(epoch,account).requestAccessToken({prompt:'',login_hint:account.email})}catch{renewDone(false,'無法開啟續期視窗；請按「重新授權」。');return false}
 refreshConnection();return true;
}
async function renewCallback(epoch,account,response){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{
  if(response.error||typeof response.access_token!=='string'||!response.access_token||!(Number(response.expires_in)>5)||!google.accounts.oauth2.hasGrantedAllScopes(response,'openid','email','https://www.googleapis.com/auth/drive.file'))throw Error('自動續期未完成；請按「重新授權」。');
  const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{signal:controller.signal,headers:{Authorization:'Bearer '+response.access_token}});if(!r.ok)throw Error('續期後無法確認帳號；請按「重新授權」。');const user=await r.json();
  if(epoch!==authEpoch)return;
  if(user.sub!==account.sub||credential?.owner!==account.sub||bridge.account?.sub!==account.sub)throw Error('續期時選到不同的Google帳號，已忽略（沒有切換帳號）；請按「重新授權」。');
  // Same owner: update the token in place so in-flight work keeps its account context.
  credential.token=response.access_token;credential.expiresAt=Date.now()+Number(response.expires_in)*1000;renewDone(true);
 }catch(e){if(epoch===authEpoch)renewDone(false,e.name==='AbortError'?'續期確認逾時；請按「重新授權」。':e.message)}finally{clearTimeout(timer)}}
// A click inside the app is the user gesture the Google popup needs.
document.addEventListener('click',e=>{try{if(!(e.isTrusted||navigator.userActivation?.isActive))return;const r=renewState();if(!r.needed||r.tried||renewing||pending)return;if(e.target?.closest?.('[data-drive-auth]')||bridge.renewBlocked(e))return;renew()}catch{}},true);
if(config.clientId&&/^[\w-]+\.apps\.googleusercontent\.com$/.test(config.clientId)){
 bridge.configured=true;const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
 script.onerror=()=>{bridge.error='Google登入元件無法載入，請檢查網路。';window.dispatchEvent(new Event('studio-drive-ready'))};
 script.onload=()=>{makeClient=(epoch,renewFor=null)=>google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope:'openid email https://www.googleapis.com/auth/drive.file',include_granted_scopes:false,
  error_callback:(err)=>{if(epoch!==authEpoch)return;if(renewFor)return renewDone(false,err?.type==='popup_failed_to_open'?'瀏覽器擋下續期視窗；請按「重新授權」。':'自動續期未完成；請按「重新授權」，本機內容保留。');clearWait();pending=false;progress('idle','');credential=null;bridge.account=null;window.dispatchEvent(new Event('studio-drive-account'));bridge.error=err?.type==='popup_failed_to_open'?'Google視窗未能開啟，請允許彈出視窗後重新點選。':err?.type==='popup_closed'?'Google視窗已關閉，尚未完成連接；本機內容保留。':'Google視窗未完成，請關閉該視窗後重新點選；本機內容保留。';window.dispatchEvent(new Event('studio-drive-ready'))},
  callback:async response=>{if(epoch!==authEpoch)return;if(renewFor)return renewCallback(epoch,renewFor,response);clearWait();let profileTimer;try{
   if(response.error)throw Error(response.error==='access_denied'?'Google授權未完成或已取消；本機內容保留。':'Google未完成授權，請回授權視窗確認錯誤後重試。');
   if(typeof response.access_token!=='string'||!response.access_token||!Number.isFinite(Number(response.expires_in))||Number(response.expires_in)<=5)throw Error('Google授權回應不完整，請重新授權。');
   if(response.error||!google.accounts.oauth2.hasGrantedAllScopes(response,'openid','email','https://www.googleapis.com/auth/drive.file'))throw Error('尚未授權所需的私人Drive檔案存取。');
   progress('verifying','已收到Google回應，正在確認帳號；尚未完成連接。');const controller=new AbortController();profileController=controller;profileTimer=setTimeout(()=>controller.abort(),20000);
   const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{signal:controller.signal,headers:{Authorization:'Bearer '+response.access_token}});if(!r.ok)throw Error('無法確認Google帳號。');const user=await r.json();clearTimeout(profileTimer);if(epoch!==authEpoch)return;
   if(typeof user.sub!=='string'||!user.sub||typeof user.email!=='string'||user.email_verified!==true)throw Error('Google帳號資料不完整或電子郵件尚未驗證。');
   const normalizedEmail=user.email.trim().toLowerCase();
   // Convenience check only. A static page cannot enforce an organization security boundary.
   if(user.hd!=='apps.ntpc.edu.tw'&&normalizedEmail!=='longpuchris@gmail.com')throw Error('此試版限 apps.ntpc.edu.tw 教育帳號及本人測試帳號 longpuchris@gmail.com；這是前端篩選，非後端安全門禁。');
   // Pause and detach the current row before allowing any token for another owner.
   if(bridge.account&&bridge.account.sub!==user.sub)await window.StudioSync?.detach();
   if(epoch!==authEpoch)return;credential={owner:user.sub,token:response.access_token,expiresAt:Date.now()+Number(response.expires_in||0)*1000};bridge.account=user;connectionFault=false;needRenew=false;renewMessage='';bridge.error='';refreshConnection();window.dispatchEvent(new Event('studio-drive-account'));
  }catch(e){if(epoch!==authEpoch)return;credential=null;bridge.account=null;window.dispatchEvent(new Event('studio-drive-account'));bridge.error=e.name==='AbortError'?'確認Google帳號逾時或已中止，請檢查網路後重新點選授權；本機內容保留。':e.message;window.dispatchEvent(new Event('studio-drive-ready'))}finally{clearTimeout(profileTimer);if(epoch===authEpoch){pending=false;profileController=null;progress('idle','')}}}
 });client=makeClient(authEpoch);bridge.ready=true;window.dispatchEvent(new Event('studio-drive-ready'))};document.head.append(script);
}else bridge.error=error||'尚未設定Google OAuth Client ID，私人Drive同步尚未啟用。';
await import('./drive-ui.js?v=114');
