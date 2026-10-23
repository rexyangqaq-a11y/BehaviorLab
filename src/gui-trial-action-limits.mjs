/** Conservative repeat guard, not a claim to infer semantic GUI progress. */
export function createRepeatedActionGuard(maxIdentical = 2) {
  let previous, repeats = 0;
  return action => {
    const fingerprint = JSON.stringify(action);
    repeats = fingerprint === previous ? repeats + 1 : 1;
    previous = fingerprint;
    if (repeats > maxIdentical) throw new Error('Repeated identical action limit; stop for fresh observation and review');
  };
}
