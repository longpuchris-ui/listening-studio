/* Home tools remain separate accessible controls; illustrated props retain independent semantic hit areas. */
(()=>{
 const home=document.querySelector('#worktable'),scene=home.querySelector('.scene-characters');
 // Scene markup is present in the initial HTML; only behavior is attached here.
 const board=home.querySelector('.project-paper'),title=board.querySelector('input');
 const titleHint=()=>{title.title=title.value||'編輯專案名稱'};
 title.addEventListener('input',titleHint);title.addEventListener('focus',titleHint);titleHint();
 const sound=document.querySelector('.sound-preference');
 const note=document.querySelector('.export-note');if(note){const ps=note.querySelectorAll('p');if(ps[0])ps[0].textContent='原始錄音與設定保存在此裝置。啟用私人同步並確認已同步後，才可在另一裝置續編。';if(ps[1])ps[1].textContent='需要離線備份時，回資料庫選「備份目前專案」；這份備份包含可編輯原音。'}
 function place(){if(home.hidden){document.querySelector('.room-return').append(sound)}else scene.append(sound)}
 new MutationObserver(place).observe(home,{attributes:true,attributeFilter:['hidden']});place();
})();
