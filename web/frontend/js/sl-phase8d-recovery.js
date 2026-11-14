/* SceneLink Phase 8D recovery: prevents dead CTAs/stuck loaders if an overlay or lazy AI script misfires. */
(function(){
  'use strict';
  if (window.__SL_PHASE8D_RECOVERY__) return;
  window.__SL_PHASE8D_RECOVERY__ = true;
  var AI_SCRIPT = 'js/ai-concierge-v5.js?v=connected-20261112-auth2';
  var AI_CSS = ['css/ai-concierge.css?v=connected-20261112-auth2','css/ai-concierge-v5.css?v=connected-20261112-auth2'];
  function qs(s,r){ return (r||document).querySelector(s); }
  function qsa(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function loadCss(href){
    if (qsa('link[href="'+href+'"]').length) return;
    var l=document.createElement('link'); l.rel='stylesheet'; l.href=href; document.head.appendChild(l);
  }
  function loadScript(src, cb){
    if (qsa('script[src="'+src+'"]').length) { cb && setTimeout(cb, 60); return; }
    var s=document.createElement('script'); s.src=src; s.defer=true; s.onload=function(){ cb&&cb(); }; document.head.appendChild(s);
  }
  function openConcierge(prompt){
    AI_CSS.forEach(loadCss);
    function act(){
      try {
        if (window.SLConcierge && prompt) return window.SLConcierge.ask(prompt);
        if (window.SLConcierge) return window.SLConcierge.open();
      } catch(_) {}
      setTimeout(function(){
        try {
          if (window.SLConcierge && prompt) window.SLConcierge.ask(prompt);
          else if (window.SLConcierge) window.SLConcierge.open();
        } catch(_) {}
      }, 450);
    }
    loadScript(AI_SCRIPT, act);
  }
  function bindConcierge(){
    document.addEventListener('click', function(e){
      var t = e.target && e.target.closest && e.target.closest('[data-sl-concierge], [data-ask-concierge], .tv2-ask-ai-btn, .sl-concierge-trigger, [data-concierge-ask], .ask-concierge-btn');
      if (!t) return;
      e.preventDefault();
      var q = t.getAttribute('data-sl-concierge') || t.getAttribute('data-ask-concierge') || t.getAttribute('data-concierge-ask') || t.getAttribute('data-ask') || 'Plan my night in Boston';
      openConcierge(q);
    }, true);
  }
  function bindMobileNav(){
    qsa('[data-phase8-menu]').forEach(function(btn){
      btn.setAttribute('aria-controls', 'phase8NavLinks');
      btn.setAttribute('aria-expanded', String(!!(qs('#phase8NavLinks') && qs('#phase8NavLinks').classList.contains('open'))));
    });
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest && e.target.closest('[data-phase8-menu], .mobile-menu-toggle, .nav-toggle, [aria-label="Open menu"]');
      if (!btn) return;
      var links = qs('#phase8NavLinks') || qs('.sl-phase8-links') || qs('.nav-menu') || qs('.mobile-nav');
      if (links) {
        var open = links.classList.toggle('open');
        links.__slMenuOpener = btn;
        btn.setAttribute('aria-expanded', String(open));
        if (links.id) btn.setAttribute('aria-controls', links.id);
        if (links.id === 'phase8NavLinks') qsa('[data-phase8-menu]').forEach(function(control){
          control.setAttribute('aria-expanded', String(open));
        });
      }
    }, true);
  }
  function releaseStrandedLoaders(){
    document.body && document.body.classList.add('sl-phase8d-loader-released');
    qsa('.loading-overlay,.filters-loading-overlay,.global-loading,.page-loader,#loadingOverlay,#globalLoading,#pageLoader').forEach(function(el){
      if (el.hasAttribute('data-preserve-loading')) return;
      el.setAttribute('aria-hidden','true');
      el.style.pointerEvents='none';
      el.style.visibility='hidden';
      el.style.opacity='0';
    });
  }
  var resolvedIcons = null;
  function patchBrokenIcons(root){
    // Font Awesome Free vector glyphs, CC BY 4.0:
    // https://fontawesome.com/license/free. Replaces the old duplicate text
    // fallback so icon display is independent of webfont timing and coverage.
    var icons = resolvedIcons;
    if (!icons) {
    icons = {"fa-search":"<svg viewBox=\"0 -64 512 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M416 240Q415 170 376 117L503 -9Q512 -19 512 -32Q512 -45 503 -55Q493 -64 480 -64Q467 -64 457 -55L331 72Q278 33 208 32Q120 34 61 93Q2 152 0 240Q2 328 61 387Q120 446 208 448Q296 446 355 387Q414 328 416 240ZM208 96Q247 96 280 115Q313 134 333 168Q352 202 352 240Q352 278 333 312Q313 346 280 365Q247 384 208 384Q169 384 136 365Q103 346 83 312Q64 278 64 240Q64 202 83 168Q103 134 136 115Q169 96 208 96Z\"/></svg>","fa-magic":"<svg viewBox=\"0 -64 512 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M14 -15Q0 -1 0 19Q0 38 14 53L395 434Q410 448 429 448Q448 448 463 434L498 399Q512 385 512 365Q512 346 498 331L117 -50Q102 -64 83 -64Q63 -64 49 -50L14 -15ZM348 260 453 365 348 260 453 365 429 389 324 284 348 260Z\"/></svg>","fa-wand-magic-sparkles":"<svg viewBox=\"0 -64 576 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M235 405 197 391 235 405 197 391Q192 389 192 384Q192 379 197 377L235 363L249 325Q251 320 256 320Q261 320 263 325L277 363L315 377Q320 379 320 384Q320 389 315 391L277 405L263 443Q261 448 256 448Q251 448 249 443L235 405ZM46 53Q32 38 32 19Q32 0 46 -15L81 -50Q95 -64 115 -64Q134 -64 149 -50L530 331Q544 346 544 365Q544 385 530 399L495 434Q481 448 461 448Q442 448 427 434L46 53ZM485 365 380 260 485 365 380 260 356 284 461 389 485 365ZM8 331Q0 328 0 320Q0 312 8 309L64 288L85 231Q88 224 96 224Q104 224 107 231L128 288L185 309Q192 312 192 320Q192 328 185 331L128 352L107 408Q104 416 96 416Q88 416 85 408L64 352L8 331ZM360 75Q352 72 352 64Q352 56 360 53L416 32L437 -25Q440 -32 448 -32Q456 -32 459 -25L480 32L537 53Q544 56 544 64Q544 72 537 75L480 96L459 152Q456 160 448 160Q440 160 437 152L416 96L360 75Z\"/></svg>","fa-compass":"<svg viewBox=\"0 -64 512 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M256 -64Q326 -63 384 -30Q442 4 478 64Q512 125 512 192Q512 259 478 320Q442 380 384 414Q326 447 256 448Q186 447 128 414Q70 380 34 320Q0 259 0 192Q0 125 34 64Q70 4 128 -30Q186 -63 256 -64ZM307 123 162 67 307 123 162 67Q147 63 137 73Q127 83 131 98L187 243Q192 256 205 261L350 317Q365 321 375 311Q385 301 381 286L325 141Q320 128 307 123ZM288 192Q288 206 279 215Q270 224 256 224Q242 224 233 215Q224 206 224 192Q224 178 233 169Q242 160 256 160Q270 160 279 169Q288 178 288 192Z\"/></svg>","fa-bookmark":"<svg viewBox=\"0 -64 384 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M0 400V-40V400V-40Q2 -62 24 -64Q32 -64 38 -60L192 48L346 -60Q352 -64 360 -64Q382 -62 384 -40V400Q383 420 370 434Q356 447 336 448H48Q28 447 14 434Q1 420 0 400Z\"/></svg>","fa-heart":"<svg viewBox=\"0 -64 512 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M48 148 228 -21 48 148 228 -21Q240 -32 256 -32Q272 -32 284 -21L464 148Q511 192 512 257V263Q511 317 478 355Q445 394 393 404Q358 409 325 399Q293 389 268 364L256 352L244 364Q219 389 187 399Q154 409 119 404Q67 394 34 355Q1 317 0 263V257Q1 192 48 148Z\"/></svg>","fa-users":"<svg viewBox=\"0 -64 640 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M144 448Q189 447 213 408Q235 368 213 328Q189 289 144 288Q99 289 75 328Q53 368 75 408Q99 447 144 448ZM512 448Q557 447 581 408Q603 368 581 328Q557 289 512 288Q467 289 443 328Q421 368 443 408Q467 447 512 448ZM0 149Q1 195 31 225Q61 255 107 256H149Q173 256 194 246Q192 235 192 224Q194 165 235 128Q235 128 235 128Q235 128 235 128H21Q2 130 0 149ZM405 128Q405 128 405 128Q405 128 405 128Q446 165 448 224Q448 235 446 246Q467 256 491 256H533Q579 255 609 225Q639 195 640 149Q638 130 619 128H405ZM224 224Q224 250 237 272Q250 294 272 307Q295 320 320 320Q345 320 368 307Q390 294 403 272Q416 250 416 224Q416 198 403 176Q390 154 368 141Q345 128 320 128Q295 128 272 141Q250 154 237 176Q224 198 224 224ZM128 -37Q129 19 167 57Q205 95 261 96H379Q435 95 473 57Q511 19 512 -37Q510 -62 485 -64H155Q130 -62 128 -37Z\"/></svg>","fa-bars":"<svg viewBox=\"0 -64 448 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M0 352Q0 366 9 375Q18 384 32 384H416Q430 384 439 375Q448 366 448 352Q448 338 439 329Q430 320 416 320H32Q18 320 9 329Q0 338 0 352ZM0 192Q0 206 9 215Q18 224 32 224H416Q430 224 439 215Q448 206 448 192Q448 178 439 169Q430 160 416 160H32Q18 160 9 169Q0 178 0 192ZM448 32Q448 18 439 9Q430 0 416 0H32Q18 0 9 9Q0 18 0 32Q0 46 9 55Q18 64 32 64H416Q430 64 439 55Q448 46 448 32Z\"/></svg>","fa-arrow-right":"<svg viewBox=\"0 -64 448 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M439 169Q448 179 448 192Q448 205 439 215L279 375Q269 384 256 384Q243 384 233 375Q224 365 224 352Q224 339 233 329L339 224H32Q18 224 9 215Q0 206 0 192Q0 178 9 169Q18 160 32 160H339L233 55Q224 45 224 32Q224 19 233 9Q243 0 256 0Q269 0 279 9L439 169Z\"/></svg>","fa-location-dot":"<svg viewBox=\"0 -64 384 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M216 -51Q243 -18 282 38Q321 93 352 152Q382 211 384 256Q382 338 328 392Q274 446 192 448Q110 446 56 392Q2 338 0 256Q2 211 32 152Q63 93 102 38Q141 -18 168 -51Q178 -63 192 -63Q206 -63 216 -51ZM192 320Q228 319 247 288Q265 256 247 224Q228 193 192 192Q156 193 137 224Q119 256 137 288Q156 319 192 320Z\"/></svg>","fa-spinner":"<svg viewBox=\"0 -64 512 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M304 400Q303 427 280 442Q256 454 232 442Q209 427 208 400Q209 373 232 358Q256 346 280 358Q303 373 304 400ZM304 -16Q303 11 280 26Q256 38 232 26Q209 11 208 -16Q209 -43 232 -58Q256 -70 280 -58Q303 -43 304 -16ZM48 144Q75 145 90 168Q102 192 90 216Q75 239 48 240Q21 239 6 216Q-6 192 6 168Q21 145 48 144ZM512 192Q511 219 488 234Q464 246 440 234Q417 219 416 192Q417 165 440 150Q464 138 488 150Q511 165 512 192ZM143 11Q162 31 155 57Q147 83 121 91Q95 98 75 79Q56 59 63 33Q70 6 97 -1Q123 -8 143 11ZM143 305Q163 325 156 352Q149 379 122 387Q95 393 75 373Q56 353 63 327Q70 301 97 293Q123 286 143 305ZM369 11Q389 -8 415 -1Q442 6 449 33Q456 59 437 79Q417 98 391 91Q365 83 357 57Q350 31 369 11Z\"/></svg>","fa-check":"<svg viewBox=\"0 -64 448 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M439 343Q448 333 448 320Q448 307 439 297L183 41Q173 32 160 32Q147 32 137 41L9 169Q0 179 0 192Q0 205 9 215Q19 224 32 224Q45 224 55 215L160 109L393 343Q403 352 416 352Q429 352 439 343Z\"/></svg>","fa-facebook-f":"<svg viewBox=\"0 -64 320 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M80 149V-64V149V-64H196V149H283L301 247H196V281Q196 319 213 336Q230 353 269 353Q294 353 306 351V440Q294 443 273 446Q252 448 236 448Q78 450 80 289V246H14V149H80Z\"/></svg>","fa-instagram":"<svg viewBox=\"0 -64 448 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M224 307Q175 306 143 273Q110 241 109 192Q110 143 143 111Q175 78 224 77Q273 78 305 111Q338 143 339 192Q338 241 305 273Q273 306 224 307ZM224 117Q192 118 171 139Q150 160 149 192Q150 224 171 245Q192 266 224 267Q256 266 277 245Q298 224 299 192Q298 160 277 139Q256 118 224 117ZM371 312Q368 287 344 285Q319 287 317 312Q317 323 325 331Q332 338 344 338Q355 338 363 331Q370 323 371 312ZM447 284Q447 339 410 378Q371 415 317 415Q297 416 260 416Q224 416 188 416Q151 416 132 415Q78 415 38 378Q1 339 2 285Q0 265 0 228Q0 192 0 156Q0 120 2 100Q1 45 38 6Q77 -31 132 -30Q151 -31 188 -32Q224 -32 260 -32Q297 -31 317 -30Q371 -31 410 6Q447 45 447 100Q448 120 448 156Q448 192 448 228Q448 265 447 285ZM399 60Q386 30 356 17Q336 10 302 9Q268 8 240 8Q231 8 224 8Q217 8 208 8Q180 8 146 9Q113 10 92 17Q62 30 49 60Q42 81 41 114Q40 148 40 176Q40 185 40 192Q40 199 40 208Q40 236 41 270Q42 304 49 324Q62 354 92 367Q113 374 146 375Q180 377 208 376Q217 376 224 376Q231 376 240 376Q268 376 302 375Q336 374 356 367Q386 354 399 324Q406 304 407 270Q409 236 408 208Q408 199 408 192Q408 185 408 176Q409 148 407 114Q406 80 399 60Z\"/></svg>","fa-twitter":"<svg viewBox=\"0 -64 512 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M389 400H460H389H460L306 224L487 -16H345L234 129L107 -16H36L201 172L27 400H172L273 267L389 400ZM364 26H404H364H404L151 360H109L364 26Z\"/></svg>","fa-youtube":"<svg viewBox=\"0 -64 576 576\" aria-hidden=\"true\" focusable=\"false\"><path transform=\"translate(0 448) scale(1 -1)\" d=\"M550 324Q538 361 501 373Q477 378 427 381Q377 383 334 384Q291 384 288 384Q285 384 242 384Q199 383 149 381Q99 378 75 373Q38 361 26 324Q21 301 18 271Q16 240 15 216Q15 193 15 192Q15 190 15 167Q16 143 18 113Q21 82 26 59Q38 22 75 11Q99 6 149 3Q199 1 242 0Q285 0 288 0Q288 0 288 0Q291 0 334 0Q377 1 427 3Q477 6 501 11Q538 22 550 59Q555 82 558 113Q560 143 561 167Q561 190 561 192Q561 193 561 216Q560 240 558 271Q555 301 550 324ZM232 110V273V110V273L375 192L232 110Z\"/></svg>"};
    // Original line family for controls; social brand vectors above are unchanged.
    Object.assign(icons, {"fa-search":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m16 16 4.5 4.5\"/></svg>","fa-magic":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m4 20 13-13 3 3L7 23m6-12 3 3M5 3v4M3 5h4M17 1v4M15 3h4M21 15v4M19 17h4\"/></svg>","fa-compass":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m16 8-2.5 5.5L8 16l2.5-5.5Z\"/></svg>","fa-bookmark":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M6 3h12v18l-6-4-6 4Z\"/></svg>","fa-heart":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M20.8 5.6a5.3 5.3 0 0 0-7.5 0L12 7l-1.3-1.4a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-7.9a5.3 5.3 0 0 0 0-7.5Z\"/></svg>","fa-users":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2\"/></svg>","fa-bars":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 6h16M4 12h16M4 18h16\"/></svg>","fa-arrow-right":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 12h16m-6-6 6 6-6 6\"/></svg>","fa-arrow-left":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M20 12H4m6-6-6 6 6 6\"/></svg>","fa-arrow-up":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 20V4m-6 6 6-6 6 6\"/></svg>","fa-arrow-down":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 4v16m-6-6 6 6 6-6\"/></svg>","fa-chevron-right":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m9 5 7 7-7 7\"/></svg>","fa-chevron-left":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m15 5-7 7 7 7\"/></svg>","fa-chevron-down":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m5 9 7 7 7-7\"/></svg>","fa-chevron-up":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m5 15 7-7 7 7\"/></svg>","fa-location-dot":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"2.5\"/></svg>","fa-check":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m4 12 5 5L20 6\"/></svg>","fa-times":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m6 6 12 12M6 18 18 6\"/></svg>","fa-paper-plane":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m22 2-7 20-4-9-9-4Zm0 0L11 13\"/></svg>","fa-bell":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4\"/></svg>","fa-map":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16\"/></svg>","fa-home":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m3 10 9-7 9 7v11h-6v-7H9v7H3Z\"/></svg>","fa-user":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/></svg>","fa-calendar":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 2v6m10-6v6M3 11h18\"/></svg>","fa-wand-magic-sparkles":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m4 20 13-13 3 3L7 23m6-12 3 3M5 3v4M3 5h4M17 1v4M15 3h4M21 15v4M19 17h4\"/></svg>","fa-xmark":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m6 6 12 12M6 18 18 6\"/></svg>","fa-map-marker-alt":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"2.5\"/></svg>","fa-map-location-dot":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16\"/></svg>","fa-user-friends":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2\"/></svg>","fa-calendar-alt":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 2v6m10-6v6M3 11h18\"/></svg>","fa-house":"<svg class=\"sl-line-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m3 10 9-7 9 7v11h-6v-7H9v7H3Z\"/></svg>"});
    resolvedIcons = icons;
    }
    var nodes = qsa('i[class*="fa-"]', root);
    if (root && root.matches && root.matches('i[class*="fa-"]')) nodes.unshift(root);
    nodes.forEach(function(i){
      if (i.classList.contains('sl-icon-svg')) return;
      var cls = String(i.className || '').split(/\s+/).find(function(c){ return icons[c]; });
      if (!cls) return;
      i.innerHTML = icons[cls];
      i.classList.add('sl-phase8d-icon-fallback', 'sl-icon-svg');
      i.setAttribute('aria-hidden', 'true');
    });
  }
  var actionIconObserver = null;
  function observeActionIcons(){
    patchBrokenIcons();
    if (!window.MutationObserver || actionIconObserver) return;
    actionIconObserver = new MutationObserver(function(records){
      records.forEach(function(record){
        Array.prototype.forEach.call(record.addedNodes, function(node){
          if (node.nodeType === 1 && !node.closest('.sl-icon-svg')) patchBrokenIcons(node);
        });
      });
    });
    actionIconObserver.observe(document.documentElement, {childList:true, subtree:true});
  }
  window.addEventListener('pagehide', function(){
    if (actionIconObserver) actionIconObserver.disconnect();
    actionIconObserver = null;
  });
  window.addEventListener('pageshow', observeActionIcons);
  // Phase 8D: guarantee the first-visit onboarding overlay can NEVER permanently
  // trap the page. Root cause of the 8C "non-functional after a few seconds" report:
  // #sl-ob-overlay (js/sl-onboarding.js) renders full-screen at z-index 100000 with
  // pointer-events:auto ~4s after load, and with missing FontAwesome icons the dismiss
  // controls were not recognizable. We add resilient dismiss paths without removing
  // the onboarding feature itself.
  function dismissOnboarding(reason){
    try {
      var o = document.getElementById('sl-ob-overlay');
      if (!o) return false;
      try { localStorage.setItem('sl_onboarded', 'dismissed'); } catch(_){}
      o.style.transition = 'opacity .25s ease';
      o.style.opacity = '0';
      o.style.pointerEvents = 'none';
      setTimeout(function(){ try { o.parentNode && o.parentNode.removeChild(o); } catch(_){} }, 300);
      return true;
    } catch(_) { return false; }
  }
  function guardOnboarding(){
    // 1) Escape key always closes it.
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && document.getElementById('sl-ob-overlay')) dismissOnboarding('esc');
    }, true);
    // 2) Click on the dim backdrop (the overlay element itself, not its inner card) closes it.
    document.addEventListener('click', function(e){
      var o = document.getElementById('sl-ob-overlay');
      if (o && e.target === o) dismissOnboarding('backdrop');
    }, true);
    // 3) Ensure ANY skip/close/lets-go control inside it actually dismisses, even if
    //    the original handler failed to bind (icons missing made them invisible).
    document.addEventListener('click', function(e){
      var o = document.getElementById('sl-ob-overlay');
      if (!o) return;
      var btn = e.target && e.target.closest && e.target.closest('#slObSkip,#slObSkipNotif,[data-ob-close],.sl-ob-close,[aria-label="Close"],button');
      if (btn && o.contains(btn) && /skip|close|let.?s go|done|got it|×|✕|x/i.test((btn.textContent||'') + (btn.getAttribute('aria-label')||''))) {
        // give the native handler a beat; if overlay still present, force-dismiss.
        setTimeout(function(){ if (document.getElementById('sl-ob-overlay')) dismissOnboarding('btn-fallback'); }, 350);
      }
    }, true);
    // 4) Backstop: the onboarding overlay (#sl-ob-overlay) is full-screen z-100000.
    //    To honor "interactive within ~2s" and "no full-page overlay may block nav
    //    after initial load", we make the BACKDROP non-blocking as soon as it mounts
    //    while keeping its inner card fully interactive. The modal still shows and its
    //    Skip / Let's go buttons still work, but the dimmed area never traps the page.
    var armed = false;
    function neutralizeBackdrop(){
      var o = document.getElementById('sl-ob-overlay');
      if (!o) return;
      // Backdrop click-through; inner card keeps its own pointer events.
      o.style.pointerEvents = 'none';
      var card = o.querySelector(':scope > *');
      if (card) {
        card.style.pointerEvents = 'auto';
        // ensure focusable controls inside the card remain clickable
        Array.prototype.forEach.call(card.querySelectorAll('button,a,input,select,textarea'), function(el){ el.style.pointerEvents = 'auto'; });
      }
      armed = true;
    }
    // Watch for the overlay mounting (it appears ~4s after load via setTimeout in onboarding).
    try {
      var mo = new MutationObserver(function(){
        if (document.getElementById('sl-ob-overlay')) { neutralizeBackdrop(); }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      // Stop observing after 20s to avoid lingering work.
      setTimeout(function(){ try { mo.disconnect(); } catch(_){} }, 20000);
    } catch(_){}
    // Hard fallback timers in case MutationObserver misses it.
    setTimeout(neutralizeBackdrop, 4500);
    setTimeout(neutralizeBackdrop, 7000);
  }
  function boot(){ observeActionIcons(); bindConcierge(); bindMobileNav(); guardOnboarding(); setTimeout(releaseStrandedLoaders, 5500); setTimeout(patchBrokenIcons, 1200); setTimeout(patchBrokenIcons, 5000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
