/* EcoSenseMonitor immersive map — real telemetry, no synthetic fields. */
(function(){
"use strict";
const metrics=[
 ["temp","Temperatura","°C","#ff575c","♨"],
 ["humidity","Umidade relativa","%","#4c9cff","◉"],
 ["pressure","Pressão atmosférica","hPa","#b77cff","◴"],
 ["altitude","Altitude","m","#f4b33d","△"],
 ["rssi","Sinal Wi-Fi","dBm","#31cf99","▥"],
 ["satellites","Satélites GPS","sat","#58bedf","⌖"],
 ["battery","Tensão da bateria","V","#98d85d","ϟ"],
 ["rain_probability","Chance de chuva","%","#37b9db","☁"],
 ["methane","Metano (CH₄)","ppm","#da9d48","♧"],
 ["co2","CO₂","ppm","#9fa5b8","◌"],
 ["ammonia","Amônia (NH₃)","µg/m³","#32d6b3","♧"],
 ["h2s","Sulfeto (H₂S)","ppb","#a98aef","♧"],
 ["precipitation","Precipitação","mm","#46b8ff","☂"]
];
const safe=s=>String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
let showStations=false,showTools=false,showMonitor=true,showTrend=false,showKpi=false,showEnergy=false;
let selectedMetric="temp";
const fmt=(v,u)=>v==null||v===""||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("pt-BR",{maximumFractionDigits:2})+(u?" "+u:"");
const record=()=>current()?latest(current()):null;
const lastDate=r=>r?.time?dateFmt(r.time):"Nenhuma leitura";
function stationStatus(){
 const station=current();
 if(!station)return "sem dados";
 const stateValue=status(station);
 return stateValue==="online"?"Online":stateValue==="offline"?"Offline":"Sem dados";
}
function stats(){
 const now=record(),stateName=stationStatus(),valid=now?.time&&Number.isFinite(Date.parse(now.time));
 const metricsHTML=metrics.map(([key,name,u,color,sign])=>{
  const v=now?.[key];
  return '<div class="eco-sensor-row"><span class="eco-sensor-name"><span class="eco-sensor-symbol" style="color:'+color+'">'+sign+'</span>'+name+'</span><strong style="color:'+color+'">'+fmt(v,u)+'</strong></div>';
 }).join("");
 const missing='<div class="eco-sensor-subnote">Variáveis não medidas pelo hardware não são simuladas. Dados externos, quando disponíveis, devem ser apresentados em camada separada.</div>';
 return '<div class="eco-panel-head"><b>Monitoramento</b><small>'+safe(current()?.name||"Sem estação")+'</small><button type="button" data-eco-close="monitor" title="Ocultar painel">×</button></div>'+
 '<div class="eco-sensor-list">'+metricsHTML+missing+'</div>'+
 '<div class="eco-monitor-foot"><span class="eco-dot '+(stateName==="Online"?"on":"off")+'"></span>'+stateName+'<span>Última transmissão: '+safe(valid?lastDate(now):"Indisponível")+'</span></div>';
}
function topStatus(){
 const r=record(),st=stationStatus(),t=r?.time?dateFmt(r.time):"Sem telemetria";
 return '<span class="eco-dot '+(st==="Online"?"on":"off")+'"></span><strong>'+st+'</strong><span class="eco-status-date">'+safe(t)+'</span>';
}
function microTrend(){
 const station=current(),m=metrics.find(x=>x[0]===selectedMetric)||metrics[0];
 // All samples currently loaded for this station, sorted by their actual timestamps.
 const all=(station?rows(station):[]).filter(x=>x[selectedMetric]!==null&&x[selectedMetric]!==""&&x[selectedMetric]!==undefined&&Number.isFinite(Number(x[selectedMetric]))&&Number.isFinite(Date.parse(x.time))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
 if(!all.length)return '<div class="eco-trend-empty"><strong>Sem medições disponíveis</strong><p>Este sensor não possui dados válidos no histórico carregado.</p></div>';
 const endTime=Date.parse(all[all.length-1].time),firstTime=Date.parse(all[0].time);
 const days={"24h":86400000,"7d":604800000,"30d":2592000000,"all":Infinity}[trendPeriod]||Infinity;
 const begin=Number.isFinite(days)?Math.max(firstTime,endTime-days):firstTime;
 const actual=all.filter(r=>Date.parse(r.time)>=begin);
 const chosen=actual.length?actual:all;
 const values=chosen.map(x=>Number(x[selectedMetric]));
 const minVal=Math.min(...values),maxVal=Math.max(...values);
 const avg=values.reduce((a,b)=>a+b,0)/values.length,margin=Math.max((maxVal-minVal)*.12,Math.max(Math.abs(avg)*.008,.3));
 const lo=minVal-margin,hi=maxVal+margin;
 const W=660,H=246,plot={x:62,y:17,w:576,h:173};
 const tf=t=>plot.x+(t-Date.parse(chosen[0].time))/Math.max(1,Date.parse(chosen[chosen.length-1].time)-Date.parse(chosen[0].time))*plot.w;
 const vf=v=>plot.y+plot.h-(v-lo)/(hi-lo)*plot.h;
 const gapMs=chosen.slice(1).map((x,i)=>Date.parse(x.time)-Date.parse(chosen[i].time)).filter(x=>x>0).sort((a,b)=>a-b);
 const median=gapMs.length?gapMs[Math.floor(gapMs.length/2)]:600000;
 const gapLimit=Math.max(25*60000,median*2.5);
 const groups=[];let group=[],prev=NaN,gaps=0;
 for(const row of chosen){const t=Date.parse(row.time);if(group.length&&t-prev>gapLimit){groups.push(group);group=[];gaps++;}group.push(row);prev=t;}
 if(group.length)groups.push(group);
 const segments=groups.map(g=>g.map((r,i)=>(i?"L":"M")+tf(Date.parse(r.time)).toFixed(1)+","+vf(Number(r[selectedMetric])).toFixed(1)).join(" "));
 const charts=segments.map(s=>'<path d="'+s+'" fill="none" stroke="'+m[3]+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>').join("");
 const yGrid=Array.from({length:5},(_,i)=>{const val=hi-(hi-lo)*i/4,y=plot.y+plot.h*i/4;return '<line x1="'+plot.x+'" y1="'+y+'" x2="'+(plot.x+plot.w)+'" y2="'+y+'" stroke="currentColor" stroke-opacity=".14"/><text x="'+(plot.x-10)+'" y="'+(y+4)+'" text-anchor="end" fill="currentColor" font-size="11">'+Number(val).toLocaleString("pt-BR",{maximumFractionDigits:1})+'</text>';}).join("");
 const xGrid=Array.from({length:4},(_,i)=>{const t=Date.parse(chosen[0].time)+(Date.parse(chosen[chosen.length-1].time)-Date.parse(chosen[0].time))*i/3,x=plot.x+plot.w*i/3;return '<text x="'+x+'" y="'+(H-19)+'" text-anchor="'+(i===0?"start":i===3?"end":"middle")+'" fill="currentColor" font-size="11">'+safe(new Date(t).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",timeZone:"America/Fortaleza"}))+'</text>';}).join("");
 const trendStats='<div class="eco-trend-stats"><span><small>Mínima</small><b>'+fmt(minVal,m[2])+'</b></span><span><small>Média</small><b>'+fmt(avg,m[2])+'</b></span><span><small>Máxima</small><b>'+fmt(maxVal,m[2])+'</b></span></div>';
 const svg='<div class="eco-trend-chart-head"><div><span class="eco-trend-chart-dot" style="background:'+m[3]+'"></span><strong>'+safe(m[1])+'</strong><small>· '+safe(m[2])+'</small></div><span class="eco-trend-data-label">MEDIÇÕES REAIS</span></div><div class="eco-trend-plot"><svg viewBox="0 0 '+W+' '+H+'" id="ecoTrendSvg" aria-label="Série temporal de '+safe(m[1])+' com datas e escala" role="img">'+yGrid+xGrid+charts+'<line id="ecoTrendCursor" x1="0" x2="0" y1="'+plot.y+'" y2="'+(plot.y+plot.h)+'" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity="0"/><rect id="ecoTrendHit" x="'+plot.x+'" y="'+plot.y+'" width="'+plot.w+'" height="'+plot.h+'" fill="transparent"/></svg><div id="ecoTrendTooltip" class="eco-trend-tooltip" hidden></div></div>';
 const dates=chosen[0]&&chosen[chosen.length-1]?new Date(chosen[0].time).toLocaleDateString("pt-BR",{timeZone:"America/Fortaleza"})+" – "+new Date(chosen[chosen.length-1].time).toLocaleDateString("pt-BR",{timeZone:"America/Fortaleza"}):"";
 return svg+trendStats+'<p class="eco-trend-footnote">'+chosen.length.toLocaleString("pt-BR")+' amostras no período · '+safe(dates)+(gaps?' · '+gaps+' interrupção(ões) representadas por espaços':'')+'</p>';
}
let trendPeriod="all";
function wireTrendInteractions(){
 const svg=document.getElementById("ecoTrendSvg"),hit=document.getElementById("ecoTrendHit"),tooltip=document.getElementById("ecoTrendTooltip"),cursor=document.getElementById("ecoTrendCursor");
 if(!svg||!hit||!tooltip||!cursor)return;
 const s=current(),all=(s?rows(s):[]).filter(x=>x[selectedMetric]!=null&&x[selectedMetric]!==""&&Number.isFinite(Number(x[selectedMetric]))&&Number.isFinite(Date.parse(x.time))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
 if(!all.length)return;
 const ends=Date.parse(all[all.length-1].time);
 const span={"24h":86400000,"7d":604800000,"30d":2592000000,"all":Infinity}[trendPeriod]||Infinity;
 const chosen=all.filter(r=>Date.parse(r.time)>=(Number.isFinite(span)?ends-span:-Infinity));
 if(!chosen.length)return;
 const t0=Date.parse(chosen[0].time),t1=Date.parse(chosen[chosen.length-1].time);
 const scale=660/Math.max(svg.getBoundingClientRect().width,1);
 const move=e=>{
  const box=svg.getBoundingClientRect(),x=Math.max(62,Math.min(638,(e.clientX-box.left)*660/Math.max(box.width,1)));
  const t=t0+(x-62)/576*(t1-t0);
  let low=0,high=chosen.length-1;
  while(low<high){const mid=(low+high)>>1;if(Date.parse(chosen[mid].time)<t)low=mid+1;else high=mid;}
  const ix=low>0&&Math.abs(Date.parse(chosen[low-1].time)-t)<Math.abs(Date.parse(chosen[low].time)-t)?low-1:low;
  const row=chosen[ix],xActual=62+(Date.parse(row.time)-t0)/Math.max(1,t1-t0)*576;
  cursor.setAttribute("x1",xActual);cursor.setAttribute("x2",xActual);cursor.setAttribute("opacity","1");
  tooltip.hidden=false;
  tooltip.textContent=new Date(row.time).toLocaleString("pt-BR",{timeZone:"America/Fortaleza"})+" • "+fmt(row[selectedMetric],(metrics.find(x=>x[0]===selectedMetric)||metrics[0])[2]);
 };
 hit.addEventListener("pointermove",move);
 hit.addEventListener("pointerdown",move);
 hit.addEventListener("pointerleave",()=>{cursor.setAttribute("opacity","0");tooltip.hidden=true});
}
function renderImmersivePage(){
 const canAddStation=["admin","client","collaborator"].includes(window.ECOSENSE_AUTH_ROLE);
 const addStationAction=canAddStation?'<button type="button" class="eco-map-chip eco-add-station-top" data-add-station="1" title="Cadastrar uma nova estação">＋ Adicionar estação</button>':"";
 const stationList=state.stations.map(s=>'<option value="'+safe(s.id)+'" '+(s.id===state.selected?"selected":"")+'>'+safe(s.name)+'</option>').join("");
 return '<div class="full-map-layout eco-immersive" id="mapLayout">'+
 '<div class="map-main"><div id="mapCanvas"></div></div>'+
 '<div class="eco-map-top-left"><button type="button" class="eco-map-chip eco-mobile-menu" data-eco-menu>☰ Menu</button><button type="button" class="eco-map-chip eco-theme-map" id="ecoThemeMap" aria-label="Alternar tema" title="Alternar entre claro e escuro">☀ <span>Claro</span></button><button type="button" class="eco-map-chip" data-eco-toggle="stations">☷ Estações</button>'+addStationAction+'<button type="button" class="eco-map-chip" data-eco-toggle="kpis">▦ KPIs</button><button type="button" class="eco-map-chip" data-eco-toggle="energy">ϟ Energia</button><button type="button" class="eco-map-chip" data-eco-toggle="tools">⚙ Camadas</button></div>'+
 '<div class="eco-center-status" id="ecoLiveStatus">'+topStatus()+'</div>'+
 '<div class="eco-map-right-toggle '+(showMonitor?"":"is-visible")+'"><button type="button" class="eco-map-chip" data-eco-toggle="monitor">☷ Monitoramento</button></div>'+
 '<div class="eco-map-panel eco-station-panel" id="ecoStations" '+(showStations?"":"hidden")+'><div class="eco-panel-head"><b>Estações EcoSense</b><button type="button" data-eco-close="stations">×</button></div>'+(canAddStation?'<button type="button" class="eco-add-station-panel" data-add-station="1">＋ Adicionar nova estação</button>':"")+'<label class="field">Selecionar estação<select id="ecoStationSelect">'+stationList+'</select></label><div class="eco-station-summary">'+state.stations.length+' estações cadastradas · '+state.stations.filter(x=>status(x)==="online").length+' online</div><div class="eco-station-extras">'+mapSidebar()+'</div></div>'+
 '<div class="eco-map-panel eco-tool-panel" id="ecoTools" '+(showTools?"":"hidden")+'><div class="eco-panel-head"><b>Camadas e ferramentas</b><button type="button" data-eco-close="tools">×</button></div>'+toolsMap()+'</div>'+
 '<div class="eco-map-panel eco-monitor-panel" id="ecoMonitor" '+(showMonitor?"":"hidden")+'>'+stats()+'</div>'+
 '<div class="eco-map-panel eco-kpi-panel" id="ecoKpis" '+(showKpi?"":"hidden")+'><div class="eco-panel-head"><b>Indicadores</b><button data-eco-close="kpis">×</button></div><p>Estação: '+safe(current()?.name||"—")+'</p><div class="eco-mini-value">Temperatura <strong>'+fmt(record()?.temp,"°C")+'</strong></div><div class="eco-mini-value">Umidade <strong>'+fmt(record()?.humidity,"%")+'</strong></div><div class="eco-mini-value">Pressão <strong>'+fmt(record()?.pressure,"hPa")+'</strong></div></div>'+
 '<div class="eco-map-panel eco-energy-panel" id="ecoEnergy" '+(showEnergy?"":"hidden")+'><div class="eco-panel-head"><b>Energia</b><button data-eco-close="energy">×</button></div><div class="eco-mini-value">Tensão da bateria <strong>'+fmt(record()?.battery,"V")+'</strong></div><p>Disponibilidade condicionada à telemetria do hardware.</p></div>'+
 '<div class="eco-map-bottom"><button type="button" class="eco-map-chip" data-eco-toggle="trends">▥ Tendências '+(showTrend?"⌄":"⌃")+'</button></div>'+
 '<div class="eco-map-panel eco-trend-panel" id="ecoTrends" '+(showTrend?"":"hidden")+'><div class="eco-panel-head eco-trend-header"><div class="eco-trend-heading"><span class="eco-trend-eyebrow">ANÁLISE DE TELEMETRIA</span><b>Tendências da estação</b><small>'+safe(current()?.name||"Estação não selecionada")+'</small></div><button type="button" class="eco-trend-close" data-eco-close="trends" aria-label="Fechar tendências">×</button></div><div class="eco-trend-filters"><label class="field">Variável<select id="ecoTrendMetric">'+metrics.map(m=>'<option value="'+m[0]+'" '+(selectedMetric===m[0]?"selected":"")+'>'+m[1]+'</option>').join("")+'</select></label><label class="field">Período<select id="ecoTrendPeriod"><option value="24h" '+(trendPeriod==="24h"?"selected":"")+'>24 horas</option><option value="7d" '+(trendPeriod==="7d"?"selected":"")+'>7 dias</option><option value="30d" '+(trendPeriod==="30d"?"selected":"")+'>30 dias</option><option value="all" '+(trendPeriod==="all"?"selected":"")+'>Todo o histórico carregado</option></select></label></div><div id="ecoTrendContent">'+microTrend()+'</div><div class="eco-trend-footer"><span>Dados disponíveis na plataforma</span><button class="eco-chart-link" data-go="analises">Explorar análises <span aria-hidden="true">↗</span></button></div></div>'+
 '<div class="eco-map-attribution">EcoSenseMonitor · Leituras reais · Mapas Esri / OpenStreetMap</div>'+
 '</div>';
}
// A tabela de rotas mantém a referência antiga; atualizar a entrada também é obrigatório.
mapaPage=renderImmersivePage;
if(window.pages?.mapa)window.pages.mapa[2]=renderImmersivePage;
else if(typeof pages!=="undefined"&&pages.mapa)pages.mapa[2]=renderImmersivePage;
const baseInitMap=initMap;
initMap=function(){
 baseInitMap();
 if(!map)return;
 const geo=state.stations.filter(s=>s.lat!=null&&s.lon!=null&&Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lon)));
 if(geo.length===1)map.setView([Number(geo[0].lat),Number(geo[0].lon)],9,{animate:false});
 else if(geo.length>1)map.fitBounds(geo.map(s=>[Number(s.lat),Number(s.lon)]),{padding:[60,85],maxZoom:9,animate:false});
 else map.setView([-2.54,-44.30],8,{animate:false});
 setTimeout(()=>map?.invalidateSize({pan:false}),320);
};
const originalRender=render;
render=function(...args){
 document.body.classList.toggle("eco-map-mode",route==="mapa");
 const result=originalRender(...args);
 applyTheme();
 if(route==="mapa"&&showTrend)requestAnimationFrame(wireTrendInteractions);
 return result;
};
// Estado persistente da navegação lateral, sem alterar os controles de acesso.
let sidebarCollapsed=false;
try{sidebarCollapsed=localStorage.getItem("ecosense_sidebar_collapsed")==="1"}catch{}
function resizeEcoMap(){
 if(route!=="mapa")return;
 requestAnimationFrame(()=>{try{map?.invalidateSize({pan:false})}catch{}});
}
function installSidebarToggle(){
 const side=document.querySelector(".sidebar"),brand=side?.querySelector(".brand");
 if(!side||!brand||side.querySelector("#ecoSidebarToggle"))return;
 const toggle=document.createElement("button");
 toggle.id="ecoSidebarToggle";
 toggle.type="button";
 toggle.className="eco-sidebar-toggle";
 toggle.setAttribute("aria-label","Recolher ou expandir menu lateral");
 toggle.title="Recolher ou expandir menu";
 toggle.innerHTML='<span aria-hidden="true">☰</span>';
 brand.insertAdjacentElement("afterend",toggle);
 toggle.addEventListener("click",()=>{
  sidebarCollapsed=!sidebarCollapsed;
  document.body.classList.toggle("eco-sidebar-collapsed",sidebarCollapsed);
  toggle.setAttribute("aria-expanded",String(!sidebarCollapsed));
  try{localStorage.setItem("ecosense_sidebar_collapsed",sidebarCollapsed?"1":"0")}catch{}
  setTimeout(resizeEcoMap,280);
 });
 document.body.classList.toggle("eco-sidebar-collapsed",sidebarCollapsed);
 toggle.setAttribute("aria-expanded",String(!sidebarCollapsed));
}
installSidebarToggle();

// Mobile drawer works across all routes; permissions remain inherited from #nav.
(function setupMobileNavigation(){
 const aside=document.querySelector(".sidebar");if(!aside)return;
 const backdrop=document.createElement("div");backdrop.className="eco-mobile-backdrop";backdrop.id="ecoMobileBackdrop";backdrop.setAttribute("aria-hidden","true");
 const openButton=document.createElement("button");openButton.id="ecoMobileNav";openButton.className="eco-mobile-nav";
 openButton.type="button";openButton.setAttribute("aria-label","Abrir menu de navegação");
 openButton.setAttribute("aria-expanded","false");openButton.innerHTML='<span aria-hidden="true">☰</span><span>Menu</span>';
 const closeButton=document.createElement("button");closeButton.type="button";closeButton.className="eco-mobile-close";
 closeButton.id="ecoMobileClose";closeButton.setAttribute("aria-label","Fechar menu");closeButton.textContent="×";
 document.body.append(backdrop,openButton);aside.prepend(closeButton);
 function openNav(){
  aside.classList.add("show");backdrop.classList.add("is-open");
  openButton.setAttribute("aria-expanded","true");
  document.body.classList.add("eco-mobile-drawer-open");
  closeButton.focus({preventScroll:true});
 }
 function closeNav(restore=false){
  aside.classList.remove("show");backdrop.classList.remove("is-open");
  document.body.classList.remove("eco-mobile-drawer-open");
  openButton.setAttribute("aria-expanded","false");
  if(restore&&route==="mapa")openButton.focus({preventScroll:true});
 }
 function small(){return window.matchMedia("(max-width:700px)").matches}
 openButton.addEventListener("click",()=>{aside.classList.contains("show")?closeNav(true):openNav()});
 closeButton.addEventListener("click",()=>closeNav(true));
 backdrop.addEventListener("click",()=>closeNav(true));
 document.addEventListener("click",e=>{
  if(!small())return;
  if(e.target.closest("#menuMobile")){
   e.preventDefault();e.stopImmediatePropagation();
   aside.classList.contains("show")?closeNav(true):openNav();
  }else if(e.target.closest("[data-eco-menu]")){
   e.preventDefault();e.stopImmediatePropagation();
   aside.classList.contains("show")?closeNav(true):openNav();
  }else if(e.target.closest(".sidebar [data-page]")||e.target.closest(".sidebar a")){
   closeNav();
  }
 },true);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&aside.classList.contains("show"))closeNav(true)});
 window.matchMedia("(min-width:701px)").addEventListener("change",e=>{if(e.matches)closeNav()});
})();

const panelIds={stations:"ecoStations",tools:"ecoTools",monitor:"ecoMonitor",trends:"ecoTrends",kpis:"ecoKpis",energy:"ecoEnergy"};
const flip={stations:()=>showStations=!showStations,tools:()=>showTools=!showTools,monitor:()=>showMonitor=!showMonitor,trends:()=>showTrend=!showTrend,kpis:()=>showKpi=!showKpi,energy:()=>showEnergy=!showEnergy};
function togglePanel(name,forceClose=false){
 if(!panelIds[name])return;
 const mobile=window.matchMedia("(max-width:700px)").matches;
 const wasOpen={stations:showStations,tools:showTools,monitor:showMonitor,trends:showTrend,kpis:showKpi,energy:showEnergy}[name];
 const open=!forceClose&&!wasOpen;
 // Submenus e tendências não dividem a mesma região do mapa.
 if(["stations","tools","kpis","energy","trends"].includes(name)){
  showStations=false;showTools=false;showKpi=false;showEnergy=false;showTrend=false;
 }
 if(mobile&&open)showMonitor=false;
 if(name==="monitor"){
  showMonitor=open;
  if(mobile&&open){showStations=false;showTools=false;showKpi=false;showEnergy=false;showTrend=false;}
 }
 if(name==="stations")showStations=open;
 if(name==="tools")showTools=open;
 if(name==="kpis")showKpi=open;
 if(name==="energy")showEnergy=open;
 if(name==="trends")showTrend=open;
 if(name==="trends"&&showTrend)requestAnimationFrame(wireTrendInteractions);
 const values={stations:showStations,tools:showTools,monitor:showMonitor,trends:showTrend,kpis:showKpi,energy:showEnergy};
 for(const [panel,visible] of Object.entries(values)){
  const node=document.getElementById(panelIds[panel]);
  if(node)node.hidden=!visible;
 }
 const reopen=document.querySelector(".eco-map-right-toggle");
 if(reopen)reopen.classList.toggle("is-visible",!showMonitor);
 setTimeout(()=>{if(map)map.invalidateSize({pan:false})},160);
}
document.addEventListener("click",e=>{
 if(e.target.closest("#ecoThemeMap")){
  e.preventDefault();e.stopImmediatePropagation();
  state.theme=state.theme==="light"?"dark":"light";
  applyTheme();
  return;
 }
 if(e.target.closest("[data-eco-menu]")){e.preventDefault();e.stopImmediatePropagation();document.querySelector(".sidebar")?.classList.toggle("show");return;}
 const close=e.target.closest("[data-eco-close]"),toggle=e.target.closest("[data-eco-toggle]");
 if(!close&&!toggle)return;
 e.preventDefault();e.stopImmediatePropagation();
 togglePanel(close?close.dataset.ecoClose:toggle.dataset.ecoToggle,!!close);
},true);
document.addEventListener("change",e=>{
 if(e.target.id==="ecoStationSelect"){
  state.selected=e.target.value;save();
  render();
  const s=current();if(map&&s?.lat!=null&&s?.lon!=null)map.setView([Number(s.lat),Number(s.lon)],12);
 }
 if(e.target.id==="ecoTrendMetric"||e.target.id==="ecoTrendPeriod"){
  if(e.target.id==="ecoTrendMetric")selectedMetric=e.target.value;
  else trendPeriod=e.target.value;
  const content=document.getElementById("ecoTrendContent");
  if(content){content.innerHTML=microTrend();wireTrendInteractions();}
 }
});
if(route==="mapa")render();
})();