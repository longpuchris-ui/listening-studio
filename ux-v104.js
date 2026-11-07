/* v104 操作順暢化（可整檔移除退回 v103）：
   1. 房間切換列：每個房間右上角都有「回錄音室 + 麥麥／拍仔／小封／資料庫」，不必先回首頁再進下一間。
   2. 麥麥：「下一段未錄」一鍵跳到還沒錄的段落（跨大題）。
   3. 小封：完成度清單的每個大題可直接點回麥麥錄音。
   4. 鍵盤快捷鍵（電腦）：Alt+1/2/3 切換房間、Alt+0 回錄音室、Alt+N 下一段未錄。 */
(()=>{
'use strict';
const q=s=>document.querySelector(s);
const ROOMS=[
  {page:'record',action:'enterRecord',name:'麥麥',job:'錄音',num:'1',img:'assets/maimai-recording.webp'},
  {page:'arrange',action:'enterArrange',name:'拍仔',job:'節奏',num:'2',img:'assets/paizai-timing.webp'},
  {page:'export',action:'enterExport',name:'小封',job:'輸出',num:'3',img:'assets/xiaofeng-export.webp'},
  {page:'library',action:'enterLibrary',name:'資料庫',job:'備份與成品',num:'',img:'assets/audio-library-cabinet-delivery.webp'}
];
const busy=()=>!!((typeof rec!=='undefined'&&rec)||(typeof building!=='undefined'&&building));

/* ---------- 1. 房間切換列 ---------- */
function buildDock(){
  const bar=q('.room-return');if(!bar||q('.room-dock'))return;
  const nav=document.createElement('nav');nav.className='room-dock';nav.setAttribute('aria-label','切換房間');
  nav.innerHTML='<button type="button" class="dock-home" data-action="home" title="回錄音室（Alt+0）" aria-label="回錄音室首頁"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 9.8V20h13V9.8M10 20v-5.5h4V20"/></svg><span>回錄音室</span></button><span class="dock-rooms">'+
    ROOMS.map(r=>`<button type="button" class="dock-room dock-${r.page}" data-action="${r.action}" data-room="${r.page}" title="${r.num?r.num+' · ':''}${r.name}｜${r.job}${r.num?'（Alt+'+r.num+'）':''}" aria-label="${r.name}：${r.job}"><span class="dock-face"><img src="${r.img}" alt="" aria-hidden="true"></span>${r.num?`<i aria-hidden="true">${r.num}</i>`:''}<span class="dock-label">${r.name}</span></button>`).join('')+'</span>';
  bar.prepend(nav);
}
function syncDock(){
  const nav=q('.room-dock');if(!nav)return;
  const current=typeof page!=='undefined'?page:'';
  nav.querySelectorAll('[data-room]').forEach(b=>{const on=b.dataset.room===current;b.classList.toggle('is-current',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  document.body.classList.toggle('ux-has-dock',true);
}

/* ---------- 2. 下一段未錄 ---------- */
function chapterList(){
  const list=[];
  if(state.settings?.optionLabelsEnabled&&state.optionLabels?.length)list.push({id:'optionLabels',clips:state.optionLabels});
  list.push({id:'intro',clips:[...state.intro,state.start]});
  for(const s of state.sections)list.push({id:s.id,clips:A.sectionClips(s)});
  list.push({id:'end',clips:[state.end]});
  return list;
}
function usedIds(){try{return new Set(A.order(state).filter(x=>x.kind==='clip').map(x=>x.id))}catch{return null}}
function missingClips(){
  const used=usedIds(),out=[];
  for(const ch of chapterList())for(const c of ch.clips)if(c&&!c.blob&&(!used||used.has(c.id)))out.push({chapter:ch.id,clip:c});
  return out;
}
function goToClip(chapter,clipId){
  if(busy())return;
  if(typeof atWorktable!=='undefined'&&atWorktable||page!=='record')enterRoom('record');
  if(active!==chapter){stopPreview();if(chapter==='optionLabels')ensureOptionLabels();active=chapter;editClip=null;renderNav();renderChapter();renderBusy()}
  requestAnimationFrame(()=>{
    const card=clipId&&document.getElementById('clip-'+clipId);
    const target=card||q('#clips');if(!target)return;
    target.scrollIntoView({block:'center',behavior:'smooth'});
    if(card){card.classList.add('ux-flash');setTimeout(()=>card.classList.remove('ux-flash'),1600);card.querySelector('[data-action=record]')?.focus({preventScroll:true})}
    q('#chapterNav [aria-current=page]')?.scrollIntoView({inline:'nearest',block:'nearest'});
  });
}
function nextMissing(){
  const all=missingClips();
  if(!all.length){toast('全部段落都錄好了，可以找小封串成完整聽力檔。');renderNextButton();return}
  // 從目前大題（與目前段落之後）開始找，找不到再從頭。
  const order=chapterList().map(c=>c.id),here=order.indexOf(active);
  const focusedId=document.activeElement?.closest?.('.clip-card')?.id?.replace('clip-','');
  let pick=null;
  if(focusedId){const i=all.findIndex(m=>m.clip.id===focusedId);if(i>=0)pick=all[i+1]}
  if(!pick)pick=all.find(m=>order.indexOf(m.chapter)>here&&m.chapter!==active)||null;
  const inHere=all.filter(m=>m.chapter===active);
  if(!focusedId&&inHere.length)pick=inHere[0];
  if(!pick)pick=all[0];
  goToClip(pick.chapter,pick.clip.id);
}
function labelIconButtons(){
  document.querySelectorAll('#clips [data-action=editClip]:not([title])').forEach(b=>{b.title='剪輯這一段';b.setAttribute('aria-label','剪輯這一段')});
  document.querySelectorAll('#clips [data-action=importAudio]').forEach(b=>{if(!b.title)b.title='匯入音檔'});
}
function fitScripts(){
  if(innerWidth<=1000)return;
  document.querySelectorAll('#clips .clip-script').forEach(t=>{if(!t.offsetParent)return;t.style.height='auto';t.style.height=Math.min(160,Math.max(40,t.scrollHeight+2))+'px'});
}
let fitQueued=0;
function queueFit(){cancelAnimationFrame(fitQueued);fitQueued=requestAnimationFrame(fitScripts)}
function renderNextButton(){
  labelIconButtons();queueFit();
  const tools=q('.record-tools');if(!tools)return;
  let b=q('#uxNextMissing');
  if(!b){b=document.createElement('button');b.id='uxNextMissing';b.type='button';b.className='ux-next-missing';b.title='跳到下一段還沒錄的地方（Alt+N）';b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();nextMissing()});const anchor=tools.querySelector('[data-action=micSettings]');tools.insertBefore(b,anchor||null)}
  const n=missingClips().length;
  b.innerHTML=n?'<svg aria-hidden="true"><use href="#i-next"/></svg><span>下一段未錄</span><b>'+n+'</b>':'<svg aria-hidden="true"><use href="#i-check"/></svg><span>全部錄好</span>';
  b.classList.toggle('is-done',!n);
}

/* ---------- 3. 小封完成度 → 直接回麥麥 ---------- */
function linkExportOverview(){
  const flow=q('#exportWarnings .export-flow');if(!flow||flow.dataset.uxLinked)return;flow.dataset.uxLinked='1';
  const used=usedIds();
  const firstMissing=clips=>clips.find(c=>c&&!c.blob&&(!used||used.has(c.id)));
  const rows=[...flow.children];
  const make=(el,chapter,clips,label)=>{
    if(!el)return;const miss=firstMissing(clips);
    const btn=document.createElement('button');btn.type='button';btn.className='ux-flow-jump'+(miss?'':' is-done');
    btn.innerHTML=miss?'去錄 →':'✓ 已錄好';btn.title=miss?'到麥麥錄「'+label+'」':'到麥麥檢查「'+label+'」';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();goToClip(chapter,miss?.id)});
    el.append(btn);
  };
  make(rows[0],'intro',[...state.intro,state.start],'開場與開始提醒');
  const spans=rows[1]?.querySelectorAll('.flow-sections>span')||[];
  state.sections.forEach((s,i)=>make(spans[i],s.id,A.sectionClips(s),s.title));
  make(rows[2],'end',[state.end],'結束提醒');
}

/* ---------- 4. 鍵盤快捷鍵 ---------- */
function onKey(e){
  if(!e.altKey||e.metaKey||e.ctrlKey||document.querySelector('dialog[open]'))return;
  const k=e.code;
  const map={Digit1:'record',Digit2:'arrange',Digit3:'export',Digit4:'library'};
  if(k==='Digit0'){e.preventDefault();goWorktable();return}
  if(map[k]){e.preventDefault();if(map[k]==='library')openLibrary().catch(err=>toast(err.message));else enterRoom(map[k]);return}
  if(k==='KeyN'&&!atWorktable&&page==='record'){e.preventDefault();nextMissing()}
}

/* ---------- 掛勾 ---------- */
function wrap(name,after){const fn=window[name];if(typeof fn!=='function'||fn.__ux)return;const w=function(...a){const r=fn.apply(this,a);try{after()}catch(err){console.warn('[ux-v104]',name,err)}return r};w.__ux=true;window[name]=w}
function init(){
  if(typeof state==='undefined'||typeof enterRoom!=='function'){setTimeout(init,60);return}
  buildDock();syncDock();renderNextButton();
  wrap('syncPhoneRoom',syncDock);
  wrap('switchPage',syncDock);
  wrap('renderNav',renderNextButton);
  wrap('renderChapter',renderNextButton);
  wrap('renderExport',linkExportOverview);
  wrap('meta',renderNextButton);
  document.addEventListener('keydown',onKey);
  addEventListener('resize',queueFit,{passive:true});
  linkExportOverview();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
