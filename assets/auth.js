
/* =====================================================================
   CONTROL DE ACCESO DEL PORTAL (datos quemados)

   ALCANCE: el portal es estático y se abre desde el navegador, por lo
   que este login es un control de presentación, no un control de
   seguridad. Las credenciales viajan dentro de este archivo y cualquier
   persona con acceso a la carpeta puede leerlas. Sirve para identificar
   al usuario que consulta y para evitar el acceso casual; no protege el
   contenido frente a alguien que inspeccione los archivos.

   CÓMO EDITAR LOS USUARIOS
   1. Modifique la lista USERS de abajo (usuario, nombre, rol, area).
   2. La clave se guarda codificada en base64 para que no quede legible a
      simple vista. Para generar una nueva, abra la consola del navegador
      (F12) y ejecute:  btoa('MiNuevaClave')
      Copie el resultado en el campo clave.
   3. Guarde el archivo y recargue el portal.
===================================================================== */
(() => {
  'use strict';

  /* --- Usuarios habilitados (7) ------------------------------------ */
  const USERS = [
    { usuario: 'admin',              nombre: 'Administrador del portal', rol: 'Administrador',        area: 'Integraciones',      clave: 'U3VwbG9zMjAyNipBZG1pbg==' },
    { usuario: 'lider.funcional',    nombre: 'Líder funcional',          rol: 'Líder funcional',      area: 'Suplos - CAI',       clave: 'U3VwbG9zMjAyNipMaWRlcg==' },
    { usuario: 'analista.funcional', nombre: 'Analista funcional',       rol: 'Analista funcional',   area: 'Diseño funcional',   clave: 'U3VwbG9zMjAyNipBbmFsaXN0YQ==' },
    { usuario: 'arquitecto',         nombre: 'Arquitecto de solución',   rol: 'Arquitectura',         area: 'Arquitectura',       clave: 'U3VwbG9zMjAyNipBcnF1aXRlY3Rv' },
    { usuario: 'desarrollador',      nombre: 'Desarrollador PeopleSoft', rol: 'Desarrollo',           area: 'PeopleSoft 9.1',     clave: 'U3VwbG9zMjAyNipEZXY=' },
    { usuario: 'qa',                 nombre: 'Analista de pruebas',      rol: 'Calidad',              area: 'Pruebas',            clave: 'U3VwbG9zMjAyNipRQQ==' },
    { usuario: 'consulta',           nombre: 'Usuario de consulta',      rol: 'Solo lectura',         area: 'Proveedor / SUPLOS', clave: 'U3VwbG9zMjAyNipDb25zdWx0YQ==' }
  ];

  /* --- Parámetros de sesión ---------------------------------------- */
  const KEY          = 'suplos-cai-session-v1';
  const DURACION_MS  = 8 * 60 * 60 * 1000;  // la sesión caduca a las 8 horas
  const MAX_INTENTOS = 5;
  const BLOQUEO_S    = 30;                  // segundos de espera tras 5 fallos

  const $ = s => document.querySelector(s);
  /* Acepta claves codificadas como UTF-8 y también las que btoa() generó
     directamente sobre texto simple, para que ambas formas funcionen. */
  const decode = v => {
    let raw;
    try { raw = atob(v); } catch { return null; }
    try { return decodeURIComponent(escape(raw)); } catch { return raw; }
  };

  let intentos = 0, bloqueadoHasta = 0, tick = null;

  /* --- Persistencia ------------------------------------------------- */
  /* sessionStorage: la sesión muere al cerrar la pestaña.
     localStorage: solo si el usuario marca "Mantener sesión". */
  function leerSesion(){
    for (const store of [sessionStorage, localStorage]) {
      try {
        const raw = store.getItem(KEY);
        if (!raw) continue;
        const s = JSON.parse(raw);
        if (!s || !s.usuario || !s.expira || Date.now() > s.expira) { store.removeItem(KEY); continue; }
        const u = USERS.find(x => x.usuario === s.usuario);
        if (u) return u;
        store.removeItem(KEY);
      } catch { try { store.removeItem(KEY); } catch {} }
    }
    return null;
  }
  function guardarSesion(u, recordar){
    const dato = JSON.stringify({ usuario: u.usuario, expira: Date.now() + DURACION_MS });
    try { (recordar ? localStorage : sessionStorage).setItem(KEY, dato); } catch {}
  }
  function borrarSesion(){
    try { sessionStorage.removeItem(KEY); } catch {}
    try { localStorage.removeItem(KEY); } catch {}
  }

  /* --- Apertura y cierre del portal --------------------------------- */
  function abrirPortal(u){
    document.body.classList.remove('locked');
    const chip = $('#sessionChip');
    if (chip) {
      chip.hidden = false;
      $('#sessionName').textContent = u.nombre;
      $('#sessionRole').textContent = `${u.rol} · ${u.area}`;
      $('#sessionAvatar').textContent = u.nombre.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    }
    const login = $('#loginScreen');
    if (login) login.hidden = true;
    /* Si la sesión caduca con el portal abierto se vuelve al login. */
    setInterval(() => { if (!leerSesion()) location.reload(); }, 60000);
  }
  function cerrarSesion(){
    borrarSesion();
    location.reload();
  }

  /* --- Mensajes y bloqueo temporal ---------------------------------- */
  function mensaje(texto, tipo = 'error'){
    const box = $('#loginMessage');
    if (!box) return;
    box.textContent = texto || '';
    box.className = `login-message ${tipo}`;
    box.hidden = !texto;
  }
  function bloquear(){
    bloqueadoHasta = Date.now() + BLOQUEO_S * 1000;
    const boton = $('#loginSubmit');
    clearInterval(tick);
    tick = setInterval(() => {
      const restan = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
      if (restan <= 0) {
        clearInterval(tick); tick = null;
        intentos = 0;
        if (boton) { boton.disabled = false; boton.textContent = 'Ingresar'; }
        mensaje('Puede intentarlo nuevamente.', 'info');
        return;
      }
      if (boton) { boton.disabled = true; boton.textContent = `Espere ${restan} s`; }
      mensaje(`Demasiados intentos fallidos. Espere ${restan} segundos.`, 'error');
    }, 250);
  }

  /* --- Validación de credenciales ----------------------------------- */
  function autenticar(usuario, clave){
    const u = USERS.find(x => x.usuario.toLowerCase() === usuario.trim().toLowerCase());
    if (!u) return null;
    return decode(u.clave) === clave ? u : null;
  }

  function iniciar(){
    const form = $('#loginForm');
    /* Sin formulario no hay forma de autenticar: se libera el portal en
       lugar de dejarlo oculto de manera permanente. */
    if (!form) { document.body.classList.remove('locked'); return; }

    /* El cierre de sesión se enlaza siempre, tanto si la sesión ya venía
       activa como si se abre desde el formulario. */
    $('#logoutButton')?.addEventListener('click', () => {
      if (confirm('¿Cerrar la sesión del portal?')) cerrarSesion();
    });

    const activa = leerSesion();
    if (activa) { abrirPortal(activa); return; }

    document.body.classList.add('locked');
    $('#loginScreen').hidden = false;
    setTimeout(() => $('#loginUser')?.focus(), 60);

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (Date.now() < bloqueadoHasta) return;

      const usuario  = $('#loginUser').value;
      const clave    = $('#loginPass').value;
      const recordar = $('#loginRemember').checked;

      if (!usuario.trim() || !clave) { mensaje('Ingrese usuario y contraseña.'); return; }

      const u = autenticar(usuario, clave);
      if (!u) {
        intentos++;
        $('#loginPass').value = '';
        if (intentos >= MAX_INTENTOS) { bloquear(); return; }
        mensaje(`Usuario o contraseña incorrectos. Intento ${intentos} de ${MAX_INTENTOS}.`);
        $('#loginPass').focus();
        return;
      }

      intentos = 0;
      mensaje('');
      guardarSesion(u, recordar);
      abrirPortal(u);
    });

    /* Mostrar / ocultar contraseña. */
    $('#togglePass')?.addEventListener('click', () => {
      const input = $('#loginPass'), visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      $('#togglePass').textContent = visible ? 'Mostrar' : 'Ocultar';
      $('#togglePass').setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      input.focus();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  /* Expuesto por si otra parte del portal necesita el usuario activo. */
  window.PortalAuth = { usuarioActivo: leerSesion, cerrarSesion };
})();
