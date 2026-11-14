/* Fade every edit and loop through black using the actual video clock. */
(()=>{
'use strict';
const media=[...document.querySelectorAll('video')];
function brightness(v){
 const t=v.currentTime, duration=v.duration, rate=v.playbackRate||1;
 if(!Number.isFinite(duration)||duration<=0||(v.paused&&t===0))return 1;
 const ramp=.32*rate,hold=.16*rate;
 let distance=Math.min(t,duration-t);
 for(const cut of JSON.parse(v.dataset.cuts||'[]'))distance=Math.min(distance,Math.max(0,Math.abs(t-cut)-hold));
 const x=Math.max(0,Math.min(1,distance/ramp));return x*x*(3-2*x);
}
function frame(){
 for(const v of media){if(!v.closest('.slide.active'))continue;
  const level=brightness(v);v.style.filter=level>.999?'none':`brightness(${level.toFixed(4)})`;
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
