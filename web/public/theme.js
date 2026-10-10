// Aplica el tema (claro / oscuro / automático) antes de dibujar la página, para que no parpadee.
// Archivo aparte porque la política de seguridad no permite scripts dentro del HTML.
(function () {
  var KEY = 'gb.theme';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function pref() {
    try {
      return localStorage.getItem(KEY) || 'auto';
    } catch (e) {
      return 'auto';
    }
  }
  function apply() {
    var p = pref();
    var dark = p === 'dark' || (p === 'auto' && !!mq && mq.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#161412' : '#F5F0E8');
  }
  apply();
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
  }
  window.gbTheme = {
    get: pref,
    set: function (p) {
      try {
        if (p === 'auto') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, p);
      } catch (e) {
        /* sin almacenamiento local: solo cambia en esta visita */
      }
      apply();
    },
  };
})();
