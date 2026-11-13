/* v118：開新專案在資料庫第一層抽屜、結案在小封（串好音檔後）；雲端專案視窗只放雲端動作＋「我的專案」連結。
 * v114 專案列：開新專案、我的專案、結案，以及首頁雲端狀態牌（明確的上傳／下載）。
 * 不改資料格式：結案只在專案上記 finishedAt；切換專案沿用 replaceLocalProject（目前內容先存成本機草稿）。 */
'use strict';
(()=>{
const S=()=>window.StudioSync;
const busyNow=()=>!!rec||building||arrangementBusy||(typeof projectSwitching!=='undefined'&&projectSwitching);
const when=t=>t?new Date(t).toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'}):'';

/* ---------- 雲端狀態 ---------- */
function cloudView(){
  const i=S()?.info?.();
  if(!i||!i.configured)return{kind:'off',icon:'☁',title:'只存在這台裝置',text:'雲端同步尚未啟用。可用「下載專案檔」自己留一份。',up:false,down:false};
  if(!i.online)return{kind:'warn',icon:'⚠',title:'離線中 · 已存在這台',text:'連上網路後會自動上傳。',up:false,down:false};
  if(!i.connected)return{kind:'warn',icon:'☁',title:'還沒連上雲端',text:'按「存到雲端」登入 Google，就能在手機和電腦之間接著做。',up:true,down:true,downLabel:'從雲端打開'};
  if(!i.linked)return{kind:'warn',icon:'⚠',title:'這份只存在這台，還沒上雲端',text:'按「存到雲端」，換到別台裝置才找得到。',up:true,down:true,downLabel:'從雲端打開其他專案'};
  const s=i.sum||{kind:'pending',short:'',text:''};
  if(s.kind==='ok')return{kind:'ok',icon:'✓',title:'已存到雲端 · '+s.short.replace(/^已同步\s*/,''),text:/可以換裝置/.test(s.text)?'雲端最新的就是這份，可以換裝置接著做。':'雲端已有這份；換裝置前可按「從雲端下載」再確認一次。',up:true,down:true};
  if(s.kind==='newer')return{kind:'newer',icon:'⬇',title:'雲端有比較新的版本',text:'另一台裝置存了更新的內容。按「下載到這台」。',up:false,down:true,downLabel:'下載到這台',strong:'down'};
  if(s.kind==='conflict')return{kind:'warn',icon:'⚠',title:'兩台裝置都改過',text:'兩份都保留著，請打開選擇要用哪一份。',up:false,down:true,downLabel:'打開選擇'};
  if(s.kind==='paused')return{kind:'warn',icon:'⏸',title:'雲端同步已暫停',text:'這台的修改不會上傳。打開設定可以恢復同步。',up:true,down:true,upLabel:'恢復並存到雲端'};
  return{kind:'busy',icon:'⬆',title:s.short||'正在上傳',text:'正在把這台的修改存到雲端，完成會顯示「已存到雲端」。請先別關網頁或換裝置。',up:true,down:false,upLabel:'立即上傳'};
}
function renderCloudCard(){
  const card=document.getElementById('cloudCard');if(!card)return;const host=card.querySelector('.cc-cloud');
  const v=cloudView();card.dataset.kind=v.kind;
  host.innerHTML=`<div class="cc-head"><span class="cc-icon" aria-hidden="true">${v.icon}</span><div><strong>${esc(v.title)}</strong><small>${esc(v.text)}</small></div></div><div class="cc-actions">${v.up?`<button type="button" data-hub="up" class="${v.strong==='down'?'':'cc-strong'}">⬆ ${esc(v.upLabel||'存到雲端')}</button>`:''}${v.down?`<button type="button" data-hub="down" class="${v.strong==='down'?'cc-strong':''}">⬇ ${esc(v.downLabel||'從雲端下載')}</button>`:''}</div>`;
}
let cloudBusy=false;
async function cloudAct(kind,btn){
  if(cloudBusy)return;if(busyNow()){toast('請先停止錄音或完成處理');return}
  if(!S()?.saveNow){toast('雲端同步還在載入，請稍候再按。');return}
  cloudBusy=true;const label=btn?.textContent;if(btn){btn.disabled=true;btn.textContent=kind==='up'?'上傳中…':'檢查雲端中…'}
  try{
    const r=kind==='up'?await S().saveNow():await S().checkCloud();
    const msg={saved:'✓ 已存到雲端，可以換裝置接著做。',enabled:'✓ 已開始存到雲端；完成會顯示「已存到雲端」。',same:kind==='up'?'✓ 雲端已經是最新的，不用再上傳。':'✓ 雲端沒有更新的版本，這台就是最新的。',running:'正在上傳中，完成會顯示「已存到雲端」。',pending:'還有內容在上傳，請稍候。',missing:'雲端找不到這份專案；可以按「存到雲端」重新上傳。',opened:'✓ 已下載雲端最新版本。',signin:kind==='up'?'請在 Google 視窗登入；登入後會自動接著存到雲端。':'請在 Google 視窗登入；登入後下方會列出雲端上的專案。',cancelled:''}[r];
    if(msg)toast(msg);
  }catch(e){toast('沒有完成：'+(e.message||e)+'（這台的內容都還在）')}
  finally{cloudBusy=false;if(btn?.isConnected){btn.disabled=false;btn.textContent=label}renderCloudCard()}
}

/* ---------- 專案 ---------- */
function ensureDialog(){
  let d=document.getElementById('projectHubDialog');if(d)return d;
  d=document.createElement('dialog');d.id='projectHubDialog';d.className='project-hub-dialog';document.body.append(d);return d;
}
function openNewProject(lead=''){
  if(busyNow()){toast('請先停止錄音或完成處理');return}
  const d=ensureDialog(),pending=S()?.info?.()?.sum?.kind==='pending'&&S()?.info?.()?.linked;
  d.innerHTML=`<form method="dialog"><div class="dialog-top"><h2>開新專案</h2><button class="icon-btn" aria-label="關閉">×</button></div>${lead?`<p class="ph-lead">${lead}</p>`:''}<p>目前的「${esc(state.title||'未命名')}」會自動收進<strong>我的專案</strong>，之後隨時可以打開繼續。</p>${pending?'<p class="ph-warn">⚠ 這份還有修改沒存到雲端。建議先到雲端專案按「存到雲端」，等顯示「已存到雲端」再開新的。</p>':''}<div class="ph-choices"><button type="button" class="ph-choice" data-hub="blank"><strong>空白開始</strong><small>自己新增大題、題目，再錄音</small></button><button type="button" class="ph-choice" data-hub="import"><strong>匯入錄音稿／直接寫</strong><small>貼上文字或選 Word、TXT 檔，自動拆好題目</small></button></div><button class="secondary">先不要</button></form>`;
  d.showModal();
}
async function startBlank(btn){
  const d=ensureDialog();btn.disabled=true;
  try{
    const incoming=fresh();incoming.title='新的聽力測驗 '+new Date().toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'});
    await replaceLocalProject(migrateProject(validateProject(incoming)),async()=>{await waitImportStorage(Promise.resolve(S()?.detach()))});
    active='intro';mobileClipId=null;editClip=null;d.close();render();await refreshLibrary();goWorktable();renderHub();
    toast('已開新專案。前一份收在「我的專案」。');
  }catch(e){toast('沒有開新專案：'+(e.message||e));btn.disabled=false}
}
function finishProject(){
  if(busyNow()){toast('請先停止錄音或完成處理');return}
  if(state.finishedAt){if(confirm('「'+(state.title||'未命名')+'」已標成完成。\n要改回「製作中」嗎？')){delete state.finishedAt;save();renderHub();toast('已改回製作中。')}return}
  const missing=A.allClips(state).filter(c=>!c.blob).length;
  if(!confirm('把「'+(state.title||'未命名')+'」標成已完成？'+(missing?'\n（還有 '+missing+' 段沒錄音）':'')+'\n\n在「我的專案」會顯示「已完成」，之後仍可打開修改。'))return;
  state.finishedAt=Date.now();save();renderHub();
  if(S()?.info?.()?.linked)S().saveNow().catch(()=>{});
  openNewProject('✓ 「'+esc(state.title||'未命名')+'」已完成。要開下一份嗎？');
}
function renderFinishRow(){
  const host=document.getElementById('exportResult');if(!host)return;
  let row=document.getElementById('finishRow');
  if(!row){row=document.createElement('div');row.id='finishRow';row.className='finish-row';host.append(row)}
  row.innerHTML=state.finishedAt?`<span class="ph-done">✓ 這份已標成完成（${when(state.finishedAt)}）</span><button type="button" class="ph-link" data-hub="finish">改回製作中</button>`:`<span>這份考卷做完了嗎？</span><button type="button" class="secondary" data-hub="finish">✓ 這份完成了</button>`;
}
function openProjects(){if(busyNow()){toast('請先停止錄音或完成處理');return}openDraftShelf('draft')}

/* ---------- 首頁下方：存檔＋雲端狀態合成一行（v118） ---------- */
function renderHomeCloud(){
  const ticket=document.getElementById('finishTicket');if(!ticket)return;
  let b=document.getElementById('homeCloudState');
  if(!b){b=document.createElement('button');b.type='button';b.id='homeCloudState';b.className='home-cloud-state';b.addEventListener('click',()=>{if(busyNow()){toast('請先停止錄音或完成處理');return}S()?.openPanel?.()})}
  const save=document.getElementById('saveState');
  if(save&&ticket.contains(save)){if(save.nextSibling!==b)save.after(b)}else if(!ticket.contains(b))ticket.querySelector('div')?.prepend(b);
  const entry=document.querySelector('.sync-entry'),txt=(entry?.querySelector('.cloud-connection-copy')?.textContent||'').trim(),i=S()?.info?.();
  if(!i?.configured||!txt){b.hidden=true;return}
  b.hidden=false;b.textContent='雲端：'+txt;b.dataset.kind=entry?.dataset.sync||(i.connected?'':'off');b.title='打開雲端專案';
}
/* ---------- 首頁 ---------- */
function renderHub(){
  const slot=document.getElementById('hubSlot');if(!slot)return;
  let card=document.getElementById('cloudCard');
  if(!card){card=document.createElement('section');card.id='cloudCard';card.className='cloud-card';card.setAttribute('aria-label','專案與雲端存檔');card.innerHTML='<div class="cc-cloud" aria-live="polite"></div><div id="projectHubBar" class="project-hub-bar"></div>';slot.append(card)}
  const bar=document.getElementById('projectHubBar');
  bar.innerHTML=`<span class="ph-current">目前：${esc(state.title||'未命名')}${state.finishedAt?` <span class="ph-done" title="${when(state.finishedAt)} 完成">✓ 已完成</span>`:''}</span><button type="button" class="ph-link" data-hub="list">我的專案 →</button>`;
  renderFinishRow();
  renderCloudCard();renderHomeCloud();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-hub]');if(!b)return;
  const k=b.dataset.hub;
  if(k==='up'||k==='down')return cloudAct(k,b);
  if(['new','list','finish'].includes(k))document.querySelector('.sync-dialog')?.close();
  if(k==='new')return openNewProject();
  if(k==='list')return openProjects();
  if(k==='finish')return finishProject();
  if(k==='blank')return startBlank(b);
  if(k==='import'){ensureDialog().close();document.querySelector('[data-action=importScript]')?.click();return}
  if(k==='cloudProjects'){$('#draftShelfDialog')?.close();S()?.openPanel?.();return}
});
window.addEventListener('studio-sync-status',()=>{renderCloudCard();renderHomeCloud()});
window.addEventListener('studio-sync-signed-in',e=>{if(e.detail==='up')cloudAct('up',document.querySelector('.cloud-card [data-hub=up]'))});
window.addEventListener('online',renderCloudCard);window.addEventListener('offline',renderCloudCard);
window.ProjectHub={render:renderHub};
(async()=>{while(!window.StudioLoaded||!document.getElementById('hubSlot'))await new Promise(r=>setTimeout(r,150));renderHub()})();
})();
/* 首頁與小封重畫時一併更新專案列與結案列（與 ux-v104 的 wrap 同法）。 */
for(const name of ['renderWorktable','renderExport'])(()=>{const orig=window[name];if(typeof orig!=='function')return;window[name]=function(...a){const r=orig.apply(this,a);try{window.ProjectHub.render()}catch{}return r}})();
