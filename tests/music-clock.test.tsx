// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {MusicPlaybackClock} from '../apps/desktop/src/MusicDJ';
afterEach(()=>{cleanup();vi.useRealTimers();});
it('advances each second between snapshots, bounds stale estimates, and clamps duration',()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','Date','performance']});
 render(<MusicPlaybackClock position={12} duration={60} playing receivedAt={Date.now()}/>);
 expect(screen.getByLabelText('Parça süresi').textContent).toBe('0:12 / 1:00');
 act(()=>vi.advanceTimersByTime(1000));expect(screen.getByLabelText('Parça süresi').textContent).toBe('0:13 / 1:00');
 act(()=>vi.advanceTimersByTime(1000));expect(screen.getByLabelText('Parça süresi').textContent).toBe('0:14 / 1:00');
 act(()=>vi.advanceTimersByTime(30000));expect(screen.getByLabelText('Parça süresi').textContent).toBe('0:18 / 1:00');
 cleanup();render(<MusicPlaybackClock position={59} duration={60} playing receivedAt={Date.now()}/>);
 act(()=>vi.advanceTimersByTime(3000));expect(screen.getByLabelText('Parça süresi').textContent).toBe('1:00 / 1:00');
});
it('resets to an authoritative pause or new track and clears its update timer',()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','Date','performance']});
 const view=render(<MusicPlaybackClock key="playing" position={12} duration={60} playing receivedAt={Date.now()}/>);
 act(()=>vi.advanceTimersByTime(2000));
 view.rerender(<MusicPlaybackClock key="paused" position={13.5} duration={60} playing={false} receivedAt={Date.now()}/>);
 act(()=>vi.advanceTimersByTime(10000));expect(screen.getByLabelText('Parça süresi').textContent).toBe('0:13 / 1:00');
 expect(vi.getTimerCount()).toBe(0);
 view.rerender(<MusicPlaybackClock key="new-track" position={0} duration={180} playing receivedAt={Date.now()}/>);
 expect(screen.getByLabelText('Parça süresi').textContent).toBe('0:00 / 3:00');
 view.unmount();expect(vi.getTimerCount()).toBe(0);
});
