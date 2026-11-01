/* High-quality WebP with original PNG fallback for HTML/SVG image decoders; never fetch both on success. */
function originalScenePng(src){return src.replace(/(?:-delivery)?\.webp$/,'.png')}
document.addEventListener('error',event=>{const image=event.target;if(!image||!['IMG','image'].includes(image.tagName))return;const attr=image.tagName==='IMG'?'src':'href',src=image.getAttribute(attr)||'';if(/^assets\/[a-z0-9-]+\.webp$/.test(src))image.setAttribute(attr,originalScenePng(src));},true);
/* CSS image-set selects formats, not failed responses. Share the exact WebP URL
   with a decoder probe; only an error installs the original PNG background. */
const checkedSceneImages=new Set();
function checkSceneBackgrounds(){
for(const [name,selector] of [
 [matchMedia('(min-width:1001px)').matches?'studio-home-warm':'recording-studio-background','.worktable .studio-scene-backdrop'],
 ['project-nameplate','.worktable .studio-nameboard']
]){
 if(!globalThis.CSS?.supports('background-image','image-set(url("probe.webp") type("image/webp"))'))continue;
 if(checkedSceneImages.has(name))continue;checkedSceneImages.add(name);
 const probe=new Image();probe.fetchPriority='low';
 probe.onerror=()=>{
  const rule=document.createElement('style');
  rule.dataset.imageFallback=name;
  rule.textContent=selector+"{background-image:url('assets/"+name+".png')!important}";
  if(name==='studio-home-warm')rule.textContent='@media(min-width:1001px){'+rule.textContent+'}';
  if(name==='recording-studio-background')rule.textContent='@media(max-width:1000px){'+rule.textContent+'}';
  document.head.append(rule);
 };
 const delivery=['recording-studio-background','project-nameplate'].includes(name)?'-delivery':'';
 probe.src='assets/'+name+delivery+'.webp';
}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',checkSceneBackgrounds,{once:true});else checkSceneBackgrounds();

matchMedia('(min-width:1001px)').addEventListener('change',checkSceneBackgrounds);
