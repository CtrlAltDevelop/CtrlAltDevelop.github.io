/* ===========================================================
   UI behaviour: nav, scroll spy, reveal-on-scroll, role rotator.
   =========================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- footer year ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- preloader ----------
     Fake-progresses to 90% while assets stream, then completes on load.
     A hard 4s cap guarantees the page is never held hostage by a CDN. */
  (function () {
    var loader = document.getElementById('loader');
    var fill = document.getElementById('loader-fill');
    var pct = document.getElementById('loader-pct');
    if (!loader) return;

    var value = 0, done = false;

    function set(v) {
      value = Math.max(value, Math.min(100, v));
      fill.style.width = value + '%';
      pct.textContent = Math.round(value);
    }

    function finish() {
      if (done) return;
      done = true;
      set(100);
      setTimeout(function () {
        loader.classList.add('is-done');
        document.body.classList.add('is-ready');
      }, 260);
    }

    if (reduced) { finish(); return; }

    var creep = setInterval(function () {
      set(value + (90 - value) * 0.12 + 1);
      if (value >= 89) clearInterval(creep);
    }, 90);

    window.addEventListener('load', function () { clearInterval(creep); finish(); });
    setTimeout(function () { clearInterval(creep); finish(); }, 4000);
  })();

  /* ---------- scroll progress ---------- */
  var progressFill = document.getElementById('scroll-fill');

  function updateProgress() {
    if (!progressFill) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? (window.scrollY / max) * 100 : 0;
    progressFill.style.width = p.toFixed(2) + '%';
  }

  /* ---------- sticky nav + mobile menu ---------- */
  var nav = document.getElementById('nav');
  var links = document.getElementById('nav-links');
  var toggle = document.getElementById('nav-toggle');

  function closeMenu() {
    links.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function () {
    var open = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  links.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  /* ---------- scroll spy ---------- */
  var navAnchors = Array.prototype.slice.call(
    links.querySelectorAll('a[href^="#"]:not(.btn)')
  );
  var sections = navAnchors
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  var ticking = false;

  function onScroll() {
    nav.classList.toggle('is-stuck', window.scrollY > 24);
    updateProgress();

    // the section whose top has most recently passed the reading line
    var line = window.scrollY + window.innerHeight * 0.34;
    var current = null;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= line) current = sections[i];
    }
    // pin the last entry once we're at the bottom of the page
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 4) {
      current = sections[sections.length - 1];
    }

    navAnchors.forEach(function (a) {
      a.classList.toggle(
        'is-active',
        !!current && a.getAttribute('href') === '#' + current.id
      );
    });

    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- reveal on scroll ---------- */
  var revealables = document.querySelectorAll('.reveal');

  if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: .08 });

    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------- count-up numbers ---------- */
  (function () {
    var counters = document.querySelectorAll('.count');
    if (!counters.length) return;

    if (reduced || !('IntersectionObserver' in window)) {
      counters.forEach(function (el) { el.textContent = el.dataset.to; });
      return;
    }

    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        seen.unobserve(entry.target);

        var el = entry.target;
        var target = parseFloat(el.dataset.to) || 0;
        var dur = 1100;
        var t0 = performance.now();

        (function tick(now) {
          var p = Math.min(1, (now - t0) / dur);
          var e = 1 - Math.pow(1 - p, 3);          // ease-out cubic
          el.textContent = Math.round(target * e);
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: .4 });

    counters.forEach(function (el) { seen.observe(el); });
  })();

  /* ---------- pointer-tracked card tilt ----------
     Skipped on touch and coarse pointers, where there is no hover to
     track and the transform would just fight the scroll. */
  (function () {
    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    var cards = document.querySelectorAll('.card, .ap, .panel');
    var MAX = 5;   // degrees

    cards.forEach(function (card) {
      var glare = document.createElement('span');
      glare.className = 'tilt__glare';
      card.appendChild(glare);
      card.classList.add('tilt');

      var frame = 0;

      card.addEventListener('pointermove', function (e) {
        if (frame) return;
        frame = requestAnimationFrame(function () {
          frame = 0;
          var r = card.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width;
          var py = (e.clientY - r.top) / r.height;
          card.style.transform =
            'perspective(900px) rotateX(' + ((.5 - py) * MAX).toFixed(2) + 'deg) ' +
            'rotateY(' + ((px - .5) * MAX).toFixed(2) + 'deg) translateY(-3px)';
          glare.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
          glare.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
        });
      }, { passive: true });

      card.addEventListener('pointerleave', function () {
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        card.style.transform = '';
      });
    });
  })();

  /* ---------- magnetic buttons ---------- */
  (function () {
    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    document.querySelectorAll('.btn').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.transform = 'translate(' + (dx * 7).toFixed(1) + 'px,' +
                              (dy * 7 - 2).toFixed(1) + 'px)';
      }, { passive: true });

      btn.addEventListener('pointerleave', function () { btn.style.transform = ''; });
    });
  })();

  /* ---------- role rotator ---------- */
  var rotator = document.getElementById('rotator');
  var ROLES = [
    'Senior Mobile & Backend Developer',
    'Flutter & Dart Specialist',
    'Python & .NET Backend Engineer',
    'Clean Architecture Practitioner'
  ];

  if (rotator && !reduced) {
    var idx = 0, chars = ROLES[0].length, dir = -1;

    (function tick() {
      var word = ROLES[idx];
      chars += dir;

      if (chars < 0) {                      // finished deleting
        dir = 1; chars = 0;
        idx = (idx + 1) % ROLES.length;
        word = ROLES[idx];
      } else if (chars > word.length) {     // finished typing
        dir = -1; chars = word.length;
        rotator.textContent = word;
        setTimeout(tick, 2100);
        return;
      }

      rotator.textContent = word.slice(0, chars);
      setTimeout(tick, dir > 0 ? 52 : 26);
    })();
  }
})();
