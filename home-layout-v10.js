/* Home tools remain separate accessible controls; illustrated props retain independent semantic hit areas. */
(()=>{
 const home=document.querySelector('#worktable'),scene=home.querySelector('.scene-characters');
 const brandText=document.querySelector('.brand>span:last-child');
 if(brandText){brandText.innerHTML='<span class="wall-brand-word">聽力錄音室</span><small>你今天，不錄嗎？</small><svg class="wall-brand-drawing" viewBox="0 0 310 112" aria-hidden="true" focusable="false"><path d="M3 46V29C3 2 60 2 60 29v17" fill="none" stroke="#a58ab6" stroke-width="3.4"/><path d="M4 39v14m54-14v14" stroke="#dfba70" stroke-width="8" stroke-linecap="round"/><path d="M70 66h20l5-5 6 10 6-17 7 23 7-16 6 5h126" fill="none" stroke="#c4a464" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M249 29q7 7 0 14m7-19q12 12 0 24" fill="none" stroke="#a58ab6" stroke-width="2.5" stroke-linecap="round"/></svg>'}

 // Decorative floor spill only: no hit targets, layout height, or audio behavior.
 const floor=document.createElement('div');floor.className='mobile-floor-atmosphere';floor.setAttribute('aria-hidden','true');
 document.body.append(floor);
 home.querySelector('.scene-heading')?.remove();
 const stage=document.createElement('div');stage.className='studio-wood-stage';stage.setAttribute('aria-hidden','true');scene.prepend(stage);
 const backdrop=document.createElement('div');backdrop.className='studio-scene-backdrop';backdrop.setAttribute('aria-hidden','true');home.prepend(backdrop);
 const board=home.querySelector('.project-paper');board.classList.add('studio-nameboard');const title=board.querySelector('input');const titleHint=()=>{title.title=title.value||'編輯專案名稱'};title.addEventListener('input',titleHint);title.addEventListener('focus',titleHint);titleHint();
 const library=home.querySelector('.cabinet-entry');library.querySelector('svg')?.remove();const cabinetArt=document.createElement('img');cabinetArt.src='assets/audio-library-cabinet.webp';cabinetArt.width=1374;cabinetArt.height=1145;cabinetArt.alt='';cabinetArt.setAttribute('aria-hidden','true');library.prepend(cabinetArt);scene.append(library);
 const sound=document.querySelector('.sound-preference');sound.classList.add('scene-sound-prop');scene.append(sound);
 const libraryTools=document.querySelector('.library-tools');
 const backup=document.querySelector('.top-actions [data-action=backup]'),restore=document.querySelector('.top-actions [data-action=restore]');
 backup.className='secondary';backup.innerHTML='<svg aria-hidden="true"><use href="#i-download"/></svg>備份目前專案';
 restore.className='secondary';restore.innerHTML='<svg aria-hidden="true"><use href="#i-upload"/></svg>開啟專案備份';restore.setAttribute('aria-label','開啟專案備份');
 const group=document.createElement('div');group.className='library-project-tools';group.setAttribute('aria-label','可編輯專案備份與復原');group.append(backup,restore);const importScript=libraryTools.querySelector('[data-action=importScript]');if(importScript)group.prepend(importScript);libraryTools.before(group);
 const note=document.querySelector('.export-note');if(note){const ps=note.querySelectorAll('p');if(ps[0])ps[0].textContent='原始錄音與設定保存在此裝置。啟用私人同步並確認已同步後，才可在另一裝置續編。';if(ps[1])ps[1].textContent='需要離線備份時，回資料庫選「備份目前專案」；這份備份包含可編輯原音。'}
 function place(){if(home.hidden){document.querySelector('.room-return').append(sound)}else scene.append(sound)}
 new MutationObserver(place).observe(home,{attributes:true,attributeFilter:['hidden']});place();
})();
