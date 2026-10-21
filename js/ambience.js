/* Capa visual de fotografías aportadas por el usuario. No cambia datos, formularios ni mapas. */
(() => {
  const assets = Object.freeze({
    feria: 'assets/images/fondos/feria-gastronomica-puno.jpeg',
    trucha: 'assets/images/fondos/trucha-plato-andino.jpeg',
    plato: 'assets/images/fondos/plato-tradicional-andino.png',
    pan: 'assets/images/fondos/pan-artesanal-marca-original.jpeg',
    quesos: 'assets/images/fondos/quesos-artesanales.jpeg'
  });
  const descriptions = Object.freeze({
    feria: 'Fotografía aportada: feria gastronómica con mujeres y alimentos tradicionales en Puno.',
    trucha: 'Fotografía aportada: plato de pescado acompañado de arroz, papas y limón.',
    plato: 'Fotografía aportada: preparación tradicional andina.',
    pan: 'Fotografía de pan aportada por el usuario. Se conserva íntegra su marca de agua original.',
    quesos: 'Fotografía aportada: quesos artesanales.'
  });
  const views = Object.freeze({
    dashboard: 'feria', 'mis-donaciones': 'quesos', donaciones: 'quesos', disponibles: 'quesos',
    'nueva-donacion': 'pan', 'editar-donacion': 'pan', solicitudes: 'plato',
    seguimiento: 'trucha', recojos: 'trucha', entregas: 'trucha', detalle: 'trucha',
    perfil: 'quesos', establecimiento: 'quesos', organizacion: 'feria',
    auditoria: 'plato', incidencias: 'plato', reportes: 'feria',
    login: 'trucha', registro: 'feria', recuperar:'feria', index: 'feria'
  });
  function photograph(key, className) {
    const element = document.createElement('div');
    element.className = className;
    element.dataset.ambientImage = key;
    element.style.backgroundImage = `url("${assets[key]}")`;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', descriptions[key]);
    if (key === 'pan') {
      const caption = document.createElement('span');
      caption.className = 'ambience-original-caption';
      caption.textContent = 'Fotografía aportada · marca de agua original conservada';
      element.append(caption);
    }
    return element;
  }
  function apply(view = 'dashboard', role = document.body.dataset.role || 'publico') {
    const key = views[view] || 'feria';
    document.body.dataset.ambient = key;
    document.body.dataset.ambientView = view;
    document.body.dataset.ambientRole = role;
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
