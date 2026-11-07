/* 聽力錄音室 v106 · AI 配音（ElevenLabs，經 Cloudflare Worker）
 * - 只做英文段落；含中文字或標成中文的段落請老師自己錄。
 * - 一句一段生成，存進來的方式和「匯入」相同（可剪輯、可復原）。
 * - 登入資訊只留在記憶體；本機只記住是否開通過與聲音選擇。
 */
(()=>{
'use strict';
const CFG={endpoint:'https://listening-studio-voice-chris.longpuchris.workers.dev',clientId:'964857001905-feio66b11q9vmm1uje930cejhf1pcfk9.apps.googleusercontent.com',origin:'https://longpuchris-ui.github.io'};
const PREF='listening-ai-voice-v1';
const CJK=/[㐀-鿿豈-﫿　-〿！-｠]/;
const $=s=>document.querySelector(s);
let auth=null,gsiPromise=null,job=null,expiryTimer=0;

/* ---------- 偏好 ---------- */
function pref(){try{return JSON.parse(localStorage.getItem(PREF)||'{}')||{}}catch{return{}}}
function setPref(p){try{localStorage.setItem(PREF,JSON.stringify({...pref(),...p}))}catch{}}
const unlocked=()=>!!pref().unlocked;

/* ---------- 段落判斷 ---------- */
function chapterOf(id){
  if(state.intro.some(c=>c.id===id)||state.start?.id===id)return 'intro';
  if(state.end?.id===id||state.replay?.id===id)return 'end';
  if((state.optionLabels||[]).some(c=>c.id===id))return 'optionLabels';
  for(const s of state.sections)if(A.sectionClips(s).some(c=>c.id===id))return s.id;
  return null;
}
function scriptOf(c){return String(c?.script??c?.codeText??'').replace(/\[[^\]]{0,40}\]/g,' ').replace(/\s+/g,' ').trim()}
function eligible(c){
  if(!c)return{ok:false,why:'找不到段落'};
  const t=scriptOf(c);
  if(!t)return{ok:false,why:'還沒有稿子'};
  if(c.lang==='zh'||CJK.test(t))return{ok:false,why:'含中文，請自己錄'};
  if([...t].length>1000)return{ok:false,why:'稿子太長（上限 1000 字元）'};
  return{ok:true,text:t,chars:[...t].length};
}
function roleOf(c){return c?.speaker==='A'||c?.speaker==='B'?c.speaker:'narrator'}
function voiceFor(c){const p=pref(),v=auth?.account?.catalog?.voices||[],want=p.voices?.[roleOf(c)];return v.some(x=>x.id===want)?want:(v[roleOf(c)==='B'?1:0]||v[0])?.id}
function voiceLabel(id){return auth?.account?.catalog?.voices?.find(v=>v.id===id)?.label||'未選'}
const isAi=c=>c?.ai&&c.ai.version===c.version&&c.blob;
function chapterClips(ch){
  if(ch==='intro')return[...state.intro,state.start].filter(Boolean);
  if(ch==='end')return[...(state.settings.rounds>1&&state.replay?[state.replay]:[]),state.end].filter(Boolean);
  if(ch==='optionLabels')return state.optionLabels||[];
  const s=state.sections.find(s=>s.id===ch);return s?A.sectionClips(s):[];
}
function used(){try{return new Set(A.order(state).filter(x=>x.kind==='clip').map(x=>x.id))}catch{return null}}
const CATS=[['narration','題目旁白'],['options','答案選項'],['A',null],['B',null],['frame','開場／結束']];
function catOf(c){
  if(c.speaker==='A'||c.speaker==='B')return c.speaker;
  const ch=chapterOf(c.id);if(ch==='intro'||ch==='end'||ch==='optionLabels')return 'frame';
  for(const s of state.sections)for(const q of s.questions)if((q.options||[]).includes(c))return 'options';
  return 'narration';
}
function cats(){return{narration:true,options:true,A:false,B:false,frame:true,...(pref().cats||{})}}
function catName(k){return CATS.find(x=>x[0]===k)?.[1]||roleName(k)}
const stale=c=>!!(isAi(c)&&typeof c.ai.text==='string'&&c.ai.text!==scriptOf(c));
const picks=new Map();let scope='chapter';
function chapterName(ch){return ch==='intro'?'測驗開場':ch==='end'?'結束提醒':ch==='optionLabels'?'答案代號':state.sections.find(s=>s.id===ch)?.title||'大題'}
function scopeClips(){
  const ids=scope==='all'?[...(state.settings?.optionLabelsEnabled&&state.optionLabels?.length?['optionLabels']:[]),'intro',...state.sections.map(s=>s.id),'end']:[active];
  const u=used();
  return ids.flatMap(ch=>chapterClips(ch).map(c=>({c,ch}))).filter(({c})=>!u||u.has(c.id));
}
function plan(){
  const rows=[],sum={recorded:0,zh:0,empty:0},on=cats();
  for(const {c,ch} of scopeClips()){
    const e=eligible(c),st=stale(c);
    if(!e.ok){if(c.blob)sum.recorded++;else if(/中文/.test(e.why))sum.zh++;else sum.empty++;continue}
    if(c.blob&&!st){sum.recorded++;continue}
    const cat=catOf(c),def=st?false:!!on[cat];
    rows.push({c,ch,cat,stale:st,chars:e.chars,on:picks.has(c.id)?picks.get(c.id):def});
  }
  return{rows,sum};
}
function rowLabel(r){const l=r.c.speaker?roleName(r.c.speaker)+'・'+(r.c.label||'').replace(/^說話者\s*\d\s*[·・]\s*/,''):(r.c.label||'段落');return(scope==='all'?chapterName(r.ch)+'・':'')+l}

/* ---------- 錯誤訊息 ---------- */
const MSG={UNAUTHENTICATED:'登入已失效，請重新登入。',FORBIDDEN:'這個 Google 帳號還沒開通 AI 配音，請找管理的老師把你的 Email 加進名單。',STALE:'後端設定剛更新，請重新登入一次。',QUOTA:'今天的 AI 配音額度用完了（每日上限），明天再試，或請管理的老師調高上限。',BUSY:'上一段還在處理中，請等一下再試（失敗後約 90 秒才能再送）。',DUPLICATE:'這個請求已送過，不會重送。',INVALID_INPUT:'這段稿子格式無法送出（可能太長或聲音不在清單內）。',PROVIDER_AUTH:'ElevenLabs 拒絕目前的金鑰或聲音設定。',PROVIDER_LIMIT:'ElevenLabs 回報頻率或額度限制，請稍後再試。',UPSTREAM:'語音服務沒有回傳有效音檔（可能已扣額度）。',PROVIDER_PAYMENT_REQUIRED:'ElevenLabs 要求付款（402）。',PROVIDER_PAID_PLAN_REQUIRED:'ElevenLabs 表示這個聲音或功能需要付費方案。',PROVIDER_INSUFFICIENT_CREDITS:'ElevenLabs 額度不足，本月 credits 可能用完了。',PROVIDER_VOICE_ACCESS_DENIED:'ElevenLabs 拒絕使用這個聲音。',PROVIDER_MODEL_ACCESS_DENIED:'ElevenLabs 拒絕使用 Eleven v3 模型。',PROVIDER_INSUFFICIENT_PERMISSIONS:'API 金鑰缺少 Text to Speech 權限。',UNAVAILABLE:'AI 配音服務暫時無法使用。',INVALID_RESPONSE:'回傳的資料格式不對，沒有存入。',NETWORK:'網路連線失敗，請確認網路後再試。',CANCELLED:'已停止。',GIS:'Google 登入元件載入失敗，請重新整理後再試。'};
const msg=code=>MSG[code]||'AI 配音沒有完成（'+code+'）。';

/* ---------- 登入 ---------- */
function loadGoogle(){
  if(window.google?.accounts?.id)return Promise.resolve();
  if(gsiPromise)return gsiPromise;
  gsiPromise=new Promise((res,rej)=>{const s=document.createElement('script'),t=setTimeout(()=>{gsiPromise=null;rej(Error('GIS'))},10000);s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>{clearTimeout(t);window.google?.accounts?.id?res():(gsiPromise=null,rej(Error('GIS')))};s.onerror=()=>{clearTimeout(t);s.remove();gsiPromise=null;rej(Error('GIS'))};document.head.append(s)});
  return gsiPromise;
}
function claims(tok){try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))))}catch{return null}}
async function call(path,body,signal){
  let r;
  try{r=await fetch(CFG.endpoint+path,{method:body?'POST':'GET',headers:{Accept:body?'audio/mpeg, application/json':'application/json',Authorization:'Bearer '+auth.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'})}
  catch(e){throw Error(signal?.aborted?'CANCELLED':'NETWORK')}
  return r;
}
async function readJson(r){try{if(!/^application\/json/i.test(r.headers.get('content-type')||''))throw 0;return await r.json()}catch{return{code:'INVALID_RESPONSE'}}}
function validAccount(a){return a?.status==='ready'&&/^[0-9a-f]{64}$/.test(a.revision||'')&&a.catalog?.model==='eleven_v3'&&Array.isArray(a.catalog.voices)&&a.catalog.voices.length>=1&&a.catalog.voices.every(v=>/^[-\w]{1,80}$/.test(v.id)&&typeof v.label==='string')}
async function signIn(){
  const box=$('#aiGoogle');box.replaceChildren();status('正在準備 Google 登入…');
  try{await loadGoogle()}catch{status(msg('GIS'),'error');return}
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
  google.accounts.id.initialize({client_id:CFG.clientId,nonce,auto_select:false,callback:async resp=>{
    const tok=resp?.credential,c=claims(tok);
    if(!tok||c?.nonce!==nonce||c.aud!==CFG.clientId||!(c.exp*1000>Date.now()+5000)){status('登入回覆無效，請再試一次。','error');return}
    auth={token:tok,email:c.email||'',expiresAt:c.exp*1000,account:null};
    status('正在確認帳號是否已開通…');
    try{
      const r=await call('/v1/account'),a=await readJson(r);
      if(!r.ok||!validAccount(a))throw Error(a.code||'INVALID_RESPONSE');
      auth.account=a;setPref({unlocked:true});
      clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{auth=null;paint();status('登入已過期（約一小時），要用時再登入一次即可。')},Math.max(0,auth.expiresAt-Date.now()-15000));
      box.replaceChildren();status('已開通：'+auth.email,'ok');paint();decorate();
    }catch(e){auth=null;status(msg(e.message),'error');paint()}
  }});
  google.accounts.id.renderButton(box,{type:'standard',size:'large',text:'signin_with',width:Math.min(300,box.clientWidth||300)});
  status('請按下方的 Google 按鈕登入。');
}

/* ---------- 生成 ---------- */
async function generateClip(c,signal,preapproved=false){
  const e=eligible(c);if(!e.ok)throw Error('SKIP:'+e.why);
  if(!auth?.account||auth.expiresAt<=Date.now()+5000)throw Error('UNAUTHENTICATED');
  if(rec||building)throw Error('BUSYLOCAL');
  const voiceId=voiceFor(c);if(!voiceId)throw Error('INVALID_INPUT');
  const requestId=crypto.randomUUID();
  const r=await call('/v1/dialogue',{requestId,accountRevision:auth.account.revision,model:'eleven_v3',inputs:[{text:e.text,voiceId}]},signal);
  if(!r.ok){const j=await readJson(r);if(j.code==='STALE'||j.code==='UNAUTHENTICATED'){auth=null;paint()}throw Error(j.code||'INVALID_RESPONSE')}
  if(!/^audio\/mpeg/i.test(r.headers.get('content-type')||''))throw Error('INVALID_RESPONSE');
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(bytes.length<128||!(bytes[0]===73&&bytes[1]===68&&bytes[2]===51||bytes[0]===255&&(bytes[1]&224)===224))throw Error('INVALID_RESPONSE');
  const before=c.version;
  importTarget=c.id;
  const ask=window.confirm;if(preapproved)window.confirm=()=>true;
  try{await importAudio(new File([bytes],'ai-voice.mp3',{type:'audio/mpeg'}))}finally{window.confirm=ask}
  if(c.version===before)throw Error('NOT_SAVED');
  c.ai={voiceId,voice:voiceLabel(voiceId),chars:e.chars,text:e.text,version:c.version,at:new Date().toISOString()};
  save();
  return e.chars;
}
async function runOne(id,btn){
  if(job)return;
  const c=find(id);if(!c)return;
  if(!auth?.account){openPanel();status('請先登入 Google，再按一次這段的 AI 鈕。');return}
  const e=eligible(c);if(!e.ok){toast(e.why);return}
  job={controller:new AbortController(),one:true};btn?.classList.add('is-working');paint();
  try{await generateClip(c,job.controller.signal);toast('AI 配音完成：用了約 '+e.chars+' credits（'+voiceLabel(c.ai.voiceId)+'）。')}
  catch(err){const m=String(err.message);if(m==='NOT_SAVED'||m==='BUSYLOCAL')toast('AI 配音沒有存入：段落正在錄音或已變更。');else if(!m.startsWith('SKIP:'))toast(msg(m))}
  finally{job=null;btn?.classList.remove('is-working');paint();decorate()}
}
async function runBatch(){
  if(job||!auth?.account)return;
  const list=plan().rows.filter(r=>r.on).map(r=>r.c);if(!list.length)return;
  const total=list.reduce((n,c)=>n+eligible(c).chars,0);
  job={controller:new AbortController()};paint();
  let done=0,spent=0;
  try{
    for(const c of list){
      if(job.controller.signal.aborted)throw Error('CANCELLED');
      status(`正在生成第 ${done+1} / ${list.length} 段：${(c.label||'').slice(0,24)}…`);
      bar(done/list.length);
      spent+=await generateClip(c,job.controller.signal,true);done++;picks.delete(c.id);
    }
    bar(1);status(`完成：${done} 段，用了約 ${spent} credits。請在麥麥逐段試聽確認。`,'ok');
  }catch(err){
    const m=String(err.message);
    status(`停在第 ${done+1} 段：${m==='NOT_SAVED'||m==='BUSYLOCAL'?'段落正在錄音或已變更，沒有存入。':msg(m)}已完成 ${done} 段（約 ${spent} / ${total} credits）。`,'error');
  }finally{job=null;paint();decorate()}
}
/* ---------- 面板 ---------- */
function status(t,kind=''){const s=$('#aiStatus');if(!s)return;s.textContent=t;s.dataset.kind=kind}
function bar(f){const b=$('#aiBar');if(!b)return;b.hidden=f==null;if(f!=null)b.value=f}
function buildPanel(){
  if($('#aiVoiceDialog'))return;
  const d=document.createElement('dialog');d.id='aiVoiceDialog';
  d.innerHTML=`<form method="dialog"><div class="dialog-top"><h2>AI 配音</h2><button class="icon-btn" aria-label="關閉 AI 配音">×</button></div>
  <p class="ai-note">用 ElevenLabs 幫<strong>英文段落</strong>配音，一句一段，存進來和「匯入」一樣可以剪輯、復原。中文段落請自己錄。<b>1 個字元約 1 credit</b>，額度由管理的老師提供。</p>
  <section class="ai-step" id="aiLogin"><h3>① 登入</h3><p id="aiWho">需要已開通的 Google 帳號。</p><button type="button" class="secondary" data-ai="signin">用 Google 登入</button><div id="aiGoogle"></div></section>
  <section class="ai-step" id="aiVoices" hidden><h3>② 聲音</h3><div class="ai-voice-grid"></div><p class="ai-small">每份試卷共用：題目旁白用「旁白」，對話依角色自動套用。想先聽聲音，可以用試音頁比較。</p></section>
  <section class="ai-step" id="aiRun" hidden><h3>③ 生成</h3><div id="aiTargets"></div><progress id="aiBar" max="1" value="0" hidden></progress></section>
  <p id="aiStatus" role="status" aria-live="polite"></p>
  <div class="ai-actions"><button type="button" class="quiet" data-ai="stop" hidden>停止</button><button class="primary">關閉</button></div></form>`;
  document.body.append(d);
  d.addEventListener('click',e=>{const b=e.target.closest('[data-ai]');if(!b)return;e.preventDefault();const k=b.dataset.ai;
    if(k==='signin')signIn();else if(k==='batch')runBatch();else if(k==='stop')job?.controller.abort();else if(k==='current')runOne(mobileClipId||'',null)});
  d.addEventListener('change',e=>{
    const t=e.target;
    if(t.matches('select[data-role]')){const p=pref();setPref({voices:{...(p.voices||{}),[t.dataset.role]:t.value}})}
    else if(t.matches('[data-ai-cat]')){setPref({cats:{...cats(),[t.dataset.aiCat]:t.checked}});for(const r of plan().rows)if(r.cat===t.dataset.aiCat)picks.delete(r.c.id)}
    else if(t.matches('[data-ai-pick]'))picks.set(t.dataset.aiPick,t.checked);
    else if(t.name==='aiScope')scope=t.value;
    else return;
    paint();
  });
  d.addEventListener('cancel',e=>{if(job)e.preventDefault()});
  d.querySelector('form').addEventListener('submit',e=>{if(job)e.preventDefault()});
}
function paint(){
  const d=$('#aiVoiceDialog');if(!d)return;
  const ok=!!auth?.account;
  d.querySelector('#aiWho').textContent=ok?'已登入：'+auth.email:'需要已開通的 Google 帳號。';
  d.querySelector('[data-ai=signin]').hidden=ok;
  d.querySelector('#aiVoices').hidden=!ok;d.querySelector('#aiRun').hidden=!ok;
  d.querySelector('[data-ai=stop]').hidden=!job||job.one;
  d.querySelector('.primary').disabled=!!job;
  if(!ok)return;
  const v=auth.account.catalog.voices,roles=[['narrator','旁白（題目、開場、答案代號）'],['A',roleName('A')+'（對話）'],['B',roleName('B')+'（對話）']];
  const grid=d.querySelector('.ai-voice-grid');
  grid.innerHTML=roles.map(([k,l])=>{const cur=voiceFor({speaker:k==='narrator'?null:k});return`<label><span>${esc(l)}</span><select data-role="${k}" ${job?'disabled':''}>${v.map(x=>`<option value="${esc(x.id)}" ${x.id===cur?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label>`}).join('');
  const {rows,sum}=plan(),on=cats(),sel=rows.filter(r=>r.on),chars=sel.reduce((n,r)=>n+r.chars,0);
  const cur=innerWidth<=600&&mobileClipId?find(mobileClipId):null,ce=cur&&eligible(cur);
  const t=d.querySelector('#aiTargets'),keep=t.querySelector('.ai-list')?.scrollTop||0;
  t.innerHTML=`<div class="ai-scope" role="radiogroup" aria-label="生成範圍"><label><input type="radio" name="aiScope" value="chapter" ${scope==='chapter'?'checked':''} ${job?'disabled':''}>這個大題（${esc(chapterName(active))}）</label><label><input type="radio" name="aiScope" value="all" ${scope==='all'?'checked':''} ${job?'disabled':''}>整份試卷</label></div>
  <fieldset class="ai-cats" ${job?'disabled':''}><legend>要用 AI 的部分</legend>${CATS.map(([k])=>`<label><input type="checkbox" data-ai-cat="${k}" ${on[k]?'checked':''}>${esc(catName(k))}</label>`).join('')}</fieldset>
  ${rows.length?`<ul class="ai-list">${rows.map(r=>`<li class="${r.on?'is-on':''}${r.stale?' is-stale':''}"><label><input type="checkbox" data-ai-pick="${r.c.id}" ${r.on?'checked':''} ${job?'disabled':''}><span class="ai-n">${esc(rowLabel(r))}</span><span class="ai-v">${r.stale?'稿子改過，重新生成？':esc(voiceLabel(voiceFor(r.c)).split(' · ')[0])}</span><span class="ai-k">${r.chars}</span></label></li>`).join('')}</ul>`:'<p class="ai-empty">這個範圍沒有還沒錄的英文段落。</p>'}
  <p class="ai-small">${[sum.recorded&&`已錄好 ${sum.recorded} 段（不會動）`,sum.zh&&`中文 ${sum.zh} 段（請自己錄）`,sum.empty&&`${sum.empty} 段還沒有稿子`].filter(Boolean).join(' · ')||'&nbsp;'}</p>
  <button type="button" class="ai-go" data-ai="batch" ${!sel.length||job?'disabled':''}>${sel.length?`生成勾選的 ${sel.length} 段（約 ${chars} credits）`:'勾選要生成的段落'}</button>`+
  (cur?`<button type="button" class="ai-target" data-ai="current" ${!ce.ok||job?'disabled':''}><b>只生成目前這一段${cur.blob?'（會取代原錄音）':''}</b><span>${ce.ok?`約 ${ce.chars} credits`:esc(ce.why)}</span></button>`:'')+
  `<p class="ai-small">電腦版每一段的工具列也有 ✨，可單獨生成或重做。</p>`;
  const L=t.querySelector('.ai-list');if(L)L.scrollTop=keep;
}
function openPanel(){buildPanel();paint();const d=$('#aiVoiceDialog');if(!d.open)d.showModal();if(!auth?.account&&!$('#aiStatus').textContent)status('')}

/* ---------- 麥麥：工具列入口與每段按鈕 ---------- */
const SPARK='<svg viewBox="0 0 24 24" aria-hidden="true" class="ai-spark"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/><path d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
function decorate(){
  const tools=$('.record-tools');
  if(tools&&!tools.querySelector('#aiToolbar')){const b=document.createElement('button');b.type='button';b.id='aiToolbar';b.className='quiet ai-toolbar';b.title='AI 配音（英文段落）';b.innerHTML=SPARK+'<span>AI 配音</span>';const mic=tools.querySelector('[data-action=micSettings]');mic?mic.before(b):tools.append(b)}
  const on=unlocked();
  for(const card of document.querySelectorAll('#recordPage .clip-card')){
    const id=card.id.replace(/^clip-/,''),c=find(id);if(!c)continue;
    card.classList.toggle('is-ai',!!isAi(c));
    let chip=card.querySelector('.ai-chip');
    if(isAi(c)&&!chip){chip=document.createElement('span');chip.className='ai-chip';chip.textContent='AI';chip.title='AI 配音：'+(c.ai.voice||'');(card.querySelector('.clip-time')||card.querySelector('.clip-audio-state')||card.querySelector('.clip-audio-status')||card).append(chip)}
    else if(!isAi(c))chip?.remove();
    const host=card.querySelector('.clip-bottom');if(!host)continue;
    let btn=host.querySelector('.ai-clip');const e=eligible(c);
    if(!on){btn?.remove();continue}
    if(!btn){btn=document.createElement('button');btn.type='button';btn.className='ai-clip';btn.dataset.aiClip=id;btn.innerHTML=SPARK+'<span>AI</span>';host.prepend(btn)}
    btn.disabled=!e.ok||!!job;
    btn.title=e.ok?`AI 配音（${voiceLabel(voiceFor(c))}，約 ${e.chars} credits）${c.blob?'・會取代原錄音':''}`:'AI 配音：'+e.why;
    btn.setAttribute('aria-label',btn.title);
  }
}
document.addEventListener('click',e=>{
  if(e.target.closest('#aiToolbar')){e.preventDefault();openPanel();return}
  const b=e.target.closest('.ai-clip');if(b){e.preventDefault();e.stopPropagation();runOne(b.dataset.aiClip,b)}
},true);

function wrap(name,after){const fn=window[name];if(typeof fn!=='function'||fn.__ai)return;const w=function(...a){const r=fn.apply(this,a);try{after()}catch(err){console.warn('[ai-voice]',name,err)}return r};w.__ai=true;for(const k of Object.keys(fn))w[k]=fn[k];window[name]=w}
function init(){
  if(typeof state==='undefined'||typeof importAudio!=='function'||typeof renderChapter!=='function'){setTimeout(init,80);return}
  if(location.origin!==CFG.origin&&!window.__AI_VOICE_TEST__)return; // Worker 只接受正式網址
  wrap('renderChapter',decorate);wrap('renderNav',decorate);
  decorate();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.AIVoice={openPanel,eligible,_test:{get auth(){return auth},set auth(v){auth=v}}};
})();
