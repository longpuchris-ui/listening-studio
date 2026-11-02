/* Mobile reading is a view of the existing clip/session, never another recorder. */
(()=>{
 'use strict';
 const $=s=>document.querySelector(s),narrow=matchMedia('(max-width:600px)'),mobile=matchMedia('(max-width:1000px)');
 let origin=null,readingId=null,lastSession=null,layoutNarrow=false,frame=0;
 let editor=null,editorPath=[],caretFrame=0,composing=false,selecting=false,caretMirror=null;
 const saveStatus=document.getElementById('saveState');let saveStatusOrigin=null,saveStatusLive=null;
 const paperPositions=new Map(),readerPositions=new Map(),moved=[];
 const dialog=document.createElement('dialog');dialog.id='readingDialog';dialog.setAttribute('aria-labelledby','readingTitle');
 dialog.innerHTML='<header class="dialog-top reading-header"><div><strong id="readingTitle">麥麥 · 專心讀稿</strong><span id="readingTarget"></span></div><button type="button" id="readingClose" aria-label="返回一般稿頁">收起</button></header><div id="readingPaper" class="reading-paper" role="region" aria-label="本段朗讀稿" tabindex="0"></div><footer class="reading-footer"><p id="readingResult" role="status" aria-live="polite"></p><div id="readingIdle" class="reading-idle"><button type="button" id="readingPrevious" aria-label="上一段">←</button><button type="button" id="readingRecord" data-action="record">● 錄音</button><button type="button" id="readingPlay" data-action="toggleClipPlayback">試聽</button><button type="button" id="readingNext" aria-label="下一段">→</button></div><div id="readingDockSlot"></div></footer>';
 document.body.append(dialog);
 const editDone=document.createElement('button');editDone.id='readingEditDone';editDone.type='button';editDone.textContent='完成編輯';editDone.hidden=true;$('.room-return').append(editDone);editDone.addEventListener('click',()=>{editor?.blur();finishEditing();$('.focus-recording-button')?.focus({preventScroll:true});layout()});
 const dock=$('#recordDock'),dockMarker=document.createComment('record-dock-origin');dock.before(dockMarker);
 const toolbar=$('.focus-recording-button'),toolbarOriginal={html:$('.focus-recording-button').innerHTML,label:$('.focus-recording-button').getAttribute('aria-label'),title:$('.focus-recording-button').getAttribute('title')};let toolbarMode='original';
 toolbar.addEventListener('click',e=>{if(!eligible()||(!narrow.matches&&!rec))return;e.stopImmediatePropagation();e.preventDefault();if(rec){open(rec.clipId);return}if(building||arrangementBusy)return;const c=find(mobileClipId||currentClips()[0]?.id);if(c)action('importAudio',c.id)},true);
 const title=$('#projectTitle'),settings=$('.record-tools [data-action=micSettings]');
 for(const el of [title,settings]){const mark=document.createComment('mobile-reading-origin');el.before(mark);moved.push({el,mark})}
 function eligible(){return mobile.matches&&!atWorktable&&page==='record'}
 function paper(id){return document.getElementById('clip-'+id)?.querySelector('.clip-script')}
 function viewport(){const vv=window.visualViewport,root=document.documentElement;dialog.style.setProperty('--reading-height',(vv?.height||innerHeight)+'px');dialog.style.setProperty('--reading-top',(vv?.offsetTop||0)+'px');root.style.setProperty('--reading-viewport',(vv?.height||innerHeight)+'px');root.style.setProperty('--reading-viewport-top',(vv?.offsetTop||0)+'px');root.style.setProperty('--reading-viewport-left',(vv?.offsetLeft||0)+'px');root.style.setProperty('--reading-viewport-width',(vv?.width||innerWidth)+'px')}
 // Keep the original focused textarea in place: moving/rebuilding it can end IME
 // composition. Only its ancestor geometry changes while the keyboard is open.
 function beginEditing(el){
  if(editor===el||!eligible()||!el.matches('.clip-script')||el.closest('dialog'))return;
  finishEditing();editor=el;editor.closest('.clip-card').classList.add('reading-editor-card');
  for(let node=editor.closest('.clip-card').parentElement;node&&node!==document.body;node=node.parentElement){node.classList.add('reading-editor-path');editorPath.push(node);if(node.id==='workroom')break}
  document.body.classList.add('reading-script-editing');editDone.hidden=false;viewport();scheduleCaret();
  saveStatusOrigin=document.createComment('editing-save-status-origin');saveStatus.before(saveStatusOrigin);saveStatusLive=saveStatus.getAttribute('aria-live');placeEditStatus();
 }
 function finishEditing(){
  if(!editor)return;editor.closest('.clip-card')?.classList.remove('reading-editor-card');
  for(const node of editorPath)node.classList.remove('reading-editor-path');editorPath=[];editor=null;
  document.body.classList.remove('reading-script-editing');editDone.hidden=true;composing=false;selecting=false;
  cancelAnimationFrame(caretFrame);caretFrame=0;caretMirror?.remove();caretMirror=null;
  if(saveStatus.parentElement===$('.room-return')&&saveStatusOrigin?.isConnected)saveStatusOrigin.replaceWith(saveStatus);else saveStatusOrigin?.remove();saveStatusOrigin=null;
  if(saveStatusLive===null)saveStatus.removeAttribute('aria-live');else saveStatus.setAttribute('aria-live',saveStatusLive);
  delete saveStatus.dataset.editorStatus;delete saveStatus.dataset.editorNotice;saveStatus.removeAttribute('title');
 }
 function placeEditStatus(){
  if(!editor)return;if(saveStatus.parentElement!==$('.room-return'))$('.room-return').insertBefore(saveStatus,editDone);
  const text=saveStatus.textContent.trim();let label,notice=false;
  if(text==='正在收好這一頁…')label='待存本機';
  else if(text==='已自動保存於這台裝置'||text==='已開啟上次的聽力試卷'||text==='這次錄音已保存於這台裝置')label='已存本機';
  else if(text==='只存在這台裝置'||text==='錄音會自動保存於這台裝置')label='本機保存';
  else if(text==='稿文與設定已保存；本次錄音尚在處理')label='稿文已存';
  else{notice=true;label=text.includes('分頁衝突')?'分頁衝突・已保留草稿':text.includes('雲端排程')?'已存本機・雲端待重試':text.includes('尚未保存')||text.includes('保存無法')?'未保存・請備份':text}
  if(saveStatus.dataset.editorStatus!==label)saveStatus.dataset.editorStatus=label;
  saveStatus.dataset.editorNotice=String(notice);saveStatus.title=text;
  // Routine autosave does not announce every pause. Real errors keep the existing
  // live toast and status; the canonical status node/value is never duplicated.
  saveStatus.setAttribute('aria-live',notice?'polite':'off');
 }
 function scheduleCaret(){cancelAnimationFrame(caretFrame);caretFrame=requestAnimationFrame(revealCaret)}
 function editorControl(el){return el===editDone||!!el?.closest('.room-return,#recordDock')}
 function revealCaret(){
  caretFrame=0;if(!editor||document.activeElement!==editor||composing||selecting||!editor.isConnected)return;
  // A transient, noninteractive typography mirror measures the active selection
  // edge. It never changes the value/selection and never scrolls the whole page.
  const style=getComputedStyle(editor),pos=editor.selectionDirection==='backward'?editor.selectionStart:editor.selectionEnd;
  if(!caretMirror){caretMirror=document.createElement('div');caretMirror.className='reading-caret-measure';caretMirror.setAttribute('aria-hidden','true');document.body.append(caretMirror)}
  for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','textTransform','textIndent','textAlign','direction','tabSize','wordBreak','overflowWrap','paddingTop','paddingRight','paddingBottom','paddingLeft'])caretMirror.style[key]=style[key];
  caretMirror.style.width=editor.clientWidth+'px';caretMirror.textContent=editor.value.slice(0,pos);
  const tail=document.createElement('span');tail.textContent=editor.value.slice(pos)||'.';caretMirror.append(tail);
  const y=tail.offsetTop,line=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.5,pad=6;
  if(y<editor.scrollTop+pad)editor.scrollTop=Math.max(0,y-pad);
  else if(y+line>editor.scrollTop+editor.clientHeight-pad)editor.scrollTop=y+line-editor.clientHeight+pad;
 }
 function layout(){
  viewport();if(editor&&(!eligible()||!editor.isConnected))finishEditing();if(editor)placeEditStatus();
  const compact=narrow.matches&&!atWorktable&&page==='record';
  if(compact!==layoutNarrow){if(typeof isTextEditor==='function'&&isTextEditor(document.activeElement))return;layoutNarrow=compact;
   for(const {el,mark}of moved){if(compact)$('.room-return').append(el);else mark.after(el)}
  }
  document.body.classList.toggle('reading-compact',compact);viewport();
  const mode=eligible()&&rec?'reading':compact?'import':'original';
  if(mode!==toolbarMode){toolbarMode=mode;toolbar.innerHTML=mode==='original'?toolbarOriginal.html:icon(mode==='import'?'download':'book')+'<span>'+(mode==='import'?'匯入':'返回讀稿')+'</span>';for(const [key,value]of Object.entries(mode==='original'?{'aria-label':toolbarOriginal.label,title:toolbarOriginal.title}:{'aria-label':mode==='import'?'匯入本段音檔':'返回專心讀稿，錄音繼續',title:mode==='import'?'匯入本段音檔':'返回專心讀稿，錄音繼續'})){if(value===null)toolbar.removeAttribute(key);else toolbar.setAttribute(key,value)}}
  if(compact||mode==='reading'){toolbar.disabled=mode!=='reading'&&(building||arrangementBusy);if(rec)toolbar.setAttribute('aria-pressed',String(dialog.open));else toolbar.removeAttribute('aria-pressed')}else toolbar.disabled=!!rec||building||arrangementBusy;

  if(compact){const top=$('.mobile-deck-top'),nav=$('.mobile-page-nav');if(top&&nav&&!top.querySelector('[data-action=mobilePrevious]')){const prev=nav.querySelector('[data-action=mobilePrevious]'),next=nav.querySelector('[data-action=mobileNext]'),manage=top.querySelector('[data-action=mobileStructure]');prev.textContent='←';next.textContent='→';prev.setAttribute('aria-label','上一段');next.setAttribute('aria-label','下一段');top.prepend(prev);manage.before(next);manage.innerHTML=icon('plus')+'段落';nav.hidden=true;}}

  if(editor&&(!eligible()||!editor.isConnected))finishEditing();
  if(dialog.open&&!eligible())close();
  document.documentElement.style.setProperty('--reading-dock-height',(!dialog.open&&!dock.hidden?dock.getBoundingClientRect().height+12:0)+'px');
 }
 function open(id){
  if(!eligible())return;const c=find(id||rec?.clipId||mobileClipId||currentClips()[0]?.id);if(!c)return;
  if(!dialog.open){origin=document.activeElement;const original=paper(c.id);if(original)paperPositions.set(c.id,original.scrollTop);$('#readingDockSlot').append(dock);dialog.showModal();document.body.classList.add('reading-open')}
  readingId=c.id;$('.focus-recording-button')?.setAttribute('aria-pressed','true');sync();viewport();$('#readingPaper').focus({preventScroll:true});
 }
 function close(){
  if(!dialog.open)return;readerPositions.set(readingId,$('#readingPaper').scrollTop);dockMarker.after(dock);dialog.close();document.body.classList.remove('reading-open');$('.focus-recording-button')?.setAttribute('aria-pressed','false');
  const target=paper(rec?.clipId||readingId);if(target)target.scrollTop=paperPositions.get(rec?.clipId||readingId)||0;
  layout();if(rec&&!narrow.matches)toolbar.scrollIntoView({block:'nearest',behavior:'instant'});const focus=rec?dock.querySelector('[data-action=stopRecord]'):origin?.isConnected?origin:$('.focus-recording-button');focus?.focus({preventScroll:true});
 }
 function playback(){const playing=previewClipId===readingId&&previewAudio&&!previewAudio.paused;$('#readingPlay').textContent=playing?'停止試聽':'試聽';$('#readingPlay').setAttribute('aria-pressed',String(!!playing))}
 function sync(){
  if(!dialog.open){layout();return}
  if(pendingRecording){close();return} // Existing recovery panel must remain reachable.
  const c=find(rec?.clipId||mobileClipId||readingId);if(!c){close();return}
  const list=currentClips(),i=list.findIndex(x=>x.id===c.id),p=$('#readingPaper'),changed=readingId!==c.id;
  if(changed)readerPositions.set(readingId,p.scrollTop);
  readingId=c.id;
  if(p.dataset.clip!==c.id||p.textContent!==(c.script||'這一段還沒有朗讀稿；可收起後編輯。')){p.dataset.clip=c.id;p.textContent=c.script||'這一段還沒有朗讀稿；可收起後編輯。';p.scrollTop=readerPositions.get(c.id)||0}
  $('#readingTarget').textContent=(c.speaker?roleName(c.speaker)+' · ':'')+c.label+' · '+(i+1)+' / '+list.length;
  $('#readingIdle').hidden=!!rec;$('#readingRecord').dataset.id=c.id;$('#readingRecord').disabled=!!rec||building||arrangementBusy;
  $('#readingRecord').textContent=c.blob?'● 重錄':'● 錄音';$('#readingPlay').dataset.id=c.id;$('#readingPlay').disabled=!c.blob||!!rec||building;$('#readingPrevious').disabled=!!rec||i<=0;$('#readingNext').disabled=!!rec||i>=list.length-1;
  const saved=$('#saveState');$('#readingResult').textContent=rec?'':saved&&!saved.classList.contains('routine-save')?saved.textContent:c.blob?'這段已有錄音，可試聽或重錄。':'按錄音開始；稿件可上下捲動。';
  $('#readingClose').title=rec?'收起讀稿畫面；錄音繼續，請使用停止並保存結束。':'返回一般稿頁';
  dialog.setAttribute('aria-busy',String(rec?.phase==='saving'));
  if(lastSession&&!rec)queueMicrotask(()=>{if(dialog.open&&!rec)(c.blob?$('#readingPlay'):$('#readingRecord')).focus({preventScroll:true})});lastSession=rec;playback();
  layout();
 }
 $('#readingClose').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 $('#readingPrevious').addEventListener('click',()=>{if(!rec){stepMobileClip(-1);sync()}});$('#readingNext').addEventListener('click',()=>{if(!rec){stepMobileClip(1);sync()}});
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{layout();if(dialog.open)sync();if(editor)scheduleCaret()})};
 new ResizeObserver(schedule).observe(dock);
 new MutationObserver(()=>{if(editor)placeEditStatus();if(dialog.open)sync()}).observe($('#saveState'),{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
 window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
 document.addEventListener('focusin',e=>{if(e.target.matches('.clip-script'))beginEditing(e.target);else if(editor&&!editorControl(e.target))finishEditing();layout()});
 document.addEventListener('focusout',()=>setTimeout(()=>{if(editor&&document.activeElement!==editor&&!editorControl(document.activeElement))finishEditing();layout()},0));
 document.addEventListener('compositionstart',e=>{if(e.target===editor)composing=true});
 document.addEventListener('compositionend',e=>{if(e.target===editor){composing=false;scheduleCaret()}});
 document.addEventListener('input',e=>{if(e.target===editor&&!e.isComposing)scheduleCaret()});
 document.addEventListener('selectionchange',()=>{if(editor)scheduleCaret()});
 document.addEventListener('pointerdown',e=>{if(e.target===editor)selecting=true});
 for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>{selecting=false});
 window.MobileReading={eligible,open,close,sync,layout,playback,ownsEditor:el=>el===editor,isOpen:()=>dialog.open,capture:id=>{if(eligible())open(id)}};
 layout();
})();
