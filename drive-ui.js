/* Optional personal sync. Disabled unless an authenticated same-origin API exists. */
(()=>{
 const tab=crypto.randomUUID(); // unique page instance; abandoned jobs remain in the pending-copy list
 let localDB,session=null,row=null,serial=Promise.resolve(),running=false,opening=false,opener=null,syncError="";
 const button=document.createElement('button');button.className='quiet sync-entry';button.textContent='我的雲端專案';button.type='button';document.querySelector('.top-actions').prepend(button);
 function updateConnectionIndicator(){const value=window.StudioDrive?.connectionState?.()||{connected:false,label:navigator.onLine?'未連接或需重新授權':'離線'};button.dataset.connected=String(value.connected);let lamp=button.querySelector('.cloud-connection-light'),copy=button.querySelector('.cloud-connection-copy');if(!lamp){lamp=document.createElement('span');lamp.className='cloud-connection-light';lamp.setAttribute('aria-hidden','true');copy=document.createElement('span');copy.className='cloud-connection-copy';button.append(lamp,copy)}copy.textContent=value.connected?'已連接Google':value.label;button.title='我的雲端專案 · '+value.label;button.setAttribute('aria-label',button.title)}
 for(const event of ['studio-drive-connection','studio-drive-ready','online','offline'])window.addEventListener(event,updateConnectionIndicator);updateConnectionIndicator();
 const dialog=document.createElement('dialog');dialog.className='sync-dialog';dialog.innerHTML='<div class="dialog-top"><h2>我的雲端專案</h2><button type="button" id="syncClose" aria-label="關閉同步視窗">✕</button></div><p>同一帳號在手機與電腦接續編輯；與「共同資料夾交件」分開設定。支援 apps.ntpc.edu.tw 教育帳號及本人測試帳號 longpuchris@gmail.com。此為前端篩選，非後端安全門禁；私人檔案存取由 Google Drive 授權控管。</p><p class="sync-privacy-note">建議以 Safari／Chrome 直接開啟本站；若 Google 視窗空白，請避免從 App 內建瀏覽器連接。<br>只存取本工具建立或你授權給它的 Drive 檔案，不讀取整個雲端硬碟，也不公開錄音。啟用專案前會先確認傳送腳本與原音。授權 token 僅留在本頁記憶體；重開頁面或授權到期須再次點選 Google 授權。關閉分頁／切換帳號不會刪除本機內容或已存的 Drive 檔案。<br><a href="privacy.html" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;min-height:44px">閱讀隱私與資料說明 ↗</a></p><p id="syncStatus" role="status" aria-live="polite"></p><p id="syncDetail"></p><p id="syncCurrent"></p><div id="syncControls"></div><h3>我的雲端專案</h3><div id="syncProjects"></div><h3>這台裝置的待同步副本</h3><div id="syncPending"></div>';
 document.body.append(dialog);
 const placeEntry=()=>{const host=document.querySelector('#worktable').hidden?document.querySelector('.room-return'):document.querySelector('.top-actions');host.append(button)};new MutationObserver(placeEntry).observe(document.querySelector('#worktable'),{attributes:true,attributeFilter:['hidden']});placeEntry();
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
   if(exact)b.setAttribute('aria-current','true');b.onclick=()=>openProject(p.id,p.revision).catch(e=>{el('syncDetail').textContent=e.message});group.append(b);
  }el('syncProjects').append(group);
 }
 if(!projects.length){const empty=document.createElement('p');empty.textContent='目前帳號尚無本工具的雲端專案。';el('syncProjects').append(empty)}
}
function showCurrentCloud(){const linked=session&&row?.owner===session?.owner&&row.snapshot.projectId===state.projectId;el('syncCurrent').textContent='目前正在編輯：'+state.title+(linked?' · 雲端專案 '+String(state.projectId).slice(0,8)+' · 基底 '+String(row.revision||'尚未上傳').slice(0,8)+(row.dirty?' · 含未上傳的本機修改':'')+(row.conflict?' · 有並行衝突，尚未選定要保留哪份':''):' · 本機內容（此分頁尚未連結雲端版本）');}

 let linkedHistory=false,controlBusy=false,linkLoading=false;
 const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const snapshotSignature=async value=>canonical((await SyncCodec.pack(migrateProject(structuredClone(value)))).manifest);
 async function loadLinkedRow(){linkLoading=true;try{
  linkedHistory=false;if(!state.projectId||!session)return null;const expectedOwner=session.owner;
  const current=await dbop('readonly',s=>s.get(key(state.projectId)));if(session?.owner!==expectedOwner)return null;if(current)return current;
  const candidates=(await dbop('readonly',s=>s.getAll())).filter(r=>r.owner===expectedOwner&&r.snapshot.projectId===state.projectId);linkedHistory=candidates.length>0;
  if(session?.owner!==expectedOwner)return null;const safe=candidates.filter(r=>!r.dirty&&!r.job&&!r.conflict&&r.revision);
  if(!safe.length||new Set(safe.map(r=>r.revision)).size!==1)return null;
  // Same project ID alone is insufficient: do not attach unsynced local content as clean.
  const before=await snapshotSignature(state),owner=expectedOwner,id=state.projectId;
  const source=safe.find(r=>JSON.stringify(r.snapshot)===JSON.stringify(state))||safe[0];
  if(await snapshotSignature(source.snapshot)!==before)return null;
  if(session?.owner!==owner||state.projectId!==id||await snapshotSignature(state)!==before)return null;
  const recovered={...structuredClone(source),key:key(id),snapshot:structuredClone(state),position:position()};await store(recovered);return recovered;}finally{linkLoading=false}
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
 function status(text){button.textContent='我的雲端專案';button.title='我的雲端專案 · '+text;button.setAttribute('aria-label','我的雲端專案 · '+text);el('syncStatus').textContent=text;updateConnectionIndicator()}
 const openDB=()=>new Promise((resolve,reject)=>{let done=false;const r=indexedDB.open('listening-google-drive-sync',1),timer=setTimeout(()=>{done=true;reject(Error('同步佇列開啟逾時；本機專案仍保留'))},10000);r.onupgradeneeded=()=>r.result.createObjectStore('outbox',{keyPath:'key'});r.onsuccess=()=>{if(done){r.result.close();return}done=true;clearTimeout(timer);resolve(r.result)};r.onerror=()=>{if(done)return;done=true;clearTimeout(timer);reject(r.error)}});
 async function dbop(mode,fn){localDB??=await openDB();return new Promise((resolve,reject)=>{let tx,req,done=false,timer;const finish=e=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(req?.result)};try{tx=localDB.transaction('outbox',mode);tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error||Error('同步佇列保存失敗'));tx.onabort=()=>finish(tx.error||Error('同步佇列已中止'));timer=setTimeout(()=>{finish(Error('同步佇列逾時，已中止；本機專案仍保留，請重試同步'));try{tx.abort()}catch{}},10000);req=fn(tx.objectStore('outbox'))}catch(e){finish(e);try{tx?.abort()}catch{}}})}

 const store=r=>{r.savedAt=Date.now();return dbop('readwrite',s=>s.put(structuredClone(r)))};
 const key=id=>session.owner+':'+id+':'+tab;
 function enqueue(fn){serial=serial.catch(()=>{}).then(fn).catch(e=>{status('本機同步佇列保存失敗');detailError(e);throw e});return serial}
 async function api(path,options={}){return window.StudioDrive.api(path,options)}
 async function connect(){const s=await api('/session');if(!s.owner||!s.limits)throw Error('同步服務尚未設定');session=s;return s}
 async function renderPanel(){if(cloudOpen)return;showCurrentCloud();el('syncControls').replaceChildren();el('syncProjects').replaceChildren();el('syncPending').replaceChildren();const auth=document.createElement('button');auth.type='button';auth.textContent=window.StudioDrive.account?'重新授權／切換Google帳號':'連接Google帳號';auth.disabled=!window.StudioDrive.ready||window.StudioDrive.authStage!=='idle';auth.onclick=()=>{if(busy()||running)return toast('請先完成目前錄音或同步');window.StudioDrive.authorize()};el('syncControls').append(auth);const stage=window.StudioDrive.authStage;if(stage!=='idle'){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消本頁等待';cancel.onclick=()=>window.StudioDrive.cancelWaiting();el('syncControls').append(cancel);el('syncDetail').textContent=window.StudioDrive.authMessage;status(stage==='verifying'?'正在確認Google帳號':'等待Google授權');return}if(window.StudioDrive.authMessage){el('syncDetail').textContent=window.StudioDrive.authMessage;status('尚未完成新的Google連接');return}if(!session){el('syncDetail').textContent=window.StudioDrive.error||'請點選Google授權；音訊仍保存在本機。';return}
 el('syncDetail').textContent=syncError||(session.mode==='local-mock'?'本地模擬：兩個瀏覽器情境測試，不是真實雲端。 ':'')+'私人Drive：'+(window.StudioDrive.account?.email||'')+'。只同步你明確啟用的專案；網域檢查僅為前端提示，不是安全門禁。';
 const add=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=()=>runCloudControl(label,fn);el('syncControls').append(b)};
 add('重新整理雲端版本',async()=>{if(busy()||running)throw Error('請先完成目前工作');await renderPanel()});if(!row||row.snapshot.projectId!==state.projectId){if(linkLoading){status('正在確認本機同步連結 · 請稍候')}else if(linkedHistory){el('syncDetail').textContent='這份本機專案已有同步紀錄，但不能安全自動接回；請從下方接續本機保留副本或明確選擇雲端版本，不會建立新的根版本。'}else add('啟用這份專案的私人同步',enable);}
 else{add(row.paused?'恢復同步':'暫停同步',async()=>{await enqueue(async()=>{row.paused=!row.paused;await store(row)});status(row.paused?(running?'已要求暫停 · 等待目前傳輸結束':'同步已暫停'):'等待同步');renderPanel();flush()});add('重試同步',()=>flush());if(row.conflict){add('保留此裝置內容為另一份雲端專案',fork);add('選擇下方雲端版本',async()=>{el('syncProjects').scrollIntoView({block:'nearest'});el('syncProjects').querySelector('button')?.focus();el('syncDetail').textContent='請選擇下方明確版本；載入後再確認，目前內容會先另存草稿。'});}}
 el('syncPending').replaceChildren();const panelOwner=session.owner,pendingRows=await dbop('readonly',s=>s.getAll());if(session?.owner!==panelOwner)return;for(const saved of pendingRows){if(saved.owner!==session.owner||(!saved.dirty&&!saved.paused)||saved.key===row?.key)continue;const b=document.createElement('button');b.type='button';b.className='sync-project';b.textContent=saved.snapshot.title+' · 本機保留副本 · 專案 '+String(saved.snapshot.projectId).slice(0,8)+' · 基底 '+String(saved.revision||'尚未上傳').slice(0,8)+(saved.dirty?' · 有未上傳修改':' · 已暫停')+' · '+(saved.savedAt?new Date(saved.savedAt).toLocaleString('zh-TW'):'保存時間未提供');b.onclick=()=>resumeLocal(saved).catch(e=>{detailError(e)});el('syncPending').append(b)}
 el('syncProjects').replaceChildren();try{const projects=await api('/projects');if(session?.owner!==panelOwner)return;if(row&&!row.conflict&&projects.some(p=>p.id===row.snapshot.projectId&&p.conflict)){row.conflict=true;await store(row);status('版本衝突 · 所有版本保留');return renderPanel()}showCloudProjects(projects)}catch(e){detailError(e)}
 }
 async function enable(){if(linkLoading)throw Error('本機同步紀錄仍在確認，請稍候。');if(state.projectId&&(await dbop('readonly',s=>s.getAll())).some(r=>r.owner===session?.owner&&r.snapshot.projectId===state.projectId))throw Error('已有同步紀錄，請接續保留副本或選擇雲端版本，不會另建根版本。');if(busy())throw Error('請先停止錄音或完成處理');if(!confirm('啟用後，這份專案的朗讀稿及所有原始錄音（含停用片段）會傳到你目前Google帳號的私人Drive，供同帳號跨裝置編輯。其他本機素材庫不會上傳。確定啟用？'))return;
 state.projectId=state.projectId||crypto.randomUUID();state.syncSchema=1;row={key:key(state.projectId),owner:session.owner,revision:0,generation:0,dirty:true,snapshot:structuredClone(state),position:position(),paused:false};await store(row);await persist();await capture(state);renderPanel();}
 async function capture(snapshot){if(opening||!row||row.snapshot.projectId!==snapshot.projectId)return;const target=row,snap=structuredClone(snapshot),pos=position();const fingerprint=JSON.stringify({snap,pos},(k,v)=>v instanceof Blob?{size:v.size,type:v.type}:v);await enqueue(async()=>{if(row!==target||session?.owner!==target.owner)return;if(target.fingerprint===fingerprint)return;target.fingerprint=fingerprint;target.snapshot=snap;target.position=pos;target.generation++;target.dirty=true;try{await store(target)}catch(e){target.fingerprint=null;throw e}if(row===target)status(navigator.onLine?'已存本機 · 等待同步':'離線 · 已存本機')});if(row===target)flush()}
 async function flush(){if(running||!row||row.paused||row.conflict||!row.dirty)return;if(!navigator.onLine){status('離線 · 已存本機');return}running=true;syncError='';const syncingRow=row;try{
 const who=await api('/session');if(who.owner!==row.owner)throw Error('登入帳號已變更，未上傳本機專案');
 while(row?.dirty&&!row.paused&&!row.conflict){
 await enqueue(async()=>{if(!row.job){const packed=await SyncCodec.pack(row.snapshot),blobs=[...packed.assets.values()];if(blobs.some(b=>b.size>session.limits.assetBytes)||blobs.reduce((n,b)=>n+b.size,0)>session.limits.ownerBytes)throw Error('這份專案超過同步容量上限；未上傳，不會自動升級');row.job={operationId:crypto.randomUUID(),baseRevision:row.revision,manifest:packed.manifest,assets:[...packed.assets],position:row.position,generation:row.generation};await store(row)}});
 const current=row,job=structuredClone(row.job),id=job.manifest.projectId;status('同步中 · 本機原音已保留');
 for(const [assetId,blob]of job.assets){if(row!==current||row.paused)break;await api('/assets/'+assetId,{method:'PUT',headers:{'Content-Type':blob.type},body:blob})}
 if(row!==current||row.paused)break;
 const result=await api('/projects/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:job.operationId,baseRevision:job.baseRevision,manifest:job.manifest,position:job.position})});
 await enqueue(async()=>{if(row!==current)return;row.revision=result.revision;row.job=null;row.dirty=row.generation!==job.generation;await store(row)});
 if(row!==current)break;status(row.dirty?'已存本機 · 等待同步':'已上傳 · 換裝置前請檢查版本');
 }
 }catch(e){if(row!==syncingRow)return;if(e.status===409){await enqueue(async()=>{row.conflict=true;await store(row)});status('版本衝突 · 兩份內容均保留')}else status(navigator.onLine?'同步未完成 · 本機保留':'離線 · 已存本機');detailError(e);}finally{running=false;if(row?.paused)status('同步已暫停');if(dialog.open)renderPanel().catch(e=>{detailError(e)})}}
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

 async function openProject(id,revision){if(busy()||running||opening)throw Error('請先停止錄音或等目前同步完成');invalidateAudioImport();if(row?.owner===session?.owner&&state.projectId===id&&row.revision===revision&&!row.dirty&&!row.conflict){status('目前已開啟此版本');return}opening=true;const task=startCloudOpen();try{
 const remote=await waitCloudOpen(task,api('/projects/'+encodeURIComponent(id)+(revision?'?revision='+encodeURIComponent(revision):'')));checkCloudOpen(task);task.text.textContent='下載並校驗原始錄音中；目前專案未替換。';let loaded=0;const incoming=await waitCloudOpen(task,SyncCodec.unpack(remote.manifest,async assetId=>{checkCloudOpen(task);const blob=await waitCloudOpen(task,window.StudioDrive.asset(assetId));task.text.textContent='已校驗 '+(++loaded)+' 段原音，繼續準備中；目前專案未替換。';return blob}));validateProject(incoming);checkCloudOpen(task);
 if(busy())throw Error('錄音中不會替換專案');if(!confirm('開啟雲端專案繼續編輯？目前內容會先保存為本機草稿；不同版本不會被覆蓋。')){status('未開啟雲端專案 · 本機保留');return;}
 checkCloudOpen(task);task.applying=true;clearTimeout(task.timer);task.cancel.disabled=true;task.text.textContent='正在保留本機草稿並開啟專案，請稍候。';const next={key:key(id),owner:session.owner,revision:remote.revision,generation:0,dirty:false,snapshot:structuredClone(incoming),position:remote.position,paused:true};await prepareReplacement(migrateProject(incoming),next);
 editClip=null;active=remote.position?.active||'intro';if(!['intro','end',...state.sections.map(s=>s.id)].includes(active))active='intro';mobileClipId=remote.position?.mobileClipId||null;row.paused=false;try{await store(row)}catch(e){row.paused=true;detailError(e);status('專案已存本機 · 同步暫停，請重試');render();await renderPanel();return}render();enterRoom(['record','arrange','export'].includes(remote.position?.page)?remote.position.page:'record');dialog.close();syncError='';status('已同步 · 繼續編輯');
 }catch(e){status(task.applying?'開啟未完成 · 請檢查本機草稿':task.cancelled?'開啟已取消 · 本機保留':'開啟失敗 · 本機保留');detailError(e); }finally{finishCloudOpen(task);opening=false}}
 button.onclick=async()=>{if(busy())return toast('請先停止錄音或完成處理');opener=button;dialog.showModal();try{await connect();if(!row&&state.projectId)row=await loadLinkedRow();status(row?.conflict?'版本衝突 · 兩份內容均保留':row?.dirty?'已存本機 · 等待同步':'跨裝置續編');await renderPanel();flush()}catch(e){session=null;status(window.StudioDrive.configured?'請授權Google · 已存本機':'同步服務尚未啟用');renderPanel()}};
 el('syncClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>opener?.focus());
 window.addEventListener('online',()=>flush());
 window.addEventListener('studio-drive-ready',()=>{if(dialog.open)renderPanel()});
 window.addEventListener('studio-drive-account',async()=>{try{await connect();row=null;if(state.projectId)row=await loadLinkedRow();status('Google帳號已連接');await renderPanel();flush()}catch(e){session=null;row=null;status('請重新授權Google');renderPanel()}});

 window.StudioSync={capture,flush,detach:async()=>{if(row){row.paused=true;await store(row)}row=null;status('跨裝置續編')}};
 // Recover only an already opted-in outbox; opening the page never opts in old audio.
 (async()=>{try{await connect();while(!window.StudioLoaded)await new Promise(r=>setTimeout(r,100));if(state.projectId)row=await loadLinkedRow();if(row){status(row.dirty?'已存本機 · 等待同步':'已上傳 · 換裝置前請檢查版本');flush()}}catch{status('跨裝置續編')}})();
 document.addEventListener('click',e=>{if(e.target.closest('[data-action]')&&!dialog.open)setTimeout(()=>{if(row&&!busy())capture(state).catch(()=>{})},400)});
})();
