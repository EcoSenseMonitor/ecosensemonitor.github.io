/* EcoSenseMonitor Cloud: Supabase como fonte central; v4.0 */
(function(){
"use strict";
const client=window.ecosenseClient;
if(!client){console.error("Autenticação não inicializada");return}
const admin=window.ECOSENSE_AUTH_ROLE==="admin";
const escCloud=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const el=s=>document.querySelector(s);
let stationRecords=[],importing=false,loading=false;
function fromStation(x){return {id:x.station_code,uuid:x.id,name:x.name,lat:x.latitude,lon:x.longitude,endpoint:x.source_url||"",owner:"EcoSense",created:x.created_at}}
function fromReading(x){return {station:x.station_id,time:x.measured_at,temp:x.temperature_c,humidity:x.humidity_pct,pressure:x.pressure_hpa,altitude:x.altitude_m,battery:x.battery_v,rssi:x.rssi,satellites:x.satellites,latitude:x.latitude,longitude:x.longitude}}
async function cloudLoad(silent=false){
 if(loading)return;loading=true;
 try{
  const {data:stations,error}=await client.from("stations").select("*").order("station_code");
  if(error)throw error;
  stationRecords=stations||[];
  state.stations=stationRecords.map(fromStation);
  state.readings={};
  for(const s of stations||[]){
    // Interface leve: 1.500 pontos recentes por estação; histórico integral permanece no servidor.
    const {data,error:re}=await client.from("readings").select("station_id,measured_at,temperature_c,humidity_pct,pressure_hpa,altitude_m,battery_v,rssi,satellites,latitude,longitude")
     .eq("station_id",s.id).order("measured_at",{ascending:false}).limit(1500);
    if(re)throw re;
    state.readings[s.station_code]=(data||[]).map(fromReading).sort((a,b)=>a.time.localeCompare(b.time));
    if((s.latitude==null||s.longitude==null)&&data?.length){
      const gps=data.find(x=>x.latitude!=null&&x.longitude!=null);
      const st=state.stations.find(x=>x.id===s.station_code);
      if(st&&gps){st.lat=gps.latitude;st.lon=gps.longitude}
    }
  }
  if(!state.stations.some(x=>x.id===state.selected))state.selected=state.stations[0]?.id||null;
  state.events=state.events.filter(e=>e.station!=="loading");
  const latest=Object.values(state.readings).flat().sort((a,b)=>b.time.localeCompare(a.time))[0];
  cloudSnapshot={count:null,latest:latest||null};
  render();
  if(!silent)toast("Dados atualizados no servidor Supabase.");
 }catch(err){console.error("EcoSense cloud",err);if(!silent)toast("Erro ao consultar banco: "+err.message,true)}
 finally{loading=false}
}
async function saveStation(form,previous){
 const get=n=>String(form.elements[n]?.value||"").trim();
 const code=get("id");
 if(!/^[a-zA-Z0-9_-]{2,100}$/.test(code))throw Error("Identificador inválido");
 const lat=get("lat")?Number(get("lat")):null,lon=get("lon")?Number(get("lon")):null;
 if(lat!=null&&Math.abs(lat)>90||lon!=null&&Math.abs(lon)>180)throw Error("Coordenadas inválidas");
 const endpoint=get("endpoint");
 if(endpoint){const u=new URL(endpoint);if(u.protocol!=="https:"||u.hostname!=="script.google.com"||!u.pathname.startsWith("/macros/s/"))throw Error("Endpoint deve ser Google Apps Script HTTPS")}
 const row={station_code:code,name:get("name"),latitude:lat,longitude:lon,source_url:endpoint||null};
 if(!row.name)throw Error("Informe nome da estação");
 let q=client.from("stations");
 const result=previous?await q.update(row).eq("id",previous.uuid):await q.insert(row);
 if(result.error)throw result.error;
 await cloudLoad(true);
}
stationModal=function(previous=null){
 if(!admin)return toast("Apenas administradores podem cadastrar estações.",true);
 const box=document.createElement("div");box.className="modal-backdrop";box.id="stationDialog";
 box.innerHTML='<div class="modal"><h2>'+(previous?"Editar estação":"Nova estação")+'</h2><form id="stationCloudForm"><div class="stack">'+
 '<label class="field">Identificador<input required name="id" maxlength="100" '+(previous?"readonly":"")+' value="'+escCloud(previous?.id||"")+'" placeholder="estacao-02"></label>'+
 '<label class="field">Nome<input required name="name" maxlength="150" value="'+escCloud(previous?.name||"")+'"></label>'+
 '<label class="field">Latitude<input name="lat" type="number" step="any" value="'+escCloud(previous?.lat??"")+'"></label>'+
 '<label class="field">Longitude<input name="lon" type="number" step="any" value="'+escCloud(previous?.lon??"")+'"></label>'+
 '<label class="field">Endpoint Google Apps Script<input name="endpoint" type="url" value="'+escCloud(previous?.endpoint||"")+'" placeholder="https://script.google.com/macros/s/.../exec"></label>'+
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
 if(!admin)throw Error("Apenas administradores podem importar medições");
 if(!file)throw Error("Selecione o arquivo");
 if(file.size>20_000_000)throw Error("Arquivo acima de 20 MB");
 const station=stationRecords.find(x=>x.station_code===stationCode);
 if(!station)throw Error("Estação inexistente");
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
 await cloudLoad(true);toast("Origem sincronizada: "+result.valid+" medições válidas; "+(result.complete?"histórico percorrido":"mais páginas pendentes"));
}
function adminPage(){
 return '<div class="grid section-grid">'+
 '<section class="card glass"><div class="panel-heading"><div><h2>Usuários e autorizações</h2><p>Somente administradores podem aprovar contas.</p></div><button class="btn" id="cloudRefreshUsers">Atualizar</button></div><div id="cloudUsers">Carregando usuários...</div></section>'+
 '<section class="card glass"><div class="panel-heading"><div><h2>Importação e histórico central</h2><p>O serviço executa importação incremental automática a cada 10 minutos.</p></div></div><div class="actions"><button class="btn" id="cloudRunImport">Importar agora</button><button class="btn-secondary" id="cloudExportAll">Exportar histórico integral da estação selecionada</button></div><div id="cloudIngestion">Consultando estado de importação...</div></section>'+
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
 '<td><select data-newrole="'+escCloud(u.user_id)+'"><option value="viewer">Visualizador</option><option value="operator">Operador</option><option value="admin">Administrador</option></select> '+
 '<button class="btn-secondary" data-userchange="'+escCloud(u.user_id)+'" data-approved="'+(!u.approved)+'">'+(u.approved?"Revogar":"Aprovar")+'</button></td></tr>'
 ).join("")+'</tbody></table></div>';
 const {data:states}=await client.from("ingestion_state").select("station_id,next_offset,last_attempt_at,last_error,rows_received,pages_imported");
 const ing=el("#cloudIngestion");
 if(ing)ing.innerHTML=states?.length?states.map(s=>'<p><b>Última tentativa:</b> '+escCloud(s.last_attempt_at?dateFmt(s.last_attempt_at):"Não executada")+
 ' · Registros recebidos: '+Number(s.rows_received||0).toLocaleString("pt-BR")+
 (s.last_error?' · <span style="color:#ffb8ae">Erro: '+escCloud(s.last_error)+'</span>':'')+'</p>').join(""):"Nenhuma importação iniciada";
}
const originalRender=render;
render=function(){
 originalRender();
 if(route==="admin")loadAdmin().catch(e=>toast(e.message,true));
 if(!admin){
  document.querySelectorAll("[data-add-station],[data-edit],[data-delete]").forEach(x=>x.disabled=true);
  const a=document.querySelector("#pageAction");if(route==="estacoes"&&a)a.innerHTML="";
 }
 if(route==="estacoes"){
  const area=document.querySelector("#pageContent");
  if(area){
   const row=document.createElement("div");row.className="card glass";
   row.innerHTML='<p><strong>Base central Supabase</strong> — estações e histórico são compartilhados entre usuários aprovados. O aplicativo apresenta até 1.500 leituras recentes por estação; o histórico integral fica no banco.</p>'+
   (admin?'<button class="btn" id="cloudRunImport">Sincronizar origem agora</button> ':'')+
   '<button class="btn-secondary" id="cloudExportAll">Exportar histórico integral da estação selecionada</button>';
   area.prepend(row);
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
   if(!admin)throw Error("Acesso negado");
   const st=stationRecords.find(x=>x.station_code===b.dataset.delete);
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
setInterval(()=>{if(document.visibilityState!=="hidden")cloudLoad(true)},60000);
})();