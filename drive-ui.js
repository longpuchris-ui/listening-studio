/* Optional personal sync. Disabled unless an authenticated same-origin API exists. */
(()=>{
 const tab=crypto.randomUUID(); // unique page instance; abandoned jobs remain in the pending-copy list
 const DEVICE=(()=>{try{let d=localStorage.getItem('listening-sync-device');if(!/^[\w-]{8,40}$/.test(d||'')){d=crypto.randomUUID();localStorage.setItem('listening-sync-device',d)}return d}catch{return crypto.randomUUID()}})();let retryDelay=30000;
 const TAB_LOCK='listening-sync-tab:';try{navigator.locks?.request(TAB_LOCK+tab,()=>new Promise(()=>{})).catch(()=>{})}catch{}
 let localDB,session=null,row=null,serial=Promise.resolve(),running=false,opening=false,opener=null,syncError="",upload=null,remoteHead=null;
 const button=document.createElement('button');button.className='quiet sync-entry';button.textContent='雲端專案';button.type='button';document.querySelector('.top-actions').prepend(button);
 function updateConnectionIndicator(){const value=window.StudioDrive?.connectionState?.()||{connected:false,label:navigator.onLine?'尚未連接':'離線'};button.dataset.connected=String(value.connected);let lamp=button.querySelector('.cloud-connection-light'),copy=button.querySelector('.cloud-connection-copy');if(!lamp){lamp=document.createElement('span');lamp.className='cloud-connection-light';lamp.setAttribute('aria-hidden','true');copy=document.createElement('span');copy.className='cloud-connection-copy';button.append(lamp,copy)}const sum=syncSummary();button.dataset.sync=sum?.kind||'';copy.textContent=sum?(sum.short+(value.connected||running?'':' · '+value.label)):value.connected?'已連接Google':value.label;button.title='雲端專案 · '+(sum?sum.text+' · ':'')+value.label;try{window.dispatchEvent(new Event('studio-sync-status'))}catch{}button.setAttribute('aria-label',button.title);const safe=document.getElementById('syncSafe');if(safe){safe.textContent=sum?sum.text:'';safe.dataset.kind=sum?.kind||''}}
 for(const event of ['studio-drive-connection','studio-drive-ready','online','offline'])window.addEventListener(event,updateConnectionIndicator);updateConnectionIndicator();
 const dialog=document.createElement('dialog');dialog.className='sync-dialog';dialog.innerHTML='<div class="dialog-top"><h2>雲端專案</h2><button type="button" id="syncClose" aria-label="關閉同步視窗">✕</button></div><p class="sync-privacy-note"><strong class="sync-browser-advice">建議以 Safari／Chrome 直接開啟本站；若 Google 視窗空白，請避免從 App 內建瀏覽器連接。</strong><br>僅存取本工具建立或你授權的 Drive 檔案；確認啟用專案後才上傳稿件與原音。<br><a href="privacy.html" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;min-height:44px">閱讀隱私與資料說明 ↗</a></p><p id="syncStatus" role="status" aria-live="polite"></p><p id="syncSafe"></p><p id="syncDetail"></p><p id="syncCurrent"></p><div id="syncControls"></div><h3>雲端上的專案</h3><div id="syncProjects"></div><h3>這台裝置的待同步副本</h3><div id="syncPending"></div>';
 document.body.append(dialog);
 const showHomeEntry=()=>{button.hidden=document.querySelector('#worktable').hidden};new MutationObserver(showHomeEntry).observe(document.querySelector('#worktable'),{attributes:true,attributeFilter:['hidden']});showHomeEntry();
 const el=id=>dialog.querySelector('#'+id);
function showCloudProjects(projects){
 if(!session)return;
 const groups=new Map();for(const p of projects){if(!groups.has(p.id))groups.set(p.id,[]);groups.get(p.id).push(p)}
 for(const[id,versions]of groups){
  const group=document.createElement('section');group.className='cloud-project-group';group.style.cssText='margin:12px 0;padding:12px;border:1px solid #ddd4e5;border-radius:16px;overflow-wrap:anywhere';
  const heading=document.createElement('h4');heading.style.margin='0 0 8px';heading.textContent=versions[0].title+' · 專案 '+String(id).slice(0,8);heading.title='完整專案識別：'+id;group.append(heading);
  const note=document.createElement('p');note.style.cssText='font-size:14px;margin:4px 0 8px';note.textContent=versions.length>1?'這是同一專案的並行版本；尚未合併，請自行選擇。時間不代表哪份應保留。':'獨立雲端專案；同名不代表同一份。';group.append(note);
  for(const p of versions){const b=document.createElement('button');b.type='button';b.className='sync-project';const linked=row?.owner===session?.owner&&row.snapshot.projectId===state.projectId&&p.id===state.projectId;
   const exact=linked&&row.revision===p.revision;const when=p.updatedAt&&Number.isFinite(Date.parse(p.updatedAt))?new Date(p.updatedAt).toLocaleString('zh-TW'):'時間未提供';
   b.textContent=(exact?'目前編輯的基底 · ':linked?'目前專案的另一版本 · ':'')+(p.conflict?'並行版本 ':'版本 ')+String(p.revision).slice(0,8)+' · '+when;b.title='完整版本：'+p.revision;
   if(exact)b.setAttribute('aria-current','true');b.onclick=()=>openProject(p.id,p.revision,p.conflict?p.heads:null).catch(e=>{el('syncDetail').textContent=e.message});group.append(b);
  }el('syncProjects').append(group);
 }
 if(!projects.length){const empty=document.createElement('p');empty.textContent='目前帳號尚無本工具的雲端專案。';el('syncProjects').append(empty)}
}
function showCurrentCloud(){const linked=session&&row?.owner===session?.owner&&row.snapshot.projectId===state.projectId;el('syncCurrent').textContent='目前正在編輯：'+state.title+(linked?' · 雲端專案 '+String(state.projectId).slice(0,8)+' · 基底 '+String(row.revision||'尚未上傳').slice(0,8)+(row.dirty?' · 含未上傳的本機修改':'')+(row.conflict?' · 有並行衝突，尚未選定要保留哪份':''):' · 尚未連結雲端版本');}

 let linkedHistory=false,controlBusy=false,linkLoading=false;
 const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const snapshotSignature=async value=>canonical((await SyncCodec.pack(migrateProject(structuredClone(value)))).manifest);
 // Cheap pre-check (no hashing): recordings compared by size/type only.
 const quickSignature=async value=>canonical(JSON.parse(JSON.stringify(migrateProject(structuredClone(value)),(_k,v)=>v instanceof Blob?{blobSize:v.size,blobType:v.type}:v)));
 async function liveTabs(){try{const q=await navigator.locks?.query?.();return q?new Set([...(q.held||[]),...(q.pending||[])].map(l=>l.name)):null}catch{return null}}
 async function loadLinkedRow(){linkLoading=true;try{
  linkedHistory=false;if(!state.projectId||!session)return null;const expectedOwner=session.owner;
  const current=await dbop('readonly',s=>s.get(key(state.projectId)));if(session?.owner!==expectedOwner)return null;if(current)return current;
  const candidates=(await dbop('readonly',s=>s.getAll())).filter(r=>r.owner===expectedOwner&&r.snapshot.projectId===state.projectId);linkedHistory=candidates.length>0;
  if(session?.owner!==expectedOwner)return null;
  // Resume after reload: exactly one unfinished row whose page is gone (its tab lock is free) and whose
  // snapshot is exactly the project now open. Anything else stays a manual choice in 本機保留副本.
  const live=await liveTabs();if(live){const open=candidates.filter(r=>(r.dirty||r.job||r.conflict)&&!r.paused&&!String(r.key).includes(':switch:')&&!live.has(TAB_LOCK+String(r.key).split(':').pop()));
   if(open.length===1){const orphan=open[0],sig=await quickSignature(state);if(sig===await quickSignature(orphan.snapshot)){const before=await snapshotSignature(state);
    if(await snapshotSignature(orphan.snapshot)===before&&session?.owner===expectedOwner&&state.projectId===orphan.snapshot.projectId&&await snapshotSignature(state)===before){
     const adopted={...structuredClone(orphan),key:key(state.projectId),snapshot:structuredClone(state),fingerprint:null};await store(adopted);try{await dbop('readwrite',s=>s.delete(orphan.key))}catch{}return adopted}}}}
  const safe=candidates.filter(r=>!r.dirty&&!r.job&&!r.conflict&&r.revision);
  if(!safe.length||new Set(safe.map(r=>r.revision)).size!==1)return null;
  // Same project ID alone is insufficient: do not attach unsynced local content as clean.
  const before=await snapshotSignature(state),owner=expectedOwner,id=state.projectId;
  const source=safe.find(r=>JSON.stringify(r.snapshot)===JSON.stringify(state))||safe[0];
  if(await snapshotSignature(source.snapshot)!==before)return null;
  if(session?.owner!==owner||state.projectId!==id||await snapshotSignature(state)!==before)return null;
  const recovered={...structuredClone(source),key:key(id),snapshot:structuredClone(state),position:position()};await store(recovered);for(const old of safe)if(old.key!==recovered.key)try{await dbop('readwrite',s=>s.delete(old.key))}catch{}return recovered;}finally{linkLoading=false}
 }
 async function runCloudControl(label,fn){
  if(controlBusy||cloudOpen)return;controlBusy=true;syncError='';status('處理中 · '+label);const buttons=[...el('syncControls').querySelectorAll('button')].map(b=>[b,b.disabled]);for(const[b]of buttons)b.disabled=true;
  try{await fn();if(el('syncStatus').textContent==='處理中 · '+label)status('操作已結束 · 請查看下方狀態');if(label==='重新整理雲端版本')status('雲端版本已重新整理');else if(label==='重試同步'&&!row?.dirty&&!row?.conflict)status('已檢查 · 目前沒有待上傳修改')}
  catch(e){status('操作未完成 · 本機保留');detailError(e)}
  finally{controlBusy=false;for(const[b,d]of buttons)if(b.isConnected)b.disabled=d;}
 }

 const busy=()=>!!rec||building||arrangementBusy;
 const position=()=>({page:['record','arrange','export'].includes(page)?page:'record',active,mobileClipId});
 function detailError(error){syncError=error.message||String(error);el('syncDetail').textContent=syncError}
 function status(text){button.textContent='雲端專案';el('syncStatus').textContent=text;updateConnectionIndicator()}
 // ---- what the teacher needs to know before switching devices ----
 const hhmm=t=>t&&Number.isFinite(+new Date(t))?new Date(t).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}):'';
 const mb=n=>(n/1048576).toFixed(n<10485760?1:0);
 // Recordings in the local copy that are not yet confirmed on Drive (needs the per-row hash index; old rows report null).
 function pendingRecordings(r){if(!r?.snapshot||!r.hashes)return null;let n=0;for(const c of SyncCodec.inventory(r.snapshot))if(c.blob){const e=r.hashes[c.id];if(!e||!e.uploaded||e.version!==c.version||e.size!==c.blob.size)n++}return n}
 function syncSummary(){
  if(!row||!session||row.owner!==session.owner||row.snapshot?.projectId!==state?.projectId)return null;
  if(row.conflict)return{kind:'conflict',short:'版本衝突 · 請選擇',text:'有版本衝突：兩份內容都保留，請在這裡選擇。換裝置前先處理。'};
  if(running&&upload)return{kind:'pending',short:'上傳中 '+upload.done+'／'+upload.total,text:'上傳中：錄音 '+upload.done+'／'+upload.total+' · '+mb(upload.bytesDone)+'／'+mb(upload.bytesTotal)+' MB。完成前請先別換裝置。'};
  if(row.dirty||row.job){const n=running?null:pendingRecordings(row),what=n?n+' 段錄音'+(row.dirty?'與修改':''):'修改';return{kind:'pending',short:'待上傳 '+(n?n+' 段':'修改'),text:(row.paused?'同步已暫停 · ':running?'同步中 · ':'')+'待上傳：'+what+'。先別換裝置；上傳完成會顯示「已同步」。'}}
  if(row.paused)return{kind:'paused',short:'同步已暫停',text:'同步已暫停：這台的修改不會上傳。'};
  if(remoteHead&&remoteHead.project===row.snapshot.projectId&&remoteHead.revision!==row.revision)return{kind:'newer',short:'另一台有新版本',text:'雲端有另一台裝置的較新版本'+(remoteHead.at?'（'+new Date(remoteHead.at).toLocaleString('zh-TW')+'）':'')+'；關閉此視窗即可選擇載入。'};
  if(!row.revision)return{kind:'pending',short:'尚未上傳',text:'尚未上傳到雲端。'};
  const last=row.lastSync||{at:row.syncedAt,by:'this'},who=last.by==='other'?'另一台':'這台裝置';
  const sure=remoteHead&&remoteHead.project===row.snapshot.projectId&&remoteHead.revision===row.revision;
  return{kind:'ok',short:'已同步 '+hhmm(last.at)+' · '+(last.by==='other'?'另一台':'這台'),text:'已同步 · '+(hhmm(last.at)||'時間未記錄')+' · '+(last.by==='other'?'從另一台裝置載入':'由這台裝置上傳')+(sure?' · 雲端最新就是這份，可以換裝置繼續。':' · 開啟此視窗會再向雲端確認。')};
 }
 // Cached sha256 per clip (id+version+size+type) so a text-only edit does not re-read every recording.
 // Kept on the outbox row: the row's lineage only changes audio through clip.version++, and a cloud open seeds it from the manifest.
 function hashIndex(target){target.hashes??={};return async(blob,c)=>{const ok=typeof c.id==='string'&&Number.isFinite(c.version),e=ok&&target.hashes[c.id];if(e&&e.version===c.version&&e.size===blob.size&&e.type===blob.type)return e.hash;const hash=await SyncCodec.hash(await blob.arrayBuffer());if(ok)target.hashes[c.id]={version:c.version,size:blob.size,type:blob.type,hash,uploaded:false};return hash}}
 function seedHashes(manifest){const hashes={};for(const c of SyncCodec.inventory(manifest))if(c.asset&&typeof c.id==='string'&&Number.isFinite(c.version))hashes[c.id]={version:c.version,size:c.asset.size,type:c.asset.mime,hash:c.asset.id,uploaded:true};return hashes}
 const markUploaded=(target,hashes)=>{for(const e of Object.values(target.hashes||{}))if(hashes.has(e.hash))e.uploaded=true};
 const openDB=()=>new Promise((resolve,reject)=>{let done=false;const r=indexedDB.open('listening-google-drive-sync',1),timer=setTimeout(()=>{done=true;reject(Error('同步佇列開啟逾時；本機專案仍保留'))},10000);r.onupgradeneeded=()=>r.result.createObjectStore('outbox',{keyPath:'key'});r.onsuccess=()=>{if(done){r.result.close();return}done=true;clearTimeout(timer);resolve(r.result)};r.onerror=()=>{if(done)return;done=true;clearTimeout(timer);reject(r.error)}});
 async function dbop(mode,fn){localDB??=await openDB();return new Promise((resolve,reject)=>{let tx,req,done=false,timer;const finish=e=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(req?.result)};try{tx=localDB.transaction('outbox',mode);tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error||Error('同步佇列保存失敗'));tx.onabort=()=>finish(tx.error||Error('同步佇列已中止'));timer=setTimeout(()=>{finish(Error('同步佇列逾時，已中止；本機專案仍保留，請重試同步'));try{tx.abort()}catch{}},10000);req=fn(tx.objectStore('outbox'))}catch(e){finish(e);try{tx?.abort()}catch{}}})}

 const store=r=>{r.savedAt=Date.now();return dbop('readwrite',s=>s.put(structuredClone(r)))};
 const key=id=>session.owner+':'+id+':'+tab;
 function enqueue(fn){serial=serial.catch(()=>{}).then(fn).catch(e=>{status('本機同步佇列保存失敗');detailError(e);throw e});return serial}
 async function api(path,options={}){return window.StudioDrive.api(path,options)}
 async function connect(){const s=await api('/session');if(!s.owner||!s.limits)throw Error('同步服務尚未設定');session=s;return s}
 async function renderPanel(){if(cloudOpen)return;showCurrentCloud();el('syncControls').replaceChildren();el('syncProjects').replaceChildren();el('syncPending').replaceChildren();const auth=document.createElement('button');auth.type='button';auth.textContent=window.StudioDrive.account?'重新授權／切換Google帳號':'連接Google帳號';auth.dataset.driveAuth='';auth.disabled=!window.StudioDrive.ready||window.StudioDrive.authStage!=='idle';auth.onclick=()=>{if(busy()||running)return toast('請先完成目前錄音或同步');window.StudioDrive.authorize()};el('syncControls').append(auth);const stage=window.StudioDrive.authStage;if(stage!=='idle'){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消本頁等待';cancel.onclick=()=>window.StudioDrive.cancelWaiting();el('syncControls').append(cancel);el('syncDetail').textContent=window.StudioDrive.authMessage;status(stage==='verifying'?'正在確認Google帳號':'等待Google授權');return}if(window.StudioDrive.authMessage){el('syncDetail').textContent=window.StudioDrive.authMessage;status('尚未完成新的Google連接');return}if(!session){el('syncDetail').textContent=window.StudioDrive.error||'';return}
 el('syncDetail').textContent=syncError||(window.StudioDrive.renewState?.().message?window.StudioDrive.renewState().message+' ':'')+(session.mode==='local-mock'?'本地模擬：兩個瀏覽器情境測試，不是真實雲端。 ':'')+'Google帳號：'+(window.StudioDrive.account?.email||'');
 const add=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=()=>runCloudControl(label,fn);el('syncControls').append(b)};
 add('重新整理雲端版本',async()=>{if(busy()||running)throw Error('請先完成目前工作');await renderPanel()});if(!row||row.snapshot.projectId!==state.projectId){if(linkLoading){status('正在確認本機同步連結 · 請稍候')}else if(linkedHistory){el('syncDetail').textContent='這份本機專案已有同步紀錄，但不能安全自動接回；請從下方接續本機保留副本或明確選擇雲端版本，不會建立新的根版本。'}else add('啟用這份專案的私人同步',enable);}
 else{add(row.paused?'恢復同步':'暫停同步',async()=>{await enqueue(async()=>{row.paused=!row.paused;await store(row)});status(row.paused?(running?'已要求暫停 · 等待目前傳輸結束':'同步已暫停'):'等待同步');renderPanel();flush()});add('重試同步',()=>flush());if(row.conflict){add('以這台裝置的內容為準',resolveWithLocal);add('保留此裝置內容為另一份雲端專案',fork);add('選擇下方雲端版本',async()=>{el('syncProjects').scrollIntoView({block:'nearest'});el('syncProjects').querySelector('button')?.focus();el('syncDetail').textContent='請選擇下方明確版本；載入後再確認，目前內容會先另存草稿。'});}}
 add('清理雲端舊版本與未使用錄音',cleanupCloud);el('syncPending').replaceChildren();const panelOwner=session.owner,pendingRows=await dbop('readonly',s=>s.getAll());if(session?.owner!==panelOwner)return;for(const saved of pendingRows){if(saved.owner!==session.owner||(!saved.dirty&&!saved.paused)||saved.key===row?.key)continue;const b=document.createElement('button');b.type='button';b.className='sync-project';b.textContent=saved.snapshot.title+' · 本機保留副本 · 專案 '+String(saved.snapshot.projectId).slice(0,8)+' · 基底 '+String(saved.revision||'尚未上傳').slice(0,8)+(saved.dirty?' · 有未上傳修改':' · 已暫停')+' · '+(saved.savedAt?new Date(saved.savedAt).toLocaleString('zh-TW'):'保存時間未提供');b.onclick=()=>resumeLocal(saved).catch(e=>{detailError(e)});el('syncPending').append(b)}
 el('syncProjects').replaceChildren();try{const projects=await api('/projects');if(session?.owner!==panelOwner)return;noteRemote(projects);if(row&&!row.conflict&&projects.some(p=>p.id===row.snapshot.projectId&&p.conflict)){row.conflict=true;await store(row);status('版本衝突 · 所有版本保留');return renderPanel()}showCloudProjects(projects)}catch(e){detailError(e)}
 }
 function noteRemote(projects){if(!row)return;const mine=projects.filter(p=>p.id===row.snapshot.projectId);remoteHead=mine.length===1?{project:mine[0].id,revision:mine[0].revision,at:mine[0].updatedAt,device:mine[0].device}:null;updateConnectionIndicator()}
 async function enable(){if(linkLoading)throw Error('本機同步紀錄仍在確認，請稍候。');if(state.projectId&&(await dbop('readonly',s=>s.getAll())).some(r=>r.owner===session?.owner&&r.snapshot.projectId===state.projectId))throw Error('已有同步紀錄，請接續保留副本或選擇雲端版本，不會另建根版本。');if(busy())throw Error('請先停止錄音或完成處理');if(!confirm('啟用後，這份專案的朗讀稿及所有原始錄音（含停用片段）會傳到你目前Google帳號的私人Drive，供同帳號跨裝置編輯。其他本機素材庫不會上傳。確定啟用？'))return;
 state.projectId=state.projectId||crypto.randomUUID();state.syncSchema=1;row={key:key(state.projectId),owner:session.owner,revision:0,generation:0,dirty:true,snapshot:structuredClone(state),position:position(),paused:false};await store(row);await persist();await capture(state);renderPanel();}
 async function capture(snapshot){if(opening||!row||row.snapshot.projectId!==snapshot.projectId)return;const target=row,snap=structuredClone(snapshot),pos=position();const fingerprint=JSON.stringify({snap,pos},(k,v)=>v instanceof Blob?{size:v.size,type:v.type}:v);await enqueue(async()=>{if(row!==target||session?.owner!==target.owner)return;if(target.fingerprint===fingerprint)return;target.fingerprint=fingerprint;target.snapshot=snap;target.position=pos;target.generation++;target.dirty=true;try{await store(target)}catch(e){target.fingerprint=null;throw e}if(row===target)status(navigator.onLine?'已存本機 · 等待同步':'離線 · 已存本機')});if(row===target)scheduleFlush()}
 let flushTimer=0;function scheduleFlush(ms=6000){clearTimeout(flushTimer);flushTimer=setTimeout(()=>flush(),ms)}
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&row?.dirty){clearTimeout(flushTimer);flush()}});
 async function flush(){clearTimeout(flushTimer);if(running||!row||row.paused||row.conflict||!row.dirty)return;if(!navigator.onLine){status('離線 · 已存本機');return}running=true;syncError='';const syncingRow=row;try{
 const who=await api('/session');if(who.owner!==row.owner)throw Error('登入帳號已變更，未上傳本機專案');
 const resumed=!!row.job;
 await enqueue(async()=>{if(row!==syncingRow||row.job)return;status('同步中 · 整理本機錄音');const packed=await SyncCodec.pack(row.snapshot,hashIndex(row)),blobs=[...packed.assets.values()];if(blobs.some(b=>b.size>session.limits.assetBytes)||blobs.reduce((n,b)=>n+b.size,0)>session.limits.ownerBytes)throw Error('這份專案超過同步容量上限；未上傳，不會自動升級');row.job={operationId:crypto.randomUUID(),baseRevision:row.revision,mergeParents:row.mergeParents||[],manifest:packed.manifest,assets:[...packed.assets],position:row.position,generation:row.generation};await store(row)});
 if(row!==syncingRow||!row.job)return;
 const current=row,job=structuredClone(row.job),id=job.manifest.projectId;status('同步中 · 檢查雲端已有的錄音 · 本機原音已保留');
 const check=await api('/assets/missing',{method:'POST',body:JSON.stringify({items:job.assets.map(([hash,blob])=>({hash,size:blob.size}))})}),missing=new Set(check.missing);
 markUploaded(current,new Set(job.assets.map(([hash])=>hash).filter(hash=>!missing.has(hash))));
 const todo=job.assets.filter(([hash])=>missing.has(hash)),already=resumed?job.assets.length-todo.length:0;
 upload={done:0,total:todo.length,bytesDone:0,bytesTotal:todo.reduce((n,[,b])=>n+b.size,0)};
 // n/m and MB so a teacher on mobile data can see it moving; a reload resumes from the outbox job (Drive already has the finished ones).
 for(const [assetId,blob]of todo){if(row!==current||row.paused)break;status('同步中 · 上傳錄音 '+(upload.done+1)+'／'+upload.total+' · '+mb(upload.bytesDone)+'／'+mb(upload.bytesTotal)+' MB'+(already?' · 續傳（已在雲端 '+already+' 段）':''));await api('/assets/'+assetId,{method:'PUT',headers:{'Content-Type':blob.type},body:blob});upload.done++;upload.bytesDone+=blob.size;markUploaded(current,new Set([assetId]))}
 if(row===current&&!row.paused){
 status('同步中 · 寫入雲端版本');
 const result=await api('/projects/'+id,{method:'POST',device:DEVICE,headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:job.operationId,baseRevision:job.baseRevision,mergeParents:job.mergeParents||[],manifest:job.manifest,position:job.position})});
 await enqueue(async()=>{if(row!==current)return;row.revision=result.revision;row.job=null;row.mergeParents=[];row.dirty=row.generation!==job.generation;row.syncedAt=Date.now();row.lastSync={at:row.syncedAt,by:'this',revision:result.revision};markUploaded(row,new Set(job.assets.map(([hash])=>hash)));await store(row)});
 if(row===current){retryDelay=30000;remoteHead={project:id,revision:result.revision,at:Date.now()};upload=null;status(row.dirty?'已存本機 · 等待同步':'已同步 · '+hhmm(Date.now())+' · 由這台裝置上傳');if(row.dirty)scheduleFlush()}
 }
 }catch(e){if(row!==syncingRow)return;if(e.status===409){await enqueue(async()=>{if(row.job&&!row.job.mergeParents?.length)row.job=null;row.conflict=true;await store(row)});status('另一台裝置也改過 · 兩份內容都保留，請選擇')}
 else{if(e.status===401){const r=window.StudioDrive.renewState?.();status(r?.needed&&!r.tried?'Google授權到期 · 點畫面任一處即可續期（同一帳號）；本機保留':'Google授權到期 · 請按「重新授權」；本機保留')}else if(!e.status||e.status>=500||e.status===429){retryDelay=Math.min(retryDelay*2,600000);status(navigator.onLine?'同步未完成 · 本機保留，約 '+Math.round(retryDelay/60000)+' 分鐘後自動重試':'離線 · 已存本機');scheduleFlush(retryDelay)}else status('同步未完成 · 本機保留');enqueue(()=>row===syncingRow&&store(row)).catch(()=>{})}detailError(e);}finally{running=false;upload=null;if(row?.paused)status('同步已暫停');updateConnectionIndicator();if(dialog.open)renderPanel().catch(e=>{detailError(e)})}}
 async function resolveWithLocal(){if(busy()||running)throw Error('請先完成目前工作');const projects=await api('/projects'),heads=[...new Set(projects.filter(p=>p.id===row.snapshot.projectId).flatMap(p=>p.heads||[p.revision]))];if(!confirm('以這台裝置目前的內容作為最新版本？\n雲端上另一台裝置的版本會變成舊版（暫時保留在雲端歷史中，之後會自動清理）。'))return;await enqueue(async()=>{row.mergeParents=heads.filter(h=>h!==row.revision);row.job=null;row.conflict=false;row.dirty=true;row.generation++;await store(row)});syncError='';await flush()}
 async function cleanupCloud(){if(busy()||running)throw Error('請先完成目前工作');if(!confirm('清理雲端：每份專案只保留最近的版本，並刪除已不再使用的舊錄音（一小時內上傳的不會刪）。\n目前開啟的內容與各專案最新版本不受影響。確定清理？'))return;status('清理中…');const r=await api('/cleanup',{method:'POST'});status('清理完成 · 移除 '+r.revisions+' 個舊版本、'+r.audio+' 段舊錄音（約 '+(r.freedBytes/1048576).toFixed(1)+' MB）')}
 async function prepareReplacement(incoming,next){const owner=session?.owner,previousRow=row,staged={...next,key:next.key+':switch:'+crypto.randomUUID(),paused:true};try{await replaceLocalProject(incoming,async()=>{if(session?.owner!==owner)throw Error('登入帳號已變更，未切換專案');if(previousRow){previousRow.paused=true;await store(previousRow)}await store(staged);if(session?.owner!==owner)throw Error('登入帳號已變更，未切換專案')},()=>session?.owner===owner&&(!window.StudioDrive||window.StudioDrive.account?.sub===owner))}catch(e){try{await dbop('readwrite',s=>s.delete(staged.key))}catch{}throw e}if(session?.owner!==owner){row=null;throw Error('專案已存本機；帳號已變更，同步保持停止')}row={...next,paused:true};try{await store(row);await dbop('readwrite',s=>s.delete(staged.key))}catch(e){row=staged;detailError(Error('專案已存本機；同步連結暫存為保留副本：'+e.message))}}

 async function fork(){if(busy()||running)throw Error('請先停止錄音並等同步工作結束');const incoming=structuredClone(state);incoming.projectId=crypto.randomUUID();incoming.title+='（此裝置副本）';const next={key:key(incoming.projectId),owner:session.owner,revision:0,generation:0,dirty:true,snapshot:structuredClone(incoming),position:position(),paused:true};await prepareReplacement(incoming,next);render();await renderPanel();status('副本已存本機 · 同步暫停，確認後可恢復同步')}
 async function resumeLocal(saved){if(busy()||running)throw Error('請先完成目前工作');if(!confirm('接續這份本機副本？目前內容會先另存草稿。'))return;const incoming=migrateProject(validateProject(structuredClone(saved.snapshot))),next={...structuredClone(saved),key:key(incoming.projectId),paused:true};await prepareReplacement(incoming,next);active='intro';mobileClipId=null;editClip=null;render();renderPanel();status('本機副本已開啟 · 同步暫停')}
 // The download phase is cancellable; local replacement starts only after validation and confirmation.
 let cloudOpen=null;
 function cancelCloudOpen(message='已取消開啟；目前專案未替換。'){
  const task=cloudOpen;if(!task||task.applying)return;
  task.cancelled=true;task.message=message;task.reject(Object.assign(Error(message),{cloudCancelled:true}));
 }
 function startCloudOpen(){
  let reject;const stop=new Promise((_,r)=>reject=r);stop.catch(()=>{});
  const task={owner:window.StudioDrive.account?.sub,cancelled:false,applying:false,stop,reject,disabled:[]};cloudOpen=task;
  const panel=document.createElement('div');panel.id='cloudOpenProgress';panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');
  const text=document.createElement('p'),cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消開啟';cancel.onclick=()=>cancelCloudOpen();panel.append(text,cancel);el('syncControls').before(panel);task.panel=panel;task.text=text;task.cancel=cancel;
  for(const b of dialog.querySelectorAll('button'))if(b!==cancel&&b.id!=='syncClose'){task.disabled.push([b,b.disabled]);b.disabled=true}
  task.timer=setTimeout(()=>cancelCloudOpen('開啟等待逾時，尚未替換目前專案；請檢查網路後再點選專案重試。'),120000);
  status('正在準備雲端專案 · 本機保留');text.textContent='讀取專案版本中，完成下載與校驗後才會詢問是否開啟。';return task;
 }
 function checkCloudOpen(task){if(task.cancelled||cloudOpen!==task)throw Object.assign(Error(task.message||'開啟已取消'),{cloudCancelled:true});if(window.StudioDrive.account?.sub!==task.owner)throw Error('Google帳號已變更，未開啟舊帳號專案。')}
 async function waitCloudOpen(task,promise){const result=await Promise.race([promise,task.stop]);checkCloudOpen(task);return result}
 function finishCloudOpen(task){clearTimeout(task.timer);task.panel.remove();for(const[b,disabled]of task.disabled)if(b.isConnected)b.disabled=disabled;if(cloudOpen===task)cloudOpen=null}
 dialog.addEventListener('close',()=>cancelCloudOpen());
 window.addEventListener('studio-drive-account',()=>{if(cloudOpen&&window.StudioDrive.account?.sub!==cloudOpen.owner)cancelCloudOpen('帳號已變更，開啟已取消；目前專案未替換。')});

 async function openProject(id,revision,heads=null,preConfirmed=false){if(busy()||running||opening)throw Error('請先停止錄音或等目前同步完成');invalidateAudioImport();if(row?.owner===session?.owner&&state.projectId===id&&row.revision===revision&&!row.dirty&&!row.conflict){status('目前已開啟此版本');return}opening=true;const task=startCloudOpen();try{
 const remote=await waitCloudOpen(task,api('/projects/'+encodeURIComponent(id)+(revision?'?revision='+encodeURIComponent(revision):'')));checkCloudOpen(task);task.text.textContent='下載並校驗原始錄音中；目前專案未替換。';let loaded=0;const incoming=await waitCloudOpen(task,SyncCodec.unpack(remote.manifest,async assetId=>{checkCloudOpen(task);const blob=await waitCloudOpen(task,window.StudioDrive.asset(assetId));task.text.textContent='已校驗 '+(++loaded)+' 段原音，繼續準備中；目前專案未替換。';return blob}));validateProject(incoming);checkCloudOpen(task);
 if(busy())throw Error('錄音中不會替換專案');if(!preConfirmed&&!confirm(heads?.length>1?'以這個版本為準繼續編輯？\n其他並行版本會變成舊版（暫時保留在雲端歷史中）；目前內容會先保存為本機草稿。':'開啟雲端專案繼續編輯？目前內容會先保存為本機草稿；不同版本不會被覆蓋。')){status('未開啟雲端專案 · 本機保留');return;}
 checkCloudOpen(task);task.applying=true;clearTimeout(task.timer);task.cancel.disabled=true;task.text.textContent='正在保留本機草稿並開啟專案，請稍候。';const others=(heads||[]).filter(h=>h!==remote.revision),next={key:key(id),owner:session.owner,revision:remote.revision,generation:0,dirty:others.length>0,mergeParents:others,snapshot:structuredClone(incoming),position:remote.position,paused:true,hashes:seedHashes(remote.manifest),lastSync:{at:Date.now(),by:remote.device&&remote.device===DEVICE?'this':'other',revision:remote.revision}};await prepareReplacement(migrateProject(incoming),next);
 editClip=null;active=remote.position?.active||'intro';if(!['intro','end',...state.sections.map(s=>s.id)].includes(active))active='intro';remoteHead={project:id,revision:remote.revision,at:Date.now()};mobileClipId=remote.position?.mobileClipId||null;row.paused=false;try{await store(row)}catch(e){row.paused=true;detailError(e);status('專案已存本機 · 同步暫停，請重試');render();await renderPanel();return}render();enterRoom(['record','arrange','export'].includes(remote.position?.page)?remote.position.page:'record');dialog.close();syncError='';status(row.dirty?'已選定版本 · 正在通知雲端':'已同步 · 繼續編輯');if(row.dirty)flush();
 }catch(e){status(task.applying?'開啟未完成 · 請檢查本機草稿':task.cancelled?'開啟已取消 · 本機保留':'開啟失敗 · 本機保留');detailError(e); }finally{finishCloudOpen(task);opening=false}}
 button.onclick=async()=>{if(busy())return toast('請先停止錄音或完成處理');opener=button;dialog.showModal();try{await connect();if(!row&&state.projectId)row=await loadLinkedRow();status(row?.conflict?'版本衝突 · 兩份內容均保留':row?.dirty?'已存本機 · 等待同步':'跨裝置續編');await renderPanel();flush()}catch(e){session=null;status(window.StudioDrive.configured?'尚未連接Google':'同步服務尚未啟用');renderPanel()}};
 el('syncClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>opener?.focus());
 window.addEventListener('online',()=>flush());
 window.addEventListener('studio-drive-ready',()=>{if(dialog.open)renderPanel()});
 window.addEventListener('studio-drive-account',async()=>{try{const before=session?.owner;await connect();
  // Same account re-authorised: keep the live row (replacing it mid-upload used to drop the commit result).
  if(!(row&&before===session.owner&&row.owner===session.owner)){row=null;if(state.projectId)row=await loadLinkedRow()}status('Google帳號已連接');await renderPanel();flush();if(!dialog.open)checkNewer()}catch(e){session=null;row=null;status('請重新授權Google');renderPanel()}});

 window.addEventListener('studio-drive-renewed',async()=>{try{await connect()}catch{}status('Google授權已續期（同一帳號）');if(dialog.open)renderPanel().catch(e=>detailError(e));if(row?.dirty)flush();else checkNewer()});
 window.addEventListener('studio-drive-connection',updateConnectionIndicator);
 // Quiet renewal needs a click; never on clicks that start recording/playback, and only while sync is in use.
 const RENEW_SKIP='[data-action=record],[data-action=stopRecord],[data-action=nextRecord],[data-action=toggleClipPlayback],[data-action=playSelection],[data-action=previewRoleA],[data-action=previewRoleB],[data-action=micSettings],[data-action=build],input,textarea,select,[contenteditable]';
 if(window.StudioDrive)window.StudioDrive.renewBlocked=e=>busy()||opening||!!e.target?.closest?.(RENEW_SKIP)||!((row&&!row.paused)||dialog.open);
 // After the panel closes (e.g. right after connecting on this device), offer a newer version from the other device.
 dialog.addEventListener('close',()=>setTimeout(checkNewer,300));
 window.StudioSync={capture,flush,detach:async()=>{if(row){row.paused=true;await store(row)}row=null;status('跨裝置續編')},
  /* v114 首頁雲端狀態牌：只讀狀態與明確的上傳／下載動作，同步引擎本身不變。 */
  info:()=>({configured:!!window.StudioDrive?.configured,connected:!!session,linked:!!(row&&session&&row.owner===session.owner&&row.snapshot?.projectId===state?.projectId),running,opening,sum:syncSummary(),online:navigator.onLine}),
  openPanel:()=>button.onclick(),
  async saveNow(){if(busy())throw Error('請先停止錄音或完成處理');if(!session){button.onclick();return 'panel'}if(!row&&state.projectId)row=await loadLinkedRow();if(!row){await enable();updateConnectionIndicator();if(!row)return 'cancelled';await flush();return 'enabled'}if(row.paused||row.conflict){button.onclick();return 'panel'}await capture(state);if(running){return 'running'}if(!row.dirty){const projects=await api('/projects');noteRemote(projects);updateConnectionIndicator();return 'same'}await flush();updateConnectionIndicator();return row&&!row.dirty?'saved':'pending'},
  async checkCloud(){if(busy())throw Error('請先停止錄音或完成處理');if(!session){button.onclick();return 'panel'}if(!row&&state.projectId)row=await loadLinkedRow();if(!row||row.paused||row.conflict){button.onclick();return 'panel'}const projects=await api('/projects');noteRemote(projects);updateConnectionIndicator();const mine=projects.filter(p=>p.id===row.snapshot.projectId);if(mine.length!==1)return 'missing';if(mine[0].revision===row.revision)return 'same';if(row.dirty||row.job){button.onclick();return 'panel'}const when=mine[0].updatedAt?new Date(mine[0].updatedAt).toLocaleString('zh-TW'):'';if(!confirm('雲端有'+(when?' '+when+' ':'')+'存的較新版本「'+mine[0].title+'」。\n下載到這台繼續編輯？\n（目前畫面的內容會先存成本機草稿）'))return 'cancelled';offeredHead=mine[0].revision;opener=button;dialog.showModal();await openProject(mine[0].id,mine[0].revision,null,true);return 'opened'}};
 // Recover only an already opted-in outbox; opening the page never opts in old audio.
 (async()=>{try{await connect();while(!window.StudioLoaded)await new Promise(r=>setTimeout(r,100));if(state.projectId)row=await loadLinkedRow();if(row){status(row.dirty?'已存本機 · 等待同步':'已上傳 · 換裝置前請檢查版本');flush();checkNewer()}}catch{status('跨裝置續編')}})();
 // Another device moved this project ahead while this copy has no unsent edits: offer to load it.
 let offeredHead=null;async function checkNewer(){try{if(!row||row.dirty||row.conflict||row.paused||running||opening||busy()||dialog.open)return;const projects=await api('/projects');noteRemote(projects);const mine=projects.filter(p=>p.id===row.snapshot.projectId);if(mine.length!==1||mine[0].revision===row.revision||offeredHead===mine[0].revision||row.dirty)return;offeredHead=mine[0].revision;const when=mine[0].updatedAt?new Date(mine[0].updatedAt).toLocaleString('zh-TW'):'';if(!confirm('另一台裝置'+(when?'在 '+when+' ':'')+'更新了「'+mine[0].title+'」。\n要載入最新版本繼續編輯嗎？\n（目前畫面的內容會先存成本機草稿）'))return;opener=button;dialog.showModal();await openProject(mine[0].id,mine[0].revision,null,true)}catch(e){detailError(e)}}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(checkNewer,800)});
 document.addEventListener('click',e=>{if(e.target.closest('[data-action]')&&!dialog.open)setTimeout(()=>{if(row&&!busy())capture(state).catch(()=>{})},400)});
})();
