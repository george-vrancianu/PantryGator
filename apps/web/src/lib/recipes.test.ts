import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { retryUnlessGone } from './recipes';

describe('retryUnlessGone', () => {
  it('does not retry a Recipe that is not there or not visible, which waiting cannot bring back', () => {
    expect(retryUnlessGone(0, new ApiError('recipes.not_found', 404))).toBe(
      false,
    );
    expect(retryUnlessGone(0, new ApiError('forbidden', 403))).toBe(false);
  });

  it('retries a failure that may pass, up to twice', () => {
    expect(retryUnlessGone(0, new ApiError('unknown', 500))).toBe(true);
    expect(retryUnlessGone(1, new TypeError('network'))).toBe(true);
    expect(retryUnlessGone(2, new ApiError('unknown', 500))).toBe(false);
  });
});
