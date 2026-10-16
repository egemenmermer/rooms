/** This listener turned the person down to zero, so they are not heard here even when speaking. */
export const silencedHere = (person: { local?: unknown; volume?: unknown }) =>
  !person.local && person.volume === 0;
