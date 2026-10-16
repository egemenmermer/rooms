import { resolve } from 'node:path';

/** Repository root; Electron is launched from here so `.` resolves to the built app. */
export const repoRoot = resolve(__dirname, '../../..');
export const e2eRoot = resolve(repoRoot, '.local/e2e');
export const stackState = resolve(e2eRoot, 'stack');
export const runFile = resolve(e2eRoot, 'run.json');

const httpPort = process.env.ROOMS_E2E_HTTP_PORT ?? '4100';
const apiPort = process.env.ROOMS_E2E_API_PORT ?? '4101';
const mongoPort = process.env.ROOMS_E2E_MONGO_PORT ?? '4102';

/** The only server this suite talks to. Loopback by construction; see assertLoopback. */
export const stack = {
  /** Public community origin, exactly what a member types into the client. */
  serverUrl: `http://127.0.0.1:${httpPort}`,
  /** Raw upstream API used only for test arrangement (the public proxy blocks account creation). */
  rawApi: `http://127.0.0.1:${apiPort}`,
  mongoUrl: `mongodb://127.0.0.1:${mongoPort}/revolt?directConnection=true`,
  accessUrl: `http://127.0.0.1:${httpPort}/rooms-access`,
  activitiesUrl: `http://127.0.0.1:${httpPort}/rooms-activities`,
  registrationLedger: resolve(stackState, 'access/registration-invites.json'),
};

export function assertLoopback() {
  for (const value of [stack.serverUrl, stack.rawApi, stack.mongoUrl]) {
    const host = new URL(value).hostname;
    if (host !== '127.0.0.1')
      throw new Error(`The e2e suite only targets the local disposable stack, not ${host}.`);
  }
}
