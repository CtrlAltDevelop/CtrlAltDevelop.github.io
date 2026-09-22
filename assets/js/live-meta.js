/* ─────────────────────────────────────────────────────────────────────────────
   live-meta.js — keeps the open-source section honest.

   Every package card already links to its registry, so the package name is read
   straight off that link: no extra markup to keep in sync. On first scroll into
   view the card asks pub.dev or PyPI for the current release and swaps in the
   live version, publish date and one-line description — the same description
   that ships in pubspec.yaml / the PyPI summary, so editing it at the source
   updates this page on the next visit.

   The GitHub side is one request for the whole account, not one per card, so
   the repository topics become the tag row and cost a single call.

   Everything here is additive. The hand-written copy in the HTML is what a
   visitor sees with no JavaScript, an offline cache or a registry outage; a
   failed lookup simply leaves that copy in place.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CACHE_KEY = 'pkg-meta-v2';
  var CACHE_TTL = 6 * 60 * 60 * 1000;          // 6h — a release is not urgent news

  var REGISTRIES = {
    pub: {
      match: /pub\.dev\/packages\/([a-z0-9_]+)/i,
      url: function (n) { return 'https://pub.dev/api/packages/' + n; },
      read: function (j) {
        return {
          version: j && j.latest && j.latest.version,
          published: j && j.latest && j.latest.published,
          desc: j && j.latest && j.latest.pubspec && j.latest.pubspec.description
        };
      }
    },
    pypi: {
      match: /pypi\.org\/project\/([a-z0-9._-]+)/i,
      url: function (n) { return 'https://pypi.org/pypi/' + n + '/json'; },
      read: function (j) {
        var v = j && j.info && j.info.version;
        var files = (v && j.releases && j.releases[v]) || [];
        return {
          version: v,
          published: files.length ? files[0].upload_time_iso_8601 : null,
          desc: j && j.info && j.info.summary
        };
      }
    }
  };

  /* ---------- session cache ---------- */

  function cacheRead() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return {};
      var box = JSON.parse(raw);
      return (Date.now() - box.at < CACHE_TTL) ? box.data : {};
    } catch (e) { return {}; }
  }

  function cacheWrite(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data }));
    } catch (e) { /* private mode, quota, blocked storage — the page works without it */ }
  }

  var cache = cacheRead();

  /* ---------- rendering ---------- */

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    try {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return String(iso).slice(0, 10); }
  }

  // A pill-shaped placeholder that shimmers while the registry is being asked.
  // It carries no text, so a screen reader is not told about a pending fetch.
  function skeleton(card) {
    var top = card.querySelector('.pkg__top');
    if (!top || top.querySelector('.pkg__ver')) return;

    var badge = document.createElement('span');
    badge.className = 'pkg__ver pkg__ver--loading';
    badge.setAttribute('aria-hidden', 'true');
    top.appendChild(badge);
  }

  function clearSkeleton(card) {
    var badge = card.querySelector('.pkg__ver--loading');
    if (badge) badge.parentNode.removeChild(badge);
  }

  function paint(card, meta) {
    if (!meta || !meta.version) return;

    // Live one-liner from the package itself, when the registry has one.
    var desc = card.querySelector('.pkg__desc');
    if (desc && meta.desc && meta.desc.length > 20) {
      desc.textContent = meta.desc;
    }

    var top = card.querySelector('.pkg__top');
    if (!top) return;

    var badge = top.querySelector('.pkg__ver');
    if (!badge) {
      badge = document.createElement('span');
      top.appendChild(badge);
    }
    badge.className = 'pkg__ver';
    badge.removeAttribute('aria-hidden');

    var when = meta.published && formatDate(meta.published);
    badge.textContent = 'v' + meta.version;
    badge.title = when ? 'Latest release, published ' + when : 'Latest release';
    if (when) {
      var sub = document.createElement('i');
      sub.textContent = when;
      badge.appendChild(sub);
    }
    card.classList.add('pkg--live');
  }

  /* ---------- github topics ---------- */

  // GitHub topics are lowercase slugs. Title-casing alone would print
  // "Custompainter" and "Github Actions", so the names that have a real spelling
  // are listed; everything else is de-hyphenated and capitalised.
  var TOPIC_NAMES = {
    'custompainter': 'CustomPainter', 'github-actions': 'GitHub Actions',
    'ohlcv': 'OHLCV', 'api': 'API', 'apis': 'APIs', 'cli': 'CLI', 'ci': 'CI',
    'ui': 'UI', 'ux': 'UX', 'rtl': 'RTL', 'a11y': 'a11y', 'json': 'JSON',
    'jwt': 'JWT', 'oauth2': 'OAuth 2.0', 'oauth': 'OAuth', 'dpop': 'DPoP',
    'rfc9449': 'RFC 9449', 'totp': 'TOTP', 'sms': 'SMS', 'http': 'HTTP',
    'websocket': 'WebSocket', 'websockets': 'WebSockets', 'sdk': 'SDK',
    'openapi': 'OpenAPI', 'swagger': 'Swagger', 'bloc': 'BLoC',
    'ios': 'iOS', 'macos': 'macOS', 'devops': 'DevOps', 'mvvm': 'MVVM',
    'django': 'Django', 'django-ninja': 'Django Ninja', 'pypi': 'PyPI',
    '2fa': '2FA', 'mfa': 'MFA', 'sso': 'SSO', 'crud': 'CRUD', 'dtcg': 'DTCG',
    'rest': 'REST', 'rest-api': 'REST API', 'pubsub': 'Pub/Sub',
    'tabbar': 'Tab Bar', 'tabs': 'Tabs', 'graphql': 'GraphQL', 'grpc': 'gRPC'
  };

  var MAX_TOPICS = 7;      // the tag row is one or two lines by design

  // GitHub hands topics back alphabetically, which buries the interesting ones:
  // ohlcv_chart would show "charts, dart, finance" and drop "trading" and
  // "technical-indicators" at the cut. So the platform leads, as the eye expects
  // on a package card, and the rest follow most-specific first.
  var TOPIC_LEAD = ['flutter', 'dart', 'python', 'django'];

  function rankTopics(topics) {
    var lead = [], rest = [];
    topics.forEach(function (t) {
      (TOPIC_LEAD.indexOf(t) > -1 ? lead : rest).push(t);
    });

    lead.sort(function (a, b) { return TOPIC_LEAD.indexOf(a) - TOPIC_LEAD.indexOf(b); });
    rest.sort(function (a, b) { return b.length - a.length; });

    return lead.concat(rest);
  }

  function topicLabel(slug) {
    if (TOPIC_NAMES[slug]) return TOPIC_NAMES[slug];
    return slug.split('-').map(function (word) {
      return TOPIC_NAMES[word] || word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  function paintTopics(card, topics) {
    if (!topics || !topics.length) return;

    var list = card.querySelector('.tags');
    if (!list) return;

    var frag = document.createDocumentFragment();
    rankTopics(topics).slice(0, MAX_TOPICS).forEach(function (slug) {
      var li = document.createElement('li');
      li.textContent = topicLabel(slug);
      frag.appendChild(li);
    });

    list.textContent = '';
    list.appendChild(frag);
    card.classList.add('pkg--topics');
  }

  // One call covers every card: the account's repositories carry their own
  // description and topics, so nothing here scales with the number of packages.
  function loadTopics(cards) {
    var owner = null;
    var byRepo = {};

    cards.forEach(function (card) {
      var links = card.querySelectorAll('a[href]');
      for (var i = 0; i < links.length; i++) {
        var hit = /github\.com\/([^\/]+)\/([^\/?#]+)/i.exec(links[i].getAttribute('href'));
        if (!hit) continue;
        owner = owner || hit[1];
        byRepo[hit[2].toLowerCase()] = card;
        break;
      }
    });

    if (!owner) return;

    // Forks and archived repositories are somebody else's work or finished work,
    // so the headline figure counts neither.
    function countRepos(repos) {
      var live = repos.filter(function (repo) { return !repo.fork && !repo.archived; });
      var cell = document.querySelector('.pkg-facts [data-live="repos"]');
      if (!cell || !live.length) return;

      cell.dataset.to = live.length;
      var shown = cell.textContent.trim();
      if (shown && shown !== '0') cell.textContent = live.length;   // already counted up
    }

    function apply(repos) {
      repos.forEach(function (repo) {
        var card = byRepo[String(repo.name).toLowerCase()];
        if (card) paintTopics(card, repo.topics);
      });
      countRepos(repos);
    }

    if (cache.__repos) { apply(cache.__repos); return; }

    // Unauthenticated GitHub allows 60 calls an hour per address; this is one of
    // them per session, and a refusal just leaves the hand-written tags alone.
    fetch('https://api.github.com/users/' + owner + '/repos?per_page=100', {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (list) {
        if (!Array.isArray(list)) return;
        var slim = list.map(function (repo) {
          return {
            name: repo.name,
            topics: repo.topics || [],
            fork: !!repo.fork,
            archived: !!repo.archived
          };
        });
        cache.__repos = slim;
        cacheWrite(cache);
        apply(slim);
      })
      .catch(function () { /* rate-limited or offline — the curated tags stand */ });
  }

  /* ---------- lookup ---------- */

  function lookup(card, reg, name) {
    var key = reg + ':' + name;

    skeleton(card);

    fetch(REGISTRIES[reg].url(name), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (j) {
        var meta = REGISTRIES[reg].read(j);
        if (!meta.version) return;
        cache[key] = meta;
        cacheWrite(cache);
        paint(card, meta);
      })
      .catch(function () {
        clearSkeleton(card);      // offline, rate-limited, renamed — keep the static copy
      });
  }

  function identify(card) {
    var links = card.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      for (var reg in REGISTRIES) {
        var hit = REGISTRIES[reg].match.exec(links[i].getAttribute('href'));
        if (hit) return { reg: reg, name: hit[1] };
      }
    }
    return null;
  }

  function start(card) {
    var id = identify(card);
    if (id) lookup(card, id.reg, id.name);
  }

  /* ---------- wiring ---------- */

  var cards = [].slice.call(document.querySelectorAll('.pkg'));
  if (!cards.length || !window.fetch) return;

  // Package counts come from the cards themselves, so adding a card to the HTML
  // is enough — the tallies above the list cannot drift out of step with it.
  (function tally() {
    var counts = { pub: 0, pypi: 0 };
    cards.forEach(function (card) {
      var id = identify(card);
      if (id) counts[id.reg]++;
    });

    var total = counts.pub + counts.pypi;
    if (!total) return;

    var facts = document.querySelectorAll('.pkg-facts .count');
    var values = [total, counts.pub, counts.pypi];
    for (var i = 0; i < values.length && i < facts.length; i++) {
      facts[i].dataset.to = values[i];               // picked up by the count-up
      var shown = facts[i].textContent.trim();
      if (shown && shown !== '0') facts[i].textContent = values[i];   // already counted up
    }
  })();

  loadTopics(cards);

  // Anything already in this session's cache costs nothing to show, so paint it
  // up front instead of making it wait for the card to scroll into view again.
  var pending = cards.filter(function (card) {
    var id = identify(card);
    if (!id) return false;
    var hit = cache[id.reg + ':' + id.name];
    if (!hit) return true;
    paint(card, hit);
    return false;
  });

  if (!pending.length) return;

  if (!('IntersectionObserver' in window)) {
    pending.forEach(start);
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      start(entry.target);
    });
  }, { rootMargin: '200px 0px' });

  pending.forEach(function (card) { io.observe(card); });
})();
