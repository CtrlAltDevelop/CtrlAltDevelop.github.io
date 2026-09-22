/* ─────────────────────────────────────────────────────────────────────────────
   live-meta.js — GitHub is the source of truth for the open-source section.

   The rule this implements: every public repository that is neither a fork nor
   archived counts towards the repository tally, and every one of those that has
   a published release gets a card. Publish a release and the package appears
   here; archive a repository and its card goes away. Nothing to edit twice.

   The cards already in index.html are the baseline: they are what Google indexes
   and what a visitor without JavaScript reads, and they cover the packages that
   exist today. This file reconciles that baseline with GitHub — filling in live
   versions, descriptions and topics, adding cards for repositories released
   since, and dropping cards whose repository no longer qualifies.

   Request budget matters, because unauthenticated GitHub allows 60 calls an hour
   per address. So: one call lists the account, and only repositories that do not
   already have a card are asked whether they have a release. That index is kept
   in localStorage for a day. Version numbers for the packages that do have cards
   come from pub.dev and PyPI instead, which are not rate-limited, and are
   fetched lazily as each card scrolls into view.

   Every step is additive and every failure is silent: rate-limited, offline or
   blocked, the page keeps exactly what the HTML already said.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var PKG_CACHE = 'pkg-meta-v2';          // sessionStorage: registry lookups
  var PKG_TTL = 6 * 60 * 60 * 1000;

  var GH_CACHE = 'gh-index-v1';           // localStorage: the account index
  var GH_TTL = 24 * 60 * 60 * 1000;

  var MAX_TOPICS = 7;                     // the tag row is one or two lines by design

  /* ---------- registries ---------- */

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

  /* ---------- caches ---------- */

  function readCache(store, key, ttl) {
    try {
      var raw = window[store].getItem(key);
      if (!raw) return null;
      var box = JSON.parse(raw);
      return (Date.now() - box.at < ttl) ? box.data : null;
    } catch (e) { return null; }
  }

  function writeCache(store, key, data) {
    try {
      window[store].setItem(key, JSON.stringify({ at: Date.now(), data: data }));
    } catch (e) { /* private mode, quota, blocked storage — the page works without it */ }
  }

  var pkgCache = readCache('sessionStorage', PKG_CACHE, PKG_TTL) || {};

  /* ---------- topic naming ---------- */

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

  // GitHub hands topics back alphabetically, which buries the interesting ones:
  // ohlcv_chart would show "charts, dart, finance" and drop "trading" and
  // "technical-indicators" at the cut. So the platform leads, as the eye expects
  // on a package card, and the rest follow most-specific first.
  var TOPIC_LEAD = ['flutter', 'dart', 'python', 'django'];

  function topicLabel(slug) {
    if (TOPIC_NAMES[slug]) return TOPIC_NAMES[slug];
    return slug.split('-').map(function (word) {
      return TOPIC_NAMES[word] || word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  function rankTopics(topics) {
    var lead = [], rest = [];
    topics.forEach(function (t) {
      (TOPIC_LEAD.indexOf(t) > -1 ? lead : rest).push(t);
    });
    lead.sort(function (a, b) { return TOPIC_LEAD.indexOf(a) - TOPIC_LEAD.indexOf(b); });
    rest.sort(function (a, b) { return b.length - a.length; });
    return lead.concat(rest);
  }

  /* ---------- painting ---------- */

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    try {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return String(iso).slice(0, 10); }
  }

  // A pill-shaped placeholder that shimmers while a lookup is in flight. It
  // carries no text, so a screen reader is not told about a pending fetch.
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

  function paintVersion(card, version, published) {
    if (!version) return;

    var top = card.querySelector('.pkg__top');
    if (!top) return;

    var badge = top.querySelector('.pkg__ver');
    if (!badge) {
      badge = document.createElement('span');
      top.appendChild(badge);
    }
    badge.className = 'pkg__ver';
    badge.removeAttribute('aria-hidden');

    var when = published && formatDate(published);
    badge.textContent = String(version).charAt(0) === 'v' ? version : 'v' + version;
    badge.title = when ? 'Latest release, published ' + when : 'Latest release';
    if (when) {
      var sub = document.createElement('i');
      sub.textContent = when;
      badge.appendChild(sub);
    }
    card.classList.add('pkg--live');
  }

  function paintDesc(card, text) {
    var desc = card.querySelector('.pkg__desc');
    if (desc && text && text.length > 20) desc.textContent = text;
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

  /* ---------- registry lookup (cards that carry a registry link) ---------- */

  function lookup(card, reg, name) {
    var key = reg + ':' + name;
    var hit = pkgCache[key];

    if (hit) {
      paintDesc(card, hit.desc);
      paintVersion(card, hit.version, hit.published);
      return;
    }

    skeleton(card);

    fetch(REGISTRIES[reg].url(name), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (j) {
        var meta = REGISTRIES[reg].read(j);
        if (!meta.version) return;
        pkgCache[key] = meta;
        writeCache('sessionStorage', PKG_CACHE, pkgCache);
        paintDesc(card, meta.desc);
        paintVersion(card, meta.version, meta.published);
      })
      .catch(function () {
        clearSkeleton(card);      // offline, rate-limited, renamed — keep what is there
      });
  }

  function registryOf(card) {
    var links = card.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      for (var reg in REGISTRIES) {
        var hit = REGISTRIES[reg].match.exec(links[i].getAttribute('href'));
        if (hit) return { reg: reg, name: hit[1] };
      }
    }
    return null;
  }

  function repoOf(card) {
    var links = card.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var hit = /github\.com\/([^\/]+)\/([^\/?#]+)/i.exec(links[i].getAttribute('href'));
      if (hit) return { owner: hit[1], name: hit[2] };
    }
    return null;
  }

  var observer = null;

  function watch(card) {
    var id = registryOf(card);
    if (!id) return;
    if (observer) observer.observe(card);
    else lookup(card, id.reg, id.name);
  }

  /* ---------- cards built from a discovered repository ---------- */

  function link(href, text, quiet) {
    var a = document.createElement('a');
    a.className = 'pkg__link' + (quiet ? ' pkg__link--quiet' : '');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    return a;
  }

  function buildCard(repo, owner, onPubDev) {
    var card = document.createElement('article');
    card.className = 'pkg pkg--mini reveal in';

    var top = document.createElement('div');
    top.className = 'pkg__top';
    var name = document.createElement('h4');
    name.className = 'pkg__name';
    name.textContent = repo.name;
    top.appendChild(name);
    card.appendChild(top);

    var desc = document.createElement('p');
    desc.className = 'pkg__desc';
    desc.textContent = repo.description || '';
    card.appendChild(desc);

    var tags = document.createElement('ul');
    tags.className = 'tags';
    card.appendChild(tags);

    var links = document.createElement('div');
    links.className = 'pkg__links';
    if (onPubDev) links.appendChild(link('https://pub.dev/packages/' + repo.name, 'pub.dev'));
    links.appendChild(link('https://github.com/' + owner + '/' + repo.name, 'GitHub', !!onPubDev));
    card.appendChild(links);

    paintTopics(card, repo.topics);
    paintVersion(card, repo.version, repo.published);
    return card;
  }

  // Discovered packages have no editorial home among the curated groups, so they
  // arrive under a heading of their own, which only exists if something is in it.
  function discoveryGroup() {
    var existing = document.querySelector('.pkgs--discovered');
    if (existing) return existing;

    var grids = document.querySelectorAll('.pkgs--mini');
    var anchor = grids[grids.length - 1];
    if (!anchor || !anchor.parentNode) return null;

    var heading = document.createElement('h3');
    heading.className = 'pkg-group reveal in';
    heading.textContent = 'Recently released';

    var grid = document.createElement('div');
    grid.className = 'pkgs pkgs--mini pkgs--discovered';

    anchor.parentNode.insertBefore(heading, anchor.nextSibling);
    anchor.parentNode.insertBefore(grid, heading.nextSibling);
    return grid;
  }

  /* ---------- the GitHub index ---------- */

  function ghJson(url) {
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) {
        if (r.status === 404) return null;                  // no release: a normal answer
        return r.ok ? r.json() : Promise.reject(r.status);
      });
  }

  function loadIndex(owner, known) {
    var cached = readCache('localStorage', GH_CACHE, GH_TTL);
    if (cached && cached.owner === owner) return Promise.resolve(cached);

    return ghJson('https://api.github.com/users/' + owner + '/repos?per_page=100')
      .then(function (list) {
        if (!Array.isArray(list)) return Promise.reject('shape');

        var repos = list.map(function (repo) {
          return {
            name: repo.name,
            description: repo.description || '',
            topics: repo.topics || [],
            fork: !!repo.fork,
            archived: !!repo.archived
          };
        });

        // Only repositories without a card need to be asked about releases. The
        // ones that have a card are released by definition and read their version
        // from pub.dev or PyPI, which costs nothing against the GitHub limit.
        var unknown = repos.filter(function (repo) {
          return !repo.fork && !repo.archived && !known[repo.name.toLowerCase()];
        });

        return Promise.all(unknown.map(function (repo) {
          return ghJson('https://api.github.com/repos/' + owner + '/' + repo.name + '/releases/latest')
            .then(function (rel) {
              if (!rel || !rel.tag_name) return null;
              repo.version = rel.tag_name;
              repo.published = rel.published_at;
              return repo;
            })
            .catch(function () { return null; });
        })).then(function (released) {
          var index = {
            owner: owner,
            repos: repos,
            released: released.filter(Boolean)
          };
          writeCache('localStorage', GH_CACHE, index);
          return index;
        });
      });
  }

  /* ---------- wiring ---------- */

  var cards = [].slice.call(document.querySelectorAll('.pkg'));
  if (!cards.length || !window.fetch) return;

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        var id = registryOf(entry.target);
        if (id) lookup(entry.target, id.reg, id.name);
      });
    }, { rootMargin: '200px 0px' });
  }

  function setCount(cell, value) {
    if (!cell) return;
    cell.dataset.to = value;                                  // picked up by the count-up
    var shown = cell.textContent.trim();
    if (shown && shown !== '0') cell.textContent = value;     // already counted up
  }

  // The package tallies are counted from the cards on the page, so they cannot
  // drift from what is shown — including cards added or removed below.
  function tally() {
    var counts = { pub: 0, pypi: 0 };
    [].slice.call(document.querySelectorAll('.pkg')).forEach(function (card) {
      var id = registryOf(card);
      if (id) counts[id.reg]++;
    });

    var total = counts.pub + counts.pypi;
    if (!total) return;

    var facts = document.querySelectorAll('.pkg-facts .count');
    var values = [total, counts.pub, counts.pypi];
    for (var i = 0; i < values.length && i < facts.length; i++) {
      setCount(facts[i], values[i]);
    }
  }

  cards.forEach(watch);
  tally();

  var seed = repoOf(cards[0]);
  if (!seed) return;

  var known = {};
  cards.forEach(function (card) {
    var repo = repoOf(card);
    if (repo) known[repo.name.toLowerCase()] = card;
  });

  loadIndex(seed.owner, known)
    .then(function (index) {
      index.repos.forEach(function (repo) {
        var key = repo.name.toLowerCase();
        var card = known[key];
        if (!card) return;

        // A card whose repository has since been archived, or turned into a fork,
        // no longer belongs on a page about maintained work.
        if (repo.fork || repo.archived) {
          if (card.parentNode) card.parentNode.removeChild(card);
          delete known[key];
          return;
        }

        paintTopics(card, repo.topics);
      });

      // Repositories that are neither forks nor archived, whatever else they are.
      var repoCount = index.repos.filter(function (repo) {
        return !repo.fork && !repo.archived;
      }).length;
      if (repoCount) setCount(document.querySelector('.pkg-facts [data-live="repos"]'), repoCount);

      var fresh = index.released.filter(function (repo) {
        return !known[repo.name.toLowerCase()];
      });

      if (!fresh.length) { tally(); return; }

      // Each discovered repository is offered to pub.dev as well, so a Dart
      // package links to both places and anything else just links to GitHub.
      return Promise.all(fresh.map(function (repo) {
        return fetch('https://pub.dev/api/packages/' + repo.name)
          .then(function (r) { return r.ok; })
          .catch(function () { return false; });
      })).then(function (onPubDev) {
        var grid = discoveryGroup();
        if (!grid) return;

        fresh.forEach(function (repo, i) {
          var card = buildCard(repo, index.owner, onPubDev[i]);
          grid.appendChild(card);
          known[repo.name.toLowerCase()] = card;
        });

        tally();
      });
    })
    .catch(function () { /* rate-limited or offline — the page keeps what it has */ });
})();
