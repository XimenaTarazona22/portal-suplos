
(() => {
  const D = window.PORTAL_DATA;
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const pct = v => `${(Number(v)*100).toFixed(Number(v)*100 % 1 ? 1 : 0)}%`;
  const statusClass = s => s.includes('Pendiente') ? 'badge-pending' : s.includes('validación') ? 'badge-validation' : 'badge-proposed';
  let currentModule = 'Todos';

  /* ---------------------------------------------------------------------
     Análisis de campos: se calcula una sola vez por integración a partir de
     los ejemplos JSON y las filas del mapeo. Los JSON solo se leen.
  --------------------------------------------------------------------- */
  const FM = window.FieldMatching;
  const MT = FM.MATCH;
  const ANALYSIS = {};
  D.integrations.forEach(i => { ANALYSIS[i.code] = FM.analyzeIntegration(i, D.mappingsByKey[i.mappingKey] || []); });
  const analysisOf = i => ANALYSIS[i.code] || { rows: [], report: {} };
  const GLOBAL = FM.summarize(D.integrations.map(i => analysisOf(i)));

  /* Clase visual por tipo de coincidencia. */
  const matchClass = t => ({
    [MT.EXACT]: 'match-exact',
    [MT.CAI]: 'match-cai',
    [MT.ALIAS]: 'match-alias',
    [MT.STRUCTURE]: 'match-structure',
    [MT.JSON_ONLY]: 'match-json-only',
    [MT.MAPPING_ONLY]: 'match-missing',
    [MT.PENDING]: 'match-pending'
  }[t] || 'match-exact');

  /* Resumen de la columna Coincidencia. */
  const matchState = t => {
    if (t === MT.EXACT || t === MT.CAI || t === MT.ALIAS) return 'Coincide';
    if (t === MT.STRUCTURE) return 'Estructura';
    if (t === MT.JSON_ONLY) return 'Solo JSON';
    if (t === MT.MAPPING_ONLY) return 'Solo mapeo';
    return 'Pendiente';
  };

  function go(section){
    $$('.section').forEach(x=>x.classList.remove('active'));
    $(`#section-${section}`).classList.add('active');
    $$('.nav-link').forEach(x=>x.classList.toggle('active',x.dataset.section===section));
    closeSidebar();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  $$('.nav-link').forEach(b=>b.addEventListener('click',()=>go(b.dataset.section)));

  const sidebar=$('#sidebar'), overlay=$('#overlay');
  function closeSidebar(){sidebar.classList.remove('open');overlay.classList.remove('show')}
  $('#menuButton').addEventListener('click',()=>{sidebar.classList.toggle('open');overlay.classList.toggle('show')});
  overlay.addEventListener('click',closeSidebar);

  function renderHome(){
    const m=D.metrics;
    $('#homeMetrics').innerHTML=[
      [m.activeIntegrations,'Integraciones oficiales'],
      [GLOBAL.total,'Campos JSON / mapeo visibles'],
      [GLOBAL.cai+GLOBAL.alias,'Resueltos por Atributo CAI o alias'],
      [GLOBAL.structures,'Estructuras presentes'],
      [GLOBAL.mappingOnly,'Campos solo en el mapeo']
    ].map(x=>`<div class="metric"><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');
    const modules={};D.integrations.forEach(i=>{modules[i.module]=(modules[i.module]||0)+1});
    $('#moduleBaseline').innerHTML=`<div class="table-shell"><table class="data-table"><thead><tr><th>Módulo</th><th>Integraciones</th><th>Peso</th></tr></thead><tbody>${Object.entries(modules).map(([m,c])=>`<tr><td><strong>${esc(m)}</strong></td><td>${c}</td><td>${pct(D.integrations.filter(i=>i.module===m).reduce((a,b)=>a+b.weight,0))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderArchitecture(){
    $('#layerCards').innerHTML=D.architecture.layers.map(l=>`<div class="layer-item"><strong>${esc(l.name)}</strong><span>${esc(l.role)}</span></div>`).join('');
  }

  function renderFilters(){
    const mods=['Todos',...new Set(D.integrations.map(i=>i.module))];
    $('#moduleFilters').innerHTML=mods.map(m=>`<button class="filter-pill ${m==='Todos'?'active':''}" data-module="${esc(m)}">${esc(m)}</button>`).join('');
    $$('#moduleFilters .filter-pill').forEach(b=>b.addEventListener('click',()=>{currentModule=b.dataset.module;$$('#moduleFilters .filter-pill').forEach(x=>x.classList.toggle('active',x===b));renderCatalog()}));
  }

  function mappingText(i){
    return analysisOf(i).rows.map(r=>r.searchText).join(' ');
  }
  function renderCatalog(){
    const q=$('#integrationSearch').value.trim().toLowerCase();
    const st=$('#integrationStatus').value;
    const rows=D.integrations.filter(i=>(currentModule==='Todos'||i.module===currentModule)&&(st==='all'||i.status===st)&&(!q||[i.code,i.technicalCode,i.title,i.objective,i.trigger,mappingText(i)].join(' ').toLowerCase().includes(q)));
    $('#integrationGrid').innerHTML=rows.map(i=>`<button class="integration-card" data-code="${esc(i.code)}"><div class="card-top"><code>${esc(i.sourceId)} · ${esc(i.code)}</code><span class="badge badge-module">${esc(i.module)}</span></div><h3>${esc(i.title)}</h3><p>${esc(i.objective)}</p><div class="stats"><span>${pct(i.weight)} del proyecto</span><span>${analysisOf(i).report.total} campos JSON</span>${analysisOf(i).report.mappingOnly?`<span class="badge badge-pending">${analysisOf(i).report.mappingOnly} sin equivalencia</span>`:''}<span class="badge ${statusClass(i.status)}">${esc(i.status)}</span></div></button>`).join('');
    $('#integrationEmpty').hidden=rows.length>0;
    $$('.integration-card').forEach(c=>c.addEventListener('click',()=>openIntegration(c.dataset.code)));
  }
  $('#integrationSearch').addEventListener('input',renderCatalog);$('#integrationStatus').addEventListener('change',renderCatalog);

  function fieldRows(i,type){return analysisOf(i).rows.filter(r=>r.service.toLowerCase().includes(type.toLowerCase()))}
  function mappingTable(rows){
    if(!rows.length) return '<div class="no-data">No hay campos JSON asociados para este tipo de servicio.</div>';
    return `<div class="table-shell"><table class="data-table mapping-table"><thead><tr><th>Coincidencia</th><th>Tipo</th><th>Estructura / operación</th><th>Campo JSON</th><th>Descripción</th><th>Atributo CAI / PeopleSoft</th><th>Tipo de coincidencia</th><th>Tabla</th><th>Tipo</th><th>Long.</th><th>Obligatorio</th><th>Transformación</th><th>Estado</th></tr></thead><tbody>${rows.map(r=>{
      const d=r.display||{};
      const evidencia=r.evidence?`<div class="match-evidence">${esc(r.evidence)}</div>`:'';
      return `<tr><td><span class="mapping-match ${matchClass(r.matchType)}">${esc(matchState(r.matchType))}</span></td><td>${esc(r.service)}</td><td>${esc(r.operacion||'Pendiente')}</td><td><code>${esc(d.campoJson||r.campoJson)}</code></td><td>${esc(d.descripcion||'')}</td><td><code>${esc(d.atributoCai||'Pendiente')}</code></td><td class="match-cell"><span class="match-tag ${matchClass(r.matchType)}">${esc(r.matchType)}</span>${evidencia}</td><td><code>${esc(d.tabla||'Pendiente')}</code></td><td>${esc(d.tipoCampo||'')}</td><td>${esc(d.longitud||'')}</td><td>${esc(d.obligatorio||'Pendiente')}</td><td>${esc(d.transformacion||'Pendiente')}</td><td class="field-state ${(d.estado||'').toLowerCase().includes('valid')?'pending':''}">${esc(d.estado||'Pendiente')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  /* Informe de conciliación por presencia en la estructura del JSON. */
  function reconciliationReport(rep){
    const items=[
      ['Coincidencias exactas',rep.exact,'match-exact'],
      ['Coincidencias por Atributo CAI',rep.cai,'match-cai'],
      ['Coincidencias por alias',rep.alias,'match-alias'],
      ['Estructuras presentes',rep.structures,'match-structure'],
      ['Campos solo en el JSON',rep.jsonOnly,'match-json-only'],
      ['Campos solo en el mapeo',rep.mappingOnly,'match-missing']
    ];
    return `<div class="reconciliation">${items.map(x=>`<div class="reconciliation-item ${x[2]}"><strong>${x[1]}</strong><span>${x[0]}</span></div>`).join('')}</div>`;
  }
  const SCOPE_NOTE=FM.SCOPE_NOTE;
  function sourceLinks(i){
    return (i.sourceDocuments||[]).map(d=>`<a class="source-inline" href="${esc(d.href)}" target="_blank" rel="noopener">${esc(d.label)}</a>`).join('');
  }
  function list(items){return `<ul>${(items||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`}

  function openIntegration(code){
    const i=D.integrations.find(x=>x.code===code); if(!i)return;
    $('#catalogView').hidden=true;$('#detailView').hidden=false;
    const analysis=analysisOf(i), rep=analysis.report, all=analysis.rows;
    const req=fieldRows(i,'Petición'), res=fieldRows(i,'Respuesta');
    const stats=i.mappingStats||{};
    const altJson=i.alternateRequestExample?`<article class="json-variant"><div class="code-head"><span>Variante JSON adicional</span><button class="copy contract-copy" data-kind="alternate">Copiar</button></div><pre data-contract="alternate">${esc(i.alternateRequestExample)}</pre></article>`:'';
    const faltantes=all.filter(r=>r.matchType===MT.MAPPING_ONLY);
    const mappingOnly=faltantes.length?`<details class="mapping-only"><summary>${faltantes.length} campo(s) del mapeo sin presencia en el JSON, verificados contra Campo JSON, Atributo CAI / PeopleSoft, alias documentados y nombres de estructura</summary><div class="token-list">${faltantes.map(x=>`<code>${esc(x.campoJson)}</code>`).join('')}</div></details>`:'';
    const sinFuente=rep.withoutJsonSource&&rep.withoutJsonSource.length?`<details class="mapping-only"><summary>${rep.withoutJsonSource.length} fila(s) sin ejemplo JSON de referencia para su tipo de servicio</summary><div class="token-list">${rep.withoutJsonSource.map(x=>`<code>${esc(x.field)}</code>`).join('')}</div></details>`:'';
    $('#integrationDetail').innerHTML=`
      <div class="detail-hero"><div class="detail-title"><div><span class="badge badge-module">${esc(i.module)}</span><h1>${esc(i.code)}</h1><p>${esc(i.title)}</p></div><span class="badge ${statusClass(i.status)}">${esc(i.status)}</span></div><div class="detail-meta"><div class="meta-box"><strong>ID oficial</strong><span>${esc(i.sourceId)}</span></div><div class="meta-box"><strong>Dirección</strong><span>${esc(i.direction)}</span></div><div class="meta-box"><strong>Consume</strong><span>${esc(i.consumes)}</span></div><div class="meta-box"><strong>Expone</strong><span>${esc(i.exposes)}</span></div><div class="meta-box"><strong>Peso</strong><span>${pct(i.weight)}</span></div></div></div>
      <div class="tabs"><button class="tab-button active" data-tab="summary">Resumen</button><button class="tab-button" data-tab="rules">Reglas y validaciones</button><button class="tab-button" data-tab="flow">Flujo funcional</button><button class="tab-button" data-tab="sequence">Secuencia Mermaid</button><button class="tab-button" data-tab="contract">JSON Request / Response</button><button class="tab-button" data-tab="mapping">Mapeo</button><button class="tab-button" data-tab="quality">Fuentes y pendientes</button></div>
      <div class="tab-panel active" data-panel="summary"><div class="info-grid"><article class="info-card"><h3>Objetivo</h3><p>${esc(i.objective)}</p></article><article class="info-card"><h3>Evento disparador</h3><p>${esc(i.trigger)}</p></article><article class="info-card"><h3>Precondiciones</h3>${list(i.preconditions)}</article><article class="info-card"><h3>Acción esperada en SUPLOS</h3><p>${esc(i.suploAction)}</p></article></div><article class="info-card" style="margin-top:14px"><h3>Pasos funcionales</h3><ol class="number-list">${i.functionalSteps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></article></div>
      <div class="tab-panel" data-panel="rules"><div class="grid two"><article class="info-card"><h3>Reglas de negocio</h3>${list(i.businessRules)}</article><article class="info-card"><h3>Validaciones</h3>${list(i.validations)}</article></div></div>
      <div class="tab-panel" data-panel="flow"><article class="diagram-card"><div class="diagram-head"><div><h2>Flujo funcional por integración</h2><p class="muted">Construido a partir del diseño funcional específico.</p></div><button class="btn ghost small copy-mermaid" data-source="flow">Copiar Mermaid</button></div><div class="mermaid-wrap"><div class="mermaid integration-flow-image" data-mermaid-source="flow">${esc(i.flowMermaid)}</div><div class="mermaid-fallback">No se pudo cargar Mermaid. Use el código fuente disponible debajo.</div></div><details class="mermaid-source"><summary>Ver código Mermaid</summary><pre data-code="flow">${esc(i.flowMermaid)}</pre></details></article></div>
      <div class="tab-panel" data-panel="sequence"><article class="diagram-card"><div class="diagram-head"><div><h2>Secuencia técnica</h2><p class="muted">Dirección, seguridad, trazabilidad, procesamiento y respuesta.</p></div><button class="btn ghost small copy-mermaid" data-source="sequence">Copiar Mermaid</button></div><div class="mermaid-wrap"><div class="mermaid integration-flow-image" data-mermaid-source="sequence">${esc(i.sequenceMermaid)}</div><div class="mermaid-fallback">No se pudo cargar Mermaid. Use el código fuente disponible debajo.</div></div><details class="mermaid-source"><summary>Ver código Mermaid</summary><pre data-code="sequence">${esc(i.sequenceMermaid)}</pre></details></article></div>
      <div class="tab-panel" data-panel="contract"><div class="mapping-summary"><div class="mini-metric"><strong>${i.requestKeys?.length||0}</strong><span>Claves de petición</span></div><div class="mini-metric"><strong>${i.responseKeys?.length||0}</strong><span>Claves de respuesta</span></div><div class="mini-metric"><strong>${rep.jsonOnly||0}</strong><span>JSON sin mapeo</span></div><div class="mini-metric"><strong>${rep.structures||0}</strong><span>Estructuras JSON</span></div></div><div class="callout info"><strong>Prioridad aplicada:</strong> estos ejemplos provienen de los archivos JSON adjuntos. El mapeo se cruza contra sus nombres de campo y no se utiliza para generar o completar silenciosamente el JSON.</div><div class="request-grid"><article><div class="code-head"><span>JSON fuente - Petición / envío</span><button class="copy contract-copy" data-kind="request">Copiar</button></div><pre data-contract="request">${esc(i.requestExample)}</pre></article><article><div class="code-head"><span>JSON fuente - Respuesta</span><button class="copy contract-copy" data-kind="response">Copiar</button></div><pre data-contract="response">${esc(i.responseExample)}</pre></article></div>${altJson}<div class="grid two" style="margin-top:14px"><article class="info-card"><h3>Información enviada</h3><p>${esc(i.requestSummary)}</p></article><article class="info-card"><h3>Información devuelta</h3><p>${esc(i.responseSummary)}</p></article></div></div>
      <div class="tab-panel" data-panel="mapping"><div class="callout info"><strong>Alcance de la validación:</strong> ${esc(SCOPE_NOTE)} Un campo solo se declara ausente después de buscarlo por Campo JSON, por Atributo CAI / PeopleSoft, por alias documentado y por nombre de estructura.</div>${reconciliationReport(rep)}<div class="toolbar"><input id="mappingSearch" type="search" placeholder="Buscar campo, tabla, atributo, ruta o tipo de coincidencia"><select id="mappingType"><option value="all">Petición y respuesta</option><option value="Petición">Petición</option><option value="Respuesta">Respuesta</option></select><select id="mappingMatch"><option value="all">Todos los tipos de coincidencia</option>${Object.keys(MT).map(k=>`<option>${esc(MT[k])}</option>`).join('')}</select><button class="btn secondary small" id="exportMapping">Exportar conciliación CSV</button></div><div id="mappingContainer">${mappingTable(all)}</div>${mappingOnly}${sinFuente}</div>
      <div class="tab-panel" data-panel="quality"><div class="info-grid"><article class="info-card"><h3>Base utilizada</h3><p>${esc(i.sourceBasis)}</p><div class="source-inline-list">${sourceLinks(i)}</div></article><article class="info-card"><h3>Identificación</h3><p>Código catálogo: <strong>${esc(i.code)}</strong><br>Código funcional/técnico: <strong>${esc(i.technicalCode)}</strong><br>ID oficial: <strong>${esc(i.sourceId)}</strong><br>JSON fuente: <strong>${esc(i.jsonSource)}</strong></p></article></div><article class="info-card" style="margin-top:14px"><h3>Informe de conciliación de campos</h3>${reconciliationReport(rep)}<p class="muted">${esc(SCOPE_NOTE)}</p><p class="muted">Si un campo aparece varias veces dentro del mismo JSON, se consolida como una sola coincidencia positiva. Las estructuras (objetos y arreglos) no se cuentan como campos funcionales.</p>${rep.appliedRules&&rep.appliedRules.length?`<div class="rule-note"><strong>Reglas del proyecto aplicadas:</strong> ${rep.appliedRules.map(r=>`<code>${esc(r.field)} → ${esc(r.found)}</code>`).join(' · ')}${rep.appliedRules.some(r=>r.requiresValidation)?' <em>(requieren confirmación funcional)</em>':''}</div>`:''}${rep.anomalies?`<div class="rule-note">El ejemplo JSON fuente contiene ${rep.anomalies} fragmento(s) ilegible(s) por comillas desbalanceadas. Se conservan sin corregir y no se publican como campos.</div>`:''}</article><div class="quality-list" style="margin-top:14px">${(i.issues.length?i.issues:['No se registró una inconsistencia crítica adicional.']).map(x=>`<div class="quality-item">${esc(x)}</div>`).join('')}</div></div>`;
    $$('.tab-button',$('#integrationDetail')).forEach(b=>b.addEventListener('click',()=>{const tab=b.dataset.tab;$$('.tab-button',$('#integrationDetail')).forEach(x=>x.classList.toggle('active',x===b));$$('.tab-panel',$('#integrationDetail')).forEach(x=>x.classList.toggle('active',x.dataset.panel===tab));if(tab==='flow'||tab==='sequence') renderMermaid($('#integrationDetail'));}));
    $$('.copy-mermaid',$('#integrationDetail')).forEach(b=>b.addEventListener('click',()=>navigator.clipboard.writeText(i[b.dataset.source+'Mermaid'])));
    $$('.contract-copy',$('#integrationDetail')).forEach(b=>b.addEventListener('click',()=>{const el=$(`[data-contract="${b.dataset.kind}"]`,$('#integrationDetail'));if(el)navigator.clipboard.writeText(el.textContent)}));
    const ms=$('#mappingSearch'),mt=$('#mappingType'),mm=$('#mappingMatch');
    const filtered=()=>{const q=(ms?.value||'').toLowerCase(),t=mt?.value||'all',m=mm?.value||'all';
      return all.filter(r=>(t==='all'||r.service===t)&&(m==='all'||r.matchType===m)&&(!q||r.searchText.includes(q)))};
    if(ms&&mt){const rr=()=>{$('#mappingContainer').innerHTML=mappingTable(filtered())};
      ms.addEventListener('input',rr);mt.addEventListener('change',rr);if(mm)mm.addEventListener('change',rr)}
    const em=$('#exportMapping');
    if(em)em.addEventListener('click',()=>{
      const head=['Coincidencia','Tipo servicio','Estructura / operación','Campo JSON','Descripción','Atributo CAI / PeopleSoft','Tipo de coincidencia','Evidencia','Tabla','Tipo','Longitud','Obligatorio','Transformación','Estado'];
      const rows=[head,...filtered().map(r=>{const d=r.display||{};return [matchState(r.matchType),r.service,r.operacion,d.campoJson||r.campoJson,d.descripcion,d.atributoCai,r.matchType,r.evidence,d.tabla,d.tipoCampo,d.longitud,d.obligatorio,d.transformacion,d.estado]})];
      const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`conciliacion_${i.code}.csv`;a.click();URL.revokeObjectURL(a.href)});
    window.scrollTo({top:0,behavior:'smooth'});
  }
  $('#backCatalog').addEventListener('click',()=>{$('#detailView').hidden=true;$('#catalogView').hidden=false;window.scrollTo({top:0,behavior:'smooth'})});

  function renderMermaid(root=document){
    const nodes=$$('.mermaid:not([data-processed])',root);if(!nodes.length)return;
    // useMaxWidth:false hace que Mermaid escriba el ancho natural en píxeles en
    // lugar de width="100%". Sin esto el diagrama se estira hasta llenar el
    // contenedor y, al ser flujos verticales y estrechos, el texto se agranda.
    if(window.mermaid){try{mermaid.initialize({startOnLoad:false,securityLevel:'loose',theme:'base',flowchart:{useMaxWidth:false},sequence:{useMaxWidth:false},themeVariables:{primaryColor:'#fff1f2',primaryTextColor:'#1f2328',primaryBorderColor:'#d71920',lineColor:'#586273',secondaryColor:'#edf6ff',tertiaryColor:'#f4f6f8',fontFamily:'Inter, Segoe UI, Arial'}});mermaid.run({nodes});}catch(e){nodes.forEach(n=>n.nextElementSibling?.classList.add('show'))}}
    else nodes.forEach(n=>n.nextElementSibling?.classList.add('show'));
  }

  function renderErrors(){
    const cats=[...new Set(D.errorCodes.map(x=>x.category))];$('#errorCategory').innerHTML='<option value="all">Todas las categorías</option>'+cats.map(x=>`<option>${esc(x)}</option>`).join('');
    const run=()=>{const q=$('#errorSearch').value.toLowerCase(),c=$('#errorCategory').value;const rows=D.errorCodes.filter(x=>(c==='all'||x.category===c)&&(!q||Object.values(x).join(' ').toLowerCase().includes(q)));$('#errorTable').innerHTML=rows.map(x=>`<tr><td><code>${esc(x.http)}</code></td><td><code>${esc(x.code)}</code></td><td>${esc(x.category)}</td><td>${esc(x.layer)}</td><td>${esc(x.description)}</td><td>${esc(x.channel)}</td><td>${esc(x.retry)}</td><td>${esc(x.reprocess)}</td><td>${esc(x.action)}</td></tr>`).join('')};
    $('#errorSearch').addEventListener('input',run);$('#errorCategory').addEventListener('change',run);run();
  }

  function heatClass(value){return value>=15?'high':value>=8?'medium':'low'}
  function renderRisks(){
    let html='<div></div>'+[1,2,3,4,5].map(p=>`<div class="heat-label">P${p}</div>`).join('');
    for(let impact=5;impact>=1;impact--){html+=`<div class="heat-label">I${impact}</div>`;for(let prob=1;prob<=5;prob++){const val=prob*impact;const risks=D.risks.filter(r=>r.probability===prob&&r.impact===impact);html+=`<div class="heat-cell ${heatClass(val)}">${risks.map(r=>`<button class="risk-chip" data-risk="${r.id}">${r.id}</button>`).join('')}</div>`}}
    $('#riskHeatmap').innerHTML=html;$('#riskTable').innerHTML=D.risks.map(r=>`<tr><td><code>${r.id}</code></td><td>${esc(r.dimension)}</td><td>${esc(r.risk)}</td><td>${r.probability}</td><td>${r.impact}</td><td>${r.inherent}</td><td>${esc(r.criticality)}</td><td>${esc(r.status)}</td><td>${esc(r.mitigation)}</td><td>${esc(r.residual)}</td><td>${esc(r.priority)}</td></tr>`).join('');
    const show=id=>{const r=D.risks.find(x=>x.id===id);$('#riskSelected').innerHTML=`<strong>${r.id} · ${esc(r.risk)}</strong><br><span>${esc(r.mitigation)}</span>`};$$('.risk-chip').forEach(b=>b.addEventListener('click',()=>show(b.dataset.risk)));show(D.risks[0].id);
  }

  const STORE='suplos-cai-progress-v13';
  function loadProgress(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch{return {}}}
  function saveProgress(p){localStorage.setItem(STORE,JSON.stringify(p))}
  function renderProject(){
    const progress=loadProgress();D.projectItems.forEach(x=>{if(progress[x.code]===undefined)progress[x.code]=0});
    const total=D.projectItems.reduce((a,x)=>a+x.weight*(progress[x.code]||0),0);const completed=D.projectItems.filter(x=>(progress[x.code]||0)>=1).length;const active=D.projectItems.filter(x=>(progress[x.code]||0)>0&&(progress[x.code]||0)<1).length;
    $('#pmMetrics').innerHTML=[[pct(total),'Avance ponderado'],[`${completed} de ${D.projectItems.length}`,'Integraciones completadas'],[active,'Ítems en ejecución'],[pct(D.projectItems.reduce((a,b)=>a+b.weight,0)),'Peso total'],[D.projectItems.length-completed-active,'Pendientes sin avance']].map(x=>`<div class="metric"><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');
    const mods=[...new Set(D.projectItems.map(x=>x.module))];$('#moduleProgress').innerHTML=mods.map(m=>{const items=D.projectItems.filter(x=>x.module===m);const weight=items.reduce((a,b)=>a+b.weight,0);const contribution=items.reduce((a,b)=>a+b.weight*(progress[b.code]||0),0);const mp=weight?contribution/weight:0;return `<div class="progress-row"><span>${esc(m)}</span><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,mp*100)}%"></div></div><strong>${pct(mp)}</strong></div>`}).join('');
    $('#projectTable').innerHTML=D.projectItems.map(x=>{const v=progress[x.code]||0;const state=v>=1?'Completada':v>0?'En ejecución':'Pendiente';return `<tr><td>${esc(x.module)}</td><td><code>${esc(x.code)}</code></td><td>${pct(x.weight)}</td><td><input class="progress-input" data-code="${esc(x.code)}" type="number" min="0" max="100" step="1" value="${Math.round(v*100)}" aria-label="Avance de ${esc(x.code)}"> %</td><td>${pct(x.weight*v)}</td><td>${state}</td></tr>`}).join('');
    $$('.progress-input').forEach(inp=>inp.addEventListener('change',()=>{const p=loadProgress();p[inp.dataset.code]=Math.max(0,Math.min(100,Number(inp.value)||0))/100;saveProgress(p);renderProject()}));
  }
  $('#resetProgress').addEventListener('click',()=>{if(confirm('¿Restablecer todos los avances a 0 %?')){localStorage.removeItem(STORE);renderProject()}});
  $('#exportProgress').addEventListener('click',()=>{const p=loadProgress();const rows=[['Módulo','Integración','Peso','Avance','Aporte ponderado'],...D.projectItems.map(x=>[x.module,x.code,pct(x.weight),pct(p[x.code]||0),pct(x.weight*(p[x.code]||0))])];const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='avance_integraciones_suplos_cai.csv';a.click();URL.revokeObjectURL(a.href)});

  function renderSources(){
    const root=$('#sourceLibrary');if(!root)return;
    const groups={};(D.sourceLibrary||[]).forEach(x=>{(groups[x.category]??=[]).push(x)});
    root.innerHTML=Object.entries(groups).map(([cat,items])=>`<section class="source-group"><h2>${esc(cat)}</h2><div class="source-grid">${items.map(x=>`<a class="source-card" href="${esc(x.href)}" target="_blank" rel="noopener"><strong>${esc(x.label)}</strong><span>Abrir fuente incluida en el portal.</span></a>`).join('')}</div></section>`).join('');
  }

  // Global search routes to integrations.
  $('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){go('integrations');$('#integrationSearch').value=e.target.value;renderCatalog()}});
  $('[data-copy="envelope"]').addEventListener('click',()=>navigator.clipboard.writeText($('#envelope').textContent));

  // Image modal.
  const dlg=$('#imageDialog');$$('.zoom-image').forEach(b=>b.addEventListener('click',()=>{$('#dialogTitle').textContent=b.dataset.title;$('#dialogImage').src=b.dataset.image;dlg.showModal()}));$('#closeDialog').addEventListener('click',()=>dlg.close());dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});

  function loadMermaid(){
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.min.js';
    script.async=true;
    script.onload=()=>renderMermaid(document);
    script.onerror=()=>$$('.mermaid-fallback').forEach(x=>x.classList.add('show'));
    document.head.appendChild(script);
  }
  renderHome();renderArchitecture();renderFilters();renderCatalog();renderErrors();renderRisks();renderProject();renderSources();
  loadMermaid();
})();
