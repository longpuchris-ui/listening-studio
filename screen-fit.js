/* Large screens: the desktop studio is laid out at a fixed size (about 1240 px
   wide). On monitors bigger than that, scale the whole page uniformly so the
   scene fills the screen instead of floating small in the middle. Phones and
   ordinary laptops (narrower than FIT_FROM) are left untouched.

   Under CSS zoom, viewport units are zoomed too: "max-height:90dvh" becomes
   90% x zoom of the real screen, so dialogs and lists overflow the window and
   cannot scroll. While zoomed, every stylesheet rule that uses vh/vw/dvh/...
   gets an override that measures against the real viewport instead
   (--fit-vh / --fit-vw = 1% of the real viewport, in zoomed CSS px). */
(()=>{
  const BASE_W=1440,BASE_H=860,FIT_FROM=1500,MAX=2.4;
  const root=document.documentElement;
  const UNIT=/(-?\d*\.?\d+)(?:d|s|l)?v(h|w|min|max)\b/g;
  let last=1,overrides=null,builtFrom=0;
  function rewrite(value){return value.replace(UNIT,(m,n,axis)=>axis==='h'||axis==='w'?`calc(var(--fit-v${axis}) * ${n})`:`calc(${axis}(var(--fit-vh),var(--fit-vw)) * ${n})`)}
  function walk(rules,out){
    for(const rule of rules){
      if(rule.cssRules&&(rule.conditionText!==undefined)){const inner=[];walk(rule.cssRules,inner);if(inner.length)out.push((rule instanceof CSSMediaRule?'@media ':'@supports ')+rule.conditionText+'{'+inner.join('')+'}');continue}
      if(!(rule instanceof CSSStyleRule))continue;
      const decls=[];const st=rule.style;
      for(let i=0;i<st.length;i++){const p=st[i],v=st.getPropertyValue(p);if(UNIT.test(v)){UNIT.lastIndex=0;decls.push(p+':'+rewrite(v)+(st.getPropertyPriority(p)?' !important':''))}UNIT.lastIndex=0}
      if(decls.length)out.push('html[data-screen-fit] :is('+rule.selectorText+'){'+decls.join(';')+'}');
    }
  }
  function buildOverrides(force=false){
    const sheets=[...document.styleSheets].filter(s=>s.ownerNode!==overrides);
    if(!force&&overrides&&builtFrom===sheets.length)return;
    const out=[];for(const sheet of sheets){try{walk(sheet.cssRules,out)}catch{/* cross-origin or not loaded yet */}}
    if(!overrides){overrides=document.createElement('style');overrides.dataset.screenFit='viewport-units'}
    overrides.textContent=out.join('\n');builtFrom=sheets.length;
    if(!overrides.isConnected)document.head.append(overrides);
  }
  function fit(){
    const w=window.innerWidth,h=window.innerHeight;
    let z=1;
    if(w>=FIT_FROM)z=Math.max(1,Math.min(w/BASE_W,h/BASE_H,MAX));
    z=Math.floor(z*100)/100;
    if(z>1){root.style.setProperty('--fit-vh',(h/100/z)+'px');root.style.setProperty('--fit-vw',(w/100/z)+'px')}
    if(z===last)return;
    last=z;
    if(z>1){root.style.zoom=String(z);root.dataset.screenFit=String(z);buildOverrides()}
    else{root.style.removeProperty('zoom');delete root.dataset.screenFit}
    window.dispatchEvent(new Event('screenfitchange'));
  }
  if(!('zoom' in root.style))return;
  fit();
  // Stylesheets finish loading after this script runs; rebuild once they are all in.
  const rebuild=()=>{if(last>1)buildOverrides(true)};
  document.addEventListener('DOMContentLoaded',rebuild);window.addEventListener('load',rebuild);
  let queued=0;
  window.addEventListener('resize',()=>{cancelAnimationFrame(queued);queued=requestAnimationFrame(fit)},{passive:true});
})();
