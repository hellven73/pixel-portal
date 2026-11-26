(() => {
  const key = 'px-recent-games-v1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const el = (tag, label, className) => {
    const node = document.createElement(tag);
    if (label) node.textContent = label;
    if (className) node.className = className;
    return node;
  };
  const button = (label, action, className) => {
    const node = el('button', label, className);
    node.type = 'button';
    node.onclick = action;
    return node;
  };
  const read = (name, fallback) => {
    try { return JSON.parse(localStorage.getItem(name)) ?? fallback; } catch { return fallback; }
  };
  const write = (name, value) => {
    try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* Keep the in-memory session usable. */ }
  };
  const allowed = game => game && game.kind !== 'media' && window.pixelGameAllowed(game);

  function init() {
    const home = document.querySelector('#home-page');
    if (!home || document.body.classList.contains('game-tab')) return;
    const gamePlayer = document.querySelector('#player');
    const gameStage = document.querySelector('#stage');
    const releases = new Map();
    const library = () => {
      const entries = new Map([...releases, ...window.gameCatalog.filter(allowed).map(game => [game.id, game])]);
      return [...entries.values()];
    };
    const findGame = id => window.gameCatalog.find(game => game.id === id && allowed(game)) ?? releases.get(id);

    function readHistory(fallback = []) {
      const saved = read(key, fallback);
      return Array.isArray(saved) ? saved.filter(row => row && typeof row.id === 'string' &&
        Number.isFinite(row.at) && Number.isFinite(row.seconds) && row.seconds >= 0).slice(0, 20) : [];
    }
    let history = readHistory();
    let active;
    let lastFrame;

    function checkpoint(stop = false) {
      if (!active) return;
      if (active.visibleSince !== null) active.elapsed += performance.now() - active.visibleSince;
      active.visibleSince = document.hidden || stop ? null : performance.now();
      const latest = readHistory(history);
      if (latest.find(row => row.id === active.id && row.at > active.at)) return;
      const entry = { id: active.id, at: active.at, seconds: Math.floor(active.elapsed / 1000) };
      document.dispatchEvent(new CustomEvent('pixel-session-checkpoint', {
        detail: { ...entry, name: active.name, genre: active.genre }
      }));
      history = [entry, ...latest.filter(row => row.id !== active.id)]
        .sort((a, b) => b.at - a.at).slice(0, 20);
      write(key, history);
    }

    function refreshSession() {
      const frame = gamePlayer.open ? gameStage.querySelector('iframe') : null;
      if (lastFrame === frame) return;
      lastFrame = frame;
      checkpoint(true);
      active = undefined;
      // The existing launcher sets current only after the normal launch checks.
      const game = typeof current === 'undefined' ? null : current;
      if (frame && allowed(game)) {
        if (!findGame(game.id)) releases.set(game.id, game);
        active = { id: game.id, name: game.name, genre: game.cat, at: Date.now(), elapsed: 0, visibleSince: document.hidden ? null : performance.now() };
        checkpoint();
      }
      renderRecent();
    }

    new MutationObserver(refreshSession).observe(gameStage, { childList: true });
    new MutationObserver(refreshSession).observe(gamePlayer, { attributes: true, attributeFilter: ['open'] });
    document.addEventListener('visibilitychange', () => checkpoint());
    window.addEventListener('pagehide', () => checkpoint(true));
    window.addEventListener('pageshow', () => {
      if (active && !document.hidden) active.visibleSince = performance.now();
    });
    setInterval(() => checkpoint(), 15000);
    window.addEventListener('storage', event => {
      if (event.key === key || event.key === null) {
        history = readHistory();
        renderRecent();
      }
    });

    const launch = game => openGame(game, true);
    const recent = home.querySelector('.px-progress .px-resume');
    const recentObserver = new MutationObserver(() => renderRecent());
    const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    function duration(seconds) {
      return seconds < 60 ? seconds + ' sec' : Math.floor(seconds / 60) + ' min ' + seconds % 60 + ' sec';
    }
    function renderRecent() {
      if (!recent) return;
      recentObserver.disconnect();
      recent.querySelectorAll('[data-local-resume], [data-local-session]').forEach(node => node.remove());
      const buttons = new Map([...recent.querySelectorAll('[data-game-id]')].map(node => [node.dataset.gameId, node]));
      for (const row of history) {
        const game = findGame(row.id);
        if (!game) continue;
        const detail = el('small', dateFormat.format(row.at) + ' · ' + duration(row.seconds) + ' last session');
        const existing = buttons.get(row.id);
        if (existing) {
          detail.dataset.localSession = '';
          existing.append(detail);
        } else {
          const item = button('', () => launch(game));
          item.dataset.localResume = '';
          item.append(el('b', game.name), detail);
          recent.append(item);
        }
      }
      const empty = recent.querySelector(':scope > p');
      if (empty) empty.hidden = !!recent.querySelector('button');
      recentObserver.observe(recent, { childList: true });
    }

    // Webports are loaded by the host independently of the main catalogue.
    fetch(new URL('../webports.json', document.baseURI))
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        for (const port of data?.games ?? []) {
          const game = { id: port.id, name: port.name, cat: 'Webported Games',
            size: 'big', embed: new URL(port.url, document.baseURI).href, external: !port.local, help: port.requirements };
          if (allowed(game)) releases.set(game.id, game);
        }
        renderRecent();
      }).catch(() => {});

    function dialog(id, name) {
      const node = el('dialog', '', 'px-feature-dialog');
      const title = el('h2', name);
      title.id = id + '-title';
      node.id = id;
      node.setAttribute('aria-labelledby', title.id);
      const head = el('header', '', 'px-feature-head');
      const close = button('Close', () => node.close());
      head.append(title, close);
      node.append(head);
      document.body.append(node);
      return [node, close];
    }

    const busy = () => gamePlayer.open || document.querySelector('dialog[open]') ||
      document.body.classList.contains('arcade-booting') || window.pixelStudy?.active;
    const [palette] = dialog('px-palette', 'Command Palette');
    const field = el('input');
    field.type = 'search';
    field.placeholder = 'Search games or commands…';
    field.setAttribute('role', 'combobox');
    field.setAttribute('aria-label', 'Search games or commands');
    field.setAttribute('aria-controls', 'px-command-results');
    field.setAttribute('aria-autocomplete', 'list');
    field.setAttribute('aria-expanded', 'true');
    const results = el('div', '', 'px-command-results');
    results.id = 'px-command-results';
    results.setAttribute('role', 'listbox');
    results.setAttribute('aria-label', 'Commands and games');
    const feedback = el('p', '', 'px-feature-note');
    feedback.setAttribute('role', 'status');
    palette.append(field, results, feedback, el('small', '↑ ↓ Navigate · Enter Select · Esc Close', 'px-feature-note'));
    let commands = [];
    let selection = 0;

    function normal(value) {
      return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    }
    function score(label, query) {
      if (label === query) return 1000;
      if (label.startsWith(query)) return 800 - label.length;
      const exact = label.indexOf(query);
      if (exact >= 0) return 600 - exact;
      let cursor = 0;
      let previous = -1;
      let gaps = 0;
      for (const character of query) {
        const next = label.indexOf(character, cursor);
        if (next < 0) return -Infinity;
        gaps += next - previous - 1;
        previous = next;
        cursor = next + 1;
      }
      return 300 - gaps;
    }
    const command = (name, detail, action) => ({ name, detail, action });
    const gameCommand = (game, detail = game.cat || 'Game') => command(game.name, detail, () => launch(game));
    const visit = (name, id) => command(name, 'Navigation', () => showSection(id));
    const control = (name, id) => command(name, 'Settings', () => document.getElementById(id)?.click());
    function updateSelection(index) {
      if (!commands.length) {
        field.removeAttribute('aria-activedescendant');
        return;
      }
      selection = (index + commands.length) % commands.length;
      [...results.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === selection)));
      const selected = results.children[selection];
      field.setAttribute('aria-activedescendant', selected.id);
      selected.scrollIntoView({ block: 'nearest' });
    }
    function activate(index) {
      const row = commands[index];
      if (!row) return;
      palette.close();
      row.action();
    }
    function renderCommands() {
      const query = normal(field.value.trim());
      const shortcuts = [
        visit('Home', 'home'), visit('Game Library', 'all'), visit('Webported Games', 'webports'),
        command('Game Roulette', 'Discover a game', openRoulette),
        command('Theme', 'Switch light or dark mode', () => document.getElementById('theme-toggle')?.click()), control('Settings', 'side-settings'),
        control('Playtime stats', 'statsview'), command('Favourites', 'Toggle the library favourites filter', () => {
          showSection('all');
          document.getElementById('favview')?.click();
        }),
      ];
      const favourites = read('px-favs', []);
      const favoriteIds = new Set(Array.isArray(favourites) ? favourites : []);
      const games = library();
      if (query) {
        commands = [...shortcuts, ...games.map(game => gameCommand(game))]
          .map(row => ({ row, rank: Math.max(score(normal(row.name), query), score(normal(row.detail), query) - 300) }))
          .filter(item => Number.isFinite(item.rank)).sort((a, b) => b.rank - a.rank).slice(0, 14).map(item => item.row);
      } else {
        const picks = new Map();
        for (const row of history) {
          const game = findGame(row.id);
          if (game && picks.size < 5) picks.set(game.id, gameCommand(game, favoriteIds.has(game.id) ? 'Recent · Favourite' : 'Recent'));
        }
        for (const game of games) {
          if (favoriteIds.has(game.id) && !picks.has(game.id) && picks.size < 8) picks.set(game.id, gameCommand(game, 'Favourite'));
        }
        commands = [...picks.values(), ...shortcuts];
      }
      results.replaceChildren(...commands.map((row, index) => {
        const option = button('', () => activate(index));
        option.id = 'px-command-' + index;
        option.tabIndex = -1;
        option.setAttribute('role', 'option');
        option.append(el('strong', row.name), el('small', row.detail));
        return option;
      }));
      feedback.textContent = commands.length ? '' : 'No matching games or commands.';
      updateSelection(0);
    }
    field.addEventListener('input', renderCommands);
    field.addEventListener('keydown', event => {
      const offsets = { ArrowDown: 1, ArrowUp: -1 };
      if (event.key in offsets) {
        event.preventDefault();
        updateSelection(selection + offsets[event.key]);
      } else if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        activate(selection);
      }
    });
    function openPalette() {
      if (busy()) return;
      palette.showModal();
      field.value = '';
      renderCommands();
      field.focus();
    }
    document.addEventListener('keydown', event => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey ||
          event.key.toLowerCase() !== 'k' || event.defaultPrevented || busy()) return;
      event.preventDefault();
      openPalette();
    });

    const [roulette] = dialog('px-roulette', 'Game Roulette');
    const filter = el('select');
    filter.setAttribute('aria-label', 'Game category');
    const sound = el('input');
    sound.type = 'checkbox';
    sound.checked = read('px-roulette-sound', false) === true;
    sound.onchange = () => write('px-roulette-sound', sound.checked);
    const soundLabel = el('label', 'Sound effects');
    soundLabel.prepend(sound);
    const settings = el('div', '', 'px-roulette-settings');
    settings.append(filter, soundLabel);
    const viewport = el('div', '', 'px-roulette-viewport');
    const track = el('div', '', 'px-roulette-track');
    track.setAttribute('aria-hidden', 'true');
    viewport.append(track);
    const result = el('p', '', 'px-roulette-result');
    result.setAttribute('role', 'status');
    const spin = button('Spin', spinRoulette, 'primary');
    const play = button('Play Now', () => {
      if (!winner) return;
      roulette.close();
      launch(winner);
    });
    const actions = el('div', '', 'px-roulette-actions');
    actions.append(spin, play);
    roulette.append(settings, viewport, result, actions);
    let winner;
    let motion;
    let audio;

    function artwork(game) {
      const card = el('div', '', 'px-roulette-card');
      if (CSS.supports('color', game.color || '')) card.style.setProperty('--px-cover-color', game.color);
      const image = game.cover || game.image;
      if (image) {
        const cover = el('img');
        cover.alt = '';
        cover.onload = () => { cover.hidden = false; };
        cover.hidden = true;
        cover.src = image;
        card.append(cover);
      }
      card.append(el('span', game.glyph || '◈', 'px-roulette-mark'), el('strong', game.name));
      return card;
    }
    function announceWinner() {
      track.querySelector('[data-winner]')?.classList.add('is-selected');
      result.textContent = winner.name + ' · ' + (winner.cat || 'Game');
      play.disabled = false;
      spin.disabled = false;
      filter.disabled = false;
      spin.textContent = 'Spin Again';
      if (!sound.checked || audio?.state !== 'running') return;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.setValueAtTime(540, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(820, audio.currentTime + .14);
      gain.gain.setValueAtTime(.045, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .2);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + .21);
    }
    function spinRoulette() {
      const pool = library().filter(game => !filter.value || game.cat === filter.value);
      if (!pool.length) return;
      const pick = () => pool[Math.floor(Math.random() * pool.length)];
      const selected = pick();
      if (sound.checked && window.AudioContext) {
        try {
          audio ??= new AudioContext();
          audio.resume().catch(() => {});
        } catch { /* Audio is optional. */ }
      }
      winner = selected;
      spin.disabled = filter.disabled = play.disabled = true;
      result.textContent = 'Spinning…';
      const cards = [...Array.from({ length: 12 }, pick), selected, ...Array.from({ length: 2 }, pick)];
      const immediate = reduced.matches || pool.length === 1;
      track.replaceChildren(...(immediate ? [selected] : cards).map(artwork));
      const target = track.children[immediate ? 0 : 12];
      target.dataset.winner = '';
      const center = card => viewport.clientWidth / 2 - card.offsetLeft - card.offsetWidth / 2;
      const end = center(target);
      track.style.transform = 'translateX(' + end + 'px)';
      if (immediate || !track.animate) {
        announceWinner();
        return;
      }
      const animation = track.animate([
        { transform: 'translateX(' + center(track.firstElementChild) + 'px)' },
        { transform: 'translateX(' + end + 'px)' },
      ], { duration: 2400, easing: 'cubic-bezier(.14,.7,.19,1)' });
      motion = animation;
      animation.finished.then(() => {
        if (motion === animation && roulette.open) announceWinner();
      }).catch(() => {});
    }
    function openRoulette() {
      if (busy()) return;
      const categories = [...new Set(library().map(game => game.cat).filter(Boolean))].sort();
      filter.replaceChildren(new Option('All categories', ''), ...categories.map(category => new Option(category, category)));
      track.replaceChildren();
      track.style.transform = '';
      result.textContent = 'Choose a category and spin to discover a game.';
      winner = undefined;
      play.disabled = true;
      filter.disabled = false;
      spin.disabled = false;
      spin.textContent = 'Spin';
      roulette.showModal();
      spin.focus();
    }
    roulette.addEventListener('close', () => {
      motion?.cancel();
      motion = undefined;
      track.replaceChildren();
      if (audio) audio.suspend().catch(() => {});
    });
    reduced.addEventListener('change', () => {
      if (reduced.matches && motion?.playState === 'running') motion.finish();
    });

    const shortcut = button('Search · ⌘/Ctrl K', openPalette, 'ui-text-action subtle');
    shortcut.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
    home.querySelector('.ui-hero-links')?.append(shortcut);
    const surprise = document.querySelector('#home-random');
    if (surprise) {
      surprise.textContent = 'Game Roulette';
      surprise.onclick = openRoulette;
    }
    new MutationObserver(() => {
      renderRecent();
      if (palette.open) renderCommands();
    }).observe(document.querySelector('#grid'), { childList: true });
    refreshSession();
    renderRecent();
  }
  if (document.body.classList.contains('arcade-booting')) {
    document.addEventListener('pixel-interface-ready', init, { once: true });
  } else init();
})();
