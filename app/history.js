/* EcoSenseMonitor – consulta integral da série temporal no servidor.
   Interface pagina registros sem carregar toda a tabela no navegador. */
(function(){
"use strict";
const db=window.ecosenseClient;
if(!db)return;
const headers=["data_servidor","timestamp_recebimento","estacao_id","estacao_nome","temperatura_c","umidade_relativa_perc","pressao_atmosferica_hpa","altitude_m","acc_x","acc_y","acc_z","gyro_x","gyro_y","gyro_z","rssi","gps_fix","latitude","longitude","altitude_gps_m","velocidade_kmh","satellites","hdop","data_gps","hora_gps","estado_energia","evento_energia","ciclo_deepsleep","motivo_despertar","tempo_ativo_s","tempo_restante_ativo_s","tempo_sleep_programado_s","duracao_sleep_anterior_s","proximo_despertar_previsto","temperatura_bmp_c","status_bateria_v","indice_uv","nivel_co2","ch4_ppm","co2_ppm","nh3_ugm3","h2s_ppb","precipitacao_mm","probabilidade_chuva"];
const e=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let page=0,perPage=100,from=null,to=null,count=null,chartMetric="temp",seq=0,exporting=false;
const stations=()=>state.stations;
function historyPage(){
 return '<section class="card glass"><div class="panel-heading"><div><h2>Histórico completo da estação</h2><p>Todas as medições são mantidas no Supabase. Escolha um intervalo, navegue pelas páginas e explore os 43 campos originais.</p></div></div>'+
 '<div class="form-row"><label class="field">Estação<select id="historyStation">'+stations().map(s=>'<option value="'+e(s.id)+'" '+(s.id===state.selected?'selected':'')+'>'+e(s.name)+'</option>').join("")+'</select></label>'+
 '<label class="field">Data inicial<input type="date" id="historyFrom" value="'+e(from||"")+'"></label>'+
 '<label class="field">Data final<input type="date" id="historyTo" value="'+e(to||"")+'"></label>'+
 '<label class="field">Variável do gráfico<select id="historyMetric"><option value="temp" '+(chartMetric==="temp"?'selected':'')+'>Temperatura</option><option value="humidity" '+(chartMetric==="humidity"?'selected':'')+'>Umidade</option><option value="pressure" '+(chartMetric==="pressure"?'selected':'')+'>Pressão</option><option value="altitude" '+(chartMetric==="altitude"?'selected':'')+'>Altitude</option><option value="battery" '+(chartMetric==="battery"?'selected':'')+'>Bateria</option></select></label></div>'+
 '<div class="actions" style="flex-wrap:wrap;margin:12px 0"><button class="btn" id="historyApply">Aplicar filtros</button><button class="btn-secondary" id="historyAll">Todo o período</button><button class="btn-secondary" id="history7">Últimos 7 dias</button><button class="btn-secondary" id="history30">Últimos 30 dias</button><button class="btn-secondary" id="historyExport">Exportar CSV do período</button></div>'+
 '<div class="info-flag" id="historyStatus" role="status">Consultando servidor...</div></section>'+
 '<section class="card glass" style="margin-top:18px"><div class="panel-heading"><div><h2>Visualização temporal</h2><p id="historyChartDescription">Série agregada por intervalo, preservando a contagem integral de observações.</p></div></div><div id="historyChart" class="chart-wrap">Carregando...</div></section>'+
 '<section class="card glass" style="margin-top:18px"><div class="panel-heading"><div><h2>Registros individuais</h2><p>As linhas abaixo correspondem às medições originais; abra os detalhes para consultar todas as colunas.</p></div></div>'+
 '<div id="historyTable" class="table-wrap">Carregando...</div>'+
 '<div class="actions" style="margin:18px 0;justify-content:space-between;align-items:center"><button class="btn-secondary" id="historyPrevious">← Anterior</button><span id="historyPageLabel">Página 1</span><button class="btn-secondary" id="historyNext">Próxima →</button></div></section>';
}
pages.historico=["Histórico integral","Consulta de toda a série desde a primeira medição, com filtros e exportação.",historyPage];
const nav=document.querySelector("#nav");
if(nav){const b=document.createElement("button");b.dataset.page="historico";b.innerHTML="<span>▤</span> Histórico integral";nav.append(b)}
const isoStart=d=>d?new Date(d+"T00:00:00-03:00").toISOString():null;
const isoEnd=d=>d?new Date(d+"T23:59:59.999-03:00").toISOString():null;
function selectedStation(){return stations().find(s=>s.id===state.selected)}
function queryRange(q){if(from)q=q.gte("measured_at",isoStart(from));if(to)q=q.lte("measured_at",isoEnd(to));return q}
async function loadHistory(){
 if(route!=="historico")return;
 const mySeq=++seq,station=selectedStation();
 if(!station?.uuid){document.querySelector("#historyStatus").textContent="Esta estação ainda não está cadastrada no servidor.";return}
 const status=document.querySelector("#historyStatus");
 status.textContent="Consultando a série histórica no Supabase...";
 try{
  const opts={p_station:station.uuid,p_from:isoStart(from),p_to:isoEnd(to),p_bins:1000};
  let q=db.from("timeline_readings").select("source_row,measured_at,temperature_c,humidity_pct,pressure_hpa,altitude_m,battery_v,latitude,longitude,raw_values",{count:"exact"}).eq("station_id",station.uuid);
  q=queryRange(q).order("measured_at",{ascending:false}).range(page*perPage,(page+1)*perPage-1);
  const [chart,list]=await Promise.all([db.rpc("history_chart",opts),q]);
  if(mySeq!==seq||route!=="historico")return;
  if(chart.error)throw chart.error;if(list.error)throw list.error;
  count=list.count||0;
  const points=(chart.data||[]).map(r=>({time:r.measured_at,temp:r.temperature_c,humidity:r.humidity_pct,pressure:r.pressure_hpa,altitude:r.altitude_m,battery:r.battery_v}));
  document.querySelector("#historyChart").innerHTML=points.length?svgChart(points,[chartMetric],[{temp:"#46e7a5",humidity:"#29aef0",pressure:"#ffae23",altitude:"#c69af6",battery:"#85e7fa"}[chartMetric]],260):'<p>Não existem medições neste período.</p>';
  const counted=(chart.data||[]).reduce((n,r)=>n+Number(r.readings_count||0),0);
  status.textContent=count.toLocaleString("pt-BR")+" registros neste intervalo, de "+station.name+". "+points.length+" intervalos no gráfico, representando "+counted.toLocaleString("pt-BR")+" medições.";
  document.querySelector("#historyChartDescription").textContent="O gráfico usa agregações do banco; cada ponto representa a média de um intervalo. Para valores individuais, consulte a tabela.";
  const tbody=(list.data||[]).map(r=>{
   const fields=Array.isArray(r.raw_values)?r.raw_values:(r.raw_values&&typeof r.raw_values==="object"?headers.map(h=>r.raw_values[h]??""):[]);
   const detail=fields.length?'<details><summary>Consultar campos</summary><div style="padding:12px;max-height:280px;overflow:auto"><table><tbody>'+headers.map((h,i)=>'<tr><th>'+e(h)+'</th><td>'+e(fields[i]??"—")+'</td></tr>').join("")+'</tbody></table></div></details>':'Registro transmitido após a importação da planilha';
   return '<tr><td>'+e(r.source_row??"Recente")+'</td><td>'+e(dateFmt(r.measured_at))+'</td><td>'+unit(r.temperature_c," °C")+'</td><td>'+unit(r.humidity_pct," %")+'</td><td>'+unit(r.pressure_hpa," hPa")+'</td><td>'+unit(r.altitude_m," m")+'</td><td>'+detail+'</td></tr>'
  }).join("");
  document.querySelector("#historyTable").innerHTML='<table><thead><tr><th>Linha</th><th>Data e hora</th><th>Temperatura</th><th>UR</th><th>Pressão</th><th>Altitude</th><th>Dados originais</th></tr></thead><tbody>'+ (tbody||'<tr><td colspan="7">Nenhum registro no intervalo.</td></tr>') +'</tbody></table>';
  document.querySelector("#historyPageLabel").textContent="Página "+(page+1)+" de "+Math.max(1,Math.ceil(count/perPage));
  document.querySelector("#historyPrevious").disabled=page===0;
  document.querySelector("#historyNext").disabled=(page+1)*perPage>=count;
 }catch(err){if(mySeq===seq){status.textContent="Falha na consulta: "+err.message;console.error(err)}}
}
async function exportCSV(){
 if(exporting)return;exporting=true;
 const station=selectedStation(),status=document.querySelector("#historyStatus");
 if(!station){exporting=false;return}
 const first=["linha_planilha",...headers].join(";");
 const rows=[first];
 const csv=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 let cursor=0;
 try{
  while(true){
   let q=db.from("timeline_readings").select("source_row,measured_at,raw_values,temperature_c,humidity_pct,pressure_hpa,altitude_m,battery_v,latitude,longitude").eq("station_id",station.uuid);
   const {data,error}=await queryRange(q).order("measured_at",{ascending:true}).range(cursor,cursor+999);
   if(error)throw error;if(!data.length)break;
   for(const x of data){
    const fields=Array.isArray(x.raw_values)?x.raw_values:(x.raw_values&&typeof x.raw_values==="object"?headers.map(h=>x.raw_values[h]??""):Array(headers.length).fill(""));
    if(!x.raw_values){fields[0]=x.measured_at;fields[4]=x.temperature_c;fields[5]=x.humidity_pct;fields[6]=x.pressure_hpa;fields[7]=x.altitude_m;fields[16]=x.latitude;fields[17]=x.longitude;fields[34]=x.battery_v}
    rows.push([x.source_row??"",...fields].map(csv).join(";"));
   }
   cursor+=data.length;
   if(status)status.textContent="Preparando CSV: "+cursor.toLocaleString("pt-BR")+" registros...";
   if(data.length<1000)break;
   if(cursor>=1000000)throw Error("Limite de 1 milhão de registros por exportação");
  }
  const blob=new Blob(["\uFEFF",rows.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="EcoSenseMonitor_"+(from||"inicio")+"_"+(to||"atual")+".csv";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000);
  if(status)status.textContent="Exportação concluída: "+cursor.toLocaleString("pt-BR")+" registros, sem truncamento.";
 }catch(error){if(status)status.textContent="Falha na exportação: "+error.message}
 finally{exporting=false}
}
document.addEventListener("click",ev=>{
 const b=ev.target.closest("#historyApply,#historyAll,#history7,#history30,#historyPrevious,#historyNext,#historyExport");
 if(!b)return;ev.preventDefault();
 if(b.id==="historyApply"){from=document.querySelector("#historyFrom").value||null;to=document.querySelector("#historyTo").value||null;page=0;loadHistory()}
 if(b.id==="historyAll"){from=null;to=null;page=0;render();loadHistory()}
 if(b.id==="history7"||b.id==="history30"){const days=b.id==="history7"?7:30;const d=new Date();d.setDate(d.getDate()-days);from=d.toLocaleDateString("en-CA",{timeZone:"America/Fortaleza"});to=null;page=0;render();loadHistory()}
 if(b.id==="historyPrevious"&&page>0){page--;loadHistory()}
 if(b.id==="historyNext"&&(page+1)*perPage<count){page++;loadHistory()}
 if(b.id==="historyExport")exportCSV();
});
document.addEventListener("change",ev=>{
 if(ev.target.id==="historyStation"){state.selected=ev.target.value;page=0;loadHistory()}
 if(ev.target.id==="historyMetric"){chartMetric=ev.target.value;loadHistory()}
});
const oldRender=render;
render=function(){oldRender();if(route==="historico")loadHistory()};
window.ECOSENSE_HISTORY={refresh:loadHistory};
})();