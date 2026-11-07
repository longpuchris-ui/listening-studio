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
const MOD=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent)?'⌥':'Alt+';
const busy=()=>!!((typeof rec!=='undefined'&&rec)||(typeof building!=='undefined'&&building));

/* ---------- 1. 房間切換列 ---------- */
function buildDock(){
  const bar=q('.room-return');if(!bar||q('.room-dock'))return;
  const nav=document.createElement('nav');nav.className='room-dock';nav.setAttribute('aria-label','切換房間');
  nav.innerHTML='<button type="button" class="dock-home" data-action="home" title="回錄音室（'+MOD+'0）" aria-label="回錄音室首頁"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 9.8V20h13V9.8M10 20v-5.5h4V20"/></svg><span>回錄音室</span></button><span class="dock-rooms">'+
    ROOMS.map(r=>`<button type="button" class="dock-room dock-${r.page}" data-action="${r.action}" data-room="${r.page}" title="${r.num?r.num+' · ':''}${r.name}｜${r.job}${r.num?'（'+MOD+r.num+'）':''}" aria-label="${r.name}：${r.job}"><span class="dock-face"><img src="${r.img}" alt="" aria-hidden="true"></span>${r.num?`<i aria-hidden="true">${r.num}</i>`:''}<span class="dock-label">${r.name}</span></button>`).join('')+'</span>';
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
  list.push({id:'end',clips:[...(state.settings.rounds>1&&state.replay?[state.replay]:[]),state.end]});
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
  const phone=innerWidth<=1000;
  if(phone&&clipId){try{mobileClipId=clipId}catch{}}
  if(active!==chapter||phone){stopPreview();if(chapter==='optionLabels')ensureOptionLabels();active=chapter;editClip=null;renderNav();renderChapter();renderBusy()}
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
function fitTools(){
  const t=q('.record-tools');if(!t||!t.offsetParent)return;
  t.classList.remove('ux-tight');
  if(t.scrollWidth>t.clientWidth+1)t.classList.add('ux-tight');
}
function fitScripts(){
  fitTools();
  if(innerWidth<=1000)return;
  document.querySelectorAll('#clips .clip-script').forEach(t=>{if(!t.offsetParent)return;t.style.height='auto';t.style.height=Math.min(160,Math.max(40,t.scrollHeight+2))+'px'});
}
let fitQueued=0;
function queueFit(){cancelAnimationFrame(fitQueued);fitQueued=requestAnimationFrame(fitScripts)}
function renderNextButton(){
  labelIconButtons();queueFit();
  const tools=q('.record-tools');if(!tools)return;
  let b=q('#uxNextMissing');
  if(!b){b=document.createElement('button');b.id='uxNextMissing';b.type='button';b.className='ux-next-missing';b.title='跳到下一段還沒錄的地方（'+MOD+'N）';b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();nextMissing()});const anchor=tools.querySelector('[data-action=micSettings]');tools.insertBefore(b,anchor||null)}
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
  make(rows[2],'end',[...(state.settings.rounds>1&&state.replay&&(state.replay.script||state.replay.blob)?[state.replay]:[]),state.end],'結束提醒');
}

/* ---------- 拍仔確認後：直接去小封 ---------- */
function syncRhythmNext(){
  const p=q('#rhythmConfirmedText');if(!p)return;
  let b=q('#uxGoExport');
  const arranged=!!state.workflow?.arranged;
  if(!arranged){b?.remove();return}
  if(!b){b=document.createElement('button');b.id='uxGoExport';b.type='button';b.className='ux-go-export';b.dataset.action='enterExport';b.innerHTML='<img src="assets/xiaofeng-export.webp" alt="" aria-hidden="true">✓ 節奏已確認・找小封串成聽力檔 →';p.after(b)}
}
document.addEventListener('click',e=>{if(e.target.closest('[data-action=focusRecording]'))setTimeout(queueFit,0);if(e.target.closest('[data-action=confirmRhythm]'))setTimeout(()=>{syncRhythmNext();toast('播放節奏已確認。點「找小封」或右上角的小封，就能串成完整聽力檔。')},0)});

/* ---------- 4. 鍵盤快捷鍵 ---------- */
function onKey(e){
  if(!e.altKey||e.metaKey||e.ctrlKey||document.querySelector('dialog[open]'))return;
  const t=e.target;if(t&&(t.isContentEditable||t.tagName==='TEXTAREA'||(t.tagName==='INPUT'&&!['checkbox','radio','button','range'].includes(t.type))))return;
  const k=e.code;
  const map={Digit1:'record',Digit2:'arrange',Digit3:'export',Digit4:'library'};
  if(k==='Digit0'){e.preventDefault();goWorktable();return}
  if(map[k]){e.preventDefault();if(map[k]==='library')openLibrary().catch(err=>toast(err.message));else enterRoom(map[k]);return}
  if(k==='KeyN'&&!atWorktable&&page==='record'){e.preventDefault();nextMissing()}
}

/* ---------- 使用說明補一節 ---------- */
function addGuide(){
  const box=q('#studioGuide .guide-scroll');if(!box||q('#uxGuideNav'))return;
  const d=document.createElement('details');d.id='uxGuideNav';
  d.innerHTML='<summary>快速換房間與快捷鍵</summary><p>進到任何一間房，右上角都有「回錄音室」和麥麥①、拍仔②、小封③（大螢幕另有資料庫）的頭像，直接點就能換房間，不必先回首頁。錄音或串接進行中暫時不能切換。</p><p>麥麥工具列的「下一段未錄」會跳到下一段還沒錄的地方，數字是剩下幾段。小封的完成度清單按「去錄」，會直接帶你到那個大題缺的段落。拍仔確認節奏後，可按「找小封串成聽力檔」直接前往。</p><p>電腦快捷鍵（Mac 用 Option ⌥，Windows 用 Alt）：⌥1 麥麥、⌥2 拍仔、⌥3 小封、⌥4 資料庫、⌥0 回錄音室、⌥N 下一段未錄。游標在文字框裡時不會觸發。</p>';
  const items=box.querySelectorAll(':scope>details');const after=items[5]||items[items.length-1];
  if(after)after.after(d);else box.append(d);
}


/* ---------- v105 手機麥麥：段落點點、下一段預告、稿子自動高度 ---------- */
function clipName(c){
  if(!c)return '';
  if(c.speakerName)return c.speakerName;
  if(c.speaker&&typeof roleName==='function')return roleName(c.speaker);
  if(active==='intro')return c.label||(c.lang==='zh'?'中文':'EN · English');
  return c.label||'段落';
}
function missingAfter(id){
  const all=[];for(const ch of chapterList())for(const c of ch.clips)if(c)all.push({chapter:ch.id,clip:c});
  const used=usedIds(),i=Math.max(0,all.findIndex(m=>m.clip.id===id));
  const ok=m=>m.clip.id!==id&&!m.clip.blob&&(!used||used.has(m.clip.id));
  return all.slice(i+1).find(ok)||all.slice(0,i).find(ok)||null;
}
function deckGo(id){
  if(busy()||!id)return;
  try{stopPreview()}catch{}
  mobileClipId=id;editClip=null;renderChapter();renderBusy();
}
function fitDeckScript(){
  const t=q('#mobileRecordDeck .clip-script');if(!t)return;
  t.style.height='auto';
  t.style.height=Math.max(96,t.scrollHeight+4)+'px';
}
function enhanceDeck(){
  const deck=q('#mobileRecordDeck');
  if(!deck||deck.hidden||innerWidth>600||typeof currentClips!=='function')return;
  const info=deck.querySelector('.clip-card .clip-info');if(!info)return;
  info.querySelector('.ux-deck-extra')?.remove();
  const list=currentClips();const i=list.findIndex(c=>c.id===mobileClipId);if(i<0)return;
  const c=list[i],next=list[i+1];
  const box=document.createElement('div');box.className='ux-deck-extra';
  const dots=list.map((x,k)=>`<button type="button" class="ux-dot${x.blob?' is-done':''}${k===i?' is-current':''}" data-ux-clip="${x.id}" aria-label="第 ${k+1} 段 ${esc(clipName(x))}${x.blob?'（已錄）':''}"${k===i?' aria-current="step"':''}></button>`).join('');
  const done=list.filter(x=>x.blob).length;
  let tail;
  if(next){
    const text=(next.script||'').replace(/\s+/g,' ').trim();
    tail=`<button type="button" class="ux-next-up" data-ux-clip="${next.id}"><small>接著 · ${esc(clipName(next))}${next.blob?' ✓':''}</small><span>${esc(text.slice(0,60))||'（還沒有稿子）'}${text.length>60?'…':''}</span><b aria-hidden="true">→</b></button>`;
  }else{
    const after=missingAfter(c.id),left=missingClips().filter(m=>m.clip.id!==c.id).length;
    tail=after?`<button type="button" class="ux-next-up is-end" data-ux-missing="${after.clip.id}" data-ux-chapter="${after.chapter}"><small>這個大題最後一段${c.blob?'':' · 錄完這段後'}</small><span>去下一段未錄（其他還有 ${left} 段）</span><b aria-hidden="true">→</b></button>`
        :!c.blob?`<div class="ux-next-up is-end is-last"><small>最後一段</small><span>錄完這段，整份就全部錄好了</span></div>`
             :`<button type="button" class="ux-next-up is-end is-all" data-action="enterArrange"><small>全部錄好了</small><span>找拍仔確認播放節奏</span><b aria-hidden="true">→</b></button>`;
  }
  box.innerHTML=`<div class="ux-dots" role="group" aria-label="本大題段落：已錄 ${done} / ${list.length}">${dots}<span class="ux-dots-count">${done}/${list.length} 已錄</span></div>${tail}`;
  info.append(box);
  fitDeckScript();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('.ux-deck-extra [data-ux-clip],.ux-deck-extra [data-ux-missing]');if(!b)return;
  e.preventDefault();e.stopPropagation();
  if(b.hasAttribute('data-ux-missing'))goToClip(b.dataset.uxChapter,b.dataset.uxMissing);else deckGo(b.dataset.uxClip);
},true);
document.addEventListener('input',e=>{if(e.target.matches?.('#mobileRecordDeck .clip-script'))fitDeckScript()});

/* v108 重播提醒：一鍵填入建議句 */
document.addEventListener('click',e=>{
  if(!e.target.closest?.('.replay-fill')||!state.replay||busy())return;
  e.preventDefault();state.replay.script='現在將重播一遍。You will now hear the listening part again.';save();renderChapter();renderNav();
});
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
  wrap('renderWorktable',syncRhythmNext);
  wrap('renderSettings',syncRhythmNext);
  wrap('meta',()=>{renderNextButton();enhanceDeck()});
  wrap('renderMobileDeck',enhanceDeck);
  wrap('renderBusy',()=>document.body.classList.toggle('ux-busy',busy()));
  document.addEventListener('keydown',onKey);
  addEventListener('resize',queueFit,{passive:true});
  enhanceDeck();
  linkExportOverview();syncRhythmNext();addGuide();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
