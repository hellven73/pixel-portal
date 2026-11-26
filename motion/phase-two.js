(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const standalone = matchMedia('(display-mode: standalone)');
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The current visit still works. */ }
  };
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, run) => {
    const node = el('button', text);
    node.type = 'button';
    node.addEventListener('click', run);
    return node;
  };

  // The prompt event may fire before the rest of the arcade finishes booting.
  let installPrompt;
  let installed = false;
  let updateInstall = () => {};
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateInstall();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    installed = true;
    updateInstall();
  });
  standalone.addEventListener('change', () => updateInstall());

  function init() {
    const home = document.querySelector('#home-page');
    const links = home?.querySelector('.ui-hero-links');
    const player = document.querySelector('#player');
    const stage = document.querySelector('#stage');
    if (!links || !player || !stage || document.body.classList.contains('game-tab')) return;

    const dialogsOpen = () => document.querySelector('dialog[open]');
    const arcadeAction = (label, action) => {
      const control = button(label, action);
      control.className = 'ui-text-action subtle';
      links.append(control);
      return control;
    };
    function dialog(title) {
      const node = el('dialog', '', 'px-feature-dialog px-next-dialog');
      const head = el('header', '', 'px-feature-head');
      const heading = el('h2', title);
      heading.id = 'px-next-' + title.toLowerCase().replaceAll(' ', '-');
      node.setAttribute('aria-labelledby', heading.id);
      const close = button('Exit', () => node.close());
      head.append(heading, close);
      node.append(head);
      document.body.append(node);
      return { node, head, close };
    }

    const installHelp = dialog('Install PixelArcade').node;
    const installStatus = el('p', '');
    installStatus.setAttribute('role', 'status');
    installHelp.append(installStatus);
    const install = arcadeAction('Install app', async () => {
      if (installPrompt) {
        const prompt = installPrompt;
        installPrompt = undefined;
        try {
          await prompt.prompt();
          if ((await prompt.userChoice).outcome === 'accepted') { installed = true; updateInstall(); }
        } catch { updateInstall(); }
        return;
      }
      if (dialogsOpen()) return;
      installStatus.textContent = 'On iPhone or iPad, open PixelArcade in Safari and choose Share, then Add to Home Screen. On Chromium browsers, look for Install PixelArcade in the browser menu.';
      installHelp.showModal();
    });
    updateInstall = () => { install.hidden = installed || standalone.matches || navigator.standalone === true; };
    updateInstall();
    if ('serviceWorker' in navigator && window.isSecureContext) {
      const update = arcadeAction('Update app', () => {});
      update.hidden = true;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading && !player.open) location.reload();
      });
      navigator.serviceWorker.register(new URL('arcade-worker.js', document.baseURI)).then(registration => {
        const refresh = () => { update.hidden = !registration.waiting; };
        refresh();
        update.onclick = () => {
          if (player.open || !registration.waiting) return;
          reloading = true;
          registration.waiting.postMessage('activate-update');
        };
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', refresh);
        });
      }).catch(() => {});
    }

    const available = game => game && game.kind !== 'media' && window.pixelGameAllowed(game);
    const catalogue = () => window.gameCatalog.filter(available);
    const gameById = id => catalogue().find(game => game.id === id);
    const launch = game => openGame(game, true);
    const currentGame = () => typeof current === 'undefined' ? null : current;
    const recent = () => {
      const rows = read('px-recent-games-v1', []);
      return Array.isArray(rows) ? rows : [];
    };

    const consoleUI = dialog('Console Mode');
    const consolePanel = consoleUI.node;
    consolePanel.classList.add('px-console');
    const hero = el('section', '', 'px-console-hero');
    const cover = el('img');
    cover.alt = '';
    cover.hidden = true;
    const heroName = el('h3');
    const heroGenre = el('p');
    const play = button('Play game', () => {
      if (!selected) return;
      const game = selected;
      consolePanel.close();
      if (document.fullscreenElement === document.documentElement) document.exitFullscreen().catch(() => {});
      launch(game);
    });
    play.className = 'primary';
    hero.append(cover, heroName, heroGenre, play);
    const consoleSettings = el('div', '', 'px-next-actions');
    const shelf = el('select');
    shelf.setAttribute('aria-label', 'Console collections');
    const adaptive = el('input');
    adaptive.type = 'checkbox';
    adaptive.checked = read('px-adaptive-colours', false) === true;
    const adaptiveLabel = el('label', 'Adaptive colours');
    adaptiveLabel.prepend(adaptive);
    const deadZone = el('input');
    deadZone.type = 'range';
    deadZone.min = '.15';
    deadZone.max = '.65';
    deadZone.step = '.05';
    deadZone.value = String(read('px-controller-deadzone', .25));
    const deadZoneLabel = el('label', 'Controller dead zone');
    deadZoneLabel.append(deadZone);
    deadZone.onchange = () => save('px-controller-deadzone', Number(deadZone.value));
    const fullscreen = button('Fullscreen', async () => {
      try {
        if (document.fullscreenElement === document.documentElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch { controllerStatus.textContent = 'Fullscreen is unavailable on this device.'; }
    });
    fullscreen.hidden = !document.documentElement.requestFullscreen;
    document.addEventListener('fullscreenchange', () => {
      fullscreen.textContent = document.fullscreenElement === document.documentElement ? 'Exit fullscreen' : 'Fullscreen';
    });
    consoleSettings.append(shelf, adaptiveLabel, deadZoneLabel, fullscreen);
    const rail = el('div', '', 'px-console-rail');
    rail.setAttribute('aria-label', 'Games in this collection');
    const counter = el('p', '', 'px-feature-note');
    const more = button('Show more', () => { limit += 24; renderShelf(true); });
    const controllerStatus = el('p', '', 'px-feature-note');
    controllerStatus.setAttribute('role', 'status');
    consolePanel.append(hero, consoleSettings, rail, counter, more, controllerStatus);
    let selected;
    let shelfGames = [];
    let selectedIndex = -1;
    let limit = 24;
    let frameId;
    let lastPoll = 0;
    let previousInput = '';
    let tintRequest = 0;
    const tints = new Map();

    function applyTint(game, image) {
      const request = ++tintRequest;
      consolePanel.style.removeProperty('--px-adaptive');
      home.style.removeProperty('--px-home-adaptive');
      if (!adaptive.checked || !game) return;
      if (CSS.supports('color', game.color || '')) {
        consolePanel.style.setProperty('--px-adaptive', game.color);
        home.style.setProperty('--px-home-adaptive', game.color);
      }
      if (!image) return;
      const apply = color => {
        if (request === tintRequest && adaptive.checked && consolePanel.open) {
          consolePanel.style.setProperty('--px-adaptive', color);
          home.style.setProperty('--px-home-adaptive', color);
        }
      };
      if (tints.has(image)) return apply(tints.get(image));
      const sample = new Image();
      sample.crossOrigin = 'anonymous';
      sample.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 12;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(sample, 0, 0, 12, 12);
          const pixels = context.getImageData(0, 0, 12, 12).data;
          let r = 0, g = 0, b = 0, weight = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const spread = Math.max(...pixels.subarray(i, i + 3)) - Math.min(...pixels.subarray(i, i + 3));
            if (pixels[i + 3] < 160 || spread < 24) continue;
            r += pixels[i] * spread; g += pixels[i + 1] * spread; b += pixels[i + 2] * spread; weight += spread;
          }
          if (!weight) return;
          const color = 'rgb(' + [r, g, b].map(channel => Math.round(channel / weight)).join(' ') + ')';
          if (tints.size >= 64) tints.delete(tints.keys().next().value);
          tints.set(image, color);
          apply(color);
        } catch { /* Third-party artwork can be displayed even if its pixels cannot be read. */ }
      };
      sample.src = image;
    }
    function artwork(game) {
      const image = game.cover || game.image;
      if (!image) return '';
      try {
        const url = new URL(image, document.baseURI);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
      } catch { return ''; }
    }
    let reveal;
    function select(index, scroll = false) {
      selectedIndex = Math.min(rail.children.length - 1, Math.max(0, index));
      selected = shelfGames[selectedIndex];
      const image = selected ? artwork(selected) : '';
      heroName.textContent = selected?.name || 'No games in this collection';
      heroGenre.textContent = selected?.cat || '';
      play.disabled = !selected;
      cover.hidden = !image;
      if (image) cover.src = image;
      else cover.removeAttribute('src');
      applyTint(selected, image);
      [...rail.children].forEach((entry, i) => {
        entry.setAttribute('aria-pressed', String(i === selectedIndex));
        entry.tabIndex = i === selectedIndex ? 0 : -1;
      });
      if (scroll) rail.children[selectedIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      reveal?.cancel();
      if (selected && !reducedMotion.matches) {
        reveal = hero.animate?.([{ opacity: .66, translate: '0 5px' }, { opacity: 1, translate: 'none' }],
          { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    }
    cover.addEventListener('error', () => { cover.hidden = true; });
    function renderShelf(keep = false) {
      const games = catalogue();
      const favourites = read('px-favs', []);
      const previous = keep ? selected?.id : null;
      switch (shelf.value) {
        case 'recent': shelfGames = recent().map(row => games.find(game => game.id === row.id)).filter(Boolean); break;
        case 'favourite': shelfGames = games.filter(game => Array.isArray(favourites) && favourites.includes(game.id)); break;
        case 'all': shelfGames = games; break;
        default: shelfGames = games.filter(game => 'genre:' + game.cat === shelf.value);
      }
      rail.replaceChildren(...shelfGames.slice(0, limit).map((game, index) => {
        const entry = button('', () => select(index));
        const source = artwork(game);
        if (source) {
          const thumbnail = el('img');
          thumbnail.alt = '';
          thumbnail.loading = 'lazy';
          thumbnail.src = source;
          thumbnail.onerror = () => thumbnail.remove();
          entry.append(thumbnail);
        } else entry.append(el('span', game.glyph || '◈', 'px-console-glyph'));
        entry.append(el('strong', game.name));
        return entry;
      }));
      more.hidden = shelfGames.length <= limit;
      counter.textContent = 'Showing ' + Math.min(limit, shelfGames.length) + ' of ' + shelfGames.length;
      select(Math.max(0, shelfGames.slice(0, limit).findIndex(game => game.id === previous)), keep);
    }
    shelf.onchange = () => { limit = 24; renderShelf(); };
    adaptive.onchange = () => {
      save('px-adaptive-colours', adaptive.checked);
      applyTint(selected, selected && artwork(selected));
    };
    rail.addEventListener('keydown', event => {
      const offset = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (!offset) return;
      event.preventDefault();
      select(selectedIndex + offset, true);
      rail.children[selectedIndex]?.focus();
    });

    function standardController() {
      try { return Array.from(navigator.getGamepads?.() || []).find(pad => pad?.mapping === 'standard'); }
      catch { return undefined; }
    }

    function describeController() {
      if (!consolePanel.open) return;
      const controller = standardController();
      controllerStatus.textContent = controller
        ? controller.id + ' · D-pad or stick to browse · A / Cross to play · B / Circle to exit'
        : 'Connect an Xbox or PlayStation controller and press a button, or use the arrow keys.';
    }
    function pollController(now) {
      if (!consolePanel.open) return;
      frameId = requestAnimationFrame(pollController);
      if (now - lastPoll < 95) return;
      lastPoll = now;
      const pad = standardController();
      if (!pad) { previousInput = ''; return; }
      const pressed = index => pad.buttons[index]?.pressed;
      const axis = pad.axes[0] || 0;
      const threshold = Number(deadZone.value);
      const input = pressed(1) ? 'back' : pressed(0) ? 'play' :
        pressed(14) || axis < -threshold ? 'left' : pressed(15) || axis > threshold ? 'right' : '';
      if (input !== previousInput) {
        previousInput = input;
        if (input === 'back') consolePanel.close();
        if (input === 'play' && selected) play.click();
        if (input === 'left' || input === 'right') select(selectedIndex + (input === 'left' ? -1 : 1), true);
      }
    }
    window.addEventListener('gamepadconnected', describeController);
    window.addEventListener('gamepaddisconnected', describeController);
    consolePanel.addEventListener('close', () => {
      cancelAnimationFrame(frameId);
      previousInput = '';
      tintRequest++;
      rail.replaceChildren();
      cover.removeAttribute('src');
      if (document.fullscreenElement === document.documentElement) document.exitFullscreen().catch(() => {});
    });
    arcadeAction('Console Mode', () => {
      if (dialogsOpen()) return;
      const genres = [...new Set(catalogue().map(game => game.cat).filter(Boolean))].sort();
      shelf.replaceChildren(new Option('All games', 'all'), new Option('Recently played', 'recent'),
        new Option('Favourites', 'favourite'), ...genres.map(genre => new Option(genre, 'genre:' + genre)));
      limit = 24;
      consolePanel.showModal();
      renderShelf();
      describeController();
      frameId = requestAnimationFrame(pollController);
    });

    initWrapped();
    initTabs();

    function initWrapped() {
      const log = 'px-wrapped-sessions-v1';
      const getRows = () => {
        const stored = read(log, []);
        return Array.isArray(stored) ? stored.filter(row => row && typeof row.id === 'string' &&
          typeof row.name === 'string' && Number.isFinite(row.at) && row.at > 0 && row.at <= Date.now() &&
          Number.isFinite(row.seconds) && row.seconds >= 0) : [];
      };
      let sessions = getRows();
      document.addEventListener('pixel-session-checkpoint', ({ detail }) => {
        if (!detail?.id || !detail.name || detail.seconds < 1) return;
        const latest = getRows();
        const rows = latest.length ? latest : sessions;
        const earlier = rows.find(row => row.id === detail.id && row.at === detail.at);
        if (earlier?.seconds >= detail.seconds) return;
        sessions = [detail, ...rows.filter(row => row.id !== detail.id || row.at !== detail.at)]
          .sort((a, b) => b.at - a.at).slice(0, 500);
        save(log, sessions);
      });
      const wrapped = dialog('PixelWrapped').node;
      wrapped.classList.add('px-wrapped');
      const slide = el('section', '', 'px-wrapped-slide');
      slide.setAttribute('aria-live', 'polite');
      const controls = el('div', '', 'px-next-actions');
      const previous = button('Previous', () => { index--; draw(); });
      const next = button('Next', () => { index++; draw(); });
      const download = button('Download recap', () => exportRecap(false));
      const share = button('Share recap', () => exportRecap(true));
      share.hidden = !navigator.canShare;
      controls.append(previous, next, download, share);
      wrapped.append(slide, controls, el('p', 'Includes up to 500 sessions recorded in this browser since the update.', 'px-feature-note'));
      const pretty = seconds => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(seconds / 60) + ' min';
      const month = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });
      let index = 0;
      let screens = [];
      let recap = [];
      const rankings = map => [...map].sort((a, b) => b[1] - a[1]);
      const add = (map, id, seconds) => map.set(id, (map.get(id) || 0) + seconds);

      arcadeAction('PixelWrapped', () => {
        if (dialogsOpen()) return;
        const plays = getRows();
        if (plays.length) sessions = plays;
        const games = new Map(), genres = new Map(), dates = new Map(), names = new Map();
        let total = 0, longest = 0;
        for (const row of sessions) {
          total += row.seconds;
          longest = Math.max(row.seconds, longest);
          names.set(row.id, row.name);
          add(games, row.id, row.seconds);
          add(genres, row.genre || 'Uncategorised', row.seconds);
          const date = new Date(row.at);
          add(dates, new Date(date.getFullYear(), date.getMonth(), 1).getTime(), row.seconds);
        }
        index = 0;
        recap = total ? [pretty(total) + ' played', games.size + ' games explored',
          'Most played: ' + names.get(rankings(games)[0][0]), 'Longest session: ' + pretty(longest)] : [];
        screens = total ? [
          { title: 'Your arcade time', lines: recap.slice(0, 2) },
          { title: 'Most-played games', bars: rankings(games).slice(0, 5).map(([id, value]) => [names.get(id), value]) },
          { title: 'Favourite genres', bars: rankings(genres).slice(0, 5) },
          { title: 'Monthly activity', bars: [...dates].sort(([a], [b]) => a - b).slice(-12).map(([date, value]) => [month.format(date), value]) },
          { title: 'Gaming milestones', lines: [recap[3], games.size >= 10 ? 'Explored 10 or more games' :
            'Reached ' + games.size + ' of 10 games explored'] },
        ] : [{ title: 'Your recap starts with a game', lines: ['There isn’t enough playtime recorded in this browser yet.'] }];
        wrapped.showModal();
        draw();
      });
      function draw() {
        const screen = screens[index];
        slide.replaceChildren(el('h3', screen.title));
        for (const line of screen.lines || []) slide.append(el('p', line));
        const maximum = Math.max(1, ...(screen.bars || []).map(([, value]) => value));
        for (const [label, value] of screen.bars || []) {
          const row = el('div', '', 'px-wrapped-bar');
          const meter = el('span');
          meter.style.setProperty('--px-bar', (value / maximum * 100) + '%');
          meter.setAttribute('aria-hidden', 'true');
          row.append(el('span', label), el('small', pretty(value)), meter);
          slide.append(row);
        }
        previous.disabled = index === 0;
        next.disabled = index >= screens.length - 1;
        download.disabled = share.disabled = !recap.length;
        if (!reducedMotion.matches) slide.animate?.([{ opacity: .4, translate: '9px 0' }, { opacity: 1, translate: 'none' }],
          { duration: 250, easing: 'ease-out' });
      }
      function exportRecap(sharing) {
        const canvas = document.createElement('canvas');
        canvas.width = 1000; canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#15121f'; ctx.fillRect(0, 0, 1000, 600);
        ctx.fillStyle = '#b4a0ff'; ctx.font = 'bold 75px system-ui';
        ctx.fillText('PixelWrapped', 70, 135);
        ctx.fillStyle = '#f4efff'; ctx.font = '38px system-ui';
        recap.forEach((line, i) => ctx.fillText(line, 74, 245 + i * 75, 850));
        canvas.toBlob(async blob => {
          if (!blob) return;
          const file = new File([blob], 'pixelwrapped.png', { type: 'image/png' });
          if (sharing && navigator.canShare?.({ files: [file] })) {
            try { await navigator.share({ files: [file], title: 'PixelWrapped' }); return; }
            catch (error) { if (error.name === 'AbortError') return; }
          }
          const url = URL.createObjectURL(blob);
          const link = el('a');
          link.href = url; link.download = file.name; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
        });
      }
    }

    function initTabs() {
      const tabs = [];
      const desk = dialog('Game Tabs').node;
      const help = el('p', 'One game runs at a time. Switching suspends the old game and stops its audio. Reopening may reload progress.');
      const search = el('input');
      search.type = 'search';
      search.placeholder = 'Search games to open';
      search.setAttribute('aria-label', 'Search games to open');
      const picker = el('select');
      picker.setAttribute('aria-label', 'Choose a game for a new tab');
      const list = el('div', '', 'px-desk-list');
      const status = el('p', '', 'px-feature-note');
      status.setAttribute('role', 'status');
      const addGame = button('Open game', () => switchGame(gameById(picker.value)));
      const row = el('div', '', 'px-next-actions');
      row.append(search, picker, addGame);
      search.oninput = populate;
      desk.append(help, list, row, status);
      const tools = el('div', '', 'px-desk-toolbar');
      const manage = button('Game Tabs', openDesk);
      tools.append(manage);
      stage.before(tools);
      arcadeAction('Game Tabs', openDesk);
      let activeId;
      function eligible(game) {
        if (!available(game) || game.highEnd || game.providerLaunch || game.uploaded ||
            game.externalPopup || game.isolatedLaunch || game.cat === 'Cloud gaming') return false;
        try { return new URL(game.embed || game.url, document.baseURI).hostname !== 'web.cloudmoonapp.com'; }
        catch { return false; }
      }
      function refresh() {
        const game = currentGame();
        const running = player.open && stage.querySelector('iframe') && eligible(game);
        activeId = running ? game.id : undefined;
        if (running && !tabs.some(tab => tab.id === game.id)) {
          if (tabs.length === 4) tabs.shift();
          tabs.push(game);
        }
        manage.textContent = 'Game Tabs' + (tabs.length ? ' (' + tabs.length + ')' : '');
        if (desk.open) draw();
      }
      function openDesk() {
        if (desk.open || [...document.querySelectorAll('dialog[open]')].some(node => node !== player)) return;
        search.value = '';
        populate();
        desk.showModal();
        draw();
      }
      function populate() {
        const query = search.value.trim().toLowerCase();
        const games = catalogue().filter(game => eligible(game) && game.name.toLowerCase().includes(query)).slice(0, 32);
        picker.replaceChildren(...games.map(game => new Option(game.name, game.id)));
        picker.disabled = addGame.disabled = !games.length;
      }
      function switchGame(game) {
        if (!eligible(game)) return;
        desk.close();
        if (activeId !== game.id) launch(game);
      }
      function draw() {
        list.replaceChildren(...tabs.map(game => {
          const row = el('div', '', 'px-next-actions');
          const active = game.id === activeId;
          row.append(el('strong', game.name), el('small', active ? 'Playing' : 'Suspended'),
            button(active ? 'Return to game' : 'Reopen', () => switchGame(game)),
            button('Close ' + game.name, () => {
              tabs.splice(tabs.indexOf(game), 1);
              if (active) player.close();
              draw();
            }));
          return row;
        }));
        if (!tabs.length) list.append(el('p', 'Open a game to start a tab.'));
        status.textContent = tabs.length + ' of 4 recent tabs · ' + (activeId ? 'one game running' : 'no game running');
      }
      new MutationObserver(refresh).observe(stage, { childList: true });
      new MutationObserver(refresh).observe(player, { attributes: true, attributeFilter: ['open'] });
      refresh();
    }
  }

  if (document.body.classList.contains('arcade-booting')) {
    document.addEventListener('pixel-interface-ready', init, { once: true });
  } else init();
})();
