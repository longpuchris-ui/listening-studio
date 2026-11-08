'use strict';
/* Shared-computer cleanup: removes only this site's local data (the github.io origin is shared with other sites,
   so we never call a blanket clear). Drive files and downloaded backups are untouched. */
(()=>{
const DBS=['listening-picturebook','listening-google-drive-sync','listening-drive-identifiers'];
const button=document.getElementById('clearDeviceData'),out=document.getElementById('clearDeviceStatus');
if(!button||!out)return;
const say=t=>{out.textContent=t};
const drop=name=>new Promise(resolve=>{let r;try{r=indexedDB.deleteDatabase(name)}catch{return resolve('failed')}
 r.onsuccess=()=>resolve('ok');r.onerror=()=>resolve('failed');r.onblocked=()=>resolve('blocked')});
button.addEventListener('click',async()=>{
 if(!confirm('要清除這台裝置上「聽力錄音室」的所有本機資料嗎？\n\n會移除：目前專案、草稿、已匯出成品、待同步副本、共同資料夾與 AI 配音的偏好設定。\n不會移除：已下載的備份檔、Google Drive 或共同資料夾裡的檔案。\n\n要保留的內容，請先回資料庫「備份目前專案」。'))return;
 if(!confirm('最後確認：清除後無法復原。\n請先關閉其他開著聽力錄音室的分頁，再按「確定」。'))return;
 button.disabled=true;say('正在清除…');
 try{for(const k of Object.keys(localStorage))if(k.startsWith('listening-'))localStorage.removeItem(k)}catch{}
 try{for(const k of Object.keys(sessionStorage))if(k.startsWith('listening-'))sessionStorage.removeItem(k)}catch{}
 const results=await Promise.all(DBS.map(drop));
 button.disabled=false;
 if(results.includes('blocked'))say('還有其他聽力錄音室分頁開著，部分資料要等那些分頁關閉後才會清除。請關閉其他分頁後再按一次。');
 else if(results.includes('failed'))say('部分資料沒有清除成功。請改用瀏覽器設定中的「清除網站資料」。');
 else say('已清除這台裝置上的聽力錄音室資料。若曾登入 Google，請另外登出瀏覽器中的 Google 帳號。');
});
})();
