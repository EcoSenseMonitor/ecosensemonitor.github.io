/* EcoSenseMonitor: visualização interativa com séries reais, sem interpolação de falhas. */
(function(){
"use strict";
const variables={
 temp:{label:"Temperatura",unit:"°C",color:"#ff954c"},
 humidity:{label:"Umidade relativa",unit:"%",color:"#39baff"},
 pressure:{label:"Pressão",unit:"hPa",color:"#bc82ff"},
 altitude:{label:"Altitude",unit:"m",color:"#33d6ac"},
 battery:{label:"Bateria",unit:"V",color:"#e7b858"},
 rssi:{label:"Sinal Wi-Fi",unit:"dBm",color:"#f272a8"},
 satellites:{label:"Satélites GPS",unit:"",color:"#adcf5b"}
};
let active=["temp","humidity","pressure"],zoom=null,showPoints=false;
const escText=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(x,k)=>Number(x).toLocaleString("pt-BR",{maximumFractionDigits:2})+(variables[k].unit?" "+variables[k].unit:"");
const date=x=>new Date(x).toLocaleString("pt-BR",{timeZone:"America/Fortaleza",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const originalRender=render;
render=function(){originalRender();if(route==="analises")drawInteractive()};
function dataForCurrentStation(){
 const station=current(); if(!station)return [];
 return rows(station).filter(r=>Number.isFinite(Date.parse(r.time))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
}
function visibleData(all){
 const maxT=all.length?Date.parse(all[all.length-1].time):0;
 const span={"24":86400000,"7":604800000,"30":2592000000}[period];
 let begin=span?Date.now()-span:-Infinity,end=Infinity;
 if(zoom){begin=Math.max(begin,zoom[0]);end=Math.min(end,zoom[1]);}
 return all.filter(r=>{const t=Date.parse(r.time);return t>=begin&&t<=end});
}
function zoomTo(factor){
 const all=visibleData(dataForCurrentStation());if(all.length<3)return;
 const min=Date.parse(all[0].time),max=Date.parse(all[all.length-1].time),mid=(min+max)/2;
 const newSpan=Math.max(60000,(max-min)*factor);
 zoom=[mid-newSpan/2,mid+newSpan/2];drawInteractive();
}
function drawInteractive(){
 const section=document.querySelector("#pageContent .grid.section-grid .card:first-child");
 const target=section?.querySelector(".chart-wrap");
 if(!target)return;
 target.style.height="auto";
 target.style.minHeight="330px";
 target.style.overflow="hidden";
 const all=dataForCurrentStation();
 const data=visibleData(all);
 const keys=active.filter(k=>variables[k]);
 const used=keys.filter(k=>data.some(r=>Number.isFinite(Number(r[k]))&&r[k]!==null&&r[k]!==""));
 const choices=Object.entries(variables).map(([key,v])=>'<label class="ec-series-choice"><input type="checkbox" data-ec-series="'+key+'" '+(keys.includes(key)?"checked":"")+'><span style="color:'+v.color+'">●</span> '+v.label+'</label>').join("");
 const tools='<div class="ec-chart-tools"><div class="ec-checks">'+choices+'</div><div class="ec-chart-actions"><button type="button" data-ec-zoom="0.5">＋ Zoom</button><button type="button" data-ec-zoom="2">－ Zoom</button><button type="button" data-ec-reset>Restaurar</button><label><input type="checkbox" id="ecPoints" '+(showPoints?"checked":"")+'/> Pontos</label></div></div>';
 if(!data.length||!used.length){
  target.innerHTML=tools+'<p class="ec-chart-note">Não existem medições válidas para as séries escolhidas neste intervalo. Selecione outras variáveis ou amplie o período.</p>';return;
 }
 const W=960,H=340,pad={left:60,right:20,top:28,bottom:53},w=W-pad.left-pad.right,h=H-pad.top-pad.bottom;
 const times=data.map(d=>Date.parse(d.time));const first=times[0],last=times[times.length-1];
 let domains={};used.forEach(k=>{let v=data.map(d=>d[k]).filter(x=>x!==null&&x!==""&&Number.isFinite(Number(x))).map(Number);let a=Math.min(...v),b=Math.max(...v);if(a===b){const d=Math.max(Math.abs(a)*.01,.5);a-=d;b+=d}domains[k]=[a,b]});
 const tx=t=>pad.left+((t-first)/Math.max(1,last-first))*w;
 const ty=(v,k)=>pad.top+h-(Number(v)-domains[k][0])/(domains[k][1]-domains[k][0])*h;
 const allDeltas=times.slice(1).map((x,i)=>x-times[i]).filter(d=>d>0).sort((a,b)=>a-b);
 const median=allDeltas.length?allDeltas[Math.floor(allDeltas.length/2)]:600000;
 // Evita unir visualmente interrupções de transmissão; dados agregados podem ocultar intervalos curtos.
 const gapThreshold=Math.max(25*60000,median*2.5);
 let gaps=0;
 let grid=Array.from({length:5},(_,i)=>{let yy=pad.top+i*h/4;return '<line x1="'+pad.left+'" x2="'+(W-pad.right)+'" y1="'+yy+'" y2="'+yy+'" stroke="#829b9b" stroke-opacity=".24"/><text x="'+(pad.left-12)+'" y="'+(yy+4)+'" text-anchor="end" fill="#bdc9c8" font-size="12">'+(100-i*25)+'%</text>';}).join("");
 const colors=used.map(k=>variables[k].color);
 let paths=used.map((k,index)=>{
  let d="",previousTime=null,segments=0;
  data.forEach(row=>{
   const value=row[k],t=Date.parse(row.time);
   if(value===null||value===""||!Number.isFinite(Number(value))){previousTime=null;return;}
   const x=tx(t),y=ty(value,k);const breakLine=previousTime===null||(t-previousTime)>gapThreshold;
   if(previousTime!==null&&breakLine)segments++;
   d+=(breakLine?"M":"L")+x.toFixed(2)+","+y.toFixed(2)+" ";previousTime=t;
  });
  gaps=Math.max(gaps,segments);
  const dots=showPoints&&data.length<=250?data.filter(r=>r[k]!=null&&r[k]!==""&&Number.isFinite(Number(r[k]))).map(r=>'<circle cx="'+tx(Date.parse(r.time)).toFixed(2)+'" cy="'+ty(r[k],k).toFixed(2)+'" r="2.8" fill="'+colors[index]+'"/>').join(""):"";
  return '<path d="'+d+'" fill="none" stroke="'+colors[index]+'" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>'+dots;
 }).join("");
 const ticks=Array.from({length:6},(_,i)=>{const t=first+(last-first)*i/5,x=tx(t);return '<text x="'+x+'" y="'+(H-19)+'" font-size="11" fill="#b2c9c4" text-anchor="middle">'+escText(new Date(t).toLocaleDateString("pt-BR",{timeZone:"America/Fortaleza",day:"2-digit",month:"2-digit",year:"2-digit"}))+'</text>';}).join("");
 const specs=used.map(k=>'<span class="ec-range"><i style="background:'+variables[k].color+'"></i>'+variables[k].label+': '+fmt(domains[k][0],k)+' a '+fmt(domains[k][1],k)+'</span>').join("");
 const svg='<svg id="ecOverlayChart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Séries temporais sobrepostas e interativas">'+grid+paths+ticks+'<line id="ecCrosshair" x1="0" x2="0" y1="'+pad.top+'" y2="'+(pad.top+h)+'" stroke="#fff" stroke-dasharray="4 5" opacity="0"/><rect id="ecHit" x="'+pad.left+'" y="'+pad.top+'" width="'+w+'" height="'+h+'" fill="transparent" style="cursor:crosshair"/></svg>';
 const note='<div class="ec-chart-note">Comparação com escala independente para cada variável (0–100% da amplitude observada), sem alterar medições originais. Passe o cursor para consultar valores reais e horários. Linhas interrompidas indicam ausência de amostras; séries agregadas podem não revelar todas as lacunas.</div>';
 target.innerHTML=tools+'<div class="ec-chart-frame">'+svg+'<div class="ec-tooltip" id="ecChartTooltip" hidden></div></div><div class="ec-ranges">'+specs+'</div>'+note;
 const canvas=target.querySelector("#ecOverlayChart"),hit=target.querySelector("#ecHit"),tip=target.querySelector("#ecChartTooltip"),cross=target.querySelector("#ecCrosshair");
 hit.addEventListener("pointermove",e=>{
  const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*W;
  const time=first+(Math.max(pad.left,Math.min(W-pad.right,x))-pad.left)/w*(last-first);
  let low=0,high=times.length-1;
  while(low<high){const mid=Math.floor((low+high)/2);if(times[mid]<time)low=mid+1;else high=mid;}
  const idx=low>0&&Math.abs(times[low-1]-time)<Math.abs(times[low]-time)?low-1:low;
  const record=data[idx],cursor=tx(times[idx]);cross.setAttribute("x1",cursor);cross.setAttribute("x2",cursor);cross.setAttribute("opacity","1");
  tip.hidden=false;tip.innerHTML='<b>'+date(record.time)+'</b>'+used.map(k=>'<div><span style="color:'+variables[k].color+'">●</span> '+variables[k].label+': <b>'+(record[k]===null||record[k]===undefined||record[k]===""?"sem medição":fmt(record[k],k))+'</b></div>').join("");
  tip.style.left=Math.min(78,Math.max(2,(cursor/W)*100))+"%";
 });
 hit.addEventListener("pointerleave",()=>{tip.hidden=true;cross.setAttribute("opacity","0")});
 target.querySelectorAll("[data-ec-series]").forEach(input=>input.addEventListener("change",e=>{const k=e.target.dataset.ecSeries;if(e.target.checked){if(!active.includes(k))active.push(k)}else{active=active.filter(v=>v!==k)}drawInteractive()}));
 target.querySelectorAll("[data-ec-zoom]").forEach(button=>button.addEventListener("click",()=>zoomTo(Number(button.dataset.ecZoom))));
 target.querySelector("[data-ec-reset]").addEventListener("click",()=>{zoom=null;drawInteractive()});
 target.querySelector("#ecPoints").addEventListener("change",e=>{showPoints=e.target.checked;drawInteractive()});
 const heading=section.querySelector(".panel-heading p");
 if(heading)heading.textContent="Selecione variáveis para sobrepor séries. Use zoom e cursor para explorar as medições da estação.";
}
document.addEventListener("change",e=>{if(e.target.matches("#analysisStation,#analysisPeriod"))zoom=null;});
if(route==="analises")drawInteractive();
})();