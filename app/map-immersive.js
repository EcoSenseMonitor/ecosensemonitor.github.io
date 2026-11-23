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
 ["battery","Tensão da bateria","V","#98d85d","ϟ"]
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
 const station=current();
 const vals=(station?rows(station):[]).filter(x=>x[selectedMetric]!=null&&Number.isFinite(Number(x[selectedMetric]))&&Number.isFinite(Date.parse(x.time))).slice(-140);
 const m=metrics.find(x=>x[0]===selectedMetric),color=m?.[3]||"#3ed5c7";
 if(vals.length<2)return '<div class="eco-no-trend">Sem pontos suficientes para a tendência selecionada.</div>';
 const v=vals.map(x=>Number(x[selectedMetric]));const min=Math.min(...v),max=Math.max(...v);
 const start=Date.parse(vals[0].time),end=Date.parse(vals[vals.length-1].time),span=Math.max(1,end-start);
 const y=num=>74-((num-min)/Math.max(.0001,max-min))*58;
 const times=vals.map(x=>Date.parse(x.time));
 const deltas=times.slice(1).map((t,i)=>t-times[i]).filter(n=>n>0).sort((a,b)=>a-b);
 const median=deltas.length?deltas[Math.floor(deltas.length/2)]:600000;
 const threshold=Math.max(25*60000,median*2.5);
 let previous=null;
 const path=vals.map((r,i)=>{const t=Date.parse(r.time);const cmd=previous===null||t-previous>threshold?"M":"L";previous=t;return cmd+(12+(t-start)/span*336).toFixed(1)+","+y(Number(r[selectedMetric])).toFixed(1)}).join(" ");
 return '<svg viewBox="0 0 360 96" role="img" aria-label="Tendência das últimas amostras disponíveis"><path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2.8" stroke-linecap="round"/></svg><div class="eco-trend-info">'+fmt(v[0],m[2])+' → '+fmt(v[v.length-1],m[2])+' · '+vals.length+' amostras disponíveis</div>';
}
function renderImmersivePage(){
 const stationList=state.stations.map(s=>'<option value="'+safe(s.id)+'" '+(s.id===state.selected?"selected":"")+'>'+safe(s.name)+'</option>').join("");
 return '<div class="full-map-layout eco-immersive" id="mapLayout">'+
 '<div class="map-main"><div id="mapCanvas"></div></div>'+
 '<div class="eco-map-top-left"><button type="button" class="eco-map-chip" data-eco-toggle="stations">☷ Estações</button><button type="button" class="eco-map-chip" data-eco-toggle="kpis">▦ KPIs</button><button type="button" class="eco-map-chip" data-eco-toggle="energy">ϟ Energia</button><button type="button" class="eco-map-chip" data-eco-toggle="tools">⚙ Camadas</button></div>'+
 '<div class="eco-center-status" id="ecoLiveStatus">'+topStatus()+'</div>'+
 '<div class="eco-map-right-toggle"><button type="button" class="eco-map-chip" data-eco-toggle="monitor">☷ Monitoramento</button></div>'+
 '<div class="eco-map-panel eco-station-panel" id="ecoStations" '+(showStations?"":"hidden")+'><div class="eco-panel-head"><b>Estações EcoSense</b><button type="button" data-eco-close="stations">×</button></div><label class="field">Selecionar estação<select id="ecoStationSelect">'+stationList+'</select></label><div class="eco-station-summary">'+state.stations.length+' estações cadastradas · '+state.stations.filter(x=>status(x)==="online").length+' online</div><div class="eco-station-extras">'+mapSidebar()+'</div></div>'+
 '<div class="eco-map-panel eco-tool-panel" id="ecoTools" '+(showTools?"":"hidden")+'><div class="eco-panel-head"><b>Camadas e ferramentas</b><button type="button" data-eco-close="tools">×</button></div>'+toolsMap()+'</div>'+
 '<div class="eco-map-panel eco-monitor-panel" id="ecoMonitor" '+(showMonitor?"":"hidden")+'>'+stats()+'</div>'+
 '<div class="eco-map-panel eco-kpi-panel" id="ecoKpis" '+(showKpi?"":"hidden")+'><div class="eco-panel-head"><b>Indicadores</b><button data-eco-close="kpis">×</button></div><p>Estação: '+safe(current()?.name||"—")+'</p><div class="eco-mini-value">Temperatura <strong>'+fmt(record()?.temp,"°C")+'</strong></div><div class="eco-mini-value">Umidade <strong>'+fmt(record()?.humidity,"%")+'</strong></div><div class="eco-mini-value">Pressão <strong>'+fmt(record()?.pressure,"hPa")+'</strong></div></div>'+
 '<div class="eco-map-panel eco-energy-panel" id="ecoEnergy" '+(showEnergy?"":"hidden")+'><div class="eco-panel-head"><b>Energia</b><button data-eco-close="energy">×</button></div><div class="eco-mini-value">Tensão da bateria <strong>'+fmt(record()?.battery,"V")+'</strong></div><p>Disponibilidade condicionada à telemetria do hardware.</p></div>'+
 '<div class="eco-map-bottom"><button type="button" class="eco-map-chip" data-eco-toggle="trends">▥ Tendências '+(showTrend?"⌄":"⌃")+'</button></div>'+
 '<div class="eco-map-panel eco-trend-panel" id="ecoTrends" '+(showTrend?"":"hidden")+'><div class="eco-panel-head"><b>Tendências temporais</b><button data-eco-close="trends">×</button></div><label class="field">Variável<select id="ecoTrendMetric">'+metrics.map(m=>'<option value="'+m[0]+'" '+(selectedMetric===m[0]?"selected":"")+'>'+m[1]+'</option>').join("")+'</select></label><div id="ecoTrendContent">'+microTrend()+'</div><button class="eco-chart-link" data-go="analises">Abrir análises interativas</button></div>'+
 '<div class="eco-map-attribution">EcoSenseMonitor · Leituras reais · Mapas Esri / OpenStreetMap</div>'+
 '</div>';
}
mapaPage=renderImmersivePage;
const originalRender=render;
render=function(...args){
 document.body.classList.toggle("eco-map-mode",route==="mapa");
 return originalRender(...args);
};
const panelIds={stations:"ecoStations",tools:"ecoTools",monitor:"ecoMonitor",trends:"ecoTrends",kpis:"ecoKpis",energy:"ecoEnergy"};
const flip={stations:()=>showStations=!showStations,tools:()=>showTools=!showTools,monitor:()=>showMonitor=!showMonitor,trends:()=>showTrend=!showTrend,kpis:()=>showKpi=!showKpi,energy:()=>showEnergy=!showEnergy};
function togglePanel(name,forceClose=false){
 if(!panelIds[name])return;
 if(forceClose){if(name==="stations")showStations=false;if(name==="tools")showTools=false;if(name==="monitor")showMonitor=false;if(name==="trends")showTrend=false;if(name==="kpis")showKpi=false;if(name==="energy")showEnergy=false}
 else flip[name]();
 const values={stations:showStations,tools:showTools,monitor:showMonitor,trends:showTrend,kpis:showKpi,energy:showEnergy};
 document.getElementById(panelIds[name])?.toggleAttribute("hidden",!values[name]);
 setTimeout(()=>map?.invalidateSize({pan:false}),100);
}
document.addEventListener("click",e=>{
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
 if(e.target.id==="ecoTrendMetric"){
  selectedMetric=e.target.value;
  const content=document.getElementById("ecoTrendContent");
  if(content)content.innerHTML=microTrend();
 }
});
if(route==="mapa")render();
})();