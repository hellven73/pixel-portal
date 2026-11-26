const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const home = document.querySelector('#home-page');
const library = document.querySelector('#library-page');
const sidebar = document.querySelector('#side-nav');
const player = document.querySelector('#player');

const easeOut = 'cubic-bezier(.22, 1, .36, 1)';
const cardSelector = '#home-page :is(.destination-card, .home-tool-card, .new-game-card), #grid > .card, .px-webports-card, .ports-card';
const buttonSelector = '#home-page :is(.ui-hero-links > *, #home-search-form button, .quick-launch button), #side-nav .side-link, .compact-header :is(.ui-header-button, .compact-menu-toggle), #library-page :is(.filters button, .library-pager button), .px-webports-filter';
const rest = [0, 0, 0, 0]; // Pointer x/y, hover intensity, press intensity.
const clamp = (value, max = 1) => Math.max(-max, Math.min(max, value));

function initialize() {
  if (!home || !library || !sidebar || !player || !Element.prototype.animate ||
      new URLSearchParams(location.search).get('gameview') === '1') return;

  const { body } = document;
  const navScroll = sidebar.querySelector('.ui-nav-scroll');
  const hero = home.querySelector('.ui-hero');
  const loader = document.querySelector('#pixel-launch-loader');
  const welcome = document.querySelector('.pixel-intro');
  const surfaces = new Map();
  const animations = new Map();
  const seenSections = new WeakSet();
  const grids = new Map();
  const watchedGrids = new WeakSet();
  const seenCards = new WeakSet();
  let activeSection;
  let visitedHome = false;
  let hovered;
  let pressed;
  let springFrame = 0;
  let previousTick = 0;
  let refreshFrame = 0;
  let flight;
  let searchOrigin;
  let rail;
  let activeLink;
  let railLink;

  const enabled = () => body.hasAttribute('data-pixel-motion') && !reducedMotion.matches;

  function animate(node, frames, options = {}) {
    if (!node || !enabled()) return;
    animations.get(node)?.cancel();
    const animation = node.animate(frames, { duration: 360, easing: easeOut, fill: 'backwards', ...options });
    animations.set(node, animation);
    const forget = () => {
      if (animations.get(node) === animation) animations.delete(node);
    };
    animation.finished.then(forget, forget);
    return animation;
  }

  function resetSurface(node) {
    surfaces.get(node)?.sheen?.remove();
    surfaces.delete(node);
    delete node.dataset.pxMotionSurface;
    node.removeAttribute('data-px-motion-position');
    for (const name of [...node.style]) {
      if (name.startsWith('--px-motion-')) node.style.removeProperty(name);
    }
  }

  function paintSurface(node, { kind, rect, values: [x, y, lift, press] }) {
    const css = node.style;
    const set = (key, value, unit = 'px') => css.setProperty('--px-motion-' + key, value.toFixed(3) + unit);
    const card = kind === 'card';
    const artwork = kind === 'hero' ? 12 : card ? 5 : 2;
    set('art-x', x * artwork);
    set('art-y', y * artwork);
    set('copy-x', x * (card ? 2 : -6));
    set('copy-y', y * (card ? 2 : -6));
    set('control-x', x * (card ? 3 : 20));
    set('control-y', y * (card ? 3 : 20));
    if (kind === 'hero') return;

    set('x', card ? 0 : x * 2.5);
    set('y', card ? lift * -3 : y * 2.5);
    set('scale', 1 + lift * (card ? .012 : .024) - press * (card ? .035 : .07), '');
    set('rx', y * -6.5, 'deg');
    set('ry', x * 8, 'deg');
    set('zoom', 1 + lift * .065, '');
    set('light-x', x * rect.width / 2);
    set('light-y', y * rect.height / 2);
    set('light', Math.max(0, lift) * (card ? 1 : .65), '');
  }

  // A damped spring shares one frame loop across the hovered and settling surfaces.
  // Substeps keep the response stable at both 60 Hz and high refresh rates.
  function tick(now) {
    const elapsed = Math.min((now - previousTick) / 1000, .032);
    const steps = Math.max(1, Math.ceil(elapsed / .008));
    const dt = elapsed / steps;
    previousTick = now;
    springFrame = 0;
    let moving = false;

    for (const [node, state] of surfaces) {
      if (!node.isConnected || !enabled()) {
        resetSurface(node);
        continue;
      }
      const { values, speeds, target } = state;
      let settled = true;
      for (let i = 0; i < values.length; i++) {
        for (let step = 0; step < steps; step++) {
          speeds[i] += (340 * (target[i] - values[i]) - 30 * speeds[i]) * dt;
          values[i] += speeds[i] * dt;
        }
        if (Math.abs(target[i] - values[i]) > .001 || Math.abs(speeds[i]) > .015) {
          settled = false;
        } else {
          values[i] = target[i];
          speeds[i] = 0;
        }
      }

      if (settled && target.every(value => value === 0)) {
        if (hovered !== node && pressed?.node !== node) resetSurface(node);
        else paintSurface(node, state);
      } else {
        paintSurface(node, state);
      }
      moving ||= !settled;
    }

    if (moving) springFrame = requestAnimationFrame(tick);
  }

  function wakeSpring() {
    if (springFrame) return;
    previousTick = performance.now();
    springFrame = requestAnimationFrame(tick);
  }

  function surfaceFor(node) {
    const card = node.closest(cardSelector);
    if (card) return [card, 'card'];
    const button = node.closest(buttonSelector);
    if (button && !button.matches(':disabled')) return [button, 'button'];
    if (hero?.contains(node)) return [hero, 'hero'];
    return [];
  }

  function engage(node, kind) {
    if (surfaces.has(node)) return surfaces.get(node);
    const rect = node.getBoundingClientRect();
    const state = { kind, rect, values: [...rest], speeds: [...rest], target: [...rest] };
    if (kind !== 'hero' && !node.matches('a[href]') && !node.closest('#side-nav')) {
      if (getComputedStyle(node).position === 'static') node.dataset.pxMotionPosition = '';
      const sheen = document.createElement('span');
      sheen.className = 'px-motion-sheen';
      sheen.setAttribute('aria-hidden', 'true');
      node.append(sheen);
      state.sheen = sheen;
    }
    node.dataset.pxMotionSurface = kind;
    paintSurface(node, state);
    surfaces.set(node, state);
    return state;
  }

  function leaveSurface() {
    const state = surfaces.get(hovered);
    hovered = undefined;
    if (!state) return;
    state.target.fill(0, 0, 3);
    wakeSpring();
  }

  document.addEventListener('pointermove', event => {
    if (!enabled() || !finePointer.matches || event.pointerType === 'touch' || player.open) return;
    const [node, kind] = surfaceFor(event.target);
    if (node !== hovered) leaveSurface();
    if (!node) return;

    const state = engage(node, kind);
    hovered = node;
    const { rect } = state;
    state.target[0] = clamp((event.clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1);
    state.target[1] = clamp((event.clientY - rect.top) / Math.max(rect.height, 1) * 2 - 1);
    state.target[2] = 1;
    wakeSpring();
  }, { passive: true });

  document.addEventListener('pointerout', event => {
    if (hovered && hovered.contains(event.target) && !hovered.contains(event.relatedTarget)) leaveSurface();
  }, { passive: true });

  document.addEventListener('pointerdown', event => {
    if (!enabled() || player.open || event.button !== 0 || !event.isPrimary) return;
    const [node, kind] = surfaceFor(event.target);
    if (!node || kind === 'hero') return;
    const state = engage(node, kind);
    state.speeds[3] = 18;
    state.target[3] = 1;
    pressed = { node, id: event.pointerId };
    wakeSpring();
  }, { passive: true });

  function releasePress(event) {
    if (!pressed || (event && event.pointerId !== pressed.id)) return;
    const state = surfaces.get(pressed.node);
    if (state) state.target[3] = 0;
    pressed = undefined;
    wakeSpring();
  }

  document.addEventListener('pointerup', releasePress, { passive: true, capture: true });
  document.addEventListener('pointercancel', releasePress, { passive: true, capture: true });
  window.addEventListener('blur', () => {
    leaveSurface();
    releasePress();
  });
  finePointer.addEventListener('change', leaveSurface);

  function reveal(node, delay, distance = 14) {
    if (!node || !node.getClientRects().length) return;
    animate(node, [
      { translate: `0 ${distance}px`, opacity: .52 },
      { translate: '0 0', opacity: 1 },
    ], { delay });
  }

  function homeIsReady() {
    return enabled() && activeSection === home && !welcome?.open &&
      (!loader?.isConnected || loader.classList.contains('pixel-launch-leaving'));
  }

  const homeCards = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    if (!homeIsReady()) return;
    let index = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = entry.target;
      homeCards.unobserve(card);
      seenCards.add(card);
      if (!card.matches(':hover, :focus-within')) reveal(card, Math.min(index++, 7) * 27, 14);
    }
  }, { threshold: .16 }) : null;

  function revealHome() {
    if (!homeIsReady()) return;
    if (homeCards) {
      for (const card of home.querySelectorAll('.new-game-card, .home-tool-card, .destination-card')) {
        if (!seenCards.has(card)) {
          // Re-observe when the welcome dialog closes so visible cards get an entry.
          homeCards.unobserve(card);
          homeCards.observe(card);
        }
      }
    }
    if (seenSections.has(home)) return;

    seenSections.add(home);
    const title = home.querySelector('.home-intro h1');
    animate(title, [
      { clipPath: 'inset(0 0 100% 0)', translate: '0 .22em' },
      { clipPath: 'inset(0 0 0 0)', translate: '0 0' },
    ], { duration: 560, delay: 30 });
    const art = home.querySelector('.ui-hero-art');
    if (art) {
      animate(art, [{ translate: '24px 9px', rotate: '-8deg' }, { translate: '0 0', rotate: '0deg' }],
        { duration: 650 });
    }
    ['.ui-eyebrow', '.home-intro p', '#home-search-form', '.ui-hero-links'].forEach((selector, index) => {
      reveal(home.querySelector(selector), 35 + index * 32);
    });
  }

  function clearRail() {
    rail?.remove();
    rail = undefined;
    railLink?.removeAttribute('data-px-motion-rail');
    railLink = undefined;
  }

  function updateRail() {
    const next = sidebar.querySelector('.side-link.active:not([hidden])');
    const last = activeLink;
    activeLink = next;
    if (!enabled() || !navScroll || next === last || !next?.getClientRects().length ||
        !last?.getClientRects().length || !navScroll.contains(next) || !navScroll.contains(last)) return;

    const container = navScroll.getBoundingClientRect();
    const from = (rail || last).getBoundingClientRect();
    const to = next.getBoundingClientRect();
    clearRail();
    const { backgroundColor, borderColor, borderRadius } = getComputedStyle(next);
    rail = document.createElement('span');
    rail.className = 'px-motion-nav-rail';
    rail.setAttribute('aria-hidden', 'true');
    Object.assign(rail.style, {
      width: to.width + 'px',
      height: to.height + 'px',
      left: to.left - container.left + navScroll.scrollLeft + 'px',
      top: to.top - container.top + navScroll.scrollTop + 'px',
      backgroundColor,
      borderColor,
      borderRadius,
    });
    navScroll.prepend(rail);
    railLink = next;
    next.dataset.pxMotionRail = '';
    const currentRail = rail;
    const animation = animate(rail, [
      { translate: `${from.left - to.left}px ${from.top - to.top}px`, scale: `${from.width / to.width} ${from.height / to.height}` },
      { translate: '0 0', scale: '1 1' },
    ], { duration: 320 });
    const finish = () => { if (rail === currentRail) clearRail(); };
    animation.finished.then(finish, finish);
  }

  function cardKey(card) {
    return (card.querySelector('strong, h3')?.textContent || card.textContent) + '|' +
      (card.querySelector('.meta > span')?.textContent || '');
  }

  function readGrid(grid) {
    const cards = grid.querySelectorAll(':scope > :is(.card, .px-webports-card, .ports-card)');
    const readings = new Map();
    for (const card of cards) {
      const { top, left, bottom } = card.getBoundingClientRect();
      if (bottom < -36 || top > innerHeight + 80) continue;
      readings.set(cardKey(card), { card, x: left + scrollX, y: top + scrollY });
    }
    return readings;
  }

  function animateGrid(grid) {
    const before = grids.get(grid);
    const after = readGrid(grid);
    grids.set(grid, after);
    let fresh = 0;
    for (const [key, entry] of after) {
      const last = before?.get(key);
      if (last?.card === entry.card) continue;
      if (!last) {
        reveal(entry.card, Math.min(fresh++, 9) * 22, 20);
        continue;
      }
      const x = last.x - entry.x;
      const y = last.y - entry.y;
      if (Math.abs(x) + Math.abs(y) < 2 || Math.abs(x) + Math.abs(y) > 460) continue;
      animate(entry.card, [{ translate: `${x}px ${y}px` }, { translate: '0 0' }], { duration: 340 });
    }
  }

  const gridObserver = new MutationObserver(records => {
    if (!enabled()) return;
    for (const grid of new Set(records.map(record => record.target))) {
      if (activeSection?.contains(grid) && !activeSection.hidden) animateGrid(grid);
    }
  });

  function currentGrid() {
    return activeSection?.querySelector('#grid, .px-webports-grid, .ports-grid');
  }

  function bridgeSearch() {
    if (!searchOrigin) return;
    const from = searchOrigin;
    searchOrigin = undefined;
    const field = library.querySelector('#search');
    const to = field.getBoundingClientRect();
    if (!from.width || !to.width || from.top < 0 || from.bottom > innerHeight || to.bottom > innerHeight) return;

    const outline = document.createElement('span');
    outline.className = 'px-motion-search-bridge';
    outline.setAttribute('aria-hidden', 'true');
    Object.assign(outline.style, {
      left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px',
      borderRadius: getComputedStyle(field).borderRadius,
    });
    body.append(outline);
    const animation = animate(outline, [
      {
        translate: `${from.left - to.left}px ${from.top - to.top}px`,
        scale: `${from.width / to.width} ${from.height / to.height}`,
        opacity: .45,
      },
      { translate: '0 0', scale: '1 1', opacity: .65, offset: .77 },
      { translate: '0 0', scale: '1 1', opacity: 0 },
    ], { duration: 340 });
    animation.finished.then(() => outline.remove(), () => outline.remove());
  }

  function refresh() {
    refreshFrame = 0;
    const next = [home, library, document.querySelector('#px-webports-page'), document.querySelector('#webports-page')]
      .find(section => section && !section.hidden);
    const changed = next !== activeSection;
    activeSection = next;
    visitedHome ||= next === home;
    body.toggleAttribute('data-pixel-motion', !!next && visitedHome && !reducedMotion.matches);
    updateRail();
    if (changed) {
      leaveSurface();
      releasePress();
      grids.clear();
    }
    if (!enabled()) {
      searchOrigin = undefined;
      clearRail();
      return;
    }

    if (next === home) {
      revealHome();
      return;
    }
    if (changed) {
      const title = next.querySelector('h1, h2');
      reveal(title?.parentElement, 0, 12);
      reveal(next.querySelector('.library-tools, .px-webports-toolbar, :scope > input'), 24, 9);
      if (next === library) bridgeSearch();
      else searchOrigin = undefined;
    }
    const grid = currentGrid();
    if (!grid) return;
    if (!watchedGrids.has(grid)) {
      gridObserver.observe(grid, { childList: true });
      watchedGrids.add(grid);
    }
    if (changed) animateGrid(grid);
  }

  function queueRefresh() {
    if (!refreshFrame) refreshFrame = requestAnimationFrame(refresh);
  }

  const sectionObserver = new MutationObserver(queueRefresh);
  sectionObserver.observe(body, { attributes: true, attributeFilter: ['data-section'] });
  for (const section of [home, library]) {
    sectionObserver.observe(section, { attributes: true, attributeFilter: ['hidden'] });
  }
  new MutationObserver(queueRefresh).observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class', 'open'] });
  const arrivalObserver = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && node.matches('.new-games-panel')))) {
      queueRefresh();
    }
  });
  arrivalObserver.observe(home, { childList: true });
  welcome?.addEventListener('close', queueRefresh);
  if (loader?.isConnected) {
    const loaderObserver = new MutationObserver(queueRefresh);
    loaderObserver.observe(loader, { attributes: true, attributeFilter: ['class'] });
    const removalObserver = new MutationObserver(() => {
      if (loader.isConnected) return;
      removalObserver.disconnect();
      loaderObserver.disconnect();
      queueRefresh();
    });
    removalObserver.observe(body, { childList: true });
  }
  home.querySelector('#home-search-form')?.addEventListener('submit', event => {
    if (enabled()) searchOrigin = event.currentTarget.getBoundingClientRect();
  }, true);

  function updateGridSnapshot() {
    if (!enabled()) return;
    const grid = currentGrid();
    if (grid?.getClientRects().length) grids.set(grid, readGrid(grid));
  }

  const snapshotBeforeRender = event => {
    if (event.target.closest('#library-page, #px-webports-page, #webports-page, #favview')) updateGridSnapshot();
  };
  for (const type of ['input', 'change', 'click']) document.addEventListener(type, snapshotBeforeRender, true);
  window.addEventListener('scroll', leaveSurface, { passive: true, capture: true });
  window.addEventListener('resize', leaveSurface, { passive: true });

  function finishFlight() {
    const overlay = flight;
    flight = undefined;
    if (!overlay) return;
    animations.get(overlay)?.cancel();
    overlay.remove();
  }

  function animateLaunch(art, from) {
    const title = player.querySelector('#gametitle');
    if (!enabled() || !player.open || body.classList.contains('game-tab') ||
        player.classList.contains('minecraft-player')) return;

    const header = title.closest('.playhead');
    reveal(title, 35, 9);
    const stage = player.querySelector('#stage');
    if (!art || !HTMLElement.prototype.showPopover || stage.classList.contains('device-check-stage')) return;

    finishFlight();
    const end = header.getBoundingClientRect();
    const destinationWidth = Math.min(end.width * .53, 450);
    const destinationHeight = Math.min(end.height, from.height * 1.1);
    const overlay = document.createElement('div');
    overlay.className = 'px-motion-flight';
    overlay.setAttribute('popover', 'manual');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    Object.assign(overlay.style, {
      top: from.top + 'px', left: from.left + 'px', width: from.width + 'px', height: from.height + 'px',
    });
    overlay.append(art.cloneNode(true));
    body.append(overlay);
    flight = overlay;
    try {
      overlay.showPopover();
    } catch {
      finishFlight();
      return;
    }
    const animation = animate(overlay, [
      { transform: 'none', opacity: .88, borderRadius: '12px' },
      { opacity: .3, offset: .54 },
      {
        transform: `translate(${end.left - from.left}px, ${end.top - from.top}px) scale(${destinationWidth / from.width}, ${destinationHeight / from.height})`,
        opacity: 0,
        borderRadius: '20px',
      },
    ], { duration: 360 });
    const finish = () => { if (flight === overlay) finishFlight(); };
    animation.finished.then(finish, finish);
  }

  document.addEventListener('click', event => {
    if (!enabled()) return;
    const play = event.target.closest('.cardplay, .new-game-launch, .px-webports-play, #home-page .quick-launch button');
    if (play && !player.open) {
      const art = play.querySelector('.thumb') || play.closest('.new-game-card, .px-webports-card')?.querySelector('img, .px-webports-art');
      const from = art?.getBoundingClientRect();
      queueMicrotask(() => animateLaunch(from?.width && from.height ? art : null, from));
    }
    if (event.detail === 0) {
      const [node, kind] = surfaceFor(event.target);
      if (node && kind !== 'hero') animate(node, [
        { scale: '1' }, { scale: '.96', offset: .28 }, { scale: '1' },
      ], { duration: 240 });
    }
  }, true);

  player.addEventListener('close', finishFlight);
  document.addEventListener('fullscreenchange', finishFlight);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      for (const node of surfaces.keys()) resetSurface(node);
      for (const animation of animations.values()) animation.cancel();
      cancelAnimationFrame(springFrame);
      springFrame = 0;
      hovered = undefined;
      pressed = undefined;
      finishFlight();
      clearRail();
    }
    queueRefresh();
  });
  refresh();
}

if (document.body.classList.contains('arcade-booting')) {
  document.addEventListener('pixel-interface-ready', initialize, { once: true });
} else {
  initialize();
}
