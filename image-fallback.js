/* Lossless WebP fallback for HTML/SVG image decoders; never fetch both on success. */
document.addEventListener('error',event=>{const image=event.target;if(!image||!['IMG','image'].includes(image.tagName))return;const attr=image.tagName==='IMG'?'src':'href',src=image.getAttribute(attr)||'';if(/^assets\/[a-z0-9-]+\.webp$/.test(src))image.setAttribute(attr,src.replace(/\.webp$/,'.png'));},true);
/* CSS image-set selects formats, not failed responses. Share the exact WebP URL
   with a decoder probe; only an error installs the original PNG background. */
function checkSceneBackgrounds(){
for(const [name,selector] of [
 ['recording-studio-background','.worktable .studio-scene-backdrop'],
 ['project-nameplate','.worktable .studio-nameboard']
]){
 if(!globalThis.CSS?.supports('background-image','image-set(url("probe.webp") type("image/webp"))'))continue;
 const probe=new Image();probe.fetchPriority='low';
 probe.onerror=()=>{
  const rule=document.createElement('style');
  rule.dataset.imageFallback=name;
  rule.textContent=selector+"{background-image:url('assets/"+name+".png')!important}";
  document.head.append(rule);
 };
 probe.src='assets/'+name+'.webp';
}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',checkSceneBackgrounds,{once:true});else checkSceneBackgrounds();
