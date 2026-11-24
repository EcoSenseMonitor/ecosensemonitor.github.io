/* EcoSenseMonitor Interaction System 5.2
   Motion and interaction enhancements only. No access-control or data operations. */
(function(){
"use strict";
const reduced=()=>window.matchMedia("(prefers-reduced-motion:reduce)").matches;
const $=sel=>document.querySelector(sel);
const isInteractive=el=>el?.matches?.("button,a,[role=button]");
let lastRoute="";
let lastModal=null;
function enhanceNavigation(){
 const nodes=[...document.querySelectorAll("#nav button[data-page]")];
 const page=nodes.find(x=>x.classList.contains("active"))?.dataset.page||"";
 for(const button of nodes){
  button.setAttribute("aria-current",button.dataset.page===page?"page":"false");
  if(!button.title)button.title=button.querySelector(".eco-nav-label")?.textContent.trim()||button.textContent.trim();
 }
 if(page!==lastRoute){
  lastRoute=page;
  const content=$("#pageContent");
  if(content){
   content.classList.remove("eco-page-enter");
   void content.offsetWidth;
   content.classList.add("eco-page-enter");
  }
 }
}
function enhanceSections(){
 const root=$("#pageContent");
 if(!root)return;
 const sections=[...root.querySelectorAll(":scope > .grid > *,:scope > .card,:scope > .glass,:scope > .eco-control-page > *,:scope > .kpi-grid > *")].slice(0,35);
 sections.forEach((node,index)=>{
  if(node.closest(".eco-immersive"))return;
  if(!node.classList.contains("eco-reveal")){
   node.classList.add("eco-reveal");
   node.style.setProperty("--eco-stagger",Math.min(index,12)*34+"ms");
  }
 });
}
function enhanceModal(){
 const modal=$(".modal-backdrop:not(.eco-dialog-ready)");
 if(!modal)return;
 modal.classList.add("eco-dialog-ready");
 const inner=modal.querySelector(".modal");
 if(!inner)return;
 inner.setAttribute("role","dialog");
 inner.setAttribute("aria-modal","true");
 if(!inner.hasAttribute("aria-label"))inner.setAttribute("aria-label",inner.querySelector("h2")?.textContent.trim()||"Janela de diálogo");
 lastModal={node:modal,previous:document.activeElement};
 document.body.classList.add("eco-dialog-open");
 // Keep native form validations, handlers, and closing logic intact.
 requestAnimationFrame(()=>{const first=inner.querySelector("input:not([type=hidden]),select,button");first?.focus({preventScroll:true})});
}
function updateModalState(){
 const active=$(".modal-backdrop");
 if(active){enhanceModal();return}
 if(lastModal){
  const previous=lastModal.previous;
  lastModal=null;
  document.body.classList.remove("eco-dialog-open");
  if(previous?.isConnected&&typeof previous.focus==="function")previous.focus({preventScroll:true});
 }
}
function improveToast(){
 const node=$("#toast");
 if(!node)return;
 node.setAttribute("role","status");
 node.setAttribute("aria-live","polite");
 node.setAttribute("aria-atomic","true");
 const visible=!node.classList.contains("hidden")&&!!node.textContent.trim();
 node.classList.toggle("eco-toast-visible",visible);
}
function enhanceFormLabels(){
 document.querySelectorAll(".modal input,.modal select,.modal textarea").forEach(input=>{
  const field=input.closest(".field");
  if(field&&!field.classList.contains("eco-field-enhanced")){
   field.classList.add("eco-field-enhanced");
  }
 });
}
let scheduled=false;
function schedule(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{
  scheduled=false;
  enhanceNavigation();
  enhanceSections();
  updateModalState();
  enhanceFormLabels();
  improveToast();
 });
}
function init(){
 const observer=new MutationObserver(records=>{
  if(records.some(r=>r.type==="childList"||r.attributeName==="class"))schedule();
 });
 for(const selector of ["#pageContent","#nav","#toast","body"]){
  const element=$(selector);if(!element)continue;
  const options=selector==="body"?{childList:true}:{childList:true,subtree:true,attributes:true,attributeFilter:["class"]};
  observer.observe(element,options);
 }
 schedule();
 document.addEventListener("click",e=>{
  const target=e.target.closest("button,a,[role=button]");
  if(!isInteractive(target)||target.disabled)return;
  // Brief localized feedback; does not replace native handlers.
  target.classList.remove("eco-click-feedback");
  void target.offsetWidth;
  target.classList.add("eco-click-feedback");
  setTimeout(()=>target.classList.remove("eco-click-feedback"),380);
 },false);
 document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  const modal=$(".modal-backdrop");
  if(!modal)return;
  const cancel=modal.querySelector('[type="button"][id^="cancel"],#cancelCloud,#cancelStation');
  if(cancel)cancel.click();
 },false);
 window.addEventListener("resize",()=>{if(!reduced())schedule()},{passive:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();