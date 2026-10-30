/* =============================================================================
   PRUEBAS DEL MOTOR DE COMPARACIÓN CAMPO JSON <-> MAPEO
   -----------------------------------------------------------------------------
   Ejecución:
     node tests/field-matching.test.js
   Sin Node instalado, abra tests/run-tests.html en el navegador.

   Las pruebas verifican también que los ejemplos JSON oficiales permanecen
   byte a byte idénticos después del análisis.
============================================================================= */
'use strict';

var FM = (typeof require === 'function')
  ? require('../assets/field-matching.js')
  : window.FieldMatching;

var M = FM.MATCH;
var results = [];

function test(name, fn) {
  try { fn(); results.push({ name: name, ok: true }); }
  catch (e) { results.push({ name: name, ok: false, error: e && e.message ? e.message : String(e) }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || 'valor inesperado') + ' → esperado: ' + JSON.stringify(expected) + ' · obtenido: ' + JSON.stringify(actual));
}

/* --- utilidades de fixture ------------------------------------------- */
function row(overrides) {
  var base = {
    'ID Integración': 'T-000',
    'Tipo servicio': 'Petición',
    'Método / Operación': 'HEADER',
    'Campo Json': '',
    'Descripción Campo': 'campo de prueba',
    'Atributo CAI / Fuente Sugerida CAI': '',
    'Tabla CAI': 'TBL',
    'Tipo Campo': 'VARCHAR',
    'Longitud': '10',
    'Obligatorio': 'Sí',
    'Regla de transformación / homologación': 'N/A',
    'Estado levantamiento': 'En validación',
    'Prioridad fuente': 'Excel adjunto',
    'Coincidencia JSON': 'Coincide'
  };
  Object.keys(overrides || {}).forEach(function (k) { base[k] = overrides[k]; });
  return base;
}
function find(rows, campo) {
  return rows.filter(function (r) { return r.campoJson === campo; })[0];
}

/* =====================================================================
   1. Campo JSON y campo del mapeo con el mismo nombre
===================================================================== */
test('1. Coincidencia exacta por nombre idéntico', function () {
  var out = FM.analyzeIntegration(
    { code: 'T1', requestExample: '{ "business_unit": "PODAV", "po_id": "12" }' },
    [row({ 'Campo Json': 'po_id', 'Atributo CAI / Fuente Sugerida CAI': 'PO_ID' })]
  );
  var r = find(out.rows, 'po_id');
  eq(r.matchType, M.EXACT, 'tipo de coincidencia');
  eq(r.jsonField, 'po_id', 'campo encontrado');
  eq(r.jsonPath, 'po_id', 'ruta JSON');
  eq(out.report.mappingOnly, 0, 'no debe haber faltantes');
});

/* =====================================================================
   2. Campo JSON distinto, coincidente con Atributo CAI
===================================================================== */
test('2. Coincide por Atributo CAI', function () {
  var out = FM.analyzeIntegration(
    { code: 'T2', requestExample: '{ "GB_TIPO_OPERACION": "creation", "otro": "x" }' },
    [row({ 'Campo Json': 'operation', 'Atributo CAI / Fuente Sugerida CAI': 'GB_TIPO_OPERACION' })]
  );
  var r = find(out.rows, 'operation');
  eq(r.matchType, M.CAI, 'tipo de coincidencia');
  eq(r.jsonField, 'GB_TIPO_OPERACION', 'campo encontrado');
  eq(out.report.mappingOnly, 0, 'no debe contarse como ausente');
  assert(r.evidence.indexOf('GB_TIPO_OPERACION') !== -1, 'la evidencia debe mostrar la equivalencia');
});

/* =====================================================================
   3. Coincidencia mediante Atributo PeopleSoft
===================================================================== */
test('3. Coincide por Atributo PeopleSoft', function () {
  var r3 = row({ 'Campo Json': 'supplier', 'Atributo PeopleSoft': 'VENDOR_ID' });
  delete r3['Atributo CAI / Fuente Sugerida CAI'];
  var out = FM.analyzeIntegration({ code: 'T3', requestExample: '{ "VENDOR_ID": "76" }' }, [r3]);
  var r = find(out.rows, 'supplier');
  eq(r.matchType, M.CAI, 'tipo de coincidencia');
  eq(r.jsonField, 'VENDOR_ID', 'campo encontrado');
});

/* =====================================================================
   4. Coincidencia mediante alias documentado
===================================================================== */
test('4. Coincide por alias documentado (registro del proyecto)', function () {
  var out = FM.analyzeIntegration(
    { code: 'CON_CONT_Crear_contrato', requestExample: '{ "GB_CONTRATO_ARRND": "N", "SETID": "1" }' },
    [row({ 'Campo Json': 'GB_ARRENDAMIENTO', 'Atributo CAI / Fuente Sugerida CAI': 'GB_ARRENDAMIENTO' })]
  );
  var r = find(out.rows, 'GB_ARRENDAMIENTO');
  eq(r.matchType, M.ALIAS, 'tipo de coincidencia');
  eq(r.jsonField, 'GB_CONTRATO_ARRND', 'campo encontrado');
  eq(out.report.mappingOnly, 0, 'no debe reportarse como ausente');
});

test('4b. Coincide por alias declarado en columna del Excel', function () {
  var out = FM.analyzeIntegration(
    { code: 'T4B', requestExample: '{ "GB_DESTINO": "x" }' },
    [row({ 'Campo Json': 'origen', 'Alias documentado': 'GB_DESTINO' })]
  );
  var r = find(out.rows, 'origen');
  eq(r.matchType, M.ALIAS, 'tipo de coincidencia');
  eq(r.jsonField, 'GB_DESTINO', 'campo encontrado');
});

/* =====================================================================
   5. Campo realmente ausente
===================================================================== */
test('5. Campo ausente del JSON', function () {
  var out = FM.analyzeIntegration(
    { code: 'T5', requestExample: '{ "business_unit": "PODAV" }' },
    [row({ 'Campo Json': 'campo_inexistente', 'Atributo CAI / Fuente Sugerida CAI': 'TAMPOCO_EXISTE' })]
  );
  var r = find(out.rows, 'campo_inexistente');
  eq(r.matchType, M.MAPPING_ONLY, 'tipo de coincidencia');
  eq(r.evidence, FM.ABSENT_MESSAGE, 'mensaje de ausencia');
  eq(out.report.mappingOnly, 1, 'debe contarse un faltante real');
});

/* =====================================================================
   6. Objeto raíz que no debe contarse como faltante
===================================================================== */
test('6. Objeto raíz clasificado como estructura', function () {
  var out = FM.analyzeIntegration(
    { code: 'T6', requestExample: '{ "GB_FAC_ELE_REQ": { "INVOICE_ID": "F1" } }' },
    [row({ 'Campo Json': 'INVOICE_ID', 'Atributo CAI / Fuente Sugerida CAI': 'INVOICE_ID' })]
  );
  var raiz = find(out.rows, 'GB_FAC_ELE_REQ');
  eq(raiz.matchType, M.STRUCTURE, 'el objeto raíz debe ser estructura');
  eq(out.report.jsonOnly, 0, 'el objeto raíz no cuenta como Solo JSON');
  eq(out.report.mappingOnly, 0, 'el objeto raíz no cuenta como faltante');
});

/* =====================================================================
   7. Arreglo que no debe contarse como campo funcional
===================================================================== */
test('7. Arreglo clasificado como estructura', function () {
  var out = FM.analyzeIntegration(
    { code: 'T7', requestExample: '{ "LINEA_Pedido": [ { "id_line": "1" } ] }' },
    [row({ 'Campo Json': 'id_line', 'Método / Operación': 'LINEA_Pedido (arreglo)', 'Atributo CAI / Fuente Sugerida CAI': 'LINE_NBR' })]
  );
  var arreglo = find(out.rows, 'LINEA_Pedido');
  eq(arreglo.matchType, M.STRUCTURE, 'el arreglo debe ser estructura');
  eq(arreglo.jsonKind, 'array', 'naturaleza del nodo');
  eq(out.report.jsonOnly, 0, 'el arreglo no cuenta como campo funcional pendiente');
  eq(find(out.rows, 'id_line').jsonPath, 'LINEA_Pedido[].id_line', 'ruta completa del campo interno');
});

/* =====================================================================
   8. Diferenciación entre answers y answer
===================================================================== */
test('8. answers (arreglo) se distingue de answer (campo funcional)', function () {
  var json = '{ "vendors": [ { "VENDOR_ID": "1", "answers": [ { "externalSystemCorrelationId": "Comentarios", "answer": "" } ] } ] }';
  var out = FM.analyzeIntegration(
    { code: 'PRO_FORM_Formulario_proveedor', responseExample: json },
    [
      row({ 'Tipo servicio': 'Respuesta', 'Campo Json': 'VENDOR_ID', 'Atributo CAI / Fuente Sugerida CAI': 'VENDOR_ID', 'Método / Operación': 'Crear / Modificar proveedor' }),
      row({ 'Tipo servicio': 'Respuesta', 'Campo Json': 'externalSystemCorrelationId', 'Atributo CAI / Fuente Sugerida CAI': 'GB_PREGUN_FORM', 'Método / Operación': 'Crear / Modificar proveedor' }),
      row({ 'Tipo servicio': 'Respuesta', 'Campo Json': 'answers', 'Atributo CAI / Fuente Sugerida CAI': 'GB_VALOR_FORM', 'Método / Operación': 'Crear / Modificar proveedor' })
    ]
  );
  var valor = find(out.rows, 'answers');
  eq(valor.matchType, M.ALIAS, 'la fila GB_VALOR_FORM debe resolver por equivalencia');
  eq(valor.jsonField, 'answer', 'campo encontrado');
  eq(valor.jsonPath, 'vendors[].answers[].answer', 'ruta completa');

  var pregunta = find(out.rows, 'externalSystemCorrelationId');
  eq(pregunta.matchType, M.EXACT, 'la pregunta coincide exactamente');
  eq(pregunta.atributoCai, 'GB_PREGUN_FORM', 'atributo de la pregunta');

  var contenedores = out.rows.filter(function (r) { return r.matchType === M.STRUCTURE; })
    .map(function (r) { return r.campoJson; }).sort();
  eq(contenedores.join(','), 'answers,vendors', 'vendors y answers son contenedores');
  eq(out.report.jsonOnly, 0, 'answer no debe quedar como Solo JSON');
  eq(out.report.mappingOnly, 0, 'no hay faltantes reales');
});

/* =====================================================================
   9. Campos repetidos en varias ubicaciones del mismo JSON
   Criterio de presencia: la cantidad de apariciones no cambia el resultado.
===================================================================== */
test('9. Campo JSON presente varias veces sigue siendo Coincidencia exacta', function () {
  var json = '{ "HEADER": { "po_id": "1" }, "LINEA_Pedido": [ { "po_id": "1", "qty": "2" } ] }';
  var out = FM.analyzeIntegration({ code: 'T9', requestExample: json }, [
    row({ 'Campo Json': 'po_id', 'Método / Operación': 'HEADER', 'Atributo CAI / Fuente Sugerida CAI': 'PO_ID' }),
    row({ 'Campo Json': 'po_id', 'Método / Operación': 'LINEA_Pedido (arreglo)', 'Atributo CAI / Fuente Sugerida CAI': 'PO_ID' })
  ]);
  var filas = out.rows.filter(function (r) { return r.campoJson === 'po_id'; });
  eq(filas.length, 2, 'ambas filas del mapeo se conservan');
  filas.forEach(function (r) { eq(r.matchType, M.EXACT, 'cada fila debe coincidir'); });
  eq(out.report.mappingOnly, 0, 'ninguna debe quedar como faltante');
  eq(out.report.pending, 0, 'no debe generarse pendiente por múltiples ubicaciones');
});

/* =====================================================================
   10. Variante distinta del encabezado Atributo CAI
===================================================================== */
test('10. Variantes de encabezado Atributo CAI reconocidas', function () {
  var variantes = [
    'Atributo CAI',
    'Atributo PeopleSoft',
    'Atributo CAI / PeopleSoft',
    'Atributo CAI / Fuente Sugerida CAI',
    'Atributo CAI / Fuente CAI',
    'Atributo CAI (PeopleSoft)',
    'Campo PeopleSoft',
    'ATRIBUTO   CAI'
  ];
  variantes.forEach(function (header) {
    eq(FM.headerRole(header), 'atributoCai', 'encabezado no reconocido: ' + header);
    var r = row({ 'Campo Json': 'operation' });
    delete r['Atributo CAI / Fuente Sugerida CAI'];
    r[header] = 'GB_TIPO_OPERACION';
    var out = FM.analyzeIntegration({ code: 'T10', requestExample: '{ "GB_TIPO_OPERACION": "x" }' }, [r]);
    eq(find(out.rows, 'operation').matchType, M.CAI, 'no resolvió con encabezado ' + header);
  });
});

/* =====================================================================
   11. Atributo vacío, Pendiente, Por definir o N/A
===================================================================== */
test('11. Atributos de relleno no generan equivalencias falsas', function () {
  ['', '   ', 'Pendiente', 'Pendiente por validar', 'Por definir', 'N/A', 'n/a', '-'].forEach(function (valor) {
    assert(FM.isBlank(valor), 'debe tratarse como vacío: "' + valor + '"');
    var out = FM.analyzeIntegration(
      { code: 'T11', requestExample: '{ "Pendiente": "trampa", "otro": "x" }' },
      [row({ 'Campo Json': 'campo_x', 'Atributo CAI / Fuente Sugerida CAI': valor })]
    );
    var r = find(out.rows, 'campo_x');
    eq(r.matchType, M.MAPPING_ONLY, 'con atributo "' + valor + '" no debe inventarse coincidencia');
  });
  /* Espacios no separables y saltos de línea de Excel sí deben normalizarse. */
  var out2 = FM.analyzeIntegration(
    { code: 'T11B', requestExample: '{ "GB_TIPO_OPERACION": "x" }' },
    [row({ 'Campo Json': 'operation', 'Atributo CAI / Fuente Sugerida CAI': ' GB_TIPO_OPERACION \n' })]
  );
  eq(find(out2.rows, 'operation').matchType, M.CAI, 'debe tolerar espacios no separables y saltos de línea');
  eq(find(out2.rows, 'operation').atributoCaiOriginal, ' GB_TIPO_OPERACION \n', 'debe conservar el valor original');
});

/* =====================================================================
   12. Varias filas que apuntan al mismo campo: ambas coinciden
===================================================================== */
test('12a. Dos filas con el mismo Atributo CAI coinciden ambas', function () {
  var out = FM.analyzeIntegration(
    { code: 'T12', requestExample: '{ "GB_SUPLOS_ORGID": "1", "otro": "2" }' },
    [
      row({ 'Campo Json': 'objectidsuplos', 'Atributo CAI / Fuente Sugerida CAI': 'GB_SUPLOS_ORGID' }),
      row({ 'Campo Json': 'operation', 'Método / Operación': 'Formulario IFRS', 'Atributo CAI / Fuente Sugerida CAI': 'GB_SUPLOS_ORGID' })
    ]
  );
  eq(find(out.rows, 'objectidsuplos').matchType, M.CAI, 'primera fila');
  eq(find(out.rows, 'operation').matchType, M.CAI, 'segunda fila');
  eq(out.report.pending, 0, 'no debe haber pendientes');
});

test('12b. Atributo CAI presente en varias ubicaciones coincide sin candidatos', function () {
  var json = '{ "A": { "GB_SUPLOS_ORGID": "1" }, "B": [ { "GB_SUPLOS_ORGID": "2" } ] }';
  var out = FM.analyzeIntegration({ code: 'T12B', requestExample: json }, [
    row({ 'Campo Json': 'objectidsuplos', 'Atributo CAI / Fuente Sugerida CAI': 'GB_SUPLOS_ORGID' })
  ]);
  var r = find(out.rows, 'objectidsuplos');
  eq(r.matchType, M.CAI, 'debe coincidir aunque aparezca dos veces');
  eq(r.evidence, FM.EVIDENCE.cai('GB_SUPLOS_ORGID'), 'texto de evidencia sin rutas');
  eq((r.candidates || []).length, 0, 'no debe exponer candidatos');
  eq(out.report.pending, 0, 'no debe generarse pendiente');
});

test('12c. Ninguna evidencia del portal menciona rutas del JSON', function () {
  var json = '{ "raiz": { "GB_SUPLOS_ORGID": "1", "campo": "2" }, "otra": [ { "GB_SUPLOS_ORGID": "3" } ] }';
  var out = FM.analyzeIntegration({ code: 'T12C', requestExample: json }, [
    row({ 'Campo Json': 'objectidsuplos', 'Atributo CAI / Fuente Sugerida CAI': 'GB_SUPLOS_ORGID' }),
    row({ 'Campo Json': 'campo', 'Atributo CAI / Fuente Sugerida CAI': 'CAMPO' })
  ]);
  out.rows.forEach(function (r) {
    assert(r.evidence.indexOf('[]') === -1 && r.evidence.indexOf('raiz.') === -1 && r.evidence.indexOf('otra.') === -1,
      'la evidencia no debe contener rutas: ' + r.evidence);
    assert(!r.candidates || !r.candidates.length, 'no debe haber candidatos en ' + r.campoJson);
  });
});

/* =====================================================================
   Escáner tolerante: los ejemplos no estrictos deben leerse sin repararlos
===================================================================== */
test('E1. Escáner tolerante con claves sin comillas y comas faltantes', function () {
  var s = FM.scanJson('{GB_CONSULTAR_RADICADO { "BUSINESS_UNIT": "", "GB_RADICACION_ID": "", } }');
  eq(s.byPath['GB_CONSULTAR_RADICADO'].kind, 'object', 'raíz sin comillas ni dos puntos');
  eq(s.byPath['GB_CONSULTAR_RADICADO.BUSINESS_UNIT'].kind, 'scalar', 'campo interno');
  var s2 = FM.scanJson('{ "GB_FAC_ELE_REQ": { BUSINESS_UNIT: "APDAV", GB_ID: "x" } }');
  eq(s2.byPath['GB_FAC_ELE_REQ.BUSINESS_UNIT'].kind, 'scalar', 'clave sin comillas');
  var s3 = FM.scanJson('{GB_RESP:{ "a":"" "b":"" } }');
  eq(s3.byPath['GB_RESP.b'].kind, 'scalar', 'coma faltante entre campos');
  var s4 = FM.scanJson('{"HDR":{ { "a": "1" } }');
  eq(s4.byPath['HDR.a'].kind, 'scalar', 'llave duplicada tolerada');
  eq(FM.scanJson('No documentado en el Excel adjunto.').documented, false, 'texto sin JSON');
});

test('E2. Sin ejemplo JSON documentado no se declaran faltantes', function () {
  var out = FM.analyzeIntegration(
    { code: 'TE2', requestExample: 'No documentado en el Excel adjunto.' },
    [row({ 'Campo Json': 'algo', 'Atributo CAI / Fuente Sugerida CAI': 'ALGO' })]
  );
  eq(find(out.rows, 'algo').matchType, M.PENDING, 'sin JSON no puede afirmarse ausencia');
  eq(out.report.mappingOnly, 0, 'no debe contarse como faltante real');
});

/* =====================================================================
   13. Ningún JSON fue modificado durante el proceso
===================================================================== */
if (typeof require === 'function') {
  test('13. Los ejemplos JSON no se modifican durante el análisis', function () {
    var fs = require('fs');
    var path = require('path');
    var crypto = require('crypto');
    var vm = require('vm');

    var dataPath = path.join(__dirname, '..', 'assets', 'data.js');
    var before = crypto.createHash('sha256').update(fs.readFileSync(dataPath)).digest('hex');

    var sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(dataPath, 'utf8'), sandbox);
    var D = sandbox.window.PORTAL_DATA;

    var snapshot = D.integrations.map(function (i) {
      return {
        code: i.code,
        req: i.requestExample,
        res: i.responseExample,
        alt: i.alternateRequestExample,
        rows: JSON.stringify(D.mappingsByKey[i.mappingKey] || [])
      };
    });

    D.integrations.forEach(function (i) {
      FM.analyzeIntegration(i, D.mappingsByKey[i.mappingKey] || []);
    });

    snapshot.forEach(function (s) {
      var i = D.integrations.filter(function (x) { return x.code === s.code; })[0];
      eq(i.requestExample, s.req, 'requestExample modificado en ' + s.code);
      eq(i.responseExample, s.res, 'responseExample modificado en ' + s.code);
      eq(i.alternateRequestExample, s.alt, 'alternateRequestExample modificado en ' + s.code);
      eq(JSON.stringify(D.mappingsByKey[i.mappingKey] || []), s.rows, 'filas de mapeo modificadas en ' + s.code);
    });

    var after = crypto.createHash('sha256').update(fs.readFileSync(dataPath)).digest('hex');
    eq(after, before, 'el archivo data.js cambió en disco');
  });

  /* =====================================================================
     Casos reales de la línea base
  ===================================================================== */
  test('R1. PRO_FORM_Formulario_proveedor con datos reales', function () {
    var fs = require('fs'), path = require('path'), vm = require('vm');
    var sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8'), sandbox);
    var D = sandbox.window.PORTAL_DATA;
    var i = D.integrations.filter(function (x) { return x.code === 'PRO_FORM_Formulario_proveedor'; })[0];
    var out = FM.analyzeIntegration(i, D.mappingsByKey[i.mappingKey]);

    var valor = find(out.rows, 'answers');
    eq(valor.matchType, M.ALIAS, 'answers → answer');
    eq(valor.jsonField, 'answer', 'campo encontrado para GB_VALOR_FORM');
    eq(valor.atributoCai, 'GB_VALOR_FORM', 'atributo de la fila');

    var pregunta = find(out.rows, 'externalSystemCorrelationId');
    eq(pregunta.atributoCai, 'GB_PREGUN_FORM', 'externalSystemCorrelationId → GB_PREGUN_FORM');
    eq(pregunta.matchType, M.EXACT, 'coincidencia exacta de la pregunta');

    var estructuras = out.rows.filter(function (r) { return r.matchType === M.STRUCTURE; })
      .map(function (r) { return r.campoJson; }).sort();
    eq(estructuras.join(','), 'answers,vendors', 'contenedores esperados');
    eq(out.report.jsonOnly, 0, 'sin campos Solo JSON');
    eq(out.report.mappingOnly, 0, 'sin faltantes reales');
    eq(out.report.total, 6, 'total de filas presentadas');
  });

  test('R2. CON_CONT_Crear_contrato resuelve por Atributo CAI y alias', function () {
    var fs = require('fs'), path = require('path'), vm = require('vm');
    var sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8'), sandbox);
    var D = sandbox.window.PORTAL_DATA;
    var i = D.integrations.filter(function (x) { return x.code === 'CON_CONT_Crear_contrato'; })[0];
    var out = FM.analyzeIntegration(i, D.mappingsByKey[i.mappingKey]);

    var arrend = out.rows.filter(function (r) { return r.campoJson === 'GB_ARRENDAMIENTO'; })[0];
    eq(arrend.matchType, M.ALIAS, 'GB_ARRENDAMIENTO por alias documentado');
    eq(arrend.jsonField, 'GB_CONTRATO_ARRND', 'campo encontrado');

    var porCai = out.rows.filter(function (r) { return r.matchType === M.CAI; });
    assert(porCai.length > 0, 'debe haber coincidencias por Atributo CAI');
    assert(out.report.mappingOnly < 21, 'los faltantes reales deben bajar respecto de los 21 originales');

    /* Caso obligatorio: GB_SUPLOS_ORGID aparece en dos ubicaciones del JSON
       (cabecera y formulario_ifrs). Debe coincidir, no quedar pendiente. */
    var orgid = out.rows.filter(function (r) {
      return r.campoJson === 'objectidsuplos' && r.atributoCai === 'GB_SUPLOS_ORGID';
    });
    assert(orgid.length > 0, 'debe existir la fila objectidsuplos → GB_SUPLOS_ORGID');
    orgid.forEach(function (r) {
      eq(r.matchType, M.CAI, 'GB_SUPLOS_ORGID debe coincidir por Atributo CAI');
      eq(r.evidence, FM.EVIDENCE.cai('GB_SUPLOS_ORGID'), 'evidencia sin mención de rutas');
      eq((r.candidates || []).length, 0, 'sin candidatos');
    });
  });

  test('R3. Ninguna integración real genera pendientes por múltiples ubicaciones', function () {
    var fs = require('fs'), path = require('path'), vm = require('vm');
    var sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8'), sandbox);
    var D = sandbox.window.PORTAL_DATA;
    D.integrations.forEach(function (i) {
      var out = FM.analyzeIntegration(i, D.mappingsByKey[i.mappingKey] || []);
      out.rows.forEach(function (r) {
        assert(!r.candidates || !r.candidates.length, i.sourceId + ' expone candidatos en ' + r.campoJson);
        if (r.matchType === M.PENDING) {
          assert(/no tiene ejemplo JSON documentado/.test(r.evidence),
            i.sourceId + ' genera pendiente por una causa distinta a la falta de ejemplo JSON: ' + r.evidence);
        }
        assert(!/\[\]\./.test(r.evidence), i.sourceId + ' menciona una ruta en la evidencia: ' + r.evidence);
      });
    });
  });
}

/* =====================================================================
   Salida
===================================================================== */
function report() {
  var ok = results.filter(function (r) { return r.ok; }).length;
  var fail = results.length - ok;
  var lines = results.map(function (r) {
    return (r.ok ? '  PASA  ' : '  FALLA ') + r.name + (r.ok ? '' : '\n          → ' + r.error);
  });
  lines.push('');
  lines.push('  ' + ok + ' de ' + results.length + ' pruebas correctas' + (fail ? ' · ' + fail + ' con error' : ''));
  return { text: lines.join('\n'), ok: ok, fail: fail };
}

if (typeof module === 'object' && module.exports) {
  var out = report();
  console.log(out.text);
  process.exit(out.fail ? 1 : 0);
} else {
  window.__FM_TEST_REPORT__ = report();
}
