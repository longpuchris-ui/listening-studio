/* Home tools remain separate accessible controls; illustrated props retain independent semantic hit areas. */
(()=>{
 const home=document.querySelector('#worktable'),scene=home.querySelector('.scene-characters');
 // Scene markup is present in the initial HTML; only behavior is attached here.
 const board=home.querySelector('.project-paper'),title=board.querySelector('input');
 const titleHint=()=>{title.title=title.value||'編輯專案名稱'};
 title.addEventListener('input',titleHint);title.addEventListener('focus',titleHint);titleHint();
 const sound=document.querySelector('.sound-preference');
 // Export guidance comes from the shared HTML; no second runtime copy.
 function place(){if(home.hidden){document.querySelector('.room-return').append(sound)}else scene.append(sound)}
 new MutationObserver(place).observe(home,{attributes:true,attributeFilter:['hidden']});place();
})();
