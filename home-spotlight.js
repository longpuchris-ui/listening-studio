/* Reuse the original transparent composite; three complementary SVG regions.
   Each region and its existing information card share one button transform. */
(()=>{
 const scene=document.querySelector('.scene-characters'),home=document.querySelector('#worktable');
 const buttons=[...scene.querySelectorAll('.character-entrance')];
 // Pixel masks follow the original alpha silhouette and exclude disconnected scene marks.
 // The complementary static mask preserves every source pixel without moving background cables.
 const maskNames={enterRecord:'center',enterArrange:'left',enterExport:'right'};
 const floor=document.createElement('span');floor.className='mascot-floor-cable';floor.setAttribute('aria-hidden','true');
 floor.innerHTML=`<svg viewBox="0 0 1374 1145" xmlns="http://www.w3.org/2000/svg"><defs><mask id="static-background" maskUnits="userSpaceOnUse" x="0" y="0" width="1374" height="1145"><image href="assets/mask-static.png" width="1374" height="1145"/></mask></defs><image href="assets/microphone-friends-soft3d.webp" width="1374" height="1145" mask="url(#static-background)"/></svg>`;scene.prepend(floor);
 for(const [i,b] of buttons.entries()){
  const art=document.createElement('span');art.className='mascot-region';art.setAttribute('aria-hidden','true');
  art.innerHTML=`<svg viewBox="0 0 1374 1145" xmlns="http://www.w3.org/2000/svg"><defs><mask id="moving-${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="1374" height="1145"><image href="assets/mask-${maskNames[b.dataset.action]}.png" width="1374" height="1145"/></mask></defs><image href="assets/microphone-friends-soft3d.webp" width="1374" height="1145" mask="url(#moving-${i})"/></svg>`;
  b.prepend(art);
 }
 const dim=document.createElement('div');dim.className='home-dimmer';dim.setAttribute('aria-hidden','true');home.prepend(dim);
 let artReady=false;
 function layout(){if(home.hidden)return;dim.style.display='none';const rect=home.getBoundingClientRect();home.style.setProperty('--home-left',(rect.left+scrollX)+'px');home.style.setProperty('--home-top',(rect.top+scrollY)+'px');home.style.setProperty('--home-width',document.documentElement.clientWidth+'px');home.style.setProperty('--home-height',Math.max(document.body.scrollHeight,document.documentElement.clientHeight)+'px');dim.style.removeProperty('display');for(const b of buttons){const a=b.querySelector('.mascot-region');Object.assign(a.style,{width:scene.clientWidth+'px',height:scene.clientHeight+'px',left:-b.offsetLeft+'px',top:-b.offsetTop+'px'});}if(artReady)home.classList.add('spotlight-ready')}
 // Keep the original composite visible until every complementary layer decodes.
 Promise.all(['microphone-friends-soft3d.webp','mask-static.png','mask-center.png','mask-left.png','mask-right.png'].map(name=>new Promise(resolve=>{const img=new Image();img.onload=()=>img.decode().then(resolve,resolve);img.onerror=()=>{if(name.endsWith('.webp')){img.onerror=()=>resolve(false);img.src='assets/'+name.replace('.webp','.png')}else resolve(false)};img.src='assets/'+name}))).then(results=>{if(!results.includes(false)){artReady=true;layout()}});
 const resize=new ResizeObserver(layout);resize.observe(scene);resize.observe(document.body);layout();
 let hovered=null,focused=null,pressed=null,last=null,pending=null;
 function cancelEntry(){if(pending){clearTimeout(pending.timer);pending=null}}
 function update(){const target=home.hidden?null:pending?.button||pressed||focused||hovered;buttons.forEach(b=>b.classList.toggle('spotlit',b===target));home.classList.toggle('has-spotlight',!!target)}
 function clear(){cancelEntry();hovered=focused=pressed=null;update()}
 for(const b of buttons){
  b.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'&&matchMedia('(hover:hover)').matches){hovered=b;update()}});
  b.addEventListener('pointerleave',()=>{if(pending)return;if(hovered===b)hovered=null;pressed=null;update()});
  b.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){pressed=b;update()}});
  b.addEventListener('pointerup',()=>{if(!pending){pressed=null;update()}});b.addEventListener('pointercancel',clear);
  b.addEventListener('focus',()=>{if(b.matches(':focus-visible')){focused=b;update()}});
  b.addEventListener('blur',()=>{if(focused===b)focused=null;update()});
  b.addEventListener('click',e=>{
   e.preventDefault();e.stopPropagation();
   if(pending?.button===b)return;
   cancelEntry();last=b;pressed=b;update();
   const enter=()=>{pending=null;if(home.hidden||document.hidden)return;clear();action(b.dataset.action,b.dataset.id).catch(e=>toast(e.message));};
   if(matchMedia('(prefers-reduced-motion:reduce)').matches)enter();
   else pending={button:b,timer:setTimeout(enter,320)};
  });
 }
 document.addEventListener('click',e=>{if(pending&&!e.target.closest('.character-entrance'))clear()},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'||e.key==='Tab')clear()});
 window.addEventListener('blur',clear);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()});
 new MutationObserver(()=>{clear();if(!home.hidden)layout();if(!home.hidden&&last){last.focus({preventScroll:true});last=null}}).observe(home,{attributes:true,attributeFilter:['hidden']});
})();
