// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PushToTalkKeyField } from '../apps/desktop/src/PushToTalkKeyField';
afterEach(cleanup);

it('records the next key combination as the push-to-talk shortcut', () => {
  const onChange = vi.fn();
  render(<PushToTalkKeyField value="Ctrl+Shift+Space" onChange={onChange} />);
  expect(screen.getByText('Ctrl Shift Space')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }));
  fireEvent.keyDown(window, { code: 'ShiftLeft', shiftKey: true });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { code: 'KeyV', altKey: true });
  expect(onChange).toHaveBeenCalledWith('Alt+KeyV');
});

it('cancels capture on Escape without changing the shortcut', () => {
  const onChange = vi.fn();
  const outside = vi.fn();
  window.addEventListener('keydown', outside);
  render(<PushToTalkKeyField value="Alt+KeyV" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }));
  fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });
  expect(onChange).not.toHaveBeenCalled();
  expect(outside).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Değiştir' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Varsayılan' }));
  expect(onChange).toHaveBeenCalledWith('Ctrl+Shift+Space');
  window.removeEventListener('keydown', outside);
});
