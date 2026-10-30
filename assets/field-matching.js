/* =============================================================================
   MOTOR DE COMPARACIÓN CAMPO JSON <-> MAPEO EXCEL
   -----------------------------------------------------------------------------
   Responsabilidad única: INTERPRETAR. Este módulo solo lee los ejemplos JSON y
   las filas del mapeo. No modifica, no reescribe y no normaliza el contenido de
   los JSON oficiales; toda normalización se aplica a copias en memoria usadas
   exclusivamente para comparar. Los valores originales se conservan siempre
   para mostrarlos en la interfaz.

   Pasadas de clasificación (en orden, cada una reclama rutas del JSON):
     A. Coincidencia exacta        (Campo Json = campo del JSON)
     B. Coincide por Atributo CAI  (Atributo CAI / PeopleSoft = campo del JSON)
     C. Coincide por alias         (registro documentado o columna de alias)
     D. Coincide por alias         (contenedor -> único campo funcional libre)
     E. Estructura JSON / Solo mapeo / Pendiente de validación
   Al final se emiten las rutas del JSON que ninguna fila reclamó:
     contenedor -> Estructura JSON ; escalar -> Solo JSON
============================================================================= */
(function (root, factory) {
  var rules = null;
  if (typeof module === 'object' && module.exports) {
    try { rules = require('./equivalence-rules.js'); } catch (e) { rules = null; }
    module.exports = factory(rules);
  } else {
    root.FieldMatching = factory(root.PORTAL_EQUIVALENCE_RULES || null);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (RULES) {
  'use strict';

  RULES = RULES || { placeholders: [], extraHeaders: {}, knownContainers: [], aliases: [] };

  /* ---------------------------------------------------------------------
     Tipos de coincidencia expuestos por el motor.
  --------------------------------------------------------------------- */
  var MATCH = {
    EXACT: 'Coincidencia exacta',
    CAI: 'Coincide por Atributo CAI',
    ALIAS: 'Coincide por alias',
    STRUCTURE: 'Estructura presente',
    JSON_ONLY: 'Solo JSON',
    MAPPING_ONLY: 'Solo mapeo',
    /* Reservado para el único caso que no depende de la comparación: la
       integración no tiene ejemplo JSON documentado. Nunca se origina por que
       un campo aparezca en varias ubicaciones. */
    PENDING: 'Pendiente de validación'
  };

  var ABSENT_MESSAGE = 'No se encontró el campo ni una equivalencia mediante Atributo CAI o alias dentro del JSON.';

  /* Textos de evidencia. Describen presencia dentro de la estructura general
     del JSON; nunca mencionan rutas ni ubicaciones. */
  var EVIDENCE = {
    EXACT: 'El campo está presente en la estructura del JSON.',
    STRUCTURE: 'El objeto o arreglo está presente en el JSON.',
    JSON_ONLY: 'El campo está presente en el JSON pero no existe en el mapeo.',
    cai: function (attr) {
      return 'El campo ' + attr + ' está presente en la estructura del JSON mediante su Atributo CAI / PeopleSoft.';
    },
    alias: function (alias) {
      return 'El campo ' + alias + ' está presente en la estructura del JSON mediante un alias documentado.';
    }
  };

  var SCOPE_NOTE = 'La validación comprueba la presencia del campo dentro de la estructura general del JSON. ' +
    'No valida su ubicación exacta, tipo de dato, longitud ni regla funcional.';

  /* =====================================================================
     1. NORMALIZACIÓN (solo para comparar; nunca se escribe de vuelta)
  ===================================================================== */

  /* Limpia espacios no separables, anchos cero y saltos de línea accidentales
     provenientes de las celdas de Excel. */
  function cleanCell(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var PLACEHOLDER_SET = (function () {
    var set = Object.create(null);
    (RULES.placeholders || []).forEach(function (p) { set[cleanCell(p).toLowerCase()] = true; });
    return set;
  })();

  /* Una celda es "sin dato" si está vacía o contiene un texto de relleno
     (Pendiente, Por definir, N/A, ...). */
  function isBlank(value) {
    var clean = cleanCell(value).toLowerCase();
    if (!clean) return true;
    if (PLACEHOLDER_SET[clean]) return true;
    return /^pendiente\b/.test(clean) || /^por (definir|validar|confirmar)\b/.test(clean);
  }

  /* Clave de comparación: minúsculas sin separadores. Permite igualar
     "GB_VALOR_FORM", "gb valor form" y "GB.VALOR.FORM", pero nunca confunde
     singular y plural ("answer" != "answers"). */
  function compareKey(value) {
    var text = cleanCell(value).toLowerCase();
    /* Pliega diacríticos: "Clasificación" y "Clasificacion" deben comparar
       igual. No pliega singular/plural: "answer" nunca iguala a "answers". */
    if (typeof text.normalize === 'function') {
      text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } else {
      text = text
        .replace(/[áàäâã]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
        .replace(/[óòöôõ]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n').replace(/ç/g, 'c');
    }
    return text.replace(/[^a-z0-9]/g, '');
  }

  /* =====================================================================
     2. NORMALIZACIÓN DE ENCABEZADOS DEL EXCEL
  ===================================================================== */

  var HEADER_PATTERNS = [
    ['atributoCai', [/^atributo\s*cai/, /^atributo\s*people\s*soft/, /^atributo\s*ps\b/, /^atributo\s*destino/, /^campo\s*cai\b/, /^campo\s*people\s*soft/, /^fuente\s*sugerida\s*cai/]],
    ['alias', [/^alias/, /^equivalencia/, /^campo\s*equivalente/, /^nombre\s*equivalente/]],
    ['rutaJson', [/^ruta\s*(json)?$/, /^path\s*json/, /^json\s*path/]],
    ['campoJson', [/^campo\s*json/, /^campo\s*j?son/, /^nombre\s*del?\s*campo\s*json/, /^campo\s*del?\s*json/]],
    ['tablaCai', [/^tabla\s*cai/, /^tabla\s*people\s*soft/, /^tabla\s*destino/, /^tabla$/]],
    ['tipoServicio', [/^tipo\s*servicio/, /^tipo\s*de\s*servicio/, /^servicio$/]],
    ['operacion', [/^m[eé]todo\s*\/?\s*operaci[oó]n/, /^operaci[oó]n/, /^m[eé]todo/, /^estructura\s*\/?\s*operaci[oó]n/]],
    ['descripcion', [/^descripci[oó]n\s*campo/, /^descripci[oó]n\s*del?\s*campo/]],
    ['descripcionRespuesta', [/^descripci[oó]n\s*respuesta/]],
    ['tipoCampo', [/^tipo\s*campo/, /^tipo\s*de\s*campo/, /^tipo\s*de\s*dato/]],
    ['longitud', [/^longitud/, /^tama[nñ]o/]],
    ['decimales', [/^decimales/]],
    ['obligatorio', [/^obligatorio/, /^requerido/, /^mandatorio/]],
    ['transformacion', [/^regla\s*de\s*transformaci[oó]n/, /^transformaci[oó]n/, /^homologaci[oó]n/]],
    ['observaciones', [/^observaci[oó]n/, /^notas?$/]],
    ['opciones', [/^opciones\s*de\s*respuesta/, /^ejemplo/]],
    ['estado', [/^estado\s*levantamiento/, /^estado$/]],
    ['prioridad', [/^prioridad\s*fuente/, /^prioridad/]],
    ['coincidencia', [/^coincidencia\s*json/, /^coincidencia/]],
    ['idIntegracion', [/^id\s*integraci[oó]n/]],
    ['archivo', [/^archivo\s*json/, /^archivo/]]
  ];

  /* Encabezados adicionales declarados en equivalence-rules.js. */
  var EXTRA_HEADER_MAP = (function () {
    var map = Object.create(null);
    Object.keys(RULES.extraHeaders || {}).forEach(function (role) {
      (RULES.extraHeaders[role] || []).forEach(function (header) {
        map[compareKey(header)] = role;
      });
    });
    return map;
  })();

  function headerRole(header) {
    var clean = cleanCell(header).toLowerCase();
    var key = compareKey(header);
    if (EXTRA_HEADER_MAP[key]) return EXTRA_HEADER_MAP[key];
    for (var i = 0; i < HEADER_PATTERNS.length; i++) {
      var role = HEADER_PATTERNS[i][0];
      var patterns = HEADER_PATTERNS[i][1];
      for (var j = 0; j < patterns.length; j++) {
        if (patterns[j].test(clean)) return role;
      }
    }
    return null;
  }

  /* Devuelve un accesor por rol canónico sobre una fila con encabezados
     arbitrarios del Excel. El primer encabezado reconocido gana; los demás
     quedan disponibles como alternativas. */
  function buildHeaderIndex(row) {
    var index = Object.create(null);
    Object.keys(row).forEach(function (header) {
      var role = headerRole(header);
      if (!role) return;
      if (index[role] === undefined) index[role] = header;
      else if (isBlank(row[index[role]]) && !isBlank(row[header])) index[role] = header;
    });
    return index;
  }

  function field(row, index, role) {
    var header = index[role];
    if (!header) return '';
    return row[header] === undefined || row[header] === null ? '' : String(row[header]);
  }

  /* =====================================================================
     3. ESCÁNER TOLERANTE DE ESTRUCTURA JSON
     ---------------------------------------------------------------------
     Recorre el texto del ejemplo JSON sin reescribirlo y sin exigir JSON
     estricto. Tolera: claves sin comillas, dos puntos ausentes, comas
     faltantes, comas sobrantes y llaves duplicadas. Devuelve la lista de
     rutas con su naturaleza (objeto / arreglo / escalar).
  ===================================================================== */

  var BARE_KEY = /[A-Za-z_$][A-Za-z0-9_$\-.]*/;
  /* Un nombre de campo plausible. Los ejemplos fuente contienen comillas
     desbalanceadas que, al leerse, producen tokens basura: se registran como
     anomalías en lugar de publicarse como campos del JSON.
     Se aceptan letras acentuadas y ñ ("Clasificación", "Especialidad"); se
     rechaza únicamente lo que no puede ser un nombre de campo. */
  var INVALID_KEY_CHARS = /[\u0000-\u001F{}[\]:,"']/;
  function isValidKey(name) {
    if (!name || name.length > 128) return false;
    if (INVALID_KEY_CHARS.test(name)) return false;
    return /[A-Za-z0-9_$\u00C0-\u024F]/.test(name);
  }

  function scanJson(text) {
    var result = { ok: false, documented: false, nodes: [], byPath: Object.create(null), byName: Object.create(null), anomalies: [] };
    if (text === null || text === undefined) return result;
    var src = String(text);
    if (!/[{[]/.test(src)) return result;           // "No documentado en el Excel adjunto."
    result.documented = true;

    var i = 0, n = src.length, stack = [], guard = 0;

    function skipWs() {
      while (i < n && /[\s,;]/.test(src[i])) i++;
    }
    function skipString() {
      var quote = src[i++];
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; return; }
        i++;
      }
    }
    function skipScalar() {
      if (src[i] === '"' || src[i] === "'") { skipString(); return; }
      while (i < n && ',}]'.indexOf(src[i]) === -1) i++;
    }
    function readToken() {
      if (src[i] === '"' || src[i] === "'") {
        var start = i;
        skipString();
        return { value: src.slice(start + 1, i - 1), quoted: true };
      }
      var m = BARE_KEY.exec(src.slice(i));
      if (m && m.index === 0) { i += m[0].length; return { value: m[0], quoted: false }; }
      return null;
    }
    /* Tolera la comilla de apertura ausente: VALOR_PAGADO": [ ... ]
       Se consume la comilla suelta solo si detrás viene un separador de clave. */
    function skipStrayQuote() {
      if (src[i] !== '"' && src[i] !== "'") return;
      var save = i;
      i++; skipWs();
      if (src[i] !== ':' && src[i] !== '{' && src[i] !== '[') i = save;
    }
    function current() { return stack.length ? stack[stack.length - 1] : null; }
    function push(path, kind) {
      if (result.byPath[path]) return;
      var name = path.replace(/\[\]$/, '').split('.').pop();
      if (!isValidKey(name)) {                     // token basura por comillas
        result.anomalies.push(name);               // desbalanceadas en la fuente
        return;
      }
      var node = { path: path, name: name, kind: kind };
      result.nodes.push(node);
      result.byPath[path] = node;
      (result.byName[compareKey(name)] = result.byName[compareKey(name)] || []).push(node);
    }

    while (i < n && guard++ < 200000) {
      skipWs();
      if (i >= n) break;
      var c = src[i];

      if (c === '}' || c === ']') { stack.pop(); i++; continue; }

      if (c === '{') {                              // objeto anónimo: elemento de
        var prefixO = current() ? current().prefix : '';   // arreglo o llave suelta
        stack.push({ kind: 'object', prefix: prefixO });
        i++; continue;
      }
      if (c === '[') {
        var prefixA = current() ? current().prefix : '';
        stack.push({ kind: 'array', prefix: prefixA });
        i++; continue;
      }

      var ctx = current();
      if (!ctx) { i++; continue; }                  // ruido antes de la raíz
      if (ctx.kind === 'array') { skipScalar(); continue; }

      var token = readToken();
      if (token === null) { i++; continue; }
      skipWs();
      if (!token.quoted) skipStrayQuote();          // comilla de apertura ausente
      if (src[i] === ':') { i++; skipWs(); }        // dos puntos ausentes: se tolera

      var key = token.value;
      var path = ctx.prefix ? ctx.prefix + '.' + key : key;
      var next = src[i];
      if (next === '{') {
        push(path, 'object');
        stack.push({ kind: 'object', prefix: path });
        i++;
      } else if (next === '[') {
        push(path, 'array');
        stack.push({ kind: 'array', prefix: path + '[]' });
        i++;
      } else {
        push(path, 'scalar');
        skipScalar();
      }
    }

    result.ok = result.nodes.length > 0;
    return result;
  }

  /* Índice conjunto de uno o varios documentos JSON (petición + variante). */
  function buildJsonIndex(texts) {
    var index = { documented: false, nodes: [], byPath: Object.create(null), byName: Object.create(null), anomalies: [] };
    (texts || []).forEach(function (text) {
      var scan = scanJson(text);
      if (scan.documented) index.documented = true;
      index.anomalies = index.anomalies.concat(scan.anomalies || []);
      scan.nodes.forEach(function (node) {
        if (index.byPath[node.path]) return;
        index.nodes.push(node);
        index.byPath[node.path] = node;
        (index.byName[compareKey(node.name)] = index.byName[compareKey(node.name)] || []).push(node);
      });
    });
    return index;
  }

  function isContainer(node) { return node && (node.kind === 'object' || node.kind === 'array'); }

  /* Campos escalares directamente contenidos en un contenedor. */
  function scalarChildren(index, container) {
    var prefix = container.path + (container.kind === 'array' ? '[].' : '.');
    return index.nodes.filter(function (node) {
      if (node.kind !== 'scalar') return false;
      if (node.path.indexOf(prefix) !== 0) return false;
      var rest = node.path.slice(prefix.length);
      return rest.indexOf('.') === -1;               // hijo directo, no nieto
    });
  }

  /* =====================================================================
     5. ALIAS DOCUMENTADOS
  ===================================================================== */
  /* Aplica las reglas de celda declaradas en equivalence-rules.js y devuelve
     los nombres alternativos que el proyecto autoriza a probar, junto con la
     regla que los produjo. Nunca modifica el valor original. */
  function applyCellRules(value, target) {
    var out = [];
    if (isBlank(value)) return out;
    var clean = cleanCell(value);
    (RULES.cellRules || []).forEach(function (rule) {
      if (rule.applies !== target) return;
      var re;
      try { re = new RegExp(rule.pattern); } catch (e) { return; }
      if (!re.test(clean)) return;
      var candidate = cleanCell(clean.replace(re, rule.replacement === undefined ? '' : rule.replacement));
      if (!candidate || compareKey(candidate) === compareKey(clean)) return;
      out.push({ value: candidate, rule: rule });
    });
    return out;
  }

  function findAliasRule(integrationCode, service, mappingField) {
    var svc = compareKey(service);
    var fld = compareKey(mappingField);
    var code = compareKey(integrationCode);
    return (RULES.aliases || []).filter(function (rule) {
      if (rule.integration !== '*' && compareKey(rule.integration) !== code) return false;
      if (rule.service && rule.service !== '*' && compareKey(rule.service) !== svc) return false;
      return compareKey(rule.mappingField) === fld;
    })[0] || null;
  }

  /* =====================================================================
     6. ANÁLISIS DE UNA INTEGRACIÓN
  ===================================================================== */

  /* Distingue las filas reales del mapeo de las filas sintéticas que el
     generador agregó para representar campos presentes solo en el JSON. */
  function isJsonSideRow(row, index) {
    var coincidencia = cleanCell(field(row, index, 'coincidencia')).toLowerCase();
    var prioridad = cleanCell(field(row, index, 'prioridad')).toLowerCase();
    if (coincidencia === 'solo json') return true;
    if (prioridad.indexOf('json del excel') === 0) return true;
    return false;
  }

  /* Una fila es funcional cuando describe un campo con contenido: tiene
     Atributo CAI o tipo/longitud declarados. Las filas estructurales solo
     nombran un contenedor. */
  function isFunctionalRow(row, index) {
    if (!isBlank(field(row, index, 'atributoCai'))) return true;
    if (!isBlank(field(row, index, 'tipoCampo'))) return true;
    if (!isBlank(field(row, index, 'longitud'))) return true;
    return false;
  }

  function serviceOf(row, index) {
    var value = cleanCell(field(row, index, 'tipoServicio'));
    if (/petici/i.test(value) || /request/i.test(value) || /env/i.test(value)) return 'Petición';
    if (/respuesta/i.test(value) || /response/i.test(value)) return 'Respuesta';
    return value || 'Petición';
  }

  /**
   * Analiza una integración completa.
   * @param {Object} integration objeto de PORTAL_DATA.integrations
   * @param {Array}  rows        filas de PORTAL_DATA.mappingsByKey[...]
   * @returns {{rows:Array, report:Object}}
   */
  /**
   * Analiza una integración completa.
   *
   * Criterio: PRESENCIA. Se comprueba si el campo pertenece a la estructura
   * general del JSON de la integración. No se valida la ubicación exacta: si
   * un nombre aparece en varias posiciones, cuenta como una sola coincidencia
   * positiva. Las rutas se conservan internamente para recorrer el JSON, pero
   * no se publican ni generan estados pendientes.
   *
   * @param {Object} integration objeto de PORTAL_DATA.integrations
   * @param {Array}  rows        filas de PORTAL_DATA.mappingsByKey[...]
   * @returns {{rows:Array, report:Object}}
   */
  function analyzeIntegration(integration, rows) {
    integration = integration || {};
    rows = rows || [];

    var indexes = {
      'Petición': buildJsonIndex([integration.requestExample, integration.alternateRequestExample]),
      'Respuesta': buildJsonIndex([integration.responseExample])
    };

    var mappingRows = [];
    var jsonSideSource = [];

    rows.forEach(function (raw) {
      var index = buildHeaderIndex(raw);
      var service = serviceOf(raw, index);
      if (!indexes[service]) indexes[service] = buildJsonIndex([]);
      var entry = {
        raw: raw,
        headers: index,
        service: service,
        campoJson: cleanCell(field(raw, index, 'campoJson')),
        campoJsonOriginal: field(raw, index, 'campoJson'),
        atributoCai: cleanCell(field(raw, index, 'atributoCai')),
        atributoCaiOriginal: field(raw, index, 'atributoCai'),
        aliasColumn: cleanCell(field(raw, index, 'alias')),
        operacion: cleanCell(field(raw, index, 'operacion')),
        functional: isFunctionalRow(raw, index),
        matchType: null,
        jsonPath: '',
        jsonField: '',
        evidence: '',
        containerNode: null
      };
      if (isJsonSideRow(raw, index)) jsonSideSource.push(entry);
      else mappingRows.push(entry);
    });

    function idx(entry) { return indexes[entry.service]; }

    /* Nodos del JSON cuyo nombre coincide, sin importar en cuántas rutas
       aparezca. Se prefiere un escalar si existe alguno. */
    function nodesNamed(entry, name) {
      if (isBlank(name)) return [];
      return (idx(entry).byName[compareKey(name)] || []).slice();
    }
    function firstScalar(nodes) {
      for (var k = 0; k < nodes.length; k++) if (nodes[k].kind === 'scalar') return nodes[k];
      return null;
    }

    /* Nombres del JSON cubiertos por alguna fila del mapeo. Es un conjunto de
       NOMBRES, no de rutas: la presencia no depende de la ubicación. */
    var covered = { 'Petición': Object.create(null), 'Respuesta': Object.create(null) };
    function markCovered(entry, name) {
      if (!covered[entry.service]) covered[entry.service] = Object.create(null);
      covered[entry.service][compareKey(name)] = true;
    }

    function resolve(entry, node, matchType, evidence) {
      entry.matchType = matchType;
      entry.jsonPath = node ? node.path : '';        // solo uso interno
      entry.jsonField = node ? node.name : '';
      entry.jsonKind = node ? node.kind : '';
      entry.evidence = evidence;
      if (node) markCovered(entry, node.name);
    }

    /* --- Pasada A: Campo JSON presente en la estructura ----------------- */
    mappingRows.forEach(function (entry) {
      var nodes = nodesNamed(entry, entry.campoJson);
      if (!nodes.length) return;

      var scalar = firstScalar(nodes);
      if (scalar) {
        resolve(entry, scalar, MATCH.EXACT, EVIDENCE.EXACT);
        return;
      }
      /* El nombre existe pero corresponde a un contenedor. Si la fila describe
         un campo funcional, su equivalencia real se busca por Atributo CAI o
         por alias documentado; si no, es una estructura presente. */
      entry.containerNode = nodes[0];
      if (!entry.functional) {
        resolve(entry, nodes[0], MATCH.STRUCTURE, EVIDENCE.STRUCTURE);
      }
    });

    /* --- Pasada B: Atributo CAI / PeopleSoft presente ------------------- */
    mappingRows.forEach(function (entry) {
      if (entry.matchType) return;
      if (isBlank(entry.atributoCai)) return;
      var nodes = nodesNamed(entry, entry.atributoCai);
      if (!nodes.length) return;
      var scalar = firstScalar(nodes);
      if (scalar) {
        resolve(entry, scalar, MATCH.CAI, EVIDENCE.cai(entry.atributoCai));
        return;
      }
      if (!entry.containerNode) entry.containerNode = nodes[0];
    });

    /* --- Pasada C: alias documentado ----------------------------------- */
    mappingRows.forEach(function (entry) {
      if (entry.matchType) return;
      var aliasName = '';
      var rule = findAliasRule(integration.code, entry.service, entry.campoJson);
      if (rule) aliasName = rule.jsonField;
      else if (!isBlank(entry.aliasColumn)) aliasName = entry.aliasColumn;
      if (!aliasName) return;
      var scalar = firstScalar(nodesNamed(entry, aliasName));
      if (!scalar) return;
      resolve(entry, scalar, MATCH.ALIAS, EVIDENCE.alias(aliasName));
      if (rule) entry.aliasRule = rule;
    });

    /* --- Pasada C2: reglas de celda declaradas por el proyecto ---------- */
    mappingRows.forEach(function (entry) {
      if (entry.matchType) return;
      var attempts = applyCellRules(entry.campoJson, 'campoJson')
        .concat(applyCellRules(entry.atributoCai, 'atributoCai'));
      for (var k = 0; k < attempts.length; k++) {
        var scalar = firstScalar(nodesNamed(entry, attempts[k].value));
        if (!scalar) continue;
        resolve(entry, scalar, MATCH.ALIAS, EVIDENCE.alias(attempts[k].value));
        entry.appliedRule = attempts[k].rule;
        return;
      }
    });

    /* --- Pasada D: contenedor -> campo funcional único ------------------
       Solo aplica cuando el contenedor expone exactamente un campo escalar:
       no hay elección posible y por tanto no hay ambigüedad. */
    mappingRows.forEach(function (entry) {
      if (entry.matchType || !entry.containerNode || !entry.functional) return;
      var children = scalarChildren(idx(entry), entry.containerNode);
      if (children.length !== 1) return;
      resolve(entry, children[0], MATCH.ALIAS, EVIDENCE.alias(children[0].name));
    });

    /* --- Pasada E: estructuras y ausencias ------------------------------ */
    mappingRows.forEach(function (entry) {
      if (entry.matchType) return;
      if (entry.containerNode) {
        resolve(entry, entry.containerNode, MATCH.STRUCTURE, EVIDENCE.STRUCTURE);
        return;
      }
      if (/estructura json/i.test(entry.operacion)) {
        entry.matchType = MATCH.STRUCTURE;
        entry.evidence = EVIDENCE.STRUCTURE;
        return;
      }
      if (!idx(entry).documented) {
        /* Sin ejemplo JSON no puede afirmarse la ausencia. No es una
           ambigüedad de ruta: es falta de fuente. */
        entry.matchType = MATCH.PENDING;
        entry.evidence = 'La integración no tiene ejemplo JSON documentado para ' + entry.service +
          '; no es posible confirmar ni descartar la presencia del campo.';
        return;
      }
      entry.matchType = MATCH.MAPPING_ONLY;
      entry.evidence = ABSENT_MESSAGE;
    });

    /* --- Campos del JSON no representados en el mapeo -------------------
       Se agrupan por NOMBRE: varias apariciones del mismo nombre son una sola
       entrada, porque la validación es de presencia y no de ubicación. */
    var jsonSideByName = Object.create(null);
    jsonSideSource.forEach(function (entry) {
      jsonSideByName[entry.service + '::' + compareKey(entry.campoJson)] = entry;
    });

    var jsonRows = [];
    ['Petición', 'Respuesta'].forEach(function (service) {
      var index = indexes[service];
      if (!index || !index.documented) return;
      var emitted = Object.create(null);
      index.nodes.forEach(function (node) {
        var key = compareKey(node.name);
        if (emitted[key]) return;                    // mismo nombre: una entrada
        if (covered[service] && covered[service][key]) return;
        emitted[key] = true;
        var template = jsonSideByName[service + '::' + key];
        jsonRows.push({
          raw: template ? template.raw : {},
          headers: template ? template.headers : Object.create(null),
          service: service,
          campoJson: node.name,
          campoJsonOriginal: node.name,
          atributoCai: template ? template.atributoCai : '',
          atributoCaiOriginal: template ? template.atributoCaiOriginal : '',
          operacion: template && !isContainer(node) ? template.operacion : 'Estructura JSON',
          functional: node.kind === 'scalar',
          matchType: isContainer(node) ? MATCH.STRUCTURE : MATCH.JSON_ONLY,
          jsonPath: node.path,
          jsonField: node.name,
          jsonKind: node.kind,
          fromJsonSide: true,
          evidence: isContainer(node) ? EVIDENCE.STRUCTURE : EVIDENCE.JSON_ONLY
        });
      });
    });
    var all = mappingRows.concat(jsonRows);

    /* --- Valores originales para la interfaz ---------------------------
       Se toman tal como vienen del Excel, sin normalizar. */
    all.forEach(function (entry) {
      var raw = entry.raw || {};
      var h = entry.headers || {};
      entry.display = {
        descripcion: field(raw, h, 'descripcion') || field(raw, h, 'descripcionRespuesta') ||
          (entry.fromJsonSide ? 'Campo presente en el ejemplo JSON del Excel adjunto.' : ''),
        tabla: field(raw, h, 'tablaCai'),
        tipoCampo: field(raw, h, 'tipoCampo'),
        longitud: field(raw, h, 'longitud'),
        obligatorio: field(raw, h, 'obligatorio'),
        transformacion: field(raw, h, 'transformacion'),
        estado: field(raw, h, 'estado'),
        observaciones: field(raw, h, 'observaciones'),
        atributoCai: entry.atributoCaiOriginal || '',
        campoJson: entry.campoJsonOriginal || entry.campoJson || ''
      };
      /* Texto plano para el buscador de la tabla. No incluye la ruta JSON:
         las rutas son de uso interno y no se publican. */
      entry.searchText = [
        entry.campoJson, entry.atributoCai, entry.jsonField,
        entry.matchType, entry.operacion, entry.service, entry.evidence,
        entry.display.descripcion, entry.display.tabla, entry.display.estado
      ].join(' ').toLowerCase();
    });

    /* --- Informe ------------------------------------------------------- */
    function count(type) { return all.filter(function (r) { return r.matchType === type; }).length; }
    var report = {
      total: all.length,
      exact: count(MATCH.EXACT),
      cai: count(MATCH.CAI),
      alias: count(MATCH.ALIAS),
      structures: count(MATCH.STRUCTURE),
      mappingOnly: count(MATCH.MAPPING_ONLY),
      jsonOnly: count(MATCH.JSON_ONLY),
      pending: count(MATCH.PENDING),
      functionalFields: all.filter(function (r) { return r.matchType !== MATCH.STRUCTURE; }).length,
      resolvedByEquivalence: count(MATCH.CAI) + count(MATCH.ALIAS),
      /* Filas sin ejemplo JSON de referencia. No proviene de ambigüedad de
         rutas: esa lógica se eliminó. */
      withoutJsonSource: all.filter(function (r) { return r.matchType === MATCH.PENDING; })
        .map(function (r) { return { field: r.campoJson, reason: r.evidence }; }),
      appliedRules: all.filter(function (r) { return r.appliedRule; })
        .map(function (r) { return { field: r.campoJson, found: r.jsonField, rule: r.appliedRule.id, requiresValidation: !!r.appliedRule.requiresValidation }; }),
      anomalies: (indexes['Petición'].anomalies || []).length + (indexes['Respuesta'].anomalies || []).length,
      jsonDocumented: {
        'Petición': indexes['Petición'].documented,
        'Respuesta': indexes['Respuesta'].documented
      }
    };
    report.matched = report.exact + report.cai + report.alias;
    report.missing = report.mappingOnly;

    return { rows: all, report: report, indexes: indexes };
  }

  /* Consolida el informe de varias integraciones. */
  function summarize(analyses) {
    var keys = ['exact', 'cai', 'alias', 'structures', 'mappingOnly', 'jsonOnly', 'pending', 'matched', 'total'];
    var out = {};
    keys.forEach(function (k) { out[k] = 0; });
    (analyses || []).forEach(function (a) {
      keys.forEach(function (k) { out[k] += (a.report[k] || 0); });
    });
    return out;
  }

  return {
    MATCH: MATCH,
    EVIDENCE: EVIDENCE,
    SCOPE_NOTE: SCOPE_NOTE,
    ABSENT_MESSAGE: ABSENT_MESSAGE,
    cleanCell: cleanCell,
    isBlank: isBlank,
    compareKey: compareKey,
    headerRole: headerRole,
    buildHeaderIndex: buildHeaderIndex,
    scanJson: scanJson,
    buildJsonIndex: buildJsonIndex,
    analyzeIntegration: analyzeIntegration,
    summarize: summarize,
    rules: RULES
  };
});
