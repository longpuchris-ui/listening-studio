/* 電腦版細修：大題分頁列可用一般滑鼠滾輪左右捲動（原本只能用觸控板橫向滑，後面的大題點不到）。 */
(()=>{const nav=document.getElementById('chapterNav');if(!nav)return;
nav.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)||nav.scrollWidth<=nav.clientWidth+2)return;const before=nav.scrollLeft;nav.scrollLeft+=e.deltaY;if(nav.scrollLeft!==before)e.preventDefault()},{passive:false});})();
