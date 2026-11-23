/* EcoSenseMonitor auth: Supabase Auth + private profiles approval.
   Acesso ao HTML/JS permanece público no GitHub Pages. APIs e dados sensíveis
   devem sempre validar JWT e autorização no servidor. */
const root=document.getElementById("auth-root");
const apiUrl=String(window.ECOSENSE_SUPABASE_URL||"").trim();
const pubKey=String(window.ECOSENSE_SUPABASE_ANON_KEY||"").trim();
const valid=/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/.test(apiUrl)&&pubKey.length>40;
let supabase=null, currentMode="login",busy=false;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function screen(mode="login",message="",isError=false){
  currentMode=mode;
  const title=mode==="register"?"Criar conta":mode==="reset"?"Recuperar senha":"Acessar a plataforma";
  const desc=mode==="register"?"Cadastre-se para solicitar acesso. O cadastro exige confirmação de e-mail e aprovação.":mode==="reset"?"Receba as instruções para redefinir sua senha.":"Entre com seu e-mail e senha para consultar suas estações e análises.";
  root.innerHTML='<div class="auth-layout"><section class="auth-brand"><div><img src="/assets/logo.png" alt="EcoSenseMonitor"><h1>Monitoramento ambiental inteligente.</h1><p>Estações meteorológicas, histórico, mapas e análises em um único ambiente protegido.</p></div><a href="/">Conhecer o projeto e a operação →</a></section><section class="auth-form-panel"><h2>'+title+'</h2><p class="auth-desc">'+desc+'</p><div id="auth-msg" role="status">'+(message?'<div class="'+(isError?"auth-error":"auth-notice")+'">'+esc(message)+'</div>':'')+'</div><form id="auth-form">'+(mode==="register"?'<label class="auth-field">Nome completo<input name="name" autocomplete="name" maxlength="100" required></label>':'')+'<label class="auth-field">E-mail<input type="email" name="email" autocomplete="email" required></label>'+(mode!=="reset"?'<label class="auth-field">Senha<input type="password" name="password" autocomplete="'+(mode==="register"?"new-password":"current-password")+'" minlength="8" required></label>':'')+'<button class="auth-submit" type="submit">'+(mode==="register"?"Solicitar acesso":mode==="reset"?"Enviar instruções":"Entrar")+'</button></form><div class="auth-switch">'+(mode!=="login"?'<button type="button" data-mode="login">Já tenho conta</button>':'<button type="button" data-mode="register">Criar conta</button>')+(mode==="login"?'<button type="button" data-mode="reset">Esqueci minha senha</button>':'')+'</div></section></div>';
  root.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>screen(b.dataset.mode)));
  root.querySelector("#auth-form").addEventListener("submit",submit);
}
function status(message,isError=false){const node=document.getElementById("auth-msg");if(node)node.innerHTML='<div class="'+(isError?"auth-error":"auth-notice")+'">'+esc(message)+'</div>'}
async function submit(ev){
 ev.preventDefault();if(busy||!supabase)return;
 busy=true;const btn=ev.target.querySelector("button[type=submit]");btn.disabled=true;
 const fd=new FormData(ev.target),email=String(fd.get("email")||"").trim(),password=String(fd.get("password")||""),name=String(fd.get("name")||"").trim();
 try{
  if(currentMode==="register"){
    const {error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:location.origin+"/app/"}});
    if(error)throw error;
    screen("login","Cadastro solicitado. Confirme o e-mail recebido e aguarde aprovação do administrador.");
  }else if(currentMode==="reset"){
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+"/app/"});
    if(error)throw error;
    screen("login","Se o endereço estiver cadastrado, você receberá um e-mail com as instruções.");
  }else{
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error)throw error;
    await authorize();
  }
 }catch(e){status(e?.message||"Não foi possível concluir a solicitação.",true)}
 finally{busy=false;if(btn.isConnected)btn.disabled=false}
}
let started=false;
function pendingScreen(){
 root.innerHTML='<div class="auth-layout"><section class="auth-brand"><div><img src="/assets/logo.png" alt="EcoSenseMonitor"><h1>Conta confirmada.</h1><p>Sua identidade foi autenticada. O acesso ao painel depende de aprovação administrativa.</p></div><a href="/">Voltar ao site institucional →</a></section><section class="auth-form-panel"><h2>Cadastro aguardando liberação</h2><p class="auth-desc">Seu e-mail já foi confirmado, mas o cadastro ainda precisa ser aprovado. Você não precisa receber um segundo código por e-mail.</p><div class="auth-notice">A aprovação de perfis e o acesso de clientes e colaboradores são definidos exclusivamente pela administração da EcoSenseMonitor.</div><div class="auth-switch"><button id="pending-logout" type="button">Sair</button></div></section></div>';
 root.querySelector("#pending-logout").onclick=async()=>{await supabase.auth.signOut();screen("login")};
}
function bootstrapScreen(){
 root.innerHTML='<div class="auth-layout"><section class="auth-brand"><div><img src="/assets/logo.png" alt="EcoSense"><h1>Ativação da plataforma</h1><p>Seu e-mail foi autenticado. O código de implantação é privado e não é enviado automaticamente por e-mail.</p></div><a href="/">Conhecer a EcoSense →</a></section><section class="auth-form-panel"><h2>Ativar administrador</h2><p class="auth-desc">Esse código só pode ser usado uma vez e não fica armazenado no navegador.</p><div id="auth-msg" role="status"></div><form id="bootstrap-form"><label class="auth-field">Código de ativação<input name="code" autocomplete="off" maxlength="128" required placeholder="Cole o código privado"></label><button class="auth-submit" type="submit">Ativar minha conta</button></form><div class="auth-switch"><button id="bootstrap-logout" type="button">Sair e usar outra conta</button></div></section></div>';
 root.querySelector("#bootstrap-logout").onclick=async()=>{await supabase.auth.signOut();screen("login")};
 root.querySelector("#bootstrap-form").onsubmit=async ev=>{
 ev.preventDefault();const button=ev.target.querySelector("button");button.disabled=true;
 try{const code=String(new FormData(ev.target).get("code")||"").trim();const {error}=await supabase.rpc("bootstrap_admin",{p_code:code});
 if(error)throw error;
 await authorize();
 }catch(err){status(err.message||"Não foi possível ativar administrador.",true)}finally{button.disabled=false}
 };
}
async function authorize(){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session?.access_token){document.documentElement.classList.remove("auth-validated");screen("login");return}
 // Nunca confiar apenas em session.user: aprovação é buscada no servidor com RLS.
 const {data,error:profileError}=await supabase.from("profiles").select("approved,role").eq("user_id",session.user.id).single();
 if(profileError){
   document.documentElement.classList.remove("auth-validated");
   screen("login","Não foi possível verificar as permissões da conta. Tente entrar novamente.",true);
   return;
 }
 if(!data?.approved){
   document.documentElement.classList.remove("auth-validated");
   pendingScreen();
   return;
 }
 window.ecosenseClient=supabase;
 window.ECOSENSE_AUTH_ROLE=data.role;
 window.ecosenseSession=session;
 // Filtra a navegação antes de carregar o aplicativo, sem depender só da camada visual.
 const role=data.role;
 const permitted=new Set(role==="admin"?["dashboard","mapa","analises","estacoes","logs","integracoes","atualizacoes","configuracoes","historico"]:
 role==="client"||role==="collaborator"?["dashboard","mapa","analises","estacoes","configuracoes","historico"]:
 ["dashboard","mapa","analises","configuracoes","historico"]);
 document.querySelectorAll("#nav [data-page]").forEach(item=>{if(!permitted.has(item.dataset.page))item.remove()});
 if(role!=="admin")document.querySelector("#syncTop")?.remove();
 document.documentElement.classList.add("auth-validated");
 if(!started){
   started=true;
   const script=document.createElement("script");
   script.src=location.pathname.startsWith("/app/")?"app.js?v=theme-v42":"app/app.js?v=theme-v42";
   script.onerror=()=>{document.documentElement.classList.remove("auth-validated");screen("login","Falha ao carregar a plataforma. Tente novamente.",true)};
   script.onload=()=>{let cloud=document.createElement("script");cloud.src=location.pathname.startsWith("/app/")?"cloud.js?v=equipment-control-v44":"app/cloud.js?v=equipment-control-v44";cloud.onload=()=>{let history=document.createElement("script");history.src=location.pathname.startsWith("/app/")?"history.js":"app/history.js";history.onload=()=>{const analysis=document.createElement("script");analysis.src=location.pathname.startsWith("/app/")?"analysis-interactive.js":"app/analysis-interactive.js";analysis.onload=()=>{const immersive=document.createElement("script");immersive.src=location.pathname.startsWith("/app/")?"map-immersive.js?v=station-action-v43":"app/map-immersive.js?v=station-action-v43";document.body.appendChild(immersive)};document.body.appendChild(analysis)};document.body.appendChild(history)};document.body.appendChild(cloud)};
   document.body.appendChild(script);
 }
 const bar=document.getElementById("auth-userbar")||document.createElement("div");
 bar.id="auth-userbar";
 bar.innerHTML='<span>'+esc(session.user.email)+'</span><button type="button" id="auth-logout">Sair</button>';
 document.querySelector(".top-right")?.appendChild(bar);
 document.getElementById("auth-logout").onclick=async()=>{await supabase.auth.signOut();location.reload()};
}
async function init(){
 screen("login");
 if(!valid){
  status("Cadastro e login temporariamente indisponíveis: é necessário configurar o servidor de autenticação. Nenhum acesso não autenticado será liberado.",true);
  root.querySelectorAll("input,button.auth-submit").forEach(el=>el.disabled=true);
  return;
 }
 try{
  const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  supabase=createClient(apiUrl,pubKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const url=new URL(location.href);
  if(url.searchParams.get("error_description"))status(url.searchParams.get("error_description"),true);
  if(url.searchParams.get("type")==="recovery"){
    const {data:{session}}=await supabase.auth.getSession();
    if(session){
      const password=prompt("Defina uma nova senha (mínimo 8 caracteres):");
      if(password?.length>=8){const {error}=await supabase.auth.updateUser({password});status(error?error.message:"Senha alterada. Faça login novamente.",!!error)}
      await supabase.auth.signOut();screen("login");
    }
  } else await authorize();
  supabase.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT"){document.documentElement.classList.remove("auth-validated");screen("login")}});
 }catch(e){status("Não foi possível conectar ao servidor de autenticação. Tente novamente mais tarde.",true)}
}
init();
