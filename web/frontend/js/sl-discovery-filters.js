/* Only controls supported by the canonical venue directory are offered. */
(function () {
  'use strict';
  var keys = ['type', 'cuisine', 'neighborhood', 'vibe', 'price_level'];
  function type(value) {
    value = ({ hot: 'nightclub', rooftop: 'rooftop_bar' })[value] || value || 'all';
    var select = document.querySelector('#slDiscoveryFilters [name="type"]');
    return select && Array.from(select.options).some(function (option) { return option.value === value; }) ? value : 'all';
  }
  window.SLDiscoveryFilters = {
    type: type,
    mount: function (options) {
      var overlay = document.getElementById('slFilterOverlay'), form = document.getElementById('slDiscoveryFilters');
      var trigger = document.getElementById('slFilterBtn'), close = document.getElementById('slFilterClose');
      if (!overlay || !form || !trigger) return;
      var previousFocus, previousOverflow;
      function dismiss() { overlay.classList.remove('active'); document.body.style.overflow = previousOverflow || ''; if (previousFocus && previousFocus.isConnected) previousFocus.focus(); }
      trigger.onclick = function () {
        window.dispatchEvent(new CustomEvent('sl:explicit-modal'));
        var values = options.read(); previousFocus = document.activeElement;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        keys.forEach(function (key) { form.elements.namedItem(key).value = values[key] || (key === 'type' ? 'all' : ''); });
        overlay.classList.add('active'); close.focus();
      };
      close.onclick = dismiss;
      overlay.addEventListener('click', function (event) { if (event.target === overlay) dismiss(); });
      overlay.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
        if (event.key === 'Tab') {
          var controls = Array.from(overlay.querySelectorAll('button:not([disabled]),input,select'));
          var first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      });
      form.onsubmit = function (event) {
        event.preventDefault();
        var values = {};
        keys.forEach(function (key) { values[key] = form.elements.namedItem(key).value.trim(); });
        values.type = type(values.type);
        dismiss(); options.apply(values);
      };
      document.getElementById('slFilterReset').onclick = function () {
        dismiss(); options.apply({ type: 'all', cuisine: '', neighborhood: '', vibe: '', price_level: '' });
      };
    }
  };
})();
