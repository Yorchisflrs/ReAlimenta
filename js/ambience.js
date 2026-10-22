/* Ambientación local con imágenes generadas. No sustituye las fotos reales de cada donación. */
(() => {
  const assets = Object.freeze({
    comunidad: 'assets/images/fondos/entrega-productos-locales-v2.png',
    pan: 'assets/images/fondos/pan-queso-local-v2.png',
    cosecha: 'assets/images/fondos/cosecha-andina-v2.png'
  });
  const descriptions = Object.freeze({
    comunidad: 'Ilustración generada: la misma escena de entrega con pan artesanal, papa, oca, yuca y queso.',
    pan: 'Ilustración generada de pan artesanal y queso local.',
    cosecha: 'Ilustración generada de papa nativa, oca y yuca.'
  });
  const views = Object.freeze({
    dashboard: 'comunidad', 'mis-donaciones': 'pan', donaciones: 'pan', disponibles: 'pan',
    'nueva-donacion': 'pan', 'editar-donacion': 'pan', solicitudes: 'comunidad',
    seguimiento: 'cosecha', recojos: 'cosecha', entregas: 'cosecha', detalle: 'cosecha',
    perfil: 'cosecha', establecimiento: 'cosecha', organizacion: 'comunidad',
    auditoria: 'comunidad', incidencias: 'cosecha', reportes: 'comunidad',
    login: 'comunidad', registro: 'pan', recuperar:'cosecha', index: 'comunidad'
  });
  function photograph(key, className) {
    const element = document.createElement('div');
    element.className = className;
    element.dataset.ambientImage = key;
    element.style.backgroundImage = `url("${assets[key]}")`;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', descriptions[key]);
    return element;
  }
  function apply(view = 'dashboard', role = document.body.dataset.role || 'publico') {
    const key = views[view] || 'comunidad';
    document.body.dataset.ambient = key;
    document.body.dataset.ambientView = view;
    document.body.dataset.ambientRole = role;
    document.body.style.setProperty('--ambient-image', `url("/${assets[key]}")`);
    const header = document.querySelector('#main-content .mvp-page-header');
    if (header) {
      header.classList.add('has-ambience');
      header.dataset.ambientImage = key;
      let photo = header.querySelector('.ambience-header-photo');
      if (photo?.dataset.ambientImage !== key) { photo?.remove(); photo = null; }
      if (!photo) header.append(photograph(key, 'ambience-header-photo'));
    }
    const authAside = document.querySelector('.mvp-auth-aside');
    if (authAside && ['login', 'registro','recuperar'].includes(view)) {
      authAside.classList.add('has-ambient-photo');
      // El servidor sirve los recursos desde la raíz de la aplicación.
      authAside.style.setProperty('--auth-ambient-image', `url("/${assets[key]}")`);
      const card = document.querySelector('.mvp-auth-card');
      if (card && !card.querySelector('.ambience-auth-banner')) {
        const banner = photograph(key, 'ambience-auth-banner');
        const back = card.querySelector('.auth-back');
        if (back) back.after(banner); else card.prepend(banner);
      }
    }
    return { view, role, image: key, asset: assets[key] };
  }
  window.REAAmbience = Object.freeze({ apply, assets, views });
  document.addEventListener('DOMContentLoaded', () => {
    const file = location.pathname.split('/').pop() || 'index.html';
    const page = file.replace('.html', '');
    if (['login', 'registro','recuperar', 'index'].includes(page)) apply(page, 'publico');
  });
})();
