/* EcoSenseMonitor Cloud: Supabase como fonte central; v4.0 */
(function(){
"use strict";
const client=window.ecosenseClient;
if(!client){console.error("Autenticação não inicializada");return}
const admin=window.ECOSENSE_AUTH_ROLE==="admin";
const role=window.ECOSENSE_AUTH_ROLE;
const stationManager=admin||role==="client"||role==="collaborator";
const myUserId=window.ecosenseSession?.user?.id;
const escCloud=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const el=s=>document.querySelector(s);
let stationRecords=[],importing=false,loading=false;
function fromStation(x){return {id:x.station_code,uuid:x.id,name:x.name,lat:x.latitude,lon:x.longitude,endpoint:x.source_url||"",owner:x.owner_user_id||"EcoSense",owner_user_id:x.owner_user_id,created:x.created_at}}
function fromReading(x){return {station:x.station_id,time:x.measured_at,temp:x.temperature_c,humidity:x.humidity_pct,pressure:x.pressure_hpa,altitude:x.altitude_m,battery:x.battery_v,rssi:x.rssi,satellites:x.satellites,latitude:x.latitude,longitude:x.longitude}}
async function cloudLoad(silent=false){
 if(loading)return;loading=true;
 try{
  const {data:stations,error}=await client.from("stations").select("id,station_code,name,description,latitude,longitude,created_at,updated_at,owner_user_id,is_active").order("station_code");
  if(error)throw error;
  stationRecords=stations||[];
  state.stations=stationRecords.map(fromStation);
  state.readings={};
  let total=0,firstTime=null,lastTime=null,lastSnapshot=null;
  for(const station of stationRecords){
    const [chart,summary,latestResult]=await Promise.all([
      client.rpc("history_chart",{p_station:station.id,p_from:null,p_to:null,p_bins:1200}),
      client.rpc("history_summary",{p_station:station.id}),
      client.from("timeline_readings").select("station_id,measured_at,temperature_c,humidity_pct,pressure_hpa,altitude_m,battery_v,latitude,longitude")
        .eq("station_id",station.id).order("measured_at",{ascending:false}).limit(1)
    ]);
    if(chart.error)throw chart.error;
    if(summary.error)throw summary.error;
    if(latestResult.error)throw latestResult.error;
    const sample=(chart.data||[]).map(fromReading);
    const newest=latestResult.data?.[0]?fromReading(latestResult.data[0]):null;
    if(newest&&!sample.some(x=>x.time===newest.time))sample.push(newest);
    state.readings[station.station_code]=sample.sort((a,b)=>a.time.localeCompare(b.time));
    const stats=summary.data||{};
    total+=Number(stats.count||0);
    if(stats.first_time&&(!firstTime||stats.first_time<firstTime))firstTime=stats.first_time;
    if(stats.last_time&&(!lastTime||stats.last_time>lastTime))lastTime=stats.last_time;
    if(!lastSnapshot)lastSnapshot=stats.stats||null;
    const st=state.stations.find(x=>x.id===station.station_code);
    if(st&&(st.lat==null||st.lon==null)){
      const gps=[...state.readings[station.station_code]].reverse().find(x=>x.latitude!=null&&x.longitude!=null);
      if(gps){st.lat=gps.latitude;st.lon=gps.longitude}
    }
  }
  if(!state.stations.some(x=>x.id===state.selected))state.selected=state.stations[0]?.id||null;
  state.events=state.events.filter(e=>e.station!=="loading");
  cloudSnapshot={count:total,first_time:firstTime,last_time:lastTime,stats:lastSnapshot||{}};
  render();
  if(el("#statusText"))el("#statusText").textContent="Supabase · "+total.toLocaleString("pt-BR")+" registros";
  if(el("#statusDot"))el("#statusDot").classList.toggle("live",Boolean(lastTime&&Date.now()-Date.parse(lastTime)<25*60*1000));
  if(!silent)toast("Histórico completo consultado no Supabase.");
 }catch(err){console.error("EcoSense cloud",err);if(!silent)toast("Erro ao consultar histórico: "+err.message,true)}
 finally{loading=false}
}
async function saveStation(form,previous){
 const get=n=>String(form.elements[n]?.value||"").trim();
 const code=get("id");
 if(!/^[a-zA-Z0-9_-]{2,100}$/.test(code))throw Error("Identificador inválido");
 const lat=get("lat")?Number(get("lat")):null,lon=get("lon")?Number(get("lon")):null;
 if(lat!=null&&Math.abs(lat)>90||lon!=null&&Math.abs(lon)>180)throw Error("Coordenadas inválidas");
 const endpoint=admin?get("endpoint"):"";
 if(endpoint){const u=new URL(endpoint);if(u.protocol!=="https:"||u.hostname!=="script.google.com"||!u.pathname.startsWith("/macros/s/"))throw Error("Endpoint deve ser Google Apps Script HTTPS")}
 const row={station_code:code,name:get("name"),latitude:lat,longitude:lon};
 if(!previous)row.owner_user_id=myUserId;
 if(admin&&endpoint)row.source_url=endpoint;
 if(!row.name)throw Error("Informe nome da estação");
 let q=client.from("stations");
 const result=previous?await q.update(row).eq("id",previous.uuid):await q.insert(row);
 if(result.error)throw result.error;
 await cloudLoad(true);
}
stationModal=function(previous=null){
 if(!stationManager)return toast("Seu perfil permite somente visualizar dados.",true);
 if(previous&&!admin&&previous.owner_user_id!==myUserId)return toast("Você só pode alterar suas estações.",true);
 const box=document.createElement("div");box.className="modal-backdrop";box.id="stationDialog";
 box.innerHTML='<div class="modal"><h2>'+(previous?"Editar estação":"Nova estação")+'</h2><form id="stationCloudForm"><div class="stack">'+
 '<label class="field">Identificador<input required name="id" maxlength="100" '+(previous?"readonly":"")+' value="'+escCloud(previous?.id||"")+'" placeholder="estacao-02"></label>'+
 '<label class="field">Nome<input required name="name" maxlength="150" value="'+escCloud(previous?.name||"")+'"></label>'+
 '<label class="field">Latitude<input name="lat" type="number" step="any" value="'+escCloud(previous?.lat??"")+'"></label>'+
 '<label class="field">Longitude<input name="lon" type="number" step="any" value="'+escCloud(previous?.lon??"")+'"></label>'+
 '<label class="field" style="'+(admin?"":"display:none")+'">Endpoint Google Apps Script (admin)<input name="endpoint" type="url" value="" placeholder="https://script.google.com/macros/s/.../exec"></label>'+
 '</div><div class="modal-actions"><button type="button" class="btn-secondary" id="cancelCloud">Cancelar</button><button type="submit" class="btn">Salvar no servidor</button></div></form></div>';
 document.body.appendChild(box);
 box.querySelector("#cancelCloud").onclick=()=>box.remove();
 box.onclick=e=>{if(e.target===box)box.remove()};
 box.querySelector("form").onsubmit=async ev=>{
  ev.preventDefault();const btn=ev.target.querySelector("[type=submit]");btn.disabled=true;
  try{await saveStation(ev.target,previous);box.remove();toast("Estação registrada no servidor.")}
  catch(err){toast(err.message,true)}finally{btn.disabled=false}
 };
};
function mappedForDb(raw,uuid,code){
 const normalized=norm(raw,code);
 if(!normalized)return null;
 return {station_id:uuid,measured_at:normalized.time,
 temperature_c:normalized.temp,humidity_pct:normalized.humidity,
 pressure_hpa:normalized.pressure,altitude_m:normalized.altitude,
 battery_v:normalized.battery,rssi:normalized.rssi,satellites:normalized.satellites,
 latitude:normalized.latitude,longitude:normalized.longitude,source:"upload_validado"};
}
async function cloudImport(file,stationCode){
 if(!stationManager)throw Error("Perfil sem permissão de importação");
 if(!file)throw Error("Selecione o arquivo");
 if(file.size>20_000_000)throw Error("Arquivo acima de 20 MB");
 const station=stationRecords.find(x=>x.station_code===stationCode);
 if(!station)throw Error("Estação inexistente");
 if(!admin&&station.owner_user_id!==myUserId)throw Error("Somente estações próprias podem receber importações");
 const raw=file.name.toLowerCase().endsWith(".csv")?parseCSV(await file.text()):getJSONrecords(JSON.parse(await file.text()));
 const rows=raw.map(x=>mappedForDb(x,station.id,stationCode)).filter(Boolean);
 if(!rows.length)throw Error("Nenhuma medição válida reconhecida");
 const unique=[...new Map(rows.map(x=>[x.measured_at,x])).values()];
 let n=0;
 for(let i=0;i<unique.length;i+=250){
  const {error}=await client.from("readings").upsert(unique.slice(i,i+250),{onConflict:"station_id,measured_at"});
  if(error)throw error;n+=Math.min(250,unique.length-i);
 }
 await cloudLoad(true);toast(n.toLocaleString("pt-BR")+" leituras enviadas ao servidor");
}
async function exportFull(){
 const code=state.selected,station=stationRecords.find(x=>x.station_code===code);
 if(!station)return toast("Selecione uma estação",true);
 let offset=0,all=[];
 try{
  while(true){
   const {data,error}=await client.from("readings").select("measured_at,temperature_c,humidity_pct,pressure_hpa,altitude_m,battery_v,rssi,satellites,latitude,longitude")
    .eq("station_id",station.id).order("measured_at",{ascending:true}).range(offset,offset+999);
   if(error)throw error;all.push(...data);if(data.length<1000)break;offset+=data.length;
   if(all.length>1_000_000)throw Error("Exportação limitada a 1 milhão de registros");
  }
  const data=JSON.stringify({station:code,exported_at:new Date().toISOString(),readings:all});
  download("ecosense_historico_"+code+".json",data,"application/json");
  toast("Histórico completo: "+all.length.toLocaleString("pt-BR")+" registros");
 }catch(e){toast(e.message,true)}
}
async function cloudRunIngestion(){
 if(!admin)throw Error("Somente administradores podem sincronizar a origem");
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error("Sessão expirada");
 const code=state.selected||"estacao-01";
 const resp=await fetch(window.ECOSENSE_SUPABASE_URL+"/functions/v1/import-readings",{
  method:"POST",
  headers:{"Content-Type":"application/json",apikey:window.ECOSENSE_SUPABASE_ANON_KEY,Authorization:"Bearer "+session.access_token},
  body:JSON.stringify({station_code:code,pages:3})
 });
 const result=await resp.json();if(!resp.ok||!result.ok)throw Error(result.error||"Erro de importação");
 await cloudLoad(true);toast("Origem sincronizada: "+result.valid+" medições válidas; "+("origem oferece apenas as 500 leituras mais recentes"));
}
function adminPage(){
 return '<div class="grid section-grid">'+
 '<section class="card glass"><div class="panel-heading"><div><h2>Usuários e autorizações</h2><p>Somente administradores podem aprovar contas.</p></div><button class="btn" id="cloudRefreshUsers">Atualizar</button></div><div id="cloudUsers">Carregando usuários...</div></section>'+
 '<section class="card glass"><div class="panel-heading"><div><h2>Importação e histórico central</h2><p>O servidor consulta automaticamente as últimas medições a cada 10 minutos; o histórico anterior exige a planilha-fonte.</p></div></div><div class="actions"><button class="btn" id="cloudRunImport">Importar agora</button><button class="btn-secondary" id="cloudExportAll">Exportar histórico integral da estação selecionada</button></div><div id="cloudIngestion">Consultando estado de importação...</div></section>'+
 '</div>'
}
if(admin){
 pages.admin=["Administração","Controle de usuários, estações e integração de dados.",adminPage];
 const button=document.createElement("button");
 button.dataset.page="admin";
 button.innerHTML="<span>♙</span> Administração";
 document.querySelector("#nav")?.append(button);
}
async function loadAdmin(){
 if(!admin)return;
 const {data:users,error}=await client.from("profiles").select("user_id,full_name,approved,role,created_at").order("created_at",{ascending:false});
 const wrap=el("#cloudUsers");
 if(wrap)wrap.innerHTML=error?'<p>'+escCloud(error.message)+'</p>':'<div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Situação</th><th>Perfil</th><th>Ações</th></tr></thead><tbody>'+users.map(u=>
 '<tr><td>'+escCloud(u.full_name||"Sem nome")+'<small style="display:block;opacity:.5">'+escCloud(u.user_id.slice(0,8))+'…</small></td>'+
 '<td>'+(u.approved?"Aprovado":"Pendente")+'</td><td>'+escCloud(u.role)+'</td>'+
 '<td><select data-newrole="'+escCloud(u.user_id)+'" '+(u.role==="admin"?"disabled":"")+'><option value="viewer" '+(u.role==="viewer"?"selected":"")+'>Visualizador</option><option value="client" '+(u.role==="client"?"selected":"")+'>Cliente</option><option value="collaborator" '+(u.role==="collaborator"?"selected":"")+'>Colaborador</option></select> '+
 '<button class="btn-secondary" '+(u.role==="admin"?"disabled":"")+' data-userchange="'+escCloud(u.user_id)+'" data-approved="'+(!u.approved)+'">'+(u.role==="admin"?"Administrador exclusivo":u.approved?"Revogar":"Aprovar")+'</button></td></tr>'
 ).join("")+'</tbody></table></div>';
 const {data:states}=await client.from("ingestion_state").select("station_id,next_offset,last_attempt_at,last_error,rows_received,pages_imported");
 const ing=el("#cloudIngestion");
 if(ing)ing.innerHTML=states?.length?states.map(s=>'<p><b>Última tentativa:</b> '+escCloud(s.last_attempt_at?dateFmt(s.last_attempt_at):"Não executada")+
 ' · Registros recebidos: '+Number(s.rows_received||0).toLocaleString("pt-BR")+
 (s.last_error?' · <span style="color:#ffb8ae">Erro: '+escCloud(s.last_error)+'</span>':'')+'</p>').join(""):"Nenhuma importação iniciada";
}
// Nunca persistir credenciais administrativas na aplicação estática.
state.adminKey="";save();
function secureIntegrationsPage(){
 return '<section class="card glass"><h2>Integrações protegidas</h2><p>As chaves secretas das APIs pertencem ao administrador e devem ser gerenciadas somente no backend Supabase, nunca no navegador ou GitHub Pages.</p>'+
 '<div class="stack"><div class="info-flag">Servidor de dados: Supabase. Medições e estações disponíveis conforme as permissões no banco. O endpoint privado de ingestão não é exposto aos perfis Viewer, Cliente ou Colaborador.</div>'+
 '<p>Para alterar credenciais privadas, utilize o painel administrativo do servidor. As credenciais não são exibidas nesta página.</p>'+
 '<a href="https://supabase.com/dashboard/project/wntqtnssnznqwpsuemja/settings/functions" target="_blank" rel="noopener noreferrer" class="btn-secondary">Abrir configurações seguras do Supabase</a></div></section>';
}
if(admin)pages.integracoes=["Integrações protegidas","Configuração global exclusiva do administrador.",secureIntegrationsPage];
const allowedPages=new Set(admin?["dashboard","mapa","analises","estacoes","logs","integracoes","atualizacoes","configuracoes","historico","admin"]:stationManager?["dashboard","mapa","analises","estacoes","configuracoes","historico"]:["dashboard","mapa","analises","historico","configuracoes"]);
Object.keys(pages).forEach(p=>{if(!allowedPages.has(p))delete pages[p]});
document.querySelectorAll("#nav [data-page]").forEach(b=>{if(!allowedPages.has(b.dataset.page))b.remove()});
if(!admin)document.querySelector("#syncTop")?.remove();

function commandPanel(){
 if(!stationManager)return "";
 const stations=admin?stationRecords:stationRecords.filter(s=>s.owner_user_id===myUserId);
 if(!stations.length)return '<div class="card glass">Cadastre uma estação própria para solicitar comandos.</div>';
 return '<section class="card glass" style="margin-top:16px"><h2>Comandos das estações</h2><p>Solicitações auditadas, com execução física dependente do gateway autenticado.</p>'+
 '<div class="form-row"><label class="field">Estação<select id="commandStation">'+stations.map(s=>'<option value="'+escCloud(s.id)+'">'+escCloud(s.name)+'</option>').join("")+'</select></label>'+
 '<label class="field">Ação<select id="commandAction"><option value="sample_now">Nova leitura</option><option value="restart">Reiniciar dispositivo</option><option value="set_interval">Alterar intervalo</option></select></label>'+
 '<label class="field">Intervalo (60–86400 s)<input id="commandSeconds" type="number" min="60" max="86400" value="600"></label>'+
 '<button class="btn" id="submitCommand">Registrar solicitação</button><button class="btn-secondary" id="reloadCommands">Atualizar</button></div>'+
 '<p class="ec-chart-note">Os comandos serão registrados como pendentes; não existe confirmação de execução no equipamento até integração do firmware.</p><div id="commandsStatus"></div></section>';
}
async function loadCommands(){
 const node=el("#commandsStatus");if(!node)return;
 const {data,error}=await client.from("station_commands").select("id,command,status,requested_at").order("requested_at",{ascending:false}).limit(30);
 if(error)throw error;
 node.innerHTML=data?.length?'<div class="table-wrap"><table><thead><tr><th>Data</th><th>Comando</th><th>Status</th></tr></thead><tbody>'+data.map(v=>'<tr><td>'+escCloud(dateFmt(v.requested_at))+'</td><td>'+escCloud(v.command)+'</td><td>'+escCloud(v.status)+'</td></tr>').join("")+'</tbody></table></div>':'Nenhuma solicitação.';
}
document.addEventListener("click",async e=>{
 const b=e.target.closest("#submitCommand,#reloadCommands");if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();
 try{
  if(b.id==="submitCommand"){
   if(!stationManager)throw Error("Acesso negado");
   const station_id=el("#commandStation")?.value,command=el("#commandAction")?.value;
   const st=stationRecords.find(s=>s.id===station_id);
   if(!st||!admin&&st.owner_user_id!==myUserId)throw Error("Estação não autorizada");
   const seconds=Number(el("#commandSeconds")?.value);
   if(command==="set_interval"&&(!Number.isInteger(seconds)||seconds<60||seconds>86400))throw Error("Intervalo inválido");
   const payload=command==="set_interval"?{seconds}:{};
   const {error}=await client.from("station_commands").insert({station_id,command,payload});
   if(error)throw error;
   toast("Comando registrado como pendente; firmware ainda não conectado");
  }
  await loadCommands();
 }catch(err){toast(err.message,true)}
},true);

const originalRender=render;
render=function(){
 originalRender();
 if(route==="admin")loadAdmin().catch(e=>toast(e.message,true));
 if(!stationManager){
  document.querySelectorAll("[data-add-station],[data-edit],[data-delete],#importReadings").forEach(x=>x.remove());
  const action=document.querySelector("#pageAction");if(route==="estacoes"&&action)action.innerHTML="";
 }else if(!admin){
  document.querySelectorAll("[data-edit],[data-delete]").forEach(x=>{const st=stationRecords.find(s=>s.station_code===(x.dataset.edit||x.dataset.delete));if(!st||st.owner_user_id!==myUserId)x.remove()});
 }
 if(route==="estacoes"){
  const area=document.querySelector("#pageContent");
  if(area){
   const row=document.createElement("div");row.className="card glass";
   row.innerHTML='<p><strong>Base central Supabase</strong> — estações e histórico são compartilhados entre usuários aprovados. O aplicativo apresenta até 1.500 leituras recentes por estação; o histórico integral fica no banco.</p>'+
   (admin?'<button class="btn" id="cloudRunImport">Sincronizar origem agora</button> ':'')+
   '<button class="btn-secondary" id="cloudExportAll">Exportar histórico integral da estação selecionada</button>';
   area.prepend(row);
   if(stationManager){area.insertAdjacentHTML("beforeend",commandPanel());loadCommands().catch(e=>toast(e.message,true));}
  }
 }
};
document.addEventListener("click",async e=>{
 const b=e.target.closest("#syncTop,#syncEveryone,#syncSelected,#importReadings,[data-delete],#cloudRefreshUsers,[data-userchange],#cloudRunImport,#cloudExportAll,#loadStationsAWS,#testApi,#saveApi");
 if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();
 try{
  if(b.id==="syncTop"||b.id==="syncEveryone"||b.id==="syncSelected"){await cloudLoad();return}
  if(b.id==="cloudRefreshUsers"){await loadAdmin();return}
  if(b.id==="cloudRunImport"){b.disabled=true;await cloudRunIngestion();if(route==="admin")await loadAdmin();return}
  if(b.id==="cloudExportAll"){b.disabled=true;await exportFull();return}
  if(b.id==="importReadings"){
   if(importing)return;importing=true;
   await cloudImport(el("#importFile")?.files[0],el("#importStation")?.value);return;
  }
  if(b.dataset.delete){
   if(!stationManager)throw Error("Acesso negado");
   const st=stationRecords.find(x=>x.station_code===b.dataset.delete);
   if(!admin&&st?.owner_user_id!==myUserId)throw Error("Apenas estações próprias podem ser excluídas");
   if(!st||!confirm("Excluir definitivamente a estação e suas medições do servidor?"))return;
   const {error}=await client.from("stations").delete().eq("id",st.id);if(error)throw error;
   await cloudLoad(true);return;
  }
  if(b.dataset.userchange){
   if(!admin)throw Error("Acesso negado");
   const id=b.dataset.userchange,role=document.querySelector('[data-newrole="'+id+'"]')?.value||"viewer";
   if(!confirm("Confirmar alteração das permissões desta conta?"))return;
   const {error}=await client.rpc("approve_user",{p_user_id:id,p_approved:b.dataset.approved==="true",p_role:role});
   if(error)throw error;await loadAdmin();toast("Permissões atualizadas");return;
  }
  if(b.id==="loadStationsAWS"||b.id==="testApi"||b.id==="saveApi")return toast("A integração ativa é o Supabase; a API AWS legada está desativada.");
 }catch(err){toast(err.message||"Erro na operação",true)}
 finally{if(b.id==="importReadings")importing=false;if(b.id==="cloudRunImport"||b.id==="cloudExportAll")b.disabled=false}
},true);
window.ECOSENSE_CLOUD={refresh:cloudLoad};
cloudLoad(true);
setInterval(()=>{if(document.visibilityState!=="hidden")cloudLoad(true)},300000);
})();