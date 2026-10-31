/* Illustrated opening, dialogue and waveform tools. Cloud speech is not connected. */
'use strict';
let waveEditor=null,waveRegion=null,waveEpoch=0;
function roleName(id){const name=state.roles?.[id]?.name;return name&&!/^角色 [AB]$/.test(name)?name:'說話者 '+(id==='A'?'1':'2')}
function resolveVoice(c){return {...c,voiceStyle:c.voiceStyle||state.roles?.[c.speaker]?.tone||'natural'}}
function migrateProject(s){
 const templates={A:{name:'角色 A',tone:'natural'},B:{name:'角色 B',tone:'warm'}};
 s.roles=Object.fromEntries(['A','B'].map(k=>{const r=s.roles?.[k]||{},tone=['natural','bright','warm'].includes(r.tone)?r.tone:templates[k].tone;return[k,{...templates[k],name:typeof r.name==='string'?r.name.slice(0,30):templates[k].name,tone,deviceVoice:typeof r.deviceVoice==='string'?r.deviceVoice:''}]}));
 s.settings={introGap:1,dialogueGap:.6,itemRepeat:false,itemRepeatGap:.5,optionLabelsEnabled:false,labelGap:.25,...s.settings};
 s.intro.forEach(c=>{if(!['en','zh'].includes(c.lang))c.lang=/中文/.test(c.label)?'zh':'en'});
 // Reorder only the untouched two-card default. Existing audio and user scripts keep their order.
 if(s.intro.length===2&&!s.intro.some(c=>c.blob)&&s.intro[0].label==='中文開場'&&s.intro[1].label==='英文開場')s.intro.reverse();
 return s;
}
function changedStructure(){invalidateRhythm();A.clearCache();save();render()}
function introSegment(c,i){return `<div class="intro-segment"><div class="intro-segment-tools"><span class="segment-number">${String(i+1).padStart(2,'0')}</span><select data-intro-lang="${c.id}" aria-label="開場第${i+1}段語言"><option value="en" ${c.lang==='en'?'selected':''}>EN · 英文</option><option value="zh" ${c.lang==='zh'?'selected':''}>中文</option></select><input data-intro-label="${c.id}" aria-label="開場第${i+1}段名稱" maxlength="60" value="${esc(c.label)}"><div>${button('upIntro',c.id,'next','開場第'+(i+1)+'段往前移')}${button('downIntro',c.id,'next','開場第'+(i+1)+'段往後移')}${button('deleteIntro',c.id,'trash','移除開場第'+(i+1)+'段')}</div></div>${card(c,i)}</div>`}
function addIntro(){if(state.intro.length>=40)return toast('開場最多可放 40 段。');const prev=state.intro.at(-1),lang=(prev.lang||(/中文/.test(prev.label)?'zh':'en'))==='en'?'zh':'en';const c={...clip(lang==='en'?'英文說明':'中文說明'),lang};state.intro.push(c);mobileClipId=c.id;changedStructure();$('#clip-'+c.id)?.scrollIntoView({behavior:'smooth',block:'center'})}
function moveIntro(id,delta){const i=state.intro.findIndex(c=>c.id===id),next=i+delta;if(i<0||next<0||next>=state.intro.length)return toast(delta<0?'這已經是第一段開場。':'這已經是最後一段開場。');[state.intro[i],state.intro[next]]=[state.intro[next],state.intro[i]];changedStructure()}
function deleteIntro(id){if(state.intro.length<=1)return toast('開場請保留至少一段。');const c=find(id);if(c.blob&&!confirm('移除這段開場及錄音？其他段落不會改變。'))return;state.intro=state.intro.filter(c=>c.id!==id);changedStructure()}
function questionById(id){return state.sections.flatMap(s=>s.questions).find(q=>q.id===id)}
function labelTurns(q){(q.turns||[]).forEach((c,i)=>c.label='對話第 '+(i+1)+' 句')}
function renderDialogue(q){if(q.arrangement?.mode==='single'||(!q.arrangement&&!q.turns?.length))return '';const turns=q.turns||[];return `<div class="dialogue-workspace ${turns.length?'has-turns':''}"><div class="dialogue-tools"><span>兩個人的小對話</span><button data-action="addTurnA" data-id="${q.id}">＋ ${esc(roleName('A'))}</button><button data-action="addTurnB" data-id="${q.id}">＋ ${esc(roleName('B'))}</button></div>${turns.map((c,i)=>`<div class="dialogue-turn turn-${c.speaker}"><div class="turn-caption"><span>${esc(roleName(c.speaker))} · 第 ${i+1} 句</span><div>${button('upTurn',c.id,'next','對話第'+(i+1)+'句往前移')}${button('deleteTurn',c.id,'trash','刪除對話第'+(i+1)+'句')}</div></div>${card(c,i)}</div>`).join('')}${turns.length?'<p class="dialogue-note">依畫面中的有效段落順序播放。換人停頓可到時鐘牆調整；連續錄音也會依這個順序進行。</p>':''}</div>`}
function addTurn(id,speaker){const q=questionById(id);if(!q)return;if(q.contentClips){const c={...clip('對話'),speaker,speakerName:roleName(speaker)};q.contentClips.push(c);q.arrangement.mode='dialogue';mobileClipId=c.id;changedStructure();return}q.turns??=[];if(q.turns.length>=40)return toast('一題最多可放 40 句對話。');const c={...clip('對話第 '+(q.turns.length+1)+' 句'),speaker,lang:'en'};q.turns.push(c);mobileClipId=c.id;changedStructure();$('#clip-'+c.id)?.scrollIntoView({behavior:'smooth',block:'center'})}
function deleteTurn(id){if(editImportedTurn(id,'delete'))return;const q=state.sections.flatMap(s=>s.questions).find(q=>q.turns?.some(c=>c.id===id));if(!q)return;if(q.arrangement?.mode==='dialogue'&&q.turns.length===1)return toast('對話請保留至少一句。');const c=find(id);if(c.blob&&!confirm('刪除這一句對話及錄音？'))return;q.turns=q.turns.filter(c=>c.id!==id);labelTurns(q);changedStructure()}
function moveTurn(id){if(editImportedTurn(id,'up'))return;const q=state.sections.flatMap(s=>s.questions).find(q=>q.turns?.some(c=>c.id===id));if(!q)return;const i=q.turns.findIndex(c=>c.id===id);if(i<1)return toast('這已經是第一句對話。');[q.turns[i-1],q.turns[i]]=[q.turns[i],q.turns[i-1]];labelTurns(q);changedStructure()}
function openRoleStudio(expand=true){state=migrateProject(state);for(const k of ['A','B']){document.querySelector('[data-role-name="'+k+'"]').value=state.roles[k].name;document.querySelector('[data-role-tone="'+k+'"]').value=state.roles[k].tone}$('#roleOptions').open=expand;$('#settingsDialog').showModal()}
function previewRole(k){if(!window.speechSynthesis)return toast('此裝置沒有提供文字試念功能。');const voices=speechSynthesis.getVoices().filter(v=>v.lang.startsWith('en'));if(!voices.length)return toast('此裝置尚未提供英文試念聲音。你仍可自行錄音或匯入音檔。');stopPreview();const role=state.roles[k],u=new SpeechSynthesisUtterance(k==='A'?'Hi! What would you like for lunch?':'I would like some noodles, please.');u.voice=voices[k==='A'?0:Math.min(1,voices.length-1)];u.lang=u.voice.lang;u.rate=.9;u.pitch=role.tone==='bright'?1.12:role.tone==='warm'?.9:1;speechSynthesis.speak(u);toast('裝置試念，不會保存成音檔，也不是雲端 AI 配音。')}
function exportVoiceScript(){const clips=A.allClips(state);const payload={format:'listening-voice-script',version:1,title:state.title,roles:state.roles,notes:'逐句生成音檔，回填對應 clip_id。考試留白由網站加入，不要寫入生成的音檔。',segments:clips.map(c=>({clip_id:c.id,label:c.label,speaker:c.speaker||'narrator',language:c.lang||'en',text:c.script||''})),playback:{intro_gap:state.settings.introGap,dialogue_gap:state.settings.dialogueGap,option_gap:state.settings.optionGap}};download(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),safeName()+'.voice-script.json');toast('角色與逐句配音腳本已準備下載。')}
function destroyWaveEditor(){waveEpoch++;if(waveEditor){waveEditor.destroy();waveEditor=null}waveRegion=null}
function mountWaveEditor(){destroyWaveEditor();if(!editClip)return;const c=find(editClip),container=$('#wave-editor-'+editClip);if(!c?.blob||!container)return;if(!window.WaveSurfer?.Regions){container.textContent='波形工具未載入，仍可用下方秒數剪輯。';return}const epoch=waveEpoch;const regions=WaveSurfer.Regions.create();waveEditor=WaveSurfer.create({container,height:88,waveColor:'#b9a0d3',progressColor:'#7e5da3',cursorColor:'#df936c',barWidth:2,barGap:2,normalize:true,plugins:[regions]});waveEditor.on('ready',()=>{if(epoch!==waveEpoch)return;waveRegion=regions.addRegion({start:c.trimStart||0,end:c.trimEnd??c.duration,color:'rgba(104,183,167,.22)',drag:true,resize:true,minLength:.03});regions.on('region-updated',r=>{if(epoch!==waveEpoch||rec||building)return;c.trimStart=Math.max(0,r.start);c.trimEnd=Math.min(c.duration,r.end);if(c.trimEnd-c.trimStart<.02)return;document.querySelectorAll('[data-trim][data-id="'+c.id+'"]').forEach(el=>el.value=(el.dataset.trim==='start'?c.trimStart:c.trimEnd).toFixed(2));A.clearCache();save();meta()})});waveEditor.on('error',()=>{if(epoch===waveEpoch)container.textContent='這段音檔無法顯示波形，仍可用秒數調整。'});waveEditor.loadBlob(c.blob).catch(()=>{})}
function playWaveSelection(){if(editClip){const c=find(editClip);if(c)play(c)}}

function fitScripts(){document.querySelectorAll('.clip-script').forEach(el=>{el.style.height='auto';el.style.height=Math.min(160,Math.max(28,el.scrollHeight))+'px'})}

function toggleRecordingFocus(){const on=document.body.classList.toggle('focus-recording');document.querySelectorAll('[data-action="focusRecording"]').forEach(b=>{b.setAttribute('aria-pressed',String(on));b.innerHTML=icon('mic')+(on?'離開專心模式':'專心錄音')});if(on)$('#recordPage').scrollIntoView({behavior:'smooth',block:'start'})}
async function shareCompiledAudio(preferCloud){
 if(!compiledBlob)return toast('請先串接完整音檔，再進行分享或儲存。');
 const file=new File([compiledBlob],safeName()+($('#allowMissing').checked?'_草稿':'')+'.wav',{type:'audio/wav'});
 try{
  if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:state.title});toast('已交給系統分享選單處理。');return}
  if(preferCloud&&window.showSaveFilePicker){const handle=await showSaveFilePicker({suggestedName:file.name,types:[{description:'WAV 聽力音檔',accept:{'audio/wav':['.wav']}}]});const writer=await handle.createWritable();await writer.write(compiledBlob);await writer.close();toast('音檔已儲存到你選擇的位置。');return}
  download(compiledBlob,file.name);toast(preferCloud?'音檔已準備下載。請從檔案 App 移至 iCloud、Google Drive 或其他雲端。':'裝置未提供檔案分享；已準備下載，之後可在 LINE 選擇這個音檔。');
 }catch(e){if(e.name==='AbortError')return;toast('無法直接分享這個音檔，請使用下載後再分享。')}
}
let mobileClipId=null,deckReturnPoint=null,deckMovedCard=null,timingPage=0;
function restoreDeckCard(){if(deckMovedCard?.contains(document.activeElement))document.activeElement.blur();const card=deckMovedCard,marker=deckReturnPoint;deckMovedCard=null;deckReturnPoint=null;if(card&&marker?.parentNode){marker.parentNode.insertBefore(card,marker);marker.remove()}}
function renderMobileDeck(){restoreDeckCard();const deck=$('#mobileRecordDeck');if(!deck)return;if(!matchMedia('(max-width:600px)').matches){deck.hidden=true;return}const list=currentClips();let index=list.findIndex(c=>c.id===(rec?.clipId||mobileClipId));if(index<0)index=0;const c=list[index];if(!c){deck.hidden=true;return}mobileClipId=c.id;const node=$('#clip-'+c.id);if(!node)return;deck.hidden=false;deck.innerHTML=`<div class="mobile-deck-top"><span class="workspace-mascot mascot-mobile" data-workspace-mascot="record" aria-hidden="true"><img src="assets/maimai-recording.png" width="1145" height="1374" alt="" loading="lazy" decoding="async"></span><span>${esc(c.speaker?roleName(c.speaker):active==='intro'?(c.lang==='zh'?'中文':'EN · English'):'目前段落')} · ${index+1} / ${list.length}</span><button data-action="mobileStructure" aria-label="段落與題目管理">${icon('plus')}${active==='optionLabels'?'播放設定':'管理段落'}</button></div><div class="mobile-card-slot"></div><div class="mobile-page-nav"><button data-action="mobilePrevious" ${index===0?'disabled':''}>← 上一段</button><span>${index+1} / ${list.length}</span><button data-action="mobileNext" ${index===list.length-1?'disabled':''}>下一段 →</button></div>`;deckReturnPoint=document.createComment('mobile-card-origin');node.before(deckReturnPoint);deckMovedCard=node;deck.querySelector('.mobile-card-slot').appendChild(node);$('#roomLabel').textContent='麥麥 · '+(active==='intro'?'測驗開場':active==='end'?'結束提醒':state.sections.find(s=>s.id===active)?.title||'錄音')}
function stepMobileClip(delta){if(rec||building)return;const list=currentClips(),i=list.findIndex(c=>c.id===mobileClipId),next=Math.min(list.length-1,Math.max(0,i+delta));mobileClipId=list[next]?.id;editClip=null;renderChapter();renderBusy()}
function openMobileStructure(){const body=$('#structureDialogBody'),list=currentClips(),c=list.find(c=>c.id===mobileClipId);if(active==='optionLabels'){body.innerHTML=itemPlaybackControls()+codeManager()}else if(active==='intro'){body.innerHTML=`<p>新增段落會預設中英文交替，錄好的音檔會跟著段落一起移動。</p><button class="secondary" data-action="addIntro">＋ 再加一段開場</button>${c&&state.intro.includes(c)?`<label>這段語言<select data-intro-lang="${c.id}"><option value="en" ${c.lang==='en'?'selected':''}>英文</option><option value="zh" ${c.lang==='zh'?'selected':''}>中文</option></select></label><label>段落名稱<input data-intro-label="${c.id}" value="${esc(c.label)}" maxlength="60"></label><button class="secondary" data-action="upIntro" data-id="${c.id}">目前段落往前移</button><button class="secondary" data-action="downIntro" data-id="${c.id}">目前段落往後移</button><button class="quiet delete-text" data-action="deleteIntro" data-id="${c.id}">刪除目前段落</button>`:''}`}else if(active==='end'){body.innerHTML='<p>這一段是整份測驗最後的結束提醒，可直接編輯朗讀稿並錄音。</p>'}else{const sec=state.sections.find(s=>s.id===active),q=sec?.questions.find(q=>A.questionClips(q).some(x=>x.id===c?.id));body.innerHTML=`<label>大題名稱<input data-section-title="${sec.id}" value="${esc(sec.title)}" maxlength="60"></label>${(sec?.passages||[]).some(p=>p.clips.some(x=>x.id===c?.id))?importSegmentTools(c):''}${arrangementControls(sec,true)}<button class="secondary" data-action="addQuestion" data-id="${active}">＋ 新增一題</button>${q?`${arrangementControls(q,false)}${q.arrangement?.mode==='dialogue'||q.turns?.length?`<button class="secondary" data-action="addTurnA" data-id="${q.id}">＋ ${esc(roleName('A'))} 說一句</button><button class="secondary" data-action="addTurnB" data-id="${q.id}">＋ ${esc(roleName('B'))} 說一句</button>`:''}${c?.speaker?`<button class="secondary" data-action="upTurn" data-id="${c.id}">目前對話往前移</button><button class="quiet delete-text" data-action="deleteTurn" data-id="${c.id}">刪除目前對話</button>`:''}<button class="secondary" data-action="upQuestion" data-id="${q.id}">這一題往前移</button><button class="quiet delete-text" data-action="deleteQuestion" data-id="${q.id}">刪除這一題</button>`:''}<button class="secondary" data-action="addSection">＋ 新增大題</button>`}$('#structureDialog').showModal()}
function syncPhoneRoom(){const saved=document.getElementById('saveState');if(saved){if(atWorktable)document.querySelector('#finishTicket>div')?.prepend(saved);else document.querySelector('.room-return')?.after(saved)}StudioAmbience.navigate();document.body.classList.toggle('in-workroom',!atWorktable);document.body.classList.toggle('phone-room-record',!atWorktable&&page==='record');document.body.classList.toggle('phone-room-arrange',!atWorktable&&page==='arrange');document.body.classList.toggle('phone-room-export',!atWorktable&&page==='export');document.body.classList.toggle('phone-room-library',!atWorktable&&page==='library')}
function moveTimingPage(delta){const track=$('#timingSettings'),cards=[...track.children];timingPage=Math.min(cards.length-1,Math.max(0,timingPage+delta));cards[timingPage]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});$('#timingPageCount').textContent=(timingPage+1)+' / '+cards.length}
function openSequence(){ $('#sequenceDialogBody').innerHTML=$('#sequence').innerHTML;$('#sequenceDialog').showModal() }
// Keyboard height/visual viewport changes must never detach the focused card.
// Rebuild only when crossing the desktop/mobile layout boundary, after editing.
const recordPhoneLayout=matchMedia('(max-width:600px)');
let recordLayoutPending=false,editViewportTimer;
function isTextEditor(el){return el?.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file]),[contenteditable=true]')}
function applyRecordLayout(){if(!recordLayoutPending||isTextEditor(document.activeElement))return;recordLayoutPending=false;if(typeof state!=='undefined'&&page==='record'){renderMobileDeck();mountWaveEditor()}}
recordPhoneLayout.addEventListener('change',()=>{recordLayoutPending=true;applyRecordLayout()});
function revealTextEditor(){
 const el=document.activeElement;if(!isTextEditor(el))return;
 const vv=window.visualViewport,top=vv?.offsetTop||0,bottom=top+(vv?.height||innerHeight);
 const r=el.getBoundingClientRect();
 if(r.top<top+12||r.bottom>bottom-12){
  el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  // Overlay keyboards shrink the visual viewport without shrinking layout.
  const next=el.getBoundingClientRect();
  if(!el.closest('dialog')&&next.bottom>bottom-12)window.scrollBy({top:next.bottom-bottom+12,behavior:'instant'});
 }
}
function syncEditViewport(){
 const editing=isTextEditor(document.activeElement),vv=window.visualViewport;
 document.documentElement.style.setProperty('--edit-viewport-height',(vv?.height||innerHeight)+'px');
 document.documentElement.style.setProperty('--edit-viewport-top',(vv?.offsetTop||0)+'px');
 document.body.classList.toggle('text-editing',editing);
 // Keep the dialog geometry stable when tapping a checkbox/button after typing.
 // Removing the constraint on focusout would move the target between down/up.
 if(editing&&(innerWidth<=600||innerHeight<450))document.activeElement.closest('dialog')?.classList.add('editing-viewport');
 clearTimeout(editViewportTimer);if(editing)editViewportTimer=setTimeout(revealTextEditor,120);
}
document.addEventListener('focusin',syncEditViewport);
document.addEventListener('close',e=>{if(e.target.matches?.('dialog'))e.target.classList.remove('editing-viewport')},true);
document.addEventListener('focusout',()=>setTimeout(()=>{syncEditViewport();applyRecordLayout()},0));
window.addEventListener('resize',syncEditViewport);
window.visualViewport?.addEventListener('resize',syncEditViewport);
window.visualViewport?.addEventListener('scroll',syncEditViewport);

function renderIntroRoute(){return '<div class="intro-routing">'+state.intro.map(c=>'<span>'+(c.lang==='zh'?'中文':'EN')+'</span>').join(' → ')+'<small>依目前順序各播放一次，每一段都能個別錄音。</small></div>'}
