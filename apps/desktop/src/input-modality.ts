/** Remember the initiating input so keyboard workflows never wait for motion. */
export function installInputModality(
  root = document.documentElement,
  target: Document = document,
): () => void {
  root.dataset.input = 'keyboard';
  const pointer = () => {
    root.dataset.input = 'pointer';
  };
  const keyboard = (event: KeyboardEvent) => {
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) root.dataset.input = 'keyboard';
  };
  target.addEventListener('pointerdown', pointer, true);
  target.addEventListener('keydown', keyboard, true);
  return () => {
    target.removeEventListener('pointerdown', pointer, true);
    target.removeEventListener('keydown', keyboard, true);
  };
}
