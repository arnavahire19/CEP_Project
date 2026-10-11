(function () {
  var t = 'light';
  try { t = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
  document.documentElement.dataset.theme = t;
})();
