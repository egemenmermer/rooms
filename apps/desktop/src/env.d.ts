import type { DesktopBridge } from '@rooms/contracts';
declare global {
  interface Window {
    rooms?: DesktopBridge;
  }
}
