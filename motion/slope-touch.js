const controls = document.querySelector('#slope-touch');
const canvas = document.querySelector('#unity-canvas');
const pressed = new Map();

function steer(key, type) {
  const code = key === 'ArrowLeft' ? 37 : 39;
  canvas.dispatchEvent(new KeyboardEvent(type, {
    key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true
  }));
}

function release(pointer) {
  const key = pressed.get(pointer);
  if (!key) return;
  pressed.delete(pointer);
  if (![...pressed.values()].includes(key)) steer(key, 'keyup');
}

for (const button of controls.querySelectorAll('button')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    canvas.focus({preventScroll: true});
    button.setPointerCapture(event.pointerId);
    const key = button.dataset.key;
    if (![...pressed.values()].includes(key)) steer(key, 'keydown');
    pressed.set(event.pointerId, key);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => release(event.pointerId));
  }
}

window.addEventListener('blur', () => {
  for (const pointer of pressed.keys()) release(pointer);
});
