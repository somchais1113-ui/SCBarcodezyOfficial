'use strict';
function heroController(root,win,doc){
 const slides=Array.from(root.querySelectorAll(".hero-slide")),steps=Array.from(root.querySelectorAll(".hero-step")),toggle=root.querySelector(".hero-toggle"),counter=root.querySelector(".hero-count");
 if(slides.length!==5||steps.length!==5||!toggle||!counter)return;
 const motion=win.matchMedia("(prefers-reduced-motion: reduce)");
 const duration=6000;let index=0,elapsed=0,last=null,frame=0,manual=false,hover=false,focus=false,visible=true,start=null;
 function paused(){return manual||hover||focus||!visible||doc.hidden||motion.matches}
 function show(i){index=(i+slides.length)%slides.length;elapsed=0;last=null;slides.forEach((s,j)=>{s.classList.toggle("is-active",j===index);s.setAttribute("aria-hidden",String(j!==index))});steps.forEach((s,j)=>{s.classList.toggle("is-current",j===index);s.setAttribute("aria-pressed",String(j===index))});counter.textContent=String(index+1).padStart(2,"0")+" / 05";root.style.setProperty("--hero-progress",motion.matches?"1":"0")}
 function sync(){
  const stop=paused();root.classList.toggle("is-paused",stop);
  toggle.setAttribute("aria-pressed",String(manual||motion.matches));toggle.setAttribute("aria-label",manual||motion.matches?"เล่น Banner":"หยุดเล่น Banner");toggle.firstElementChild.textContent=manual||motion.matches?"▶":"Ⅱ";toggle.disabled=motion.matches;
  if(stop){if(frame)win.cancelAnimationFrame(frame);frame=0;last=null;return}
  if(!frame)frame=win.requestAnimationFrame(tick);
 }
 function tick(now){frame=0;if(paused()){sync();return}if(last!==null)elapsed+=Math.min(150,now-last);last=now;if(elapsed>=duration){show(index+1);last=now}root.style.setProperty("--hero-progress",String(Math.min(1,elapsed/duration)));sync()}
 steps.forEach((s,i)=>s.addEventListener("click",()=>{show(i);sync()}));
 toggle.addEventListener("click",()=>{manual=!manual;sync()});
 root.addEventListener("pointerenter",e=>{if(e.pointerType==="mouse"){hover=true;sync()}});
 root.addEventListener("pointerleave",()=>{hover=false;sync()});
 root.addEventListener("focusin",()=>{focus=true;sync()});
 root.addEventListener("focusout",e=>{if(!root.contains(e.relatedTarget)){focus=false;sync()}});
 root.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();show(index+(e.key==="ArrowRight"?1:-1));sync()}});
 root.addEventListener("touchstart",e=>{const t=e.changedTouches[0];start=[t.clientX,t.clientY]},{passive:true});
 root.addEventListener("touchend",e=>{if(!start)return;const t=e.changedTouches[0],dx=t.clientX-start[0],dy=t.clientY-start[1];start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5){show(index+(dx<0?1:-1));sync()}},{passive:true});
 root.addEventListener("touchcancel",()=>{start=null},{passive:true});
 doc.addEventListener("visibilitychange",sync);
 if(motion.addEventListener)motion.addEventListener("change",()=>{show(index);sync()});else motion.addListener(()=>{show(index);sync()});
 if("IntersectionObserver" in win){const observer=new win.IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()},{threshold:.05});observer.observe(root)}
 show(0);sync();
}
const brandHero=document.getElementById('brand-hero');if(brandHero)heroController(brandHero,window,document);
