/* Home tools remain separate accessible controls; illustrated props retain independent semantic hit areas. */
(()=>{
 const home=document.querySelector('#worktable'),scene=home.querySelector('.scene-characters');
 home.querySelector('.scene-heading')?.remove();
 const backdrop=document.createElement('div');backdrop.className='studio-scene-backdrop';backdrop.setAttribute('aria-hidden','true');home.prepend(backdrop);
 const board=home.querySelector('.project-paper');board.classList.add('studio-nameboard');const title=board.querySelector('input');const titleHint=()=>{title.title=title.value||'編輯專案名稱'};title.addEventListener('input',titleHint);title.addEventListener('focus',titleHint);titleHint();
 const library=home.querySelector('.cabinet-entry');library.querySelector('svg')?.remove();const cabinetArt=document.createElement('img');cabinetArt.src='assets/audio-library-cabinet.png';cabinetArt.width=1374;cabinetArt.height=1145;cabinetArt.alt='';cabinetArt.setAttribute('aria-hidden','true');library.prepend(cabinetArt);scene.append(library);
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
