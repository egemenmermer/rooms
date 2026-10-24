import { commandSchema, type ActivityResponse } from '@rooms/activity-protocol';
import { StoatError } from '@rooms/stoat';

/** Retry only an explicit revision precondition rejection; never uncertain writes. */
export async function postActivityCommand(
  url: string,
  roomId: string,
  token: string,
  input: unknown,
  fetcher: typeof fetch = fetch,
  assertSession: () => void = () => {},
): Promise<ActivityResponse> {
  let envelope = commandSchema.parse(input);
  for (let attempt = 0; attempt < 5; attempt++) {
    assertSession();
    const response = await fetcher(url + '/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(envelope),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    const value = await response.json().catch(() => null);
    if (response.ok) {
      assertSession();
      if (
        value?.protocolVersion !== 1 ||
        value.room?.roomId !== roomId ||
        !Number.isSafeInteger(value.room?.revision) ||
        value.room.revision < 0
      )
        throw new StoatError(502, 'INVALID_ACTIVITY_RESPONSE');
      return value as ActivityResponse;
    }
    if (response.status === 409 && value?.error === 'REVISION_CONFLICT' && attempt < 4) {
      assertSession();
      const latest = await fetcher(url, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
      if (!latest.ok) throw new StoatError(latest.status, 'ACTIVITY_ACCESS_DENIED');
      const snapshot = await latest.json();
      if (
        snapshot?.protocolVersion !== 1 ||
        snapshot.room?.roomId !== roomId ||
        !Number.isSafeInteger(snapshot.room?.revision) ||
        snapshot.room.revision < 0
      )
        throw new StoatError(502, 'INVALID_ACTIVITY_RESPONSE');
      // Keep the original identity and payload so backend receipt deduplication still applies.
      envelope = { ...envelope, expectedRevision: snapshot.room.revision };
      continue;
    }
    const code =
      typeof value?.error === 'string' && /^[A-Z_]{1,64}$/.test(value.error)
        ? value.error
        : 'ACTIVITY_ACCESS_DENIED';
    const failure = new StoatError(response.status, code);
    // Electron serializes messages rather than custom Error properties. Preserve only bounded public codes.
    if (typeof value?.error === 'string' && /^[A-Z_]{1,64}$/.test(value.error))
      failure.message = code;
    throw failure;
  }
  throw new StoatError(409, 'REVISION_CONFLICT');
}

/** Bounded reads cannot cross a room/session boundary after an asynchronous fetch. */
export async function getActivitySnapshot(
  url: string,
  roomId: string,
  token: string,
  fetcher: typeof fetch = fetch,
  assertSession: () => void = () => {},
): Promise<ActivityResponse> {
  assertSession();
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    assertSession();
    const failure = new StoatError(503, 'ACTIVITY_SERVICE_UNAVAILABLE');
    failure.message = 'The activity service is unavailable. It will reconnect automatically.';
    throw failure;
  }
  const value = await response.json().catch(() => null);
  assertSession();
  if (!response.ok) {
    const code =
      typeof value?.error === 'string' && /^[A-Z_]{1,64}$/.test(value.error)
        ? value.error
        : 'ACTIVITY_ACCESS_DENIED';
    const failure = new StoatError(response.status, code);
    if (response.status >= 500)
      failure.message = 'The activity service is unavailable. It will reconnect automatically.';
    throw failure;
  }
  if (
    value?.protocolVersion !== 1 ||
    value.room?.roomId !== roomId ||
    !Number.isSafeInteger(value.room?.revision) ||
    value.room.revision < 0
  )
    throw new StoatError(502, 'INVALID_ACTIVITY_RESPONSE');
  return value as ActivityResponse;
}
