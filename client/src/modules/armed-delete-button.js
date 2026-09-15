import { renderIcons } from './icons.js';

export function createArmedDeleteButton(className, label, onConfirm) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = '<span data-lucide="x" aria-hidden="true"></span>';

  let timer = null;
  const disarm = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    btn.classList.remove('is-armed');
    btn.innerHTML = '<span data-lucide="x" aria-hidden="true"></span>';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    renderIcons();
  };

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (btn.classList.contains('is-armed')) {
      if (timer) { clearTimeout(timer); timer = null; }
      onConfirm();
      return;
    }
    btn.classList.add('is-armed');
    btn.textContent = '!';
    btn.title = 'Click again to confirm';
    btn.setAttribute('aria-label', 'Click again to confirm delete');
    timer = setTimeout(disarm, 3000);
  });
  btn.addEventListener('blur', disarm);

  return btn;
}
