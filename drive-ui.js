/* Optional personal sync. Disabled unless an authenticated same-origin API exists. */
(()=>{
 const tab=crypto.randomUUID(); // unique page instance; abandoned jobs remain in the pending-copy list
 let localDB,session=null,row=null,serial=Promise.resolve(),running=false,opening=false,opener=null;
 const button=document.createElement('button');button.className='quiet sync-entry';button.textContent='我的雲端專案';button.type='button';document.querySelector('.top-actions').prepend(button);
 const dialog=document.createElement('dialog');dialog.className='sync-dialog';dialog.innerHTML='<div class="dialog-top"><h2>我的雲端專案</h2><button type="button" id="syncClose" aria-label="關閉同步視窗">✕</button></div><p>同一帳號在手機與電腦接續編輯；與「共同資料夾交件」分開設定。</p><p id="syncStatus" role="status" aria-live="polite"></p><p id="syncDetail"></p><div id="syncControls"></div><h3>我的雲端專案</h3><div id="syncProjects"></div><h3>這台裝置的待同步副本</h3><div id="syncPending"></div>';
 document.body.append(dialog);
 const placeEntry=()=>{const host=document.querySelector('#worktable').hidden?document.querySelector('.room-return'):document.querySelector('.top-actions');host.append(button)};new MutationObserver(placeEntry).observe(document.querySelector('#worktable'),{attributes:true,attributeFilter:['hidden']});placeEntry();
 const el=id=>dialog.querySelector('#'+id);
 const busy=()=>!!rec||building||arrangementBusy;
 const position=()=>({page:['record','arrange','export'].includes(page)?page:'record',active,mobileClipId});
 function status(text){button.textContent='我的雲端專案';button.title='我的雲端專案 · '+text;button.setAttribute('aria-label','我的雲端專案 · '+text);el('syncStatus').textContent=text}
 const openDB=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('listening-google-drive-sync',1);r.onupgradeneeded=()=>r.result.createObjectStore('outbox',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 async function dbop(mode,fn){localDB??=await openDB();return new Promise((resolve,reject)=>{const tx=localDB.transaction('outbox',mode);let req=fn(tx.objectStore('outbox'));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
 const store=r=>dbop('readwrite',s=>s.put(structuredClone(r)));
 const key=id=>session.owner+':'+id+':'+tab;
 function enqueue(fn){serial=serial.catch(()=>{}).then(fn).catch(e=>{status('本機同步佇列保存失敗');el('syncDetail').textContent=e.message;throw e});return serial}
 async function api(path,options={}){return window.StudioDrive.api(path,options)}
 async function connect(){const s=await api('/session');if(!s.owner||!s.limits)throw Error('同步服務尚未設定');session=s;return s}
 async function renderPanel(){el('syncControls').replaceChildren();const auth=document.createElement('button');auth.type='button';auth.textContent=window.StudioDrive.account?'重新授權／切換Google帳號':'連接教育Google帳號';auth.disabled=!window.StudioDrive.ready;auth.onclick=()=>{if(busy()||running)return toast('請先完成目前錄音或同步');window.StudioDrive.authorize()};el('syncControls').append(auth);if(!session){el('syncDetail').textContent=window.StudioDrive.error||'請點選Google授權；音訊仍保存在本機。';return}
 el('syncDetail').textContent=(session.mode==='local-mock'?'本地模擬：兩個瀏覽器情境測試，不是真實雲端。 ':'')+'私人Drive：'+(window.StudioDrive.account?.email||'')+'。只同步你明確啟用的專案；網域檢查僅為前端提示，不是安全門禁。';
 const add=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=()=>fn().catch(e=>{el('syncDetail').textContent=e.message});el('syncControls').append(b)};
 add('重新整理雲端版本',async()=>{if(busy()||running)throw Error('請先完成目前工作');await renderPanel()});if(!row||row.snapshot.projectId!==state.projectId)add('啟用這份專案的私人同步',enable);
 else{add(row.paused?'恢復同步':'暫停同步',async()=>{await enqueue(async()=>{row.paused=!row.paused;await store(row)});status(row.paused?'同步已暫停':'等待同步');renderPanel();flush()});add('重試同步',()=>flush());if(row.conflict){add('保留此裝置內容為另一份雲端專案',fork);add('先保留本機副本，再開啟雲端版本',()=>openProject(state.projectId));}}
 el('syncPending').replaceChildren();for(const saved of await dbop('readonly',s=>s.getAll())){if(saved.owner!==session.owner||(!saved.dirty&&!saved.paused)||saved.key===row?.key)continue;const b=document.createElement('button');b.type='button';b.className='sync-project';b.textContent=saved.snapshot.title+' · 本機保留';b.onclick=()=>resumeLocal(saved).catch(e=>{el('syncDetail').textContent=e.message});el('syncPending').append(b)}
 el('syncProjects').replaceChildren();try{const projects=await api('/projects');if(row&&!row.conflict&&projects.some(p=>p.id===row.snapshot.projectId&&p.conflict)){row.conflict=true;await store(row);status('版本衝突 · 所有版本保留');return renderPanel()}for(const p of projects){const b=document.createElement('button');b.type='button';b.className='sync-project';b.textContent=p.title+(p.conflict?' · 並行版本 ':' · 版本 ')+String(p.revision).slice(0,8);b.onclick=()=>openProject(p.id,p.revision).catch(e=>{el('syncDetail').textContent=e.message});el('syncProjects').append(b)}}catch(e){el('syncDetail').textContent=e.message}
 }
 async function enable(){if(busy())throw Error('請先停止錄音或完成處理');if(!confirm('啟用後，這份專案的朗讀稿及所有原始錄音（含停用片段）會傳到你目前Google帳號的私人Drive，供同帳號跨裝置編輯。其他本機素材庫不會上傳。確定啟用？'))return;
 state.projectId=state.projectId||crypto.randomUUID();state.syncSchema=1;row={key:key(state.projectId),owner:session.owner,revision:0,generation:0,dirty:true,snapshot:structuredClone(state),position:position(),paused:false};await store(row);await persist();await capture(state);renderPanel();}
 async function capture(snapshot){if(opening||!row||row.snapshot.projectId!==snapshot.projectId)return;const snap=structuredClone(snapshot),pos=position();const fingerprint=JSON.stringify({snap,pos},(k,v)=>v instanceof Blob?{size:v.size,type:v.type}:v);await enqueue(async()=>{if(row.fingerprint===fingerprint)return;row.fingerprint=fingerprint;row.snapshot=snap;row.position=pos;row.generation++;row.dirty=true;await store(row);status(navigator.onLine?'已存本機 · 等待同步':'離線 · 已存本機')});flush()}
 async function flush(){if(running||!row||row.paused||row.conflict||!row.dirty)return;if(!navigator.onLine){status('離線 · 已存本機');return}running=true;const syncingRow=row;try{
 const who=await api('/session');if(who.owner!==row.owner)throw Error('登入帳號已變更，未上傳本機專案');
 while(row?.dirty&&!row.paused&&!row.conflict){
 await enqueue(async()=>{if(!row.job){const blobs=SyncCodec.inventory(row.snapshot).filter(c=>c.blob).map(c=>c.blob);if(blobs.some(b=>b.size>session.limits.assetBytes)||blobs.reduce((n,b)=>n+b.size,0)>session.limits.ownerBytes)throw Error('這份專案超過同步容量上限；未上傳，不會自動升級');const packed=await SyncCodec.pack(row.snapshot);row.job={operationId:crypto.randomUUID(),baseRevision:row.revision,manifest:packed.manifest,assets:[...packed.assets],position:row.position,generation:row.generation};await store(row)}});
 const current=row,job=structuredClone(row.job),id=job.manifest.projectId;status('同步中 · 本機原音已保留');
 for(const [assetId,blob]of job.assets){if(row!==current||row.paused)break;await api('/assets/'+assetId,{method:'PUT',headers:{'Content-Type':blob.type},body:blob})}
 if(row!==current||row.paused)break;
 const result=await api('/projects/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:job.operationId,baseRevision:job.baseRevision,manifest:job.manifest,position:job.position})});
 await enqueue(async()=>{if(row!==current)return;row.revision=result.revision;row.job=null;row.dirty=row.generation!==job.generation;await store(row)});
 if(row!==current)break;status(row.dirty?'已存本機 · 等待同步':'已上傳 · 換裝置前請檢查版本');
 }
 }catch(e){if(row!==syncingRow)return;if(e.status===409){await enqueue(async()=>{row.conflict=true;await store(row)});status('版本衝突 · 兩份內容均保留')}else status(navigator.onLine?'同步未完成 · 本機保留':'離線 · 已存本機');el('syncDetail').textContent=e.message;}finally{running=false;if(dialog.open)renderPanel().catch(e=>{el('syncDetail').textContent=e.message})}}
 async function fork(){if(busy()||running)throw Error('請先停止錄音並等同步工作結束');await enqueue(async()=>{row.paused=true;await store(row)});state.projectId=crypto.randomUUID();state.title+='（此裝置副本）';row={key:key(state.projectId),owner:session.owner,revision:0,generation:0,dirty:true,snapshot:structuredClone(state),position:position(),paused:false};await store(row);await persist();render();renderPanel();flush()}
 async function resumeLocal(saved){if(busy()||running)throw Error('請先完成目前工作');if(!confirm('接續這份本機副本？目前內容會先另存草稿。'))return;await archiveRequest('readwrite',s=>s.put({id:uid(),kind:'draft',title:state.title+' · 接續副本前',createdAt:Date.now(),project:structuredClone(state)}));if(row){row.paused=true;await store(row)}saved.paused=true;await store(saved);state=migrateProject(validateProject(structuredClone(saved.snapshot)));row={...saved,key:key(state.projectId),paused:true};await store(row);opening=true;try{await persist()}finally{opening=false}active='intro';mobileClipId=null;editClip=null;A.clearCache();render();renderPanel();status('本機副本已開啟 · 同步暫停')}
 async function openProject(id,revision){if(busy()||running||opening)throw Error('請先停止錄音或等目前同步完成');opening=true;try{
 const remote=await api('/projects/'+encodeURIComponent(id)+(revision?'?revision='+encodeURIComponent(revision):''));const incoming=await SyncCodec.unpack(remote.manifest,async assetId=>window.StudioDrive.asset(assetId));validateProject(incoming);
 if(busy())throw Error('錄音中不會替換專案');if(!confirm('開啟雲端專案繼續編輯？目前內容會先保存為本機草稿；不同版本不會被覆蓋。'))return;
 await archiveRequest('readwrite',s=>s.put({id:uid(),kind:'draft',title:state.title+' · 雲端切換前',createdAt:Date.now(),project:structuredClone(state)}));
 if(row){row.paused=true;await store(row)}stopPreview();stopArchivePlayer();lastAudioUndo=null;state=migrateProject(incoming);A.clearCache();editClip=null;active=remote.position?.active||'intro';if(!['intro','end',...state.sections.map(s=>s.id)].includes(active))active='intro';mobileClipId=remote.position?.mobileClipId||null;
 row={key:key(id),owner:session.owner,revision:remote.revision,generation:0,dirty:false,snapshot:structuredClone(state),position:remote.position,paused:false};await store(row);await persist();render();enterRoom(['record','arrange','export'].includes(remote.position?.page)?remote.position.page:'record');dialog.close();status('已同步 · 繼續編輯');
 }finally{opening=false}}
 button.onclick=async()=>{if(busy())return toast('請先停止錄音或完成處理');opener=button;dialog.showModal();try{await connect();if(!row&&state.projectId)row=await dbop('readonly',s=>s.get(key(state.projectId)));status(row?.conflict?'版本衝突 · 兩份內容均保留':row?.dirty?'已存本機 · 等待同步':'跨裝置續編');await renderPanel();flush()}catch(e){session=null;status(window.StudioDrive.configured?'請授權Google · 已存本機':'同步服務尚未啟用');renderPanel()}};
 el('syncClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>opener?.focus());
 window.addEventListener('online',()=>flush());
 window.addEventListener('studio-drive-ready',()=>{if(dialog.open)renderPanel()});
 window.addEventListener('studio-drive-account',async()=>{try{await connect();row=null;if(state.projectId)row=await dbop('readonly',s=>s.get(key(state.projectId)));status('Google帳號已連接');await renderPanel();flush()}catch(e){session=null;row=null;status('請重新授權Google');renderPanel()}});

 window.StudioSync={capture,flush,detach:async()=>{if(row){row.paused=true;await store(row)}row=null;status('跨裝置續編')}};
 // Recover only an already opted-in outbox; opening the page never opts in old audio.
 (async()=>{try{await connect();while(!window.StudioLoaded)await new Promise(r=>setTimeout(r,100));if(state.projectId)row=await dbop('readonly',s=>s.get(key(state.projectId)));if(row){status(row.dirty?'已存本機 · 等待同步':'已上傳 · 換裝置前請檢查版本');flush()}}catch{status('跨裝置續編')}})();
 document.addEventListener('click',e=>{if(e.target.closest('[data-action]')&&!dialog.open)setTimeout(()=>{if(row&&!busy())capture(state).catch(()=>{})},400)});
})();
