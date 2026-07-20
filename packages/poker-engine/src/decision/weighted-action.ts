/**
 * Weighted fold/call/raise selection - client.md explicitly asks for
 * "weighted decisions rather than completely fixed actions" (§9), with
 * example distributions like {fold: 0.1, call: 0.75, raise: 0.15} for one
 * pair against a 33% pot bet.
 */
export interface ActionWeights {
  fold: number;
  call: number;
  raise: number;
}

export function normalizeWeights(w: ActionWeights): ActionWeights {
  const total = w.fold + w.call + w.raise;
  if (total <= 0) return { fold: 0, call: 1, raise: 0 };
  return { fold: w.fold / total, call: w.call / total, raise: w.raise / total };
}

/**
 * Caps the fold weight at maxFold, moving any excess onto the call weight
 * (never onto raise - a hand too weak to fold shouldn't suddenly be pushed
 * toward raising instead). Matches client.md §3's per-category maximum
 * fold frequencies.
 */
export function capFoldWeight(w: ActionWeights, maxFold: number): ActionWeights {
  if (w.fold <= maxFold) return w;
  const excess = w.fold - maxFold;
  return { fold: maxFold, call: w.call + excess, raise: w.raise };
}

/**
 * Scales the fold weight by `factor`, pulling the difference from (or
 * giving it back to) call first and raise second. Clamped to [0, 1] and
 * never lets call/raise go negative - a naive `fold *= factor` can overshoot
 * past 1 when the base fold is already high and factor > 1 (e.g. river +
 * multiway modifiers stacking on an already-90%-fold weak-pair weight),
 * which would otherwise leave call negative and corrupt every downstream
 * probability.
 */
export function scaleFoldWeight(w: ActionWeights, factor: number): ActionWeights {
  const targetFold = Math.max(0, Math.min(1, w.fold * factor));
  let delta = targetFold - w.fold; // positive = fold growing, must come from call/raise
  let call = w.call;
  let raise = w.raise;

  if (delta > 0) {
    const fromCall = Math.min(call, delta);
    call -= fromCall;
    delta -= fromCall;
    const fromRaise = Math.min(raise, delta);
    raise -= fromRaise;
    delta -= fromRaise;
    // If call and raise are both already exhausted, fold can't fully reach
    // its target - settle for however much was actually freed up.
    return { fold: targetFold - delta, call, raise };
  }

  // fold shrinking (factor < 1) - the freed-up weight goes to call.
  return { fold: targetFold, call: call - delta, raise };
}

export function pickWeightedAction(w: ActionWeights, rng: () => number = Math.random): 'fold' | 'call' | 'raise' {
  const n = normalizeWeights(w);
  const r = rng();
  if (r < n.fold) return 'fold';
  if (r < n.fold + n.call) return 'call';
  return 'raise';
}
