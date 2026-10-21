/* REAlimenta — interacciones demostrativas del prototipo.
   No se almacenan datos ni se realizan peticiones a servidores. */

document.addEventListener('DOMContentLoaded', () => {
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  // Notificaciones flotantes reutilizables.
  function showToast(message, title = 'Acción simulada') {
    const container = qs('.toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <span class="toast-icon"><i class="fa-solid fa-check"></i></span>
      <span><strong>${title}</strong><span>${message}</span></span>
      <button class="toast-close" type="button" aria-label="Cerrar notificación"><i class="fa-solid fa-xmark"></i></button>`;
    container.appendChild(toast);

    const remove = () => toast.remove();
    qs('.toast-close', toast)?.addEventListener('click', remove);
    window.setTimeout(remove, 4200);
  }

  qsa('[data-toast]').forEach((element) => {
    element.addEventListener('click', (event) => {
      if (element.tagName === 'A' && element.getAttribute('href') === '#') event.preventDefault();
      showToast(element.dataset.toast);
    });
  });

  // Menú público para pantallas pequeñas.
  const publicMenuButton = qs('[data-public-menu]');
  const publicMenu = qs('#public-menu');
  if (publicMenuButton && publicMenu) {
    publicMenuButton.addEventListener('click', () => {
      const open = publicMenu.classList.toggle('open');
      publicMenuButton.setAttribute('aria-expanded', String(open));
      qs('i', publicMenuButton)?.classList.toggle('fa-bars', !open);
      qs('i', publicMenuButton)?.classList.toggle('fa-xmark', open);
    });
    qsa('a', publicMenu).forEach((link) => link.addEventListener('click', () => {
      publicMenu.classList.remove('open');
      publicMenuButton.setAttribute('aria-expanded', 'false');
    }));
  }

  // Navegación de los paneles por vistas internas.
  const sidebar = qs('#app-sidebar');
  const sidebarOverlay = qs('[data-sidebar-overlay]');
  const breadcrumb = qs('[data-breadcrumb]');

  function closeSidebar() {
    sidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  }

  function openSidebar() {
    sidebar?.classList.add('open');
    sidebarOverlay?.classList.add('open');
    document.body.classList.add('sidebar-open');
  }

  qs('[data-sidebar-open]')?.addEventListener('click', openSidebar);
  qs('[data-sidebar-close]')?.addEventListener('click', closeSidebar);
  sidebarOverlay?.addEventListener('click', closeSidebar);

  function openView(viewName, updateHash = true) {
    const target = qs(`[data-view-section="${viewName}"]`);
    if (!target) return;

    qsa('[data-view-section]').forEach((view) => view.classList.toggle('active', view === target));
    qsa('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
    if (breadcrumb) breadcrumb.textContent = target.dataset.title || viewName;
    document.title = `${target.dataset.title || 'Panel'} | REAlimenta`;
    if (updateHash && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${viewName}`);
    }
    qs('[data-profile-dropdown]')?.classList.remove('open');
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  qsa('[data-view], [data-nav-view]').forEach((control) => {
    control.addEventListener('click', () => openView(control.dataset.view || control.dataset.navView));
  });

  const initialView = window.location.hash.replace('#', '');
  if (initialView && qs(`[data-view-section="${initialView}"]`)) openView(initialView, false);

  // Menú de usuario en la barra superior.
  const profileTrigger = qs('[data-profile-trigger]');
  const profileDropdown = qs('[data-profile-dropdown]');
  profileTrigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = profileDropdown?.classList.toggle('open');
    profileTrigger.setAttribute('aria-expanded', String(Boolean(open)));
  });
  document.addEventListener('click', (event) => {
    if (profileDropdown && !profileDropdown.contains(event.target) && !profileTrigger?.contains(event.target)) {
      profileDropdown.classList.remove('open');
      profileTrigger?.setAttribute('aria-expanded', 'false');
    }
  });

  // Selector de tipo de registro.
  const roleOptions = qsa('[data-role-option]');
  function selectRegistrationRole(role) {
    roleOptions.forEach((option) => {
      const active = option.dataset.roleOption === role;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    });
    qsa('[data-role-fields]').forEach((group) => {
      const active = group.dataset.roleFields === role;
      group.hidden = !active;
      qsa('input, select, textarea', group).forEach((field) => {
        field.disabled = !active;
      });
    });
  }
  roleOptions.forEach((option) => option.addEventListener('click', () => selectRegistrationRole(option.dataset.roleOption)));
  if (roleOptions.length) {
    const requestedRole = new URLSearchParams(window.location.search).get('tipo');
    selectRegistrationRole(requestedRole === 'organizacion' ? 'organizacion' : 'donante');
  }

  // Mostrar u ocultar contraseñas.
  qsa('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.setAttribute('aria-label', reveal ? 'Ocultar contraseña' : 'Mostrar contraseña');
      const icon = qs('i', button);
      icon?.classList.toggle('fa-eye', !reveal);
      icon?.classList.toggle('fa-eye-slash', reveal);
    });
  });

  // Formularios visuales: validan en el navegador, pero no persisten datos.
  qsa('[data-demo-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      showToast(form.dataset.message || 'La información se procesó correctamente.');
      if (form.dataset.afterView) window.setTimeout(() => openView(form.dataset.afterView), 450);
    });
  });

  // Filtros y buscadores de tablas.
  function applyTableFilters(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const container = qs(`[data-filter-container="${tableId}"]`);
    const activeStatus = qs('.filter-tab.active[data-filter]', container)?.dataset.filter || 'todas';
    const search = (qs(`[data-search-table="${tableId}"]`)?.value || '').trim().toLocaleLowerCase('es');

    qsa('tbody tr', table).forEach((row) => {
      const matchesStatus = activeStatus === 'todas' || row.dataset.status === activeStatus;
      const matchesSearch = !search || row.textContent.toLocaleLowerCase('es').includes(search);
      row.hidden = !(matchesStatus && matchesSearch);
    });
  }

  qsa('[data-filter-container]').forEach((container) => {
    const tableId = container.dataset.filterContainer;
    qsa('[data-filter]', container).forEach((button) => {
      button.addEventListener('click', () => {
        qsa('[data-filter]', container).forEach((tab) => tab.classList.remove('active'));
        button.classList.add('active');
        applyTableFilters(tableId);
      });
    });
  });
  qsa('[data-search-table]').forEach((input) => input.addEventListener('input', () => applyTableFilters(input.dataset.searchTable)));

  // Búsqueda del catálogo de donaciones.
  const catalog = qs('[data-catalog]');
  const catalogSearch = qs('[data-catalog-search]');
  const catalogCategory = qs('[data-catalog-filter="category"]');
  const catalogEmpty = qs('[data-catalog-empty]');
  function filterCatalog() {
    if (!catalog) return;
    const term = (catalogSearch?.value || '').trim().toLocaleLowerCase('es');
    const category = catalogCategory?.value || 'todas';
    let visible = 0;
    qsa('.donation-card', catalog).forEach((card) => {
      const matchesText = !term || card.textContent.toLocaleLowerCase('es').includes(term);
      const matchesCategory = category === 'todas' || card.dataset.category === category;
      card.hidden = !(matchesText && matchesCategory);
      if (!card.hidden) visible += 1;
    });
    if (catalogEmpty) catalogEmpty.hidden = visible > 0;
  }
  catalogSearch?.addEventListener('input', filterCatalog);
  catalogCategory?.addEventListener('change', filterCatalog);

  // Contenido centralizado de modales reutilizables.
  const modalTemplates = {
    'donation-detail': {
      title: 'Detalle de la donación',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Alimento</small><strong>Pan integral</strong></div><div class="info-item"><small>Cantidad</small><strong>30 unidades</strong></div><div class="info-item"><small>Publicación</small><strong>Hoy, 08:20</strong></div><div class="info-item"><small>Fecha límite</small><strong>Hoy, 18:00</strong></div><div class="info-item"><small>Solicitudes</small><strong>2 recibidas</strong></div><div class="info-item"><small>Estado</small><strong style="color:#187149">Disponible</strong></div></div><p class="modal-message">Pan integral horneado esta mañana y empaquetado en bolsas limpias de cinco unidades.</p>`,
      buttons: [{ label: 'Cerrar', className: 'btn-secondary', close: true }]
    },
    'cancel-donation': {
      title: 'Cancelar donación',
      body: `<div class="notice" style="border-color:#f1c5c5;background:#fff0f0;color:#9e3535"><i class="fa-solid fa-triangle-exclamation"></i><span>La publicación dejará de estar disponible para nuevas solicitudes. Esta acción solo se simula en el prototipo.</span></div><div class="form-group" style="margin-top:18px"><label for="cancel-reason">Motivo de cancelación</label><textarea id="cancel-reason" class="form-control" placeholder="Describe brevemente el motivo"></textarea></div>`,
      buttons: [{ label: 'Volver', className: 'btn-secondary', close: true }, { label: 'Cancelar donación', className: 'btn-danger', message: 'Donación cancelada de forma simulada.' }]
    },
    'request-detail': {
      title: 'Detalle de la solicitud',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Organización</small><strong>Comedor Popular Virgen del Carmen</strong></div><div class="info-item"><small>Responsable</small><strong>Rosa Condori Apaza</strong></div><div class="info-item"><small>Teléfono</small><strong>+51 952 345 678</strong></div><div class="info-item"><small>Dirección</small><strong>Av. El Sol 720, Puno</strong></div><div class="info-item"><small>Beneficiarios</small><strong>65 personas</strong></div><div class="info-item"><small>Alimento solicitado</small><strong>Pan integral · 30 unidades</strong></div></div><p class="modal-message"><strong>Mensaje:</strong> Los alimentos serán utilizados para el almuerzo comunitario de hoy. Podemos recogerlos antes de las 16:00.</p>`,
      buttons: [{ label: 'Rechazar solicitud', className: 'btn-danger', message: 'Solicitud rechazada de forma simulada.' }, { label: 'Aceptar solicitud', className: 'btn-primary', message: 'Solicitud aceptada. Se notificará a la organización.' }]
    },
    'request-detail-alt': {
      title: 'Detalle de la solicitud',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Organización</small><strong>Olla Común Santa Rosa</strong></div><div class="info-item"><small>Responsable</small><strong>Lucía Flores Nina</strong></div><div class="info-item"><small>Teléfono</small><strong>+51 984 221 705</strong></div><div class="info-item"><small>Dirección</small><strong>Plaza Santa Rosa 120, Chucuito</strong></div><div class="info-item"><small>Beneficiarios</small><strong>42 personas</strong></div><div class="info-item"><small>Alimento solicitado</small><strong>Pan integral · 20 unidades</strong></div></div><p class="modal-message"><strong>Mensaje:</strong> Podemos coordinar el recojo durante la tarde con nuestro responsable logístico.</p>`,
      buttons: [{ label: 'Rechazar solicitud', className: 'btn-danger', message: 'Solicitud rechazada de forma simulada.' }, { label: 'Aceptar solicitud', className: 'btn-primary', message: 'Solicitud aceptada. Se notificará a la organización.' }]
    },
    'accept-request': {
      title: 'Aceptar solicitud',
      body: `<p>¿Deseas asignar la donación a <strong>Comedor Popular Virgen del Carmen</strong>?</p><div class="notice"><i class="fa-solid fa-circle-info"></i><span>Al aceptar, la donación pasará al estado “Aceptada” y podrán coordinar el recojo.</span></div>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Aceptar solicitud', className: 'btn-primary', message: 'Solicitud aceptada correctamente.' }]
    },
    'reject-request': {
      title: 'Rechazar solicitud',
      body: `<p>Indica un motivo breve para informar a la organización.</p><div class="form-group"><label for="reject-reason">Motivo</label><select id="reject-reason" class="form-control"><option>La donación ya fue asignada</option><option>No se puede coordinar el recojo</option><option>La cantidad solicitada no está disponible</option><option>Otro motivo</option></select></div>`,
      buttons: [{ label: 'Volver', className: 'btn-secondary', close: true }, { label: 'Rechazar solicitud', className: 'btn-danger', message: 'Solicitud rechazada. La organización será notificada.' }]
    },
    'confirm-delivery': {
      title: 'Confirmar entrega',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Alimento</small><strong>Leche pasteurizada</strong></div><div class="info-item"><small>Cantidad</small><strong>10 litros</strong></div><div class="info-item"><small>Organización</small><strong>Comedor San Martín</strong></div><div class="info-item"><small>Fecha</small><strong>07/10/2026</strong></div></div><label class="check-row"><input type="checkbox" checked><span>Confirmo que la donación fue entregada a la organización.</span></label>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Confirmar entrega', className: 'btn-primary', message: 'Entrega confirmada. Falta la confirmación de recepción.' }]
    },
    'change-password': {
      title: 'Cambiar contraseña',
      body: `<div class="form-group"><label for="current-pass">Contraseña actual</label><input id="current-pass" class="form-control" type="password" placeholder="Contraseña actual"></div><div class="form-group" style="margin-top:14px"><label for="new-pass">Nueva contraseña</label><input id="new-pass" class="form-control" type="password" placeholder="Mínimo 8 caracteres"></div><div class="form-group" style="margin-top:14px"><label for="confirm-pass">Confirmar nueva contraseña</label><input id="confirm-pass" class="form-control" type="password" placeholder="Repite la contraseña"></div>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Actualizar contraseña', className: 'btn-primary', message: 'Contraseña actualizada de forma simulada.' }]
    },
    'request-donation': {
      title: 'Solicitar esta donación',
      body: `<div class="notice"><i class="fa-solid fa-circle-info"></i><span>Estás solicitando <strong>Pan integral</strong> de Panadería San Carlos.</span></div><div class="form-group" style="margin-top:18px"><label for="request-quantity">Cantidad requerida</label><div class="input-icon"><i class="fa-solid fa-box"></i><input id="request-quantity" class="form-control" type="number" value="30" min="1" max="30"></div></div><div class="form-group" style="margin-top:14px"><label for="request-message">Mensaje para el donante</label><textarea id="request-message" class="form-control" placeholder="Explica brevemente cómo coordinarán el recojo.">Podemos recoger los alimentos hoy antes de las 16:00.</textarea></div>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Enviar solicitud', className: 'btn-primary', message: 'Solicitud enviada a Panadería San Carlos.' }]
    },
    'request-status': {
      title: 'Detalle de solicitud',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Solicitud</small><strong>#SOL-048</strong></div><div class="info-item"><small>Donación</small><strong>Frutas variadas</strong></div><div class="info-item"><small>Donante</small><strong>Mercado Central Puno</strong></div><div class="info-item"><small>Cantidad</small><strong>15 kg</strong></div><div class="info-item"><small>Fecha</small><strong>07/10/2026 · 09:45</strong></div><div class="info-item"><small>Estado</small><strong style="color:#9d690b">Pendiente</strong></div></div><p class="modal-message">El donante aún no ha respondido. Recibirás una notificación cuando cambie el estado.</p>`,
      buttons: [{ label: 'Cerrar', className: 'btn-secondary', close: true }]
    },
    'confirm-reception': {
      title: 'Confirmar recepción',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Alimento recibido</small><strong>Arroz preparado</strong></div><div class="info-item"><small>Cantidad</small><strong>12 porciones</strong></div><div class="info-item"><small>Donante</small><strong>Restaurante Lago Azul</strong></div><div class="info-item"><small>Fecha</small><strong>07/10/2026</strong></div></div><label class="check-row"><input type="checkbox" checked><span>He recibido correctamente la donación.</span></label><div class="form-group" style="margin-top:16px"><label for="reception-notes">Observaciones (opcional)</label><textarea id="reception-notes" class="form-control" placeholder="Agrega algún comentario sobre la entrega"></textarea></div>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Confirmar recepción', className: 'btn-primary', message: 'Recepción confirmada. La donación quedó finalizada.' }]
    },
    'admin-profile': {
      title: 'Perfil de administración',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Nombre</small><strong>María Quispe</strong></div><div class="info-item"><small>Rol</small><strong>Administradora principal</strong></div><div class="info-item"><small>Correo</small><strong>maria.quispe@realimenta.pe</strong></div><div class="info-item"><small>Teléfono</small><strong>+51 950 100 200</strong></div></div>`,
      buttons: [{ label: 'Cerrar', className: 'btn-secondary', close: true }, { label: 'Editar perfil', className: 'btn-primary', message: 'Edición de perfil habilitada de forma simulada.' }]
    },
    'new-user': {
      title: 'Registrar usuario interno',
      body: `<div class="form-grid"><div class="form-group full"><label for="new-user-name">Nombre completo</label><input id="new-user-name" class="form-control" placeholder="Nombres y apellidos"></div><div class="form-group"><label for="new-user-email">Correo</label><input id="new-user-email" class="form-control" type="email" placeholder="nombre@realimenta.pe"></div><div class="form-group"><label for="new-user-role">Rol</label><select id="new-user-role" class="form-control"><option>Administrador</option><option>Revisor</option><option>Soporte</option></select></div></div>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Registrar usuario', className: 'btn-primary', message: 'Usuario interno registrado de forma simulada.' }]
    },
    'user-detail': {
      title: 'Detalle del usuario',
      body: `<div class="modal-detail-list"><div class="info-item"><small>ID</small><strong>#USR-186</strong></div><div class="info-item"><small>Nombre</small><strong>Carlos Quispe</strong></div><div class="info-item"><small>Correo</small><strong>contacto@sancarlos.pe</strong></div><div class="info-item"><small>Tipo</small><strong>Donante</strong></div><div class="info-item"><small>Registro</small><strong>07/10/2026</strong></div><div class="info-item"><small>Estado</small><strong style="color:#187149">Activo</strong></div></div>`,
      buttons: [{ label: 'Cerrar', className: 'btn-secondary', close: true }, { label: 'Editar usuario', className: 'btn-primary', message: 'Editor de usuario abierto de forma simulada.' }]
    },
    'block-user': {
      title: 'Bloquear usuario',
      body: `<div class="notice" style="border-color:#f1c5c5;background:#fff0f0;color:#9e3535"><i class="fa-solid fa-user-lock"></i><span>El usuario no podrá ingresar ni realizar acciones hasta que su cuenta sea reactivada.</span></div><div class="form-group" style="margin-top:16px"><label for="block-reason">Motivo</label><textarea id="block-reason" class="form-control" placeholder="Motivo del bloqueo"></textarea></div>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Bloquear cuenta', className: 'btn-danger', message: 'Usuario bloqueado de forma simulada.' }]
    },
    'donor-admin-detail': {
      title: 'Detalle del donante',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Establecimiento</small><strong>Panadería San Carlos</strong></div><div class="info-item"><small>Responsable</small><strong>Carlos Quispe</strong></div><div class="info-item"><small>RUC</small><strong>20456789012</strong></div><div class="info-item"><small>Distrito</small><strong>Puno</strong></div><div class="info-item"><small>Donaciones</small><strong>12 publicadas · 8 entregadas</strong></div><div class="info-item"><small>Estado</small><strong style="color:#187149">Verificado</strong></div></div>`,
      buttons: [{ label: 'Cerrar', className: 'btn-secondary', close: true }, { label: 'Editar', className: 'btn-primary', message: 'Editor del donante abierto de forma simulada.' }]
    },
    'organization-admin-detail': {
      title: 'Detalle de la organización',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Organización</small><strong>Comedor Popular Virgen del Carmen</strong></div><div class="info-item"><small>Responsable</small><strong>Rosa Condori</strong></div><div class="info-item"><small>Tipo</small><strong>Comedor popular</strong></div><div class="info-item"><small>Beneficiarios</small><strong>65 personas</strong></div><div class="info-item"><small>Donaciones recibidas</small><strong>14</strong></div><div class="info-item"><small>Estado</small><strong style="color:#187149">Verificada</strong></div></div>`,
      buttons: [{ label: 'Cerrar', className: 'btn-secondary', close: true }, { label: 'Editar', className: 'btn-primary', message: 'Editor de la organización abierto de forma simulada.' }]
    },
    'admin-donation-detail': {
      title: 'Detalle de donación',
      body: `<div class="modal-detail-list"><div class="info-item"><small>ID</small><strong>#DON-012</strong></div><div class="info-item"><small>Alimento</small><strong>Pan integral</strong></div><div class="info-item"><small>Donante</small><strong>Panadería San Carlos</strong></div><div class="info-item"><small>Cantidad</small><strong>30 unidades</strong></div><div class="info-item"><small>Fecha límite</small><strong>07/10/2026 · 18:00</strong></div><div class="info-item"><small>Estado</small><strong style="color:#187149">Disponible</strong></div></div>`,
      buttons: [{ label: 'Cerrar', className: 'btn-secondary', close: true }]
    },
    'admin-request-detail': {
      title: 'Detalle de solicitud',
      body: `<div class="modal-detail-list"><div class="info-item"><small>ID</small><strong>#SOL-048</strong></div><div class="info-item"><small>Organización</small><strong>Comedor Virgen del Carmen</strong></div><div class="info-item"><small>Donación</small><strong>Frutas variadas · 15 kg</strong></div><div class="info-item"><small>Donante</small><strong>Mercado Central Puno</strong></div><div class="info-item"><small>Fecha</small><strong>07/10/2026 · 09:45</strong></div><div class="info-item"><small>Estado</small><strong style="color:#9d690b">Pendiente</strong></div></div>`,
      buttons: [{ label: 'Cerrar', className: 'btn-secondary', close: true }]
    },
    'delivery-detail': {
      title: 'Seguimiento de entrega',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Entrega</small><strong>#ENT-357</strong></div><div class="info-item"><small>Donación</small><strong>Leche · 10 litros</strong></div><div class="info-item"><small>Donante</small><strong>Hotel Altiplano</strong></div><div class="info-item"><small>Organización</small><strong>Comedor Virgen del Carmen</strong></div><div class="info-item"><small>Fecha y hora</small><strong>08/10/2026 · 09:30</strong></div><div class="info-item"><small>Estado</small><strong style="color:#286aa9">Programada</strong></div></div><p class="modal-message">La entrega está coordinada y pendiente de confirmación por ambas partes.</p>`,
      buttons: [{ label: 'Cerrar', className: 'btn-secondary', close: true }]
    },
    'verification-detail': {
      title: 'Revisar organización',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Nombre</small><strong>Olla Común Santa Rosa</strong></div><div class="info-item"><small>Tipo</small><strong>Olla común</strong></div><div class="info-item"><small>Responsable</small><strong>Lucía Flores Nina</strong></div><div class="info-item"><small>Beneficiarios</small><strong>42 personas</strong></div><div class="info-item"><small>Dirección</small><strong>Plaza Santa Rosa 120, Chucuito</strong></div><div class="info-item"><small>Registro</small><strong>06/10/2026</strong></div></div><div class="notice"><i class="fa-solid fa-file-circle-check"></i><span>Documento de representación y constancia domiciliaria adjuntados.</span></div>`,
      buttons: [{ label: 'Rechazar', className: 'btn-danger', message: 'Verificación rechazada de forma simulada.' }, { label: 'Aprobar', className: 'btn-primary', message: 'Organización aprobada y verificada.' }]
    },
    'verification-detail-donor': {
      title: 'Revisar establecimiento',
      body: `<div class="modal-detail-list"><div class="info-item"><small>Nombre</small><strong>Hotel Altiplano</strong></div><div class="info-item"><small>Tipo</small><strong>Hotel</strong></div><div class="info-item"><small>Responsable</small><strong>Ana Cutipa</strong></div><div class="info-item"><small>RUC</small><strong>20567890123</strong></div><div class="info-item"><small>Dirección</small><strong>Av. Circunvalación 410, Juliaca</strong></div><div class="info-item"><small>Registro</small><strong>05/10/2026</strong></div></div><div class="notice"><i class="fa-solid fa-file-circle-check"></i><span>Ficha RUC y licencia de funcionamiento adjuntadas.</span></div>`,
      buttons: [{ label: 'Rechazar', className: 'btn-danger', message: 'Verificación rechazada de forma simulada.' }, { label: 'Aprobar', className: 'btn-primary', message: 'Establecimiento aprobado y verificado.' }]
    },
    'approve-verification': {
      title: 'Aprobar verificación',
      body: `<p>¿Confirmas que la información fue revisada y cumple con los requisitos de REAlimenta?</p><div class="notice"><i class="fa-solid fa-circle-info"></i><span>La cuenta recibirá el estado “Verificada” y tendrá acceso a todas las funciones.</span></div>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Aprobar solicitud', className: 'btn-primary', message: 'Solicitud aprobada correctamente.' }]
    },
    'reject-verification': {
      title: 'Rechazar verificación',
      body: `<div class="form-group"><label for="verification-reason">Motivo del rechazo</label><textarea id="verification-reason" class="form-control" placeholder="Indica qué información debe corregirse"></textarea></div>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Rechazar solicitud', className: 'btn-danger', message: 'Solicitud rechazada. Se enviaron observaciones.' }]
    },
    'send-notification': {
      title: 'Enviar notificación',
      body: `<div class="form-group"><label for="notification-audience">Destinatarios</label><select id="notification-audience" class="form-control"><option>Todos los usuarios</option><option>Solo donantes</option><option>Solo organizaciones</option></select></div><div class="form-group" style="margin-top:14px"><label for="notification-title">Título</label><input id="notification-title" class="form-control" placeholder="Título de la notificación"></div><div class="form-group" style="margin-top:14px"><label for="notification-message">Mensaje</label><textarea id="notification-message" class="form-control" placeholder="Escribe el mensaje"></textarea></div>`,
      buttons: [{ label: 'Cancelar', className: 'btn-secondary', close: true }, { label: 'Enviar notificación', className: 'btn-primary', message: 'Notificación enviada de forma simulada.' }]
    }
  };

  const modalBackdrop = qs('[data-modal-backdrop]');
  const modalTitle = qs('[data-modal-title]');
  const modalBody = qs('[data-modal-body]');
  const modalActions = qs('[data-modal-actions]');
  let lastModalTrigger = null;

  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('open');
    document.body.classList.remove('modal-open');
    lastModalTrigger?.focus();
  }

  function openModal(templateKey, trigger) {
    const template = modalTemplates[templateKey];
    if (!template || !modalBackdrop || !modalTitle || !modalBody || !modalActions) return;
    lastModalTrigger = trigger;
    modalTitle.textContent = template.title;
    modalBody.innerHTML = template.body;
    modalActions.innerHTML = '';
    template.buttons.forEach((buttonConfig) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn ${buttonConfig.className}`;
      button.textContent = buttonConfig.label;
      button.addEventListener('click', () => {
        closeModal();
        if (buttonConfig.message) showToast(buttonConfig.message);
      });
      modalActions.appendChild(button);
    });
    modalBackdrop.classList.add('open');
    document.body.classList.add('modal-open');
    window.setTimeout(() => qs('button, input, select, textarea', modalBackdrop)?.focus(), 20);
  }

  qsa('[data-modal]').forEach((trigger) => trigger.addEventListener('click', () => openModal(trigger.dataset.modal, trigger)));
  qsa('[data-modal-close]').forEach((button) => button.addEventListener('click', closeModal));
  modalBackdrop?.addEventListener('click', (event) => {
    if (event.target === modalBackdrop) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalBackdrop?.classList.contains('open')) closeModal();
  });
});
