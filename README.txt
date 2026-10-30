PORTAL DE INTEGRACIONES SUPLOS - CAI
Versión 1.4 · 01/08/2026

CAMBIOS DE ESTA VERSIÓN
1. Se reemplazó completamente el catálogo anterior de códigos de respuesta por 14 códigos vigentes.
2. La tabla presenta HTTP, Código, Categoría, Capa, Descripción, Canal, Reintento, Reproceso y Acción en SUPLOS.
3. La columna interna “Depuración” no se visualiza en el portal.
4. Se actualizaron los ejemplos JSON y los mapeos de las 17 integraciones activas usando las pestañas de los archivos Excel adjuntos.
5. Se conservaron las inconsistencias de sintaxis presentes en los ejemplos fuente, marcándolas como pendientes de validación en lugar de corregirlas silenciosamente.
6. Se reemplazó la biblioteca de archivos JSON/mapeo por los 16 Excel vigentes entregados para esta actualización.
7. El archivo Campos Integración Recepciones se conserva como proceso relacionado fuera de la línea base activa de 17 integraciones.

CAPA DE CONCILIACIÓN DE CAMPOS (agregada sobre la v1.4)
El portal ya no declara ausente un campo del mapeo solo porque su valor de
"Campo Json" no aparezca literalmente en el ejemplo JSON. Antes de reportar un
faltante busca, en este orden:
  1. Campo Json presente en el JSON          -> Coincidencia exacta
  2. Atributo CAI / PeopleSoft presente      -> Coincide por Atributo CAI
  3. Alias documentado o regla del proyecto  -> Coincide por alias
  4. Contenedor con un único campo interno   -> Coincide por alias
Solo cuando las cuatro fallan se marca "Solo mapeo".

ALCANCE: la validación comprueba la PRESENCIA del campo dentro de la estructura
general del JSON. No valida su ubicación exacta, tipo de dato, longitud ni
regla funcional. Si un campo aparece en varias posiciones del mismo JSON, se
consolida como una sola coincidencia positiva: la cantidad de apariciones no
cambia el resultado y nunca genera un estado pendiente.

Los objetos y arreglos (vendors, answers, LINEA_Pedido, VOUCHER_LN, ...) se
clasifican como "Estructura presente" y no cuentan como campos funcionales
pendientes.

Estados posibles en la columna "Tipo de coincidencia":
  Coincidencia exacta · Coincide por Atributo CAI · Coincide por alias ·
  Estructura presente · Solo JSON · Solo mapeo
El estado "Pendiente de validación" queda reservado para el único caso que no
depende de la comparación: la integración no tiene ejemplo JSON documentado
para ese tipo de servicio.

Las rutas del JSON se usan internamente para recorrer la estructura, pero no se
muestran en la tabla, no se exportan y no aparecen en los mensajes.

IMPORTANTE: los ejemplos JSON son fuentes oficiales inmutables. Esta capa solo
los lee para compararlos. No renombra, no agrega, no elimina ni corrige campos.
Las inconsistencias de las fuentes se siguen mostrando, no se reparan.

USO
Abra index.html en un navegador moderno. El portal es estático y no requiere
servidor. Los diagramas Mermaid sí requieren conexión a Internet.

CONTROL DE ACCESO
El portal solicita usuario y contraseña antes de mostrar el contenido. Los
usuarios están quemados en assets/auth.js.

  Usuario              Contraseña               Rol
  admin                Suplos2026*Admin         Administrador
  lider.funcional      Suplos2026*Lider         Líder funcional
  analista.funcional   Suplos2026*Analista      Analista funcional
  arquitecto           Suplos2026*Arquitecto    Arquitectura
  desarrollador        Suplos2026*Dev           Desarrollo PeopleSoft
  qa                   Suplos2026*QA            Calidad
  consulta             Suplos2026*Consulta      Solo lectura

La sesión dura 8 horas y se guarda en la pestaña actual; con la casilla
"Mantener la sesión en este equipo" se conserva en el navegador. Tras 5
intentos fallidos el ingreso se bloquea 30 segundos.

ALCANCE DEL LOGIN: el portal es estático, por lo que este control identifica
al usuario y evita el acceso casual, pero NO es una medida de seguridad. Las
credenciales viajan dentro de assets/auth.js y son legibles para quien tenga
acceso a la carpeta. Si se requiere control real, el portal debe publicarse en
un servidor con autenticación corporativa.

Para cambiar usuarios o claves edite la lista USERS en assets/auth.js. La clave
se guarda en base64: genere la nueva con btoa('MiClave') desde la consola del
navegador (F12) y reemplace el valor del campo clave.

PRUEBAS
  node tests/field-matching.test.js
Sin Node instalado, abra tests/run-tests.html en el navegador.

ESTRUCTURA
- index.html: interfaz principal.
- assets/data.js: catálogo, JSON, mapeos, códigos, riesgos y gestión.
- assets/equivalence-rules.js: alias documentados, variantes de encabezado y
  reglas de lectura de celda. Único lugar donde se declaran equivalencias.
- assets/field-matching.js: motor de comparación y clasificación de campos.
- assets/app.js: navegación, filtros, tablas y comportamiento.
- assets/styles.css: estilos.
- tests/: pruebas automatizadas del motor de comparación.
- docs/json/: archivos Excel vigentes de JSON y mapeos.
- docs/funcionales/: diseños funcionales.
