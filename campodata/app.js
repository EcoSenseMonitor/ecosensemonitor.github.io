'use strict';
/* CampoData: coleta offline, sem analytics, contas ou envio de respostas. */
const $=s=>document.querySelector(s);
const mk=(tag,attrs={},...children)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else if(k==='text')e.textContent=String(v);else if(k==='on'){if(v&&typeof v==='object')for(const [event,fn] of Object.entries(v))if(typeof fn==='function')e.addEventListener(event,fn)}else if(k==='checked')e.checked=!!v;else if(k==='value')e.value=v==null?'':String(v);else if(k==='hidden')e.hidden=!!v;else if(v!=null)e.setAttribute(k,String(v))}for(const c of children)if(c!=null)e.append(c instanceof Node?c:document.createTextNode(String(c)));return e};
const uid=()=>globalThis.crypto?.randomUUID?.()||'c'+Date.now()+Math.random().toString(36).slice(2);
const now=()=>new Date().toISOString();
const localDate=(d=new Date())=>{return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const interviewCode=(date,id)=>'ENT-'+localDate(date).replaceAll('-','')+'-'+String(id).replace(/[^a-z0-9]/gi,'').slice(0,12).toUpperCase();
async function ensureInterviewCodes(list){for(const record of list){if(!record||!record.answers||record.answers.codigo)continue;const d=new Date(record.createdAt);record.answers.codigo=interviewCode(Number.isNaN(d.getTime())?new Date():d,record.id);await save(record)}}
const datefmt=s=>{try{return new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}catch{return s||'—'}};
let schema=null,db=null,records=[],templates=[],current=null,page='records',step=0,saveTimer=null,installPrompt=null,editing=null; const DEFAULT_FORM_ID='percepcao-socioambiental-52';
const main=$('#main');
/* Redundância específica do Android: IndexedDB + cópia espelho local.
   No APK, o espelho fica nos arquivos privados do aplicativo; no PWA
   Android, usa localStorage (sem foto, por limitação de espaço). */
const androidDevice=()=>/Android/i.test(navigator.userAgent||'');
const androidBridge=()=>window.CampoDataAndroid||null;
function androidSnapshot(record){
 if(!record||!androidDevice())return;
 try{
  const native=androidBridge();
  if(native&&typeof native.writeShadow==='function')native.writeShadow(JSON.stringify(record));
  else{
   const copy={...record,answers:{...record.answers}};
   delete copy.answers.fotoMapa;
   localStorage.setItem('CampoData-shadow-'+record.id,JSON.stringify(copy));
  }
 }catch(err){console.warn('Espelho Android indisponível',err)}
}
function androidDelete(id){
 if(!androidDevice())return;
 try{const native=androidBridge();if(native&&typeof native.deleteShadow==='function')native.deleteShadow(id);else localStorage.removeItem('CampoData-shadow-'+id)}catch(err){console.warn(err)}
}
async function recoverAndroid(list){
 if(!androidDevice())return list;
 const candidates=[];
 try{
  const native=androidBridge();
  if(native&&typeof native.readShadows==='function'){const items=JSON.parse(native.readShadows()||'[]');if(Array.isArray(items))candidates.push(...items)}
  else for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith('CampoData-shadow-')){try{candidates.push(JSON.parse(localStorage.getItem(key)))}catch(e){console.warn('Cópia inválida',e)}}}
 }catch(err){console.warn('Não foi possível ler o espelho',err)}
 const merged=new Map(list.map(r=>[r.id,r]));
 for(const backup of candidates){
  if(!backup||typeof backup.id!=='string'||!backup.answers||typeof backup.answers!=='object')continue;
  const currentCopy=merged.get(backup.id);
  if(!currentCopy||String(backup.updatedAt||'')>String(currentCopy.updatedAt||'')){
   try{await save(backup);merged.set(backup.id,backup)}catch(err){console.warn('Falha ao recuperar entrevista',err)}
  }
 }
 return [...merged.values()];
}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3300)}
function openDB(){return new Promise((ok,fail)=>{const req=indexedDB.open('CampoData-Percepcao-v1',2);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('fichas'))req.result.createObjectStore('fichas',{keyPath:'id'});if(!req.result.objectStoreNames.contains('formularios'))req.result.createObjectStore('formularios',{keyPath:'id'})};req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error)})}
function rows(){return new Promise((ok,fail)=>{const req=db.transaction('fichas','readonly').objectStore('fichas').getAll();req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error)})}
function save(r){return new Promise((ok,fail)=>{const t=db.transaction('fichas','readwrite');t.objectStore('fichas').put(r);t.oncomplete=()=>{androidSnapshot(r);ok()};t.onerror=()=>fail(t.error)})}
function remove(id){return new Promise((ok,fail)=>{const t=db.transaction('fichas','readwrite');t.objectStore('fichas').delete(id);t.oncomplete=()=>{androidDelete(id);ok()};t.onerror=()=>fail(t.error)})}
function changed(){if(!current)return;if(current.status==='concluida'){current.status='rascunho';delete current.answers.termino;delete current.finishedAt;}current.updatedAt=now();androidSnapshot(current);clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(e=>toast('Falha ao salvar: '+e.message)),300);const status=$('#save-status');if(status)status.textContent='Salvando neste aparelho…'}
async function flush(){clearTimeout(saveTimer);const record=current;if(record){await save(record);records=records.filter(x=>x.id!==record.id);records.unshift(record);records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));const status=$('#save-status');if(status)status.textContent='Dados salvos neste aparelho'}}
function nav(to){if(to==='new'){create();return}flush().catch(console.error);page=to;current=null;window.scrollTo(0,0);render()}
function H(title,subtitle,button){const div=mk('div',{class:'page-head'},mk('div',{},mk('span',{class:'kicker',text:'PERCEPÇÃO SOCIOAMBIENTAL'}),mk('h1',{text:title}),mk('p',{class:'sub',text:subtitle})));if(button)div.append(button);return div}
function button(label,fn,kind=''){return mk('button',{class:'btn '+kind,type:'button',on:{click:fn},text:label})}
function banner(txt,warn=false){return mk('div',{class:'notice'+(warn?' warn':'')},txt)}
function render(){const labels={records:'Entrevistas',form:'Preenchimento',backup:'Dados e backup',help:'Instruções',forms:'Gerenciar formulários',editor:'Editor de formulário',pick:'Escolher formulário'};$('#page-title').textContent=labels[page]||'CampoData';document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));main.replaceChildren();if(page==='records')renderRecords();else if(page==='form')renderForm();else if(page==='forms')renderForms();else if(page==='editor')renderEditor();else if(page==='pick')renderPick();else if(page==='backup')renderBackup();else renderHelp()}
function renderRecords(){const done=records.filter(x=>x.status==='concluida').length;main.append(H('Registros de campo','Questionário semiestruturado de percepção socioambiental. Todas as fichas são gravadas neste dispositivo.',button('＋ Nova entrevista',create,'primary')));
const stats=mk('div',{class:'stats'});for(const x of [['Fichas registradas',records.length,'Neste aparelho'],['Concluídas',done,'Entrevistas finalizadas'],['Rascunhos',records.length-done,'Podem ser retomados']])stats.append(mk('div',{class:'stat'},mk('small',{text:x[0]}),mk('strong',{text:x[1]}),mk('em',{text:x[2]})));main.append(stats);
main.append(banner('Funciona sem internet após a primeira abertura com o site instalado e os arquivos armazenados em cache. Exporte um backup JSON após cada jornada de coleta.'));
const panel=mk('div',{class:'panel'},mk('div',{class:'panel-heading'},mk('h2',{text:'Entrevistas salvas'})));
if(!records.length)panel.append(mk('div',{class:'empty'},mk('div',{class:'empty-icon',text:'▤'}),mk('h3',{text:'Nenhuma entrevista registrada'}),mk('p',{text:'Crie uma ficha, responda ao questionário e continue a coleta mesmo sem rede.'}),button('Começar entrevista',create,'primary')));
for(const r of records){const line=mk('div',{class:'record'},mk('div',{},mk('strong',{},r.answers.codigo||'Ficha '+r.id.slice(0,8),mk('span',{class:'badge '+(r.status==='concluida'?'':'draft'),text:r.status==='concluida'?'Concluída':'Rascunho'})),mk('small',{text:((r.answers.nome_entrevistado?'Entrevistado(a): '+r.answers.nome_entrevistado+' · ':'')+(r.answers.comunidade||'Localidade não informada'))+' · '+datefmt(r.updatedAt)+' · '+formLabel(r)})));line.append(mk('div',{class:'row'},button('Abrir',()=>{current=r;page='form';step=0;window.scrollTo(0,0);render()}),button('Excluir',async()=>{if(!confirm('Excluir esta ficha permanentemente deste aparelho?'))return;await remove(r.id);records=records.filter(x=>x.id!==r.id);render();toast('Ficha excluída')},'danger')));panel.append(line)}
main.append(panel)}

const formForRecord=(record)=>record?.formSnapshot||templateById(record?.formId)||schema;
const sections=()=>{const form=formForRecord(current);return [{title:'DADOS DA ENTREVISTA',questions:form.metadata||schema.metadata}].concat(form.sections)};
const ansKey=q=>q.n?'q'+q.n:q.id;
function answer(key,value){if(!current)return;current.answers[key]=value;changed()}
function field(q){const key=ansKey(q),v=current.answers[key];const box=mk('div',{class:'question'},mk('label',{class:'question-title'},q.n?mk('span',{class:'question-num',text:q.n}):null,q.label));if(['select','yesno','scale'].includes(q.type)){const opts=mk('div',{class:'option-list'});const questionOptions=q.type==='yesno'?['Sim','Não','Não sabe']:q.type==='scale'?['1','2','3','4','5','NS']:(q.options||[]);for(const o of questionOptions){const input=mk('input',{type:'radio',name:key,value:o,checked:v===o,on:{change:()=>{answer(key,o);renderForm(true)}}});opts.append(mk('label',{class:'option'},input,mk('span',{text:o})))}box.append(opts)}
else if(q.type==='multiple'){const opts=mk('div',{class:'option-list'});for(const o of q.options||[]){const input=mk('input',{type:'checkbox',value:o,checked:Array.isArray(v)&&v.includes(o),on:{change:()=>{const arr=Array.isArray(current.answers[key])?[...current.answers[key]]:[];if(input.checked&&!arr.includes(o))arr.push(o);if(!input.checked){const n=arr.indexOf(o);if(n>=0)arr.splice(n,1)}answer(key,arr);showDynamic(q,box)}}});opts.append(mk('label',{class:'option'},input,mk('span',{text:o})))}box.append(opts)}
else if(q.type==='gps'){const controls=mk('div',{class:'gps-controls'});for(const axis of ['latitude','longitude'])controls.append(mk('div',{},mk('label',{class:'field-label',text:axis==='latitude'?'Latitude':'Longitude'}),mk('input',{class:'input',type:'number',step:'any',inputmode:'decimal',placeholder:axis==='latitude'?'-2.000000':'-44.000000',value:v?.[axis]??'',on:{input:e=>{const obj={...(current.answers[key]||{})};obj[axis]=e.target.value;answer(key,obj)}}})));box.append(controls,button('⌖ Capturar GPS',()=>captureGps(key)),mk('p',{class:'help-text',text:v?.accuracy!=null?'Precisão registrada: ±'+Math.round(v.accuracy)+' m':'Coordenadas também podem ser digitadas manualmente.'}))}
else if(q.type==='photo'){const wrap=mk('div',{class:'question-extra'});if(typeof v==='string'&&v.startsWith('data:image/'))wrap.append(mk('img',{class:'map-photo',src:v,alt:'Imagem registrada'}));wrap.append(mk('input',{class:'input',type:'file',accept:'image/*',capture:'environment',on:{change:e=>photo(e.target.files?.[0],key)}}));box.append(wrap)}
else{const type=['date','time','number'].includes(q.type)?q.type:'text';const automatic=key==='codigo'||key==='inicio'||key==='termino';const input=q.type==='textarea'?mk('textarea',{class:'input',rows:'4',on:{input:e=>answer(key,e.target.value)}}):mk('input',{class:'input',type,value:v??'',readonly:automatic?'readonly':null,step:automatic?'1':null,on:automatic?undefined:{input:e=>answer(key,e.target.value)}});if(q.type==='textarea')input.value=v||'';box.append(input);if(automatic)box.append(mk('p',{class:'help-text',text:key==='codigo'?'Código gerado automaticamente, único por identificador de entrevista e mantido no backup.':key==='inicio'?'Registrado automaticamente ao iniciar a entrevista.':'Registrado automaticamente ao concluir a entrevista.'}))}
showDynamic(q,box);return box}
function showDynamic(q,box){const old=box.querySelectorAll('.question-extra');old.forEach(x=>x.remove());if(!q.n)return;const v=current.answers['q'+q.n];const hasYes=v==='Sim',other=Array.isArray(v)?v.some(x=>/^(outr|coleta pública)/i.test(x)):typeof v==='string'&&/^(outr|parcialmente)/i.test(v);
let extra=q.extra||'';let conditional=q.n===35||q.n===16||q.n===17||q.n===33||q.n===41||q.n===42||q.n===46;
if(q.n===40)conditional=v!=='Não'&&v!=='Talvez';else if(conditional)conditional=!hasYes;
if(extra&&!conditional){const wrap=mk('div',{class:'question-extra'},mk('label',{text:extra}));const ctrl=mk('textarea',{class:'input',rows:'3',on:{input:e=>answer('extra'+q.n,e.target.value)}});ctrl.value=current.answers['extra'+q.n]||'';wrap.append(ctrl);box.append(wrap)}
if(other){const wrap=mk('div',{class:'question-extra'},mk('label',{text:'Especifique a alternativa selecionada:'}));const ctrl=mk('input',{class:'input',type:'text',value:current.answers['outro'+q.n]||'',on:{input:e=>answer('outro'+q.n,e.target.value)}});wrap.append(ctrl);box.append(wrap)}
if(q.n===35&&hasYes){const wrap=mk('div',{class:'question-extra'},mk('label',{text:'Fotografia do mapa local preenchido (opcional)'}));if(current.answers.fotoMapa)wrap.append(mk('img',{class:'map-photo',src:current.answers.fotoMapa,alt:'Mapa local fotografado'}));const input=mk('input',{class:'input',type:'file',accept:'image/*',capture:'environment',on:{change:e=>photo(e.target.files?.[0])}});wrap.append(input);box.append(wrap)}}
function renderForm(preserve=false){if(!current){page='records';render();return}if(!preserve)main.replaceChildren();else{const old=$('#form-area');if(old)old.remove()}const sec=sections()[step];const form=mk('div',{id:'form-area'});form.append(H('Entrevista '+(current.answers.codigo||current.id.slice(0,8)),'Formulário em 11 blocos. As respostas são salvas automaticamente no aparelho.',button('← Voltar às fichas',async()=>{await flush();page='records';current=null;render()})));
form.append(mk('div',{class:'row',style:'justify-content:space-between;margin-bottom:12px'},mk('strong',{text:sec.title}),mk('small',{id:'save-status',class:'sub',text:'Dados salvos neste aparelho'})));
const progress=mk('div',{class:'step-bar'},mk('div',{class:'step-line'},mk('span',{style:'width:'+Math.round((step+1)/sections().length*100)+'%'})),mk('span',{class:'step-count',text:(step+1)+' / '+sections().length}));form.append(progress);
if(step===0)form.append(banner('O nome do(a) entrevistado(a) será armazenado somente neste dispositivo e incluído nos arquivos exportados. O questionário original orienta registrá-lo apenas no TCLE; confirme que a coleta identificada está prevista no consentimento e no protocolo de pesquisa.',true));
if(step===5&&formForRecord(current).id===DEFAULT_FORM_ID)form.append(banner('Escala: 1 = Discordo totalmente · 2 = Discordo · 3 = Nem concordo nem discordo · 4 = Concordo · 5 = Concordo totalmente · NS = Não sabe'));
if(step===0){const grid=mk('div',{class:'meta-grid'});for(const f of sec.questions)grid.append(field(f));form.append(grid)}else for(const f of sec.questions){if(f.n===18&&current.answers.q17!=='Sim')continue;form.append(field(f))}
const navrow=mk('div',{class:'form-nav'},button('← Anterior',async()=>{await flush();step=Math.max(0,step-1);window.scrollTo(0,0);renderForm()},step===0?'':''));
navrow.firstChild.disabled=step===0;
navrow.append(mk('div',{class:'row'},button('Salvar rascunho',async()=>{await flush();toast('Rascunho salvo no dispositivo')}),step===sections().length-1?button('✓ Concluir entrevista',finish,'primary'):button('Próximo bloco →',async()=>{await flush();step=Math.min(sections().length-1,step+1);window.scrollTo(0,0);renderForm()},'primary')));
form.append(navrow);
if(preserve)main.append(form);else main.append(form)}
async function finish(){if(!String(current.answers.nome_entrevistado||'').trim()){toast('Informe o nome do(a) entrevistado(a) para concluir.');step=0;window.scrollTo(0,0);renderForm();return}for(let i=1;i<sections().length;i++)for(const question of sections()[i].questions){if(!question.required)continue;const val=current.answers[ansKey(question)];if(val==null||val===''||(Array.isArray(val)&&val.length===0)){step=i;window.scrollTo(0,0);renderForm();toast('Preencha a pergunta obrigatória: '+question.label.slice(0,55));return}}if(current.answers.tcle!=='Sim'){toast('Marque TCLE assinado = Sim para concluir.');step=0;window.scrollTo(0,0);renderForm();return}const finished=new Date();current.answers.termino=finished.toTimeString().slice(0,8);current.finishedAt=finished.toISOString();current.status='concluida';current.updatedAt=current.finishedAt;await save(current);records=await rows();records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));current=null;page='records';render();toast('Entrevista concluída e salva neste dispositivo')}
function captureGps(key){if(!navigator.geolocation){toast('GPS indisponível no navegador. Digite as coordenadas.');return}toast('Solicitando localização ao aparelho…');navigator.geolocation.getCurrentPosition(pos=>{answer(key,{latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy,obtainedAt:now()});renderForm(true);toast('Coordenadas registradas')},err=>toast('GPS: '+err.message+'. Utilize os campos manuais.'),{enableHighAccuracy:true,timeout:20000,maximumAge:0})}
function photo(file,key='fotoMapa'){if(!file)return;if(file.size>25*1024*1024){toast('Foto muito grande. Selecione até 25 MB.');return}const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1200/Math.max(img.width,img.height));const cvs=document.createElement('canvas');cvs.width=Math.max(1,Math.round(img.width*scale));cvs.height=Math.max(1,Math.round(img.height*scale));const ctx=cvs.getContext('2d');ctx.drawImage(img,0,0,cvs.width,cvs.height);answer(key,cvs.toDataURL('image/jpeg',.72));renderForm(true);toast('Imagem salva offline')};img.onerror=()=>toast('Foto não suportada');img.src=String(reader.result)};reader.readAsDataURL(file)}
const csvsafe=v=>{const str=Array.isArray(v)?v.join(' | '):v&&typeof v==='object'?JSON.stringify(v):String(v??'');const safe=/^[=+@\-]/.test(str)?"'"+str:str;return /[;"\r\n]/.test(safe)?'"'+safe.replace(/"/g,'""')+'"':safe};
function exportTable(list=records){
 const meta=new Map();const questionMap=new Map();
 for(const q of schema.metadata)meta.set(q.id,q.label);
 for(const record of list){
  const form=formForRecord(record),fid=record.formId||DEFAULT_FORM_ID;
  for(const q of form.metadata||[])if(!meta.has(q.id))meta.set(q.id,q.label);
  for(const section of form.sections||[])for(const q of section.questions||[]){
   const key=ansKey(q),index=fid+'::'+key;
   if(!questionMap.has(index))questionMap.set(index,{fid,key,label:form.name+' — '+q.label,extra:!!q.extra});
  }
 }
 const cols=[...questionMap.values()];
 const headers=['ID','Formulário','Situação','Criado em','Atualizado em',...meta.values(),
  ...cols.map(c=>c.label),...cols.filter(c=>c.extra).map(c=>'Complemento: '+c.label),
  ...cols.map(c=>'Outra opção: '+c.label)];
 const lines=list.map(record=>{
  const a=record.answers||{},fid=record.formId||DEFAULT_FORM_ID;
  const fmt=(value)=>typeof value==='string'&&value.startsWith('data:image/')?'[Imagem incluída no backup JSON]':value;
  const qcols=cols.map(c=>c.fid===fid?fmt(a[c.key]??''):'');
  const extras=cols.filter(c=>c.extra).map(c=>c.fid===fid?fmt(a['extra'+(c.key.startsWith('q')?c.key.slice(1):c.key)]||''):'');
  const others=cols.map(c=>c.fid===fid?fmt(a['outro'+(c.key.startsWith('q')?c.key.slice(1):c.key)]||''):'');
  return [record.id,formLabel(record),record.status,record.createdAt,record.updatedAt,
    ...[...meta.keys()].map(k=>fmt(a[k]??'')),...qcols,...extras,...others];
 });
 return [headers,...lines];
}
function csv(){
 if(!records.length){toast('Ainda não existem entrevistas');return}
 const table=exportTable();
 const str=table.map(row=>row.map(csvsafe).join(';')).join('\r\n');
 download('CampoData_entrevistas_'+localDate()+'.csv',new Blob(['\ufeff'+str],{type:'text/csv;charset=utf-8'}));
 toast('Planilha CSV exportada para Excel e R');
}
function xlsx(){
 if(!records.length){toast('Ainda não existem entrevistas');return}
 if(!window.CampoDataXLSX){toast('Exportador Excel não disponível. Use CSV.');return}
 try{
  const file=window.CampoDataXLSX(exportTable());
  download('CampoData_entrevistas_'+localDate()+'.xlsx',file);
  toast('Planilha Excel preparada');
 }catch(e){console.error(e);toast('Erro ao preparar Excel. Use CSV.')}
}
function download(filename,blob){const native=androidBridge();if(androidDevice()&&native){if(blob.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'&&typeof native.saveBase64File==='function'){const reader=new FileReader();reader.onload=()=>{const encoded=String(reader.result).split(',')[1];native.saveBase64File(filename,blob.type,encoded)};reader.onerror=()=>toast('Erro ao preparar Excel');reader.readAsDataURL(blob);return}if(typeof native.saveTextFile==='function'&&blob.type!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){blob.text().then(text=>native.saveTextFile(filename,blob.type.split(';')[0],text)).catch(err=>toast('Erro ao exportar: '+err.message));return}}const url=URL.createObjectURL(blob);const a=mk('a',{href:url,download:filename});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000)}
async function backup(){await flush();download('CampoData_backup_'+localDate()+'.json',new Blob([JSON.stringify({app:'CampoData',version:2,exportedAt:now(),templates,records},null,2)],{type:'application/json;charset=utf-8'}));toast('Backup de formulários e entrevistas exportado')}
async function importBackup(file){
 if(!file)return;
 try{
  const doc=JSON.parse(await file.text());
  if(doc.app!=='CampoData'||!Array.isArray(doc.records))throw new Error('Arquivo incompatível');
  if(doc.records.length>100000||(doc.templates||[]).length>5000)throw new Error('Backup excede o limite');
  if(!confirm('Importar '+doc.records.length+' entrevistas e '+(doc.templates||[]).length+' formulários? Registros existentes só serão atualizados quando o backup for mais recente.'))return;
  const old=new Map(records.map(x=>[x.id,x]));
  const formOld=new Map(templates.map(x=>[x.id,x]));
  for(const template of doc.templates||[]){
   if(!template||typeof template.id!=='string'||template.id===DEFAULT_FORM_ID||!Array.isArray(template.sections))continue;
   if(!formOld.has(template.id)||String(template.updatedAt||'')>String(formOld.get(template.id).updatedAt||''))await saveTemplate(template);
  }
  for(const record of doc.records){
   if(!record||typeof record.id!=='string'||!record.answers||typeof record.answers!=='object')continue;
   const previous=old.get(record.id);
   if(!previous||String(record.updatedAt||'')>String(previous.updatedAt||''))await save(record);
  }
  templates=await getTemplates();templates=await recoverTemplates(templates);
  records=await rows();records=await recoverAndroid(records);await ensureInterviewCodes(records);
  records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));page='records';render();toast('Entrevistas e formulários restaurados');
 }catch(e){toast('Falha na importação: '+e.message)}
}
function renderBackup(){main.append(H('Dados e segurança','Exportação local para análise científica e cópias de segurança. Nenhuma resposta é enviada ao GitHub.'));const panel=mk('div',{class:'panel'},mk('h2',{text:'Exportar entrevistas'}));panel.append(mk('div',{class:'tool-card'},mk('h3',{text:'Planilha CSV para Excel, R e estatística'}),mk('p',{text:'Uma linha por entrevista, com identificação, questões, respostas múltiplas e campos adicionais.'}),button('⇩ Exportar CSV',csv,'primary')));
panel.append(mk('div',{class:'tool-card'},mk('h3',{text:'Planilha Excel XLSX'}),mk('p',{text:'Arquivo Excel com uma linha por entrevista e colunas separadas por formulário.'}),button('⇩ Exportar Excel (.xlsx)',xlsx,'primary')));panel.append(mk('div',{class:'tool-card'},mk('h3',{text:'Backup completo em JSON'}),mk('p',{text:'Inclui entrevistas, fotografias e todos os formulários criados. Guarde uma cópia fora do aparelho.'}),button('⇩ Baixar backup JSON',backup,'primary')));
const upload=mk('input',{type:'file',accept:'.json,application/json',class:'input',on:{change:e=>importBackup(e.target.files?.[0])}});panel.append(mk('div',{class:'tool-card'},mk('h3',{text:'Restaurar ou reunir fichas de outros aparelhos'}),mk('p',{text:'Selecione o JSON exportado de outro aparelho. Os formulários personalizados e as fichas serão reunidos pelos seus identificadores.'}),upload));main.append(panel,banner('Importante: desinstalar o aplicativo, limpar os dados do navegador ou trocar de endereço pode apagar o armazenamento local. Não use navegação privada. Guarde backups fora do aparelho.',true))}

/* Banco de questionários personalizados — mantém a coleção antiga de entrevistas. */
const clone=v=>JSON.parse(JSON.stringify(v));
const templateById=id=>!id||id===DEFAULT_FORM_ID?schema:templates.find(t=>t.id===id)||null;
function getTemplates(){return new Promise((resolve,reject)=>{const req=db.transaction('formularios','readonly').objectStore('formularios').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function saveTemplate(template){return new Promise((resolve,reject)=>{const tx=db.transaction('formularios','readwrite');tx.objectStore('formularios').put(template);tx.oncomplete=()=>{androidTemplateShadow(template);resolve()};tx.onerror=()=>reject(tx.error)})}
function deleteTemplate(id){return new Promise((resolve,reject)=>{const tx=db.transaction('formularios','readwrite');tx.objectStore('formularios').delete(id);tx.oncomplete=()=>{androidTemplateDelete(id);resolve()};tx.onerror=()=>reject(tx.error)})}
function androidTemplateShadow(template){
 if(!androidDevice())return;
 try{const native=androidBridge();if(native?.writeTemplate)native.writeTemplate(JSON.stringify(template));else localStorage.setItem('CampoData-template-'+template.id,JSON.stringify(template))}
 catch(e){console.warn('Cópia de formulário indisponível',e)}
}
function androidTemplateDelete(id){
 if(!androidDevice())return;
 try{const native=androidBridge();if(native?.deleteTemplate)native.deleteTemplate(id);else localStorage.removeItem('CampoData-template-'+id)}
 catch(e){console.warn('Remoção de cópia indisponível',e)}
}
async function recoverTemplates(existing){
 if(!androidDevice())return existing;
 let copies=[];
 try{
  const native=androidBridge();
  if(native?.readTemplates){const vals=JSON.parse(native.readTemplates()||'[]');if(Array.isArray(vals))copies=vals}
  else for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('CampoData-template-')){try{copies.push(JSON.parse(localStorage.getItem(key)))}catch(e){console.warn(e)}}}
 }catch(e){console.warn('Leitura de formulários de reserva falhou',e)}
 const map=new Map(existing.map(x=>[x.id,x]));
 for(const item of copies){
  if(!item||typeof item.id!=='string'||!Array.isArray(item.sections)||item.id===DEFAULT_FORM_ID)continue;
  const earlier=map.get(item.id);
  if(!earlier||String(item.updatedAt||'')>String(earlier.updatedAt||'')){
   try{await saveTemplate(item);map.set(item.id,item)}catch(e){console.warn('Recuperação de formulário falhou',e)}
  }
 }
 return [...map.values()];
}
function makeTemplate(source=null){
 if(source){const t=clone(source);t.id=uid();t.name='Cópia de '+t.name;t.createdAt=now();t.updatedAt=t.createdAt;return t}
 return {id:uid(),name:'Novo formulário',description:'',createdAt:now(),updatedAt:now(),metadata:clone(schema.metadata),sections:[{id:uid(),title:'Bloco 1',questions:[{id:uid(),label:'Nova pergunta',type:'text',required:false,options:[]}]}]};
}
const formLabel=record=>record.formName||formForRecord(record)?.name||schema.name;
function renderForms(){
 main.append(H('Gerenciar formulários','Crie, edite ou duplique questionários de campo sem alterar o instrumento original. Tudo pode ser feito offline.',button('＋ Criar formulário',()=>{editing=makeTemplate();page='editor';render()},'primary')));
 main.append(banner('Questionários personalizados ficam neste dispositivo. Faça backup JSON para guardá-los ou transferi-los para outro celular. Entrevistas já iniciadas mantêm a versão das perguntas usada na coleta.'));
 const panel=mk('div',{class:'panel'},mk('h2',{text:'Biblioteca de formulários'}));
 const all=[schema,...templates];
 for(const t of all){
  const builtin=t.id===DEFAULT_FORM_ID;
  const count=records.filter(r=>(r.formId||DEFAULT_FORM_ID)===t.id).length;
  const questions=t.sections.reduce((a,b)=>a+b.questions.length,0);
  const line=mk('div',{class:'record'},mk('div',{},mk('strong',{text:t.name}),mk('small',{text:questions+' perguntas · '+t.sections.length+' blocos · '+count+' entrevistas'+(builtin?' · Formulário original protegido':'') })));
  const actions=mk('div',{class:'row'},button('Responder',()=>startWith(t),'primary'),button('Duplicar',()=>{editing=makeTemplate(t);page='editor';render()}));
  if(!builtin){
   actions.append(button('Editar',()=>{editing=clone(t);page='editor';render()}));
   actions.append(button('Excluir',async()=>{if(!confirm('Excluir este formulário da biblioteca? As entrevistas existentes continuarão salvas.'))return;await deleteTemplate(t.id);templates=templates.filter(x=>x.id!==t.id);render();toast('Formulário excluído da biblioteca')},'danger'));
  }
  line.append(actions);panel.append(line);
 }
 main.append(panel);
}
function renderPick(){
 main.append(H('Escolher formulário','Selecione o questionário que deseja aplicar nesta nova entrevista.',button('＋ Criar formulário',()=>{editing=makeTemplate();page='editor';render()})));
 for(const t of [schema,...templates]){
  const n=t.sections.reduce((a,b)=>a+b.questions.length,0);
  const p=mk('div',{class:'tool-card'},mk('h2',{text:t.name}),mk('p',{text:n+' perguntas · '+t.sections.length+' blocos'}));
  p.append(button('Começar entrevista →',()=>startWith(t),'primary'));
  main.append(p);
 }
}
function editField(label,value,update,kind='text'){
 const box=mk('div',{class:'form-edit-field'},mk('label',{class:'field-label',text:label}));
 const el=kind==='textarea'?mk('textarea',{class:'input',rows:'3',on:{input:e=>update(e.target.value)}}):mk('input',{class:'input',type:'text',value:value||'',on:{input:e=>update(e.target.value)}});
 if(kind==='textarea')el.value=value||'';
 box.append(el);return box;
}
function addNewQuestion(section){
 section.questions.push({id:uid(),label:'Nova pergunta',type:'text',required:false,options:[]});
 renderEditor();
}
function moveItem(arr,index,offset){
 const next=index+offset;
 if(next<0||next>=arr.length)return;
 const [item]=arr.splice(index,1);arr.splice(next,0,item);
 renderEditor();
}
const QUESTION_TYPES=[
 ['text','Texto curto'],['textarea','Texto longo'],['number','Número'],['select','Escolha única'],
 ['multiple','Múltipla escolha'],['yesno','Sim / Não / Não sabe'],['scale','Escala de 1 a 5 + NS'],
 ['date','Data'],['time','Hora'],['gps','Coordenadas GPS'],['photo','Fotografia']
];
function renderEditor(){
 main.replaceChildren();
 if(!editing){page='forms';render();return}
 main.append(H('Editor de formulário','Crie blocos, perguntas e opções. Salve o formulário para usá-lo em entrevistas offline.'));
 const head=mk('div',{class:'panel'},editField('Título do formulário',editing.name,v=>editing.name=v),editField('Descrição / objetivo',editing.description||'',v=>editing.description=v,'textarea'));
 main.append(head);
 editing.sections.forEach((section,si)=>{
  const panel=mk('div',{class:'panel form-editor-section'});
  panel.append(mk('div',{class:'panel-heading'},mk('h2',{text:'Bloco '+(si+1)}),
   mk('div',{class:'row'},button('↑',()=>moveItem(editing.sections,si,-1)),button('↓',()=>moveItem(editing.sections,si,1)),
   button('Excluir bloco',()=>{if(editing.sections.length<2){toast('Mantenha pelo menos um bloco');return}if(!confirm('Excluir bloco e perguntas deste formulário?'))return;editing.sections.splice(si,1);renderEditor()},'danger'))));
  panel.append(editField('Título do bloco',section.title,v=>section.title=v));
  section.questions.forEach((q,qi)=>{
   const question=mk('div',{class:'tool-card'},mk('div',{class:'panel-heading'},mk('h3',{text:'Pergunta '+(qi+1)}),
    mk('div',{class:'row'},button('↑',()=>moveItem(section.questions,qi,-1)),button('↓',()=>moveItem(section.questions,qi,1)),
    button('Remover',()=>{section.questions.splice(qi,1);renderEditor()},'danger'))));
   question.append(editField('Enunciado',q.label,v=>q.label=v,'textarea'));
   const controls=mk('div',{class:'row question-controls'});
   const type=mk('select',{class:'input',on:{change:e=>{q.type=e.target.value;if(['select','multiple'].includes(q.type)&&(!q.options||q.options.length<2))q.options=['Opção 1','Opção 2'];renderEditor()}}});
   for(const [value,name] of QUESTION_TYPES)type.append(mk('option',{value,text:name}));
   type.value=q.type||'text';
   controls.append(mk('label',{class:'type-control'},mk('span',{text:'Tipo de resposta'}),type));
   const required=mk('input',{type:'checkbox',checked:!!q.required,on:{change:e=>q.required=e.target.checked}});
   controls.append(mk('label',{class:'option'},required,mk('span',{text:'Resposta obrigatória'})));
   question.append(controls);
   if(['select','multiple'].includes(q.type)){
    question.append(editField('Alternativas (uma por linha)',(q.options||[]).join('\n'),v=>q.options=v.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),'textarea'));
   }
   panel.append(question);
  });
  panel.append(button('＋ Adicionar pergunta neste bloco',()=>addNewQuestion(section)));
  main.append(panel);
 });
 main.append(mk('div',{class:'form-nav'},button('＋ Adicionar bloco',()=>{editing.sections.push({id:uid(),title:'Bloco '+(editing.sections.length+1),questions:[]});renderEditor()}),
  mk('div',{class:'row'},button('Cancelar',()=>{editing=null;page='forms';render()}),button('Salvar formulário',saveEditor,'primary'))));
}
async function saveEditor(){
 if(!editing)return;
 editing.name=String(editing.name||'').trim();
 if(!editing.name){toast('Informe o título do formulário');return}
 if(!editing.sections.length||editing.sections.every(s=>!s.questions.length)){toast('Adicione pelo menos uma pergunta');return}
 for(const section of editing.sections){
  section.title=String(section.title||'').trim();
  if(!section.title){toast('Informe o título de todos os blocos');return}
  for(const q of section.questions){
   q.label=String(q.label||'').trim();
   if(!q.label){toast('Preencha todos os enunciados');return}
   if(['select','multiple'].includes(q.type)&&(!Array.isArray(q.options)||q.options.length<2)){toast('Cada seleção deve ter pelo menos duas alternativas');return}
  }
 }
 try{
  editing.updatedAt=now();
  await saveTemplate(editing);
  templates=templates.filter(x=>x.id!==editing.id);templates.push(clone(editing));
  templates.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  editing=null;page='forms';render();toast('Formulário salvo neste dispositivo');
 }catch(e){toast('Erro ao salvar formulário: '+e.message)}
}
function startWith(template){
 flush().catch(console.warn);
 const started=new Date(),stamp=started.toISOString(),id=uid();
 current={id,formId:template.id||DEFAULT_FORM_ID,formName:template.name,formSnapshot:clone(template),
  answers:{codigo:interviewCode(started,id),data:localDate(started),inicio:started.toTimeString().slice(0,8)},
  status:'rascunho',createdAt:stamp,startedAt:stamp,updatedAt:stamp,schema:template.id||DEFAULT_FORM_ID};
 save(current).then(()=>{records.unshift(current);page='form';step=0;window.scrollTo(0,0);render()}).catch(e=>toast('Erro ao iniciar entrevista: '+e.message));
}
async function create(){
 try{await flush();if(!templates.length){startWith(schema);return}page='pick';current=null;window.scrollTo(0,0);render()}
 catch(e){toast('Erro ao preservar a entrevista anterior: '+e.message)}
}

function renderHelp(){main.append(H('Como usar em campo','Guia rápido para celulares e tablets Android, iPhone e iPad.'));const p=mk('div',{class:'panel'});const help=[['Instalar','Conecte à internet uma vez, abra este site no Chrome (Android) ou Safari (iPhone/iPad). Android: menu ⋮ → Instalar aplicativo. iOS: Compartilhar → Adicionar à Tela de Início.'],['Conferir offline','Com a página e o questionário carregados, ative o modo avião, feche e reabra o aplicativo. Crie uma ficha de teste para verificar que as respostas persistem.'],['Preencher','Toque em Nova entrevista; o código e o horário inicial serão gerados automaticamente. Informe o nome do(a) entrevistado(a), os demais dados e percorra os 11 blocos. O encerramento será registrado ao concluir.'],['Consentimento e privacidade','Este aplicativo registra o nome do(a) entrevistado(a) como informação pessoal, por solicitação da equipe, diferente da orientação original do questionário. Verifique o TCLE e o protocolo ético; mantenha o dispositivo protegido e faça backups em local seguro. O nome será incluído nos arquivos CSV e JSON.'],['GPS e mapa','A captura de GPS depende da permissão e do sinal do dispositivo; coordenadas manuais são possíveis. A questão 35 permite registrar observação e fotografia de mapa local preenchido.'],['Gerenciar formulários','Abra Gerenciar formulários para criar blocos, perguntas e alternativas. Você pode duplicar o questionário original; alterações em um formulário não modificam entrevistas já iniciadas.'],['Guardar dados','No Android, a versão PWA e o APK são caminhos independentes. Cada um tem seu próprio banco de dados: para transferir fichas, exporte JSON e importe no outro aplicativo. O APK ainda mantém uma cópia espelho local das entrevistas. Após cada jornada, exporte o backup JSON para um local externo ao aparelho. CSV serve à análise em Excel ou R. Não há sincronização automática entre dispositivos.']];for(const [title,desc] of help)p.append(mk('div',{class:'tool-card'},mk('h3',{text:title}),mk('p',{text:desc})));main.append(p)}
function connection(){const el=$('#network');el.textContent=navigator.onLine?'● Conexão disponível':'● Sem internet · coleta offline';el.classList.toggle('offline',!navigator.onLine)}
async function boot(){try{const resp=await fetch('./questionario.json');if(!resp.ok)throw new Error('Questionário não carregou');schema=await resp.json();schema.id=DEFAULT_FORM_ID;if(schema.sections.length!==11||schema.sections.reduce((n,s)=>n+s.questions.length,0)!==52)throw new Error('O instrumento deve ter 52 questões em 11 blocos');db=await openDB();templates=await getTemplates();templates=await recoverTemplates(templates);records=await rows();records=await recoverAndroid(records);await ensureInterviewCodes(records);records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.page)));$('#install').addEventListener('click',()=>installPrompt?.prompt());window.addEventListener('online',connection);window.addEventListener('offline',connection);window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false});connection();render();if('serviceWorker'in navigator&&!androidBridge())navigator.serviceWorker.register('./sw.js').catch(console.warn);if(androidDevice()&&navigator.storage?.persist)navigator.storage.persist().catch(()=>{})}catch(e){main.replaceChildren(banner('Não foi possível inicializar o aplicativo: '+e.message,true));console.error(e)}}
boot();
