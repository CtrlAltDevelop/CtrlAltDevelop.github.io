/* ===========================================================
   UI behaviour: nav, scroll spy, reveal-on-scroll, role rotator.
   =========================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- footer year ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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
