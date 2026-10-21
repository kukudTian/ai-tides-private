(function () {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  document.querySelectorAll('.copy-link').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = btn.getAttribute('data-url') || window.location.href;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          var old = btn.innerHTML;
          btn.innerHTML = '已复制';
          setTimeout(function () {
            btn.innerHTML = old;
            if (window.lucide) window.lucide.createIcons();
          }, 1400);
        });
      }
    });
  });
})();
