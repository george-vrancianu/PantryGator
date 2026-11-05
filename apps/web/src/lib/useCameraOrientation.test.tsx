import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { stubScreen } from '../test/screen';
import { useCameraOrientation } from './useCameraOrientation';

describe('useCameraOrientation', () => {
  it('follows a rotation', () => {
    const s = stubScreen({ width: 390, height: 844 });
    const { result } = renderHook(() => useCameraOrientation());
    expect(result.current.rotateBack).toBe(0);
    act(() => s.rotate(90));
    expect(result.current.rotateBack).toBe(90);
  });

  it('keeps the same reading when one rotation fires change, orientationchange and resize', () => {
    const s = stubScreen({ width: 390, height: 844 });
    const { result } = renderHook(() => useCameraOrientation());
    act(() => s.rotate(90));
    const reading = result.current;
    act(() => s.setAngle(90));
    act(() => window.dispatchEvent(new Event('resize')));
    act(() => window.dispatchEvent(new Event('orientationchange')));
    expect(result.current).toBe(reading);
  });
});
