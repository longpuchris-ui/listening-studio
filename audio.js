/* Local audio pipeline. No recording is sent to a server. */
(function(root){
'use strict';
function order(state) {
 const out=[];
 const gap=(seconds,label)=>{if(seconds>0)out.push({kind:'silence',seconds:Number(seconds),label})};
 const clip=(c,label,of)=>!(c.omitFromPlayback&&!c.script&&!c.blob)&&out.push({kind:'clip',id:c.id,label:label||c.label,...(of?{for:of}:{})});
 state.intro.forEach((c,i)=>{clip(c);if(i<state.intro.length-1)gap(state.settings.introGap||0,'開場段落之間')}); clip(state.start); gap(state.settings.sectionGap,'開始前留白');
 for(let round=0;round<state.settings.rounds;round++) {
  if(round>0&&state.replay&&clip(state.replay,'重播提醒'))gap(state.settings.sectionGap,'重播提醒後');
  for(let si=0;si<state.sections.length;si++) {
   const sec=state.sections[si];
   const groupReplay=hasGroupReplay(sec),sectionRepeats=groupReplay?1:state.settings.repeats;
    for(let repeat=0;repeat<sectionRepeats;repeat++) {
    if(sec.heading)clip(sec.heading);clip(sec.prompt,sec.title+' · 引導語');const playedPassages=new Set();
    questionGroups(sec).forEach((g,gi,groups)=>{const passes=groupReplay&&isDialogueGroup(g)?2:1,noRepeat=passes>1;for(let pass=0;pass<passes;pass++){if(pass>0){gap(sec.groupReplayGap??3,'題組重播前');playedPassages.delete(g[0].passageId)}g.forEach((q,k)=>{
     if(q.passageId&&!playedPassages.has(q.passageId)){const passage=(sec.passages||[]).find(p=>p.id===q.passageId);(passage?.clips||[]).forEach((c,i)=>{if(i>0)gap(state.settings.dialogueGap??.6,'共用對話換人');clip(c)});playedPassages.add(q.passageId)}if(q.numberClip&&q.arrangement?.numberEnabled!==false)clip(q.numberClip);
     const content=questionClips(q),wholeRepeat=!noRepeat&&q.arrangement?.mode==='single'&&!content.some(c=>q.options.includes(c)||c.speaker||c.speakerName||c.printedItems)&&q.arrangement?.contentRepeat==='2';
     content.forEach((c,i)=>{
      const option=q.options.includes(c),single=(q.arrangement?.mode==='single'||(!q.arrangement&&!q.turns?.length));
      if(option){gap(state.settings.optionGap,'選項前留白');if(state.settings.optionLabelsEnabled){const label=resolveOptionLabel(state,q,c,q.options.indexOf(c));if(label)clip(label,undefined,c.id);gap(state.settings.labelGap??.25,'代號後留白')}}
      else if(c.speaker&&i>0&&(q.arrangement?.mode==='dialogue'||i>1))gap(state.settings.dialogueGap??.6,'對話換人');
      clip(c,sec.title+' · '+c.label);
      if(!noRepeat&&!wholeRepeat&&(option?state.settings.itemRepeat:(['1','2'].includes(q.arrangement?.contentRepeat)?false:state.settings.itemRepeat))&&(option||(single&&(c===q.stem||q.contentClips?.includes(c))&&!q.options.some(x=>questionClips(q).includes(x))))){gap(state.settings.itemRepeatGap??.5,'同一內容連唸間隔');clip(c,sec.title+' · '+c.label+'（再唸一次）')}
     });
     if(wholeRepeat){gap(state.settings.itemRepeatGap??.5,'整段內容連唸間隔');content.forEach(c=>clip(c,sec.title+' · '+c.label+'（再唸一次）'))}
     if(k<g.length-1)gap(state.settings.questionGap,'題目之間');
    })}if(gi<groups.length-1)gap(state.settings.questionGap,'題目之間');});
    if(repeat<sectionRepeats-1)gap(state.settings.sectionGap,'同一大題重播前');
   }
   if(si<state.sections.length-1)gap(state.settings.sectionGap,'大題之間');
  }
  if(round<state.settings.rounds-1)gap(state.settings.roundGap,'整份重播前');
 }
 gap(state.settings.sectionGap,'結束提醒前'); clip(state.end); return out;
}
/* 題組: consecutive questions sharing one passage; a question without a passage is its own group. */
function questionGroups(sec){const out=[];for(const q of sec.questions){const last=out.at(-1);if(q.passageId&&last&&last[0].passageId===q.passageId)last.push(q);else out.push([q])}return out}
function isDialogueGroup(g){return !!g[0].passageId||g.some(q=>q.arrangement?.mode==='dialogue'||(!q.arrangement&&q.turns?.length)||q.contentClips?.some(c=>c.speaker||c.speakerName))}
function hasGroupReplay(sec){return sec.groupReplay===true&&questionGroups(sec).some(isDialogueGroup)}
function questionClips(q){const m=q.arrangement?.mode;if(q.contentClips)return [...q.contentClips.filter(c=>m!=='single'||!c.speakerName),...(q.arrangement?.recordOptions===false?[]:q.options)];return [...(m==='dialogue'?[]:[q.stem]),...(m==='single'?[]:(q.turns||[])),...(q.arrangement?.recordOptions===false?[]:q.options)]}
function inventoryClips(s){return [...(s.optionLabels||[]),...s.intro,s.start,...s.sections.flatMap(sec=>[...(sec.heading?[sec.heading]:[]),sec.prompt,...(sec.passages||[]).flatMap(p=>p.clips),...sec.questions.flatMap(q=>[...(q.numberClip?[q.numberClip]:[]),...(q.contentClips||[]),q.stem,...(q.turns||[]),...q.options,...(q.retainedOptions||[])])]),...(s.replay?[s.replay]:[]),s.end]}
function resolveOptionLabel(s,q,c,i){return c.answerCodeId!==undefined?(s.optionLabels||[]).find(x=>x.id===c.answerCodeId):s.optionLabels?.[c.answerCodeIndex??i]}
function usedOptionLabels(s){if(!s.settings.optionLabelsEnabled)return[];const used=new Set(s.sections.flatMap(sec=>sec.questions.flatMap(q=>q.arrangement?.recordOptions===false?[]:q.options.map((c,i)=>resolveOptionLabel(s,q,c,i)?.id))));return (s.optionLabels||[]).filter(c=>used.has(c.id))}
function sectionClips(sec){const out=[...(sec.heading?[sec.heading]:[]),sec.prompt],used=new Set();for(const q of sec.questions){if(q.passageId&&!used.has(q.passageId)){out.push(...((sec.passages||[]).find(p=>p.id===q.passageId)?.clips||[]));used.add(q.passageId)}out.push(...(q.numberClip&&q.arrangement?.numberEnabled!==false?[q.numberClip]:[]),...questionClips(q))}return out}
function allClips(s){return [...usedOptionLabels(s),...s.intro,s.start,...s.sections.flatMap(sectionClips),...(s.replay&&s.settings.rounds>1?[s.replay]:[]),s.end].filter(c=>!c.omitFromPlayback||c.script||c.blob)}
function effective(c){return c.blob?Math.max(0,(c.trimEnd??c.duration)-(c.trimStart||0)):0}
function duration(s){const map=new Map(allClips(s).map(c=>[c.id,c]));return order(s).reduce((sum,item)=>sum+(item.kind==='silence'?item.seconds:effective(map.get(item.id))),0)}
/* Export plan: unrecorded clips (draft) are skipped; gaps that meet across a skipped clip merge to the longer one instead of adding up. */
function playable(s){const map=new Map(allClips(s).map(c=>[c.id,c])),out=[];let dropped=false;for(const p of order(s)){if(p.kind==='clip'){if(!map.get(p.id)?.blob||(p.for&&!map.get(p.for)?.blob)){dropped=true;continue}dropped=false;out.push(p);continue}const last=out.at(-1);if(dropped&&!last)continue;if(dropped&&last.kind==='silence'){out[out.length-1]={...last,seconds:Math.max(last.seconds,p.seconds)};continue}out.push(p)}if(dropped&&out.at(-1)?.kind==='silence')out.pop();return out}
/* Loudness of the voiced part only: 50 ms blocks, absolute gate -50 dBFS, then relative gate -10 dB (EBU R128 style), so long pauses do not raise the gain. */
function speechRms(a,rate){const w=Math.max(1,Math.round(rate*.05)),p=[];for(let i=0;i<a.length;i+=w){const j=Math.min(a.length,i+w);let e=0;for(let k=i;k<j;k++)e+=a[k]*a[k];p.push(e/(j-i))}const mean=x=>{let sum=0,n=0;for(const v of p)if(v>x){sum+=v;n++}return n?sum/n:0};const abs=mean(1e-5);return Math.sqrt(abs?mean(abs*.1)||abs:mean(-1))}
function processPCM(input,rate,settings){const a=timbre(new Float32Array(input),rate,settings.voiceStyle||'natural');if(settings.cleanup){const hp=Math.exp(-2*Math.PI*85/rate);const lp=1-Math.exp(-2*Math.PI*Math.min(8500,rate*.4)/rate);let prev=0,h=0,l=0,env=0,gain=1;const attack=Math.exp(-1/(rate*.004)),release=Math.exp(-1/(rate*.12));for(let i=0;i<a.length;i++){const x=a[i];h=hp*(h+x-prev);prev=x;l+=lp*(h-l);const abs=Math.abs(l);const k=abs>env?attack:release;env=k*env+(1-k)*abs;const target=env<.003?Math.max(.15,env/.003):1;gain+=.002*(target-gain);a[i]=settings.gentleProcessing===true?l:l*gain}}if(settings.normalize){let peak=0;for(let i=0;i<a.length;i++)peak=Math.max(peak,Math.abs(a[i]));const rms=speechRms(a,rate);if(peak>.001){const cap=settings.gentleProcessing===true?(rms<.01?1:1.5):3.5;const gain=Math.min(cap,.14/Math.max(.001,rms),.94/peak);for(let i=0;i<a.length;i++)a[i]*=gain}}const fade=Math.min(Math.floor(rate*.005),Math.floor(a.length/2));for(let i=0;i<fade;i++){a[i]*=i/fade;a[a.length-1-i]*=i/fade}return a}
function timbre(input,rate,style){
 if(!['bright','warm'].includes(style))return input;
 const out=new Float32Array(input.length);let low=0,bass=0;
 const split=1-Math.exp(-2*Math.PI*1300/rate),bassK=1-Math.exp(-2*Math.PI*240/rate);
 for(let i=0;i<input.length;i++){low+=split*(input[i]-low);bass+=bassK*(input[i]-bass);out[i]=style==='bright'?low*.85+(input[i]-low)*1.3:input[i]*.62+low*.34+bass*.14}
 return out;
}
function pcm16(a){const bytes=new ArrayBuffer(a.length*2);const v=new DataView(bytes);for(let i=0;i<a.length;i++){const s=Math.max(-1,Math.min(1,a[i]));v.setInt16(i*2,s<0?s*32768:s*32767,true)}return bytes}
function header(bytes,rate){const b=new ArrayBuffer(44),d=new DataView(b);const str=(o,t)=>{for(let i=0;i<t.length;i++)d.setUint8(o+i,t.charCodeAt(i))};str(0,'RIFF');d.setUint32(4,bytes+36,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,rate,true);d.setUint32(28,rate*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,bytes,true);return b}
let ctx,cacheBytes=0;const cache=new Map(),offline={},CACHE_BYTES=256*1024*1024;
/* iOS leaves the context 'interrupted' after a call or Siri; resume anything not running, but never hang on it. */
async function context(){if(!ctx||ctx.state==='closed')ctx=new (root.AudioContext||root.webkitAudioContext)();if(ctx.state!=='running'){try{await Promise.race([ctx.resume(),new Promise(r=>setTimeout(r,1500))])}catch{}}return ctx}
/* Decoding through an OfflineAudioContext at the export rate uses the browser's band-limited resampler and does not depend on the live context state. */
function offlineAt(rate){const O=root.OfflineAudioContext||root.webkitOfflineAudioContext;if(!O||!rate)return null;try{return offline[rate]||(offline[rate]=new O(1,1,rate))}catch{return null}}
async function decode(blob,rate=44100){const o=offlineAt(rate);if(o){try{const data=await blob.arrayBuffer();return await new Promise((ok,fail)=>{const p=o.decodeAudioData(data,ok,fail);if(p?.then)p.then(ok,fail)})}catch{}}const c=await context();return c.decodeAudioData(await blob.arrayBuffer())}
/* Fallback only (decoded rate differs from export rate): windowed-sinc resampler with anti-alias cutoff below the lower Nyquist. */
function resample(ch,sr,rate,start,n){const a=new Float32Array(n),step=sr/rate,fc=Math.min(1,rate/sr)*.92,half=Math.ceil(10/fc),len=ch[0].length;for(let i=0;i<n;i++){const pos=(start+i/rate)*sr,k0=Math.floor(pos);let v=0,wsum=0;for(let k=k0-half+1;k<=k0+half;k++){const x=pos-k,t=x/half;if(t<=-1||t>=1)continue;const w=(x?Math.sin(Math.PI*fc*x)/(Math.PI*fc*x):1)*(.42+.5*Math.cos(Math.PI*t)+.08*Math.cos(2*Math.PI*t));wsum+=w;if(k<0||k>=len)continue;let m=0;for(const d of ch)m+=d[k];v+=w*m}a[i]=wsum?v/wsum/ch.length:0}return a}
async function prepared(c,settings,rate){const key=[c.id,c.version,c.trimStart,c.trimEnd,c.voiceStyle,settings.cleanup,settings.normalize,settings.gentleProcessing===true,rate].join('|');if(cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return hit}const b=await decode(c.blob,rate);const start=Math.max(0,c.trimStart||0),end=Math.min(b.duration,c.trimEnd??b.duration);if(end-start<.02)throw Error(c.label+'：剪輯範圍太短');const n=Math.floor((end-start)*rate),ch=[];for(let i=0;i<b.numberOfChannels;i++)ch.push(b.getChannelData(i));let a;if(b.sampleRate===rate){a=new Float32Array(n);const k0=Math.round(start*rate);for(const d of ch)for(let i=0;i<n;i++)a[i]+=d[k0+i]||0;if(ch.length>1)for(let i=0;i<n;i++)a[i]/=ch.length}else a=resample(ch,b.sampleRate,rate,start,n);
 /* PCM is kept as a Blob: outside the JS heap on iOS, and shared by the final WAV instead of copied. */
 const pcm=new Blob([pcm16(processPCM(a,rate,{...settings,voiceStyle:c.voiceStyle}))]);cache.set(key,pcm);cacheBytes+=pcm.size;for(const [k,v] of cache){if(cacheBytes<=CACHE_BYTES||cache.size<=1)break;cache.delete(k);cacheBytes-=v.size}return pcm}
async function build(s,{allowMissing=false,rate=44100,onProgress=()=>{}}={}){rate=Math.round(Number(rate));if(!(rate>=8000&&rate<=96000))rate=44100;const clips=new Map(allClips(s).map(c=>[c.id,c]));const missing=allClips(s).filter(c=>!c.blob);if(missing.length&&!allowMissing)throw Error('還有 '+missing.length+' 段尚未錄音');if(!allClips(s).some(c=>c.blob))throw Error('請先錄下至少一段聲音');if(duration(s)>2400)throw Error('整份音檔約 '+Math.ceil(duration(s)/60)+' 分鐘，超過 40 分鐘上限。請到拍仔那裡縮短留白或減少重播，或分成兩份製作');const plan=playable(s),parts=[],gaps=new Map();let total=0;for(let i=0;i<plan.length;i++){const p=plan[i];let part;if(p.kind==='silence'){const bytes=Math.round(p.seconds*rate)*2;part=gaps.get(bytes)||new Blob([new Uint8Array(bytes)]);gaps.set(bytes,part)}else{const c=clips.get(p.id);part=await prepared({...c,voiceStyle:c.voiceStyle||s.roles?.[c.speaker]?.tone||'natural'},s.settings,rate)}parts.push(part);total+=part.size;onProgress(Math.round((i+1)/plan.length*100));await new Promise(r=>setTimeout(r,0))}if(total>0xfffffff0-44)throw Error('音檔超過 WAV 容量上限');return new Blob([header(total,rate),...parts],{type:'audio/wav'})}
async function preview(c,settings){const rate=44100;const pcm=await prepared(c,settings,rate);return new Blob([header(pcm.size,rate),pcm],{type:'audio/wav'})}
function captureOptions(settings){return {noiseSuppression:!!settings.noiseCapture,echoCancellation:settings.echoCapture===true,autoGainControl:false}}
function makeRecorder(stream,settings,Recorder=root.MediaRecorder){const types=['audio/webm;codecs=opus','audio/mp4','audio/webm'].filter(t=>Recorder.isTypeSupported(t));const bitrate=[128000,192000].includes(settings.captureBitrate)?settings.captureBitrate:null;let last;for(const mime of [...types,null]){const base=mime?{mimeType:mime}:{};for(const options of bitrate?[{...base,audioBitsPerSecond:bitrate},base]:[base]){try{return new Recorder(stream,options)}catch(e){last=e;if(!['NotSupportedError','TypeError'].includes(e.name))throw e}}}throw last||Error('沒有可用的錄音格式')}
function captureDiagnostics(stream,recorder){let settings={};try{settings=stream.getAudioTracks()[0]?.getSettings?.()||{}}catch{}const result={};for(const key of ['sampleRate','channelCount','noiseSuppression','echoCancellation','autoGainControl']){const v=settings[key];if(typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))result[key]=v}if(typeof recorder?.mimeType==='string')result.mimeType=recorder.mimeType;if(Number.isFinite(recorder?.audioBitsPerSecond))result.audioBitsPerSecond=recorder.audioBitsPerSecond;return result}
root.AudioBook={questionGroups,isDialogueGroup,hasGroupReplay,playable,speechRms,captureOptions,makeRecorder,captureDiagnostics,resolveOptionLabel,sectionClips,usedOptionLabels,inventoryClips,order,allClips,questionClips,timbre,effective,duration,processPCM,pcm16,header,decode,build,preview,context,clearCache:()=>{cache.clear();cacheBytes=0}};
})(typeof window!=='undefined'?window:globalThis);
