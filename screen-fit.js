/* Large screens: the desktop studio is laid out at a fixed size (about 1240 px
   wide). On monitors bigger than that, scale the whole page uniformly so the
   scene fills the screen instead of floating small in the middle. Phones and
   ordinary laptops (narrower than FIT_FROM) are left untouched. */
(()=>{
  const BASE_W=1440,BASE_H=860,FIT_FROM=1500,MAX=2.4;
  const root=document.documentElement;
  let last=1;
  function fit(){
    const w=window.innerWidth,h=window.innerHeight;
    let z=1;
    if(w>=FIT_FROM)z=Math.max(1,Math.min(w/BASE_W,h/BASE_H,MAX));
    z=Math.floor(z*100)/100;
    if(z===last)return;
    last=z;
    if(z>1){root.style.zoom=String(z);root.dataset.screenFit=String(z)}
    else{root.style.removeProperty('zoom');delete root.dataset.screenFit}
    window.dispatchEvent(new Event('screenfitchange'));
  }
  if(!('zoom' in root.style))return;
  fit();
  let queued=0;
  window.addEventListener('resize',()=>{cancelAnimationFrame(queued);queued=requestAnimationFrame(fit)},{passive:true});
})();
