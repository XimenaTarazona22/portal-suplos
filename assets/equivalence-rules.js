/* =============================================================================
   REGLAS DE EQUIVALENCIA DOCUMENTADAS - SUPLOS / CAI
   -----------------------------------------------------------------------------
   Este archivo es el ÚNICO lugar donde se declaran equivalencias explícitas
   entre el nombre de un campo del mapeo (Excel) y el nombre real del campo en
   el ejemplo JSON oficial.

   GOBIERNO:
   - El motor de comparación NUNCA inventa alias. Solo aplica los declarados
     aquí, los que vengan en una columna de alias del Excel, o los que se
     deriven del Atributo CAI / PeopleSoft de la propia fila.
   - Toda regla con requiresValidation: true debe ser confirmada por el
     responsable funcional antes de considerarse línea base.
   - Los ejemplos JSON son fuentes oficiales inmutables: estas reglas cambian
     la INTERPRETACIÓN del mapeo, jamás el contenido del JSON.
============================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PORTAL_EQUIVALENCE_RULES = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  /* Valores de celda que deben tratarse como "sin dato" al comparar.
     Se conservan tal cual para mostrarlos en la interfaz. */
  var PLACEHOLDERS = [
    '', '-', '--', '---', 'n/a', 'na', 'n.a.', 'no aplica', 'no aplica.',
    'pendiente', 'pendientes', 'pendiente por validar', 'pendiente de validar',
    'pendiente por definir', 'pendiente de definicion', 'pendiente de definición',
    'pendiente de mapeo', 'por definir', 'por confirmar', 'por validar',
    'sin definir', 'sin dato', 'sin informacion', 'sin información',
    'no documentado', 'no documentado en el excel adjunto', 'no documentado.',
    'null', 'undefined', 'ninguno', 'ninguna', 'vacio', 'vacío'
  ];

  /* Variantes adicionales de encabezado observadas o previstas en los Excel.
     El motor ya reconoce las formas canónicas por expresión regular; esta lista
     permite ampliar la cobertura sin modificar el motor. */
  var EXTRA_HEADERS = {
    atributoCai: [
      'Atributo CAI',
      'Atributo PeopleSoft',
      'Atributo CAI / PeopleSoft',
      'Atributo CAI / Fuente Sugerida CAI',
      'Atributo CAI / Fuente CAI',
      'Atributo CAI/Fuente Sugerida',
      'Atributo CAI - PeopleSoft',
      'Campo CAI',
      'Campo PeopleSoft',
      'Atributo destino'
    ],
    alias: [
      'Alias',
      'Alias documentado',
      'Campo equivalente',
      'Nombre equivalente',
      'Equivalencia JSON'
    ],
    rutaJson: [
      'Ruta JSON',
      'Ruta',
      'Path JSON',
      'Estructura JSON'
    ]
  };

  /* Nombres que, cuando el JSON los expone como objeto o arreglo, son
     contenedores estructurales y no campos funcionales. El motor decide por la
     estructura real del JSON; esta lista solo documenta los casos conocidos
     del proyecto para efectos de auditoría y de los informes. */
  var KNOWN_CONTAINERS = [
    'vendors', 'answers', 'LINEA_Pedido', 'LINEA_DISTRIBUCION', 'LINEA_RECEPCION',
    'GB_PROVEEDORES', 'GB_STATUS_RADICACION', 'VOUCHER_LN', 'VALOR_PAGADO',
    'GB_CONTRATOS_B', 'GB_ALL_CREAR_MOD_CONT_DOC', 'GB_LINE_CREAR_MOD_CONT_DOC',
    'GB_LNDS_CREAR_MOD_CONT_DOC', 'LINEA', 'distribuciones', 'lineas',
    'GB_PEDIDOS_CAI_SUPLOS_HDR', 'GB_FAC_ELE_REQ', 'GB_CONSULTAR_RADICADO',
    'GB_CANCELAR_PEDIDO', 'IMPUESTOS', 'PEDIDOS'
  ];

  /* -------------------------------------------------------------------------
     ALIAS DOCUMENTADOS
     -------------------------------------------------------------------------
     integration : code de la integración (o '*' para todas).
     service     : 'Petición' | 'Respuesta' | '*'.
     mappingField: valor de Campo Json en la fila del mapeo.
     jsonField   : nombre del campo tal como aparece en el JSON oficial.
     jsonPath    : (opcional) ruta completa cuando el nombre se repite.
     source      : evidencia que respalda la equivalencia.
  ------------------------------------------------------------------------- */
  var ALIASES = [
    {
      integration: 'CON_CONT_Crear_contrato',
      service: 'Petición',
      mappingField: 'GB_ARRENDAMIENTO',
      jsonField: 'GB_CONTRATO_ARRND',
      source: 'Excel Campos_Integracion_Crear_Contratos: la fila declara el marcador de arrendamiento del contrato, que el JSON oficial expone como GB_CONTRATO_ARRND.',
      requiresValidation: true
    },
    {
      integration: 'CON_CONT_Version_contrato',
      service: 'Petición',
      mappingField: 'GB_ARRENDAMIENTO',
      jsonField: 'GB_CONTRATO_ARRND',
      source: 'Excel Campos_Integracion_Modificar_Contratos: misma estructura de contrato que la integración de creación.',
      requiresValidation: true
    },
    {
      integration: 'PRO_FORM_Formulario_proveedor',
      service: 'Respuesta',
      mappingField: 'answers',
      jsonField: 'answer',
      jsonPath: 'vendors[].answers[].answer',
      source: 'Excel Campos_Json_Formulario_Proveedor: la fila describe el VALOR del concepto (GB_VALOR_FORM, VARCHAR/TEXT). En el JSON oficial "answers" es el arreglo y "answer" es el campo funcional que contiene el valor; "externalSystemCorrelationId" corresponde a GB_PREGUN_FORM.',
      requiresValidation: false
    }
  ];

  /* -------------------------------------------------------------------------
     REGLAS DE LECTURA DE CELDA
     -------------------------------------------------------------------------
     Normalizaciones declaradas explícitamente por el proyecto. El motor solo
     aplica las que están aquí; ninguna se deduce. Todas producen coincidencias
     etiquetadas como "Coincide por alias" con su evidencia visible, y las
     marcadas con requiresValidation deben confirmarse con el responsable
     funcional.
  ------------------------------------------------------------------------- */
  var CELL_RULES = [
    {
      id: 'prefijo-alias-tabla',
      applies: 'campoJson',
      pattern: '^[A-Za-z]{1,3}\\.(?=[A-Za-z_])',
      replacement: '',
      description: 'Prefijo de alias de tabla SQL (por ejemplo "A.") antepuesto al nombre del campo en la pestaña de mapeo.',
      source: 'Excel Campos_Integracion_Crear_Contratos y Campos_Integracion_Modificar_Contratos, bloque Formulario IFRS: las filas nombran los campos como A.SEQNBR, A.FLAG, etc., mientras el JSON oficial los expone sin el alias.',
      requiresValidation: true
    },
    {
      id: 'atributo-con-descripcion',
      applies: 'atributoCai',
      pattern: '^([A-Za-z_][A-Za-z0-9_]{2,})\\s*[-/(:].*$',
      replacement: '$1',
      description: 'Celda de Atributo CAI que incluye el nombre técnico seguido de su descripción (por ejemplo "VENDOR_ID - ID Proveedor").',
      source: 'Excel Campos_Integracion_Crear_Contratos, bloque Formulario IFRS.',
      requiresValidation: true
    }
  ];

  return {
    version: '1.1',
    placeholders: PLACEHOLDERS,
    extraHeaders: EXTRA_HEADERS,
    knownContainers: KNOWN_CONTAINERS,
    aliases: ALIASES,
    cellRules: CELL_RULES
  };
});
