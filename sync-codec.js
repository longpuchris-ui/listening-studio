/* Lossless transport: originals and inactive clips are included, never the WAV mix. */
(function(root){
 const inventory=s=>[...(s.optionLabels||[]),...s.intro,s.start,...s.sections.flatMap(x=>[...(x.heading?[x.heading]:[]),x.prompt,...(x.passages||[]).flatMap(p=>p.clips),...x.questions.flatMap(q=>[...(q.numberClip?[q.numberClip]:[]),...(q.contentClips||[]),q.stem,...(q.turns||[]),...q.options,...(q.retainedOptions||[])])]),s.end];
 async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}
 // hashOf(blob,clip) may return a cached digest (or null) so a text-only edit does not re-read every recording.
 async function pack(project,hashOf){const manifest=structuredClone(project),assets=new Map();for(const c of inventory(manifest)){if(c.blob){const blob=c.blob,id=(hashOf&&await hashOf(blob,c))||await hash(await blob.arrayBuffer());assets.set(id,blob);c.asset={id,mime:blob.type||'application/octet-stream',size:blob.size};c.blob=null}else delete c.asset;}return{manifest,assets}}
 async function unpack(manifest,fetchAsset){const project=structuredClone(manifest);for(const c of inventory(project)){if(c.asset){const blob=await fetchAsset(c.asset.id);if(blob.size!==c.asset.size||await hash(await blob.arrayBuffer())!==c.asset.id)throw Error('音訊完整性檢查失敗');c.blob=new Blob([blob],{type:c.asset.mime});delete c.asset;}}return project}
 root.SyncCodec={inventory,hash,pack,unpack};
})(globalThis);
