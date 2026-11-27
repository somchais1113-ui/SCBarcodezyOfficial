'use strict';
function premiumController(root,win,doc){
 const slides=[...root.querySelectorAll(".hero-slide")],steps=[...root.querySelectorAll(".hero-step")],toggle=root.querySelector(".hero-toggle"),counter=root.querySelector(".hero-count strong"),prev=root.querySelector(".hero-prev"),next=root.querySelector(".hero-next");
 if(slides.length!==5||steps.length!==5||!toggle||!counter||!prev||!next)return;
 const media=win.matchMedia("(prefers-reduced-motion: reduce)"),duration=7400;
 let index=0,elapsed=0,last=null,frame=0,manual=false,hover=false,focus=false,visible=true,start=null;
 const paused=()=>manual||hover||focus||!visible||doc.hidden||media.matches;
 function show(i){const old=index;index=(i+slides.length)%slides.length;elapsed=0;last=null;
  slides.forEach((s,j)=>{s.classList.toggle("is-leaving",j===old&&old!==index);s.classList.toggle("is-active",j===index);s.setAttribute("aria-hidden",String(j!==index));s.inert=j!==index});
  steps.forEach((s,j)=>{s.classList.toggle("is-current",j===index);s.setAttribute("aria-pressed",String(j===index))});
  counter.textContent=String(index+1).padStart(2,"0");root.style.setProperty("--hero-progress",media.matches?"1":"0");
 }
 function sync(){const stop=paused();root.classList.toggle("is-paused",stop);toggle.setAttribute("aria-pressed",String(manual||media.matches));toggle.setAttribute("aria-label",manual||media.matches?"เล่น Banner":"หยุดเล่น Banner");toggle.firstElementChild.textContent=manual||media.matches?"▶":"Ⅱ";toggle.disabled=media.matches;
  if(stop){if(frame)win.cancelAnimationFrame(frame);frame=0;last=null;return}
  if(!frame)frame=win.requestAnimationFrame(tick);
 }
 function tick(now){frame=0;if(paused()){sync();return}if(last!==null)elapsed+=Math.min(150,now-last);last=now;if(elapsed>=duration){show(index+1);last=now}root.style.setProperty("--hero-progress",String(Math.min(1,elapsed/duration)));sync()}
 const go=i=>{show(i);sync()};
 steps.forEach((s,i)=>s.addEventListener("click",()=>go(i)));prev.addEventListener("click",()=>go(index-1));next.addEventListener("click",()=>go(index+1));
 toggle.addEventListener("click",()=>{manual=!manual;sync()});
 root.addEventListener("pointerenter",e=>{if(e.pointerType==="mouse"){hover=true;sync()}});
 root.addEventListener("pointerleave",()=>{hover=false;sync()});
 root.addEventListener("focusin",e=>{focus=!!e.target.matches?.(":focus-visible");sync()});
 root.addEventListener("focusout",e=>{if(!root.contains(e.relatedTarget)){focus=false;sync()}});
 root.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();go(index+(e.key==="ArrowRight"?1:-1))}});
 root.addEventListener("touchstart",e=>{if(e.touches.length!==1){start=null;return}const t=e.changedTouches[0];start=[t.clientX,t.clientY]},{passive:true});
 root.addEventListener("touchend",e=>{if(!start)return;const t=e.changedTouches[0],dx=t.clientX-start[0],dy=t.clientY-start[1];start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)go(index+(dx<0?1:-1))},{passive:true});
 root.addEventListener("touchcancel",()=>{start=null},{passive:true});
 doc.addEventListener("visibilitychange",sync);
 const motionChanged=()=>{show(index);sync()};if(media.addEventListener)media.addEventListener("change",motionChanged);else media.addListener(motionChanged);
 if("IntersectionObserver" in win){const observer=new win.IntersectionObserver(es=>{visible=es[0].isIntersecting;sync()},{threshold:.05});observer.observe(root)}
 show(0);sync();
}
const premiumHero=document.getElementById('brand-hero');if(premiumHero)premiumController(premiumHero,window,document);
