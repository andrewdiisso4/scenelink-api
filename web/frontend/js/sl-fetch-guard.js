/* SceneLink recovery: bound API headers AND body reads; honor caller cancellation.
   No retries or substituted data. Non-API requests remain untouched. */
(function () {
  'use strict';
  if (window.__SL_FETCH_GUARD__) return;
  window.__SL_FETCH_GUARD__ = true;
  var originalFetch = window.fetch.bind(window), failures = [];
  function recordFail() {
    var now = Date.now(); failures.push(now);
    failures = failures.filter(function (t) { return now - t < 30000; });
    window.SL_API_DEGRADED = failures.length >= 3;
  }
  function isApi(input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    return /(^|\/)api\//.test(url);
  }
  window.fetch = function guardedFetch(input, init) {
    if (!isApi(input)) return originalFetch(input, init);
    var options = Object.assign({}, init || {});
    var callerSignal = options.signal || (input && typeof input !== 'string' && input.signal);
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) options.signal = controller.signal;
    var timer, rejectDeadline, finished = false;
    var deadline = new Promise(function (_, reject) { rejectDeadline = reject; });
    function cleanup() {
      if (finished) return; finished = true;
      clearTimeout(timer);
      if (callerSignal && callerSignal.removeEventListener) callerSignal.removeEventListener('abort', cancel);
    }
    function cancel() {
      var error = new Error('Request cancelled'); error.name = 'AbortError';
      if (controller) controller.abort(); rejectDeadline(error); cleanup();
    }
    timer = setTimeout(function () {
      var error = new Error('SceneLink service timed out. Please retry.'); error.name = 'TimeoutError';
      if (controller) controller.abort(); rejectDeadline(error); cleanup();
    }, 12000);
    if (callerSignal && callerSignal.addEventListener) callerSignal.addEventListener('abort', cancel, {once:true});
    if (callerSignal && callerSignal.aborted) cancel();
    function failed(error) { cleanup(); if (error.name !== 'AbortError') recordFail(); throw error; }
    var request;
    try { request = originalFetch(input, options); } catch (error) { request = Promise.reject(error); }
    return Promise.race([request, deadline]).then(function (response) {
      if (response.status === 404 || response.status >= 500) recordFail();
      if (!response.body && response.status === 204) cleanup();
      // A fetch promise resolves on headers, not when its body has arrived.
      function wrapResponse(response) { return new Proxy(response, {
        get: function (target, key) {
          var value = Reflect.get(target, key, target);
          if (key === 'clone' && typeof value === 'function') return function(){ return wrapResponse(value.call(target)); };
          if (['json','text','arrayBuffer','blob','formData'].indexOf(key) !== -1 && typeof value === 'function') {
            return function () {
              return Promise.race([Promise.resolve().then(function(){ return value.call(target); }), deadline])
                .then(function (data) { cleanup(); return data; }, failed);
            };
          }
          return typeof value === 'function' ? value.bind(target) : value;
        }
      }); }
      return wrapResponse(response);
    }, failed);
  };
  window.SL_FETCH_GUARD_VERSION = 'recovery-2026-10-27-bounded-body';
})();
