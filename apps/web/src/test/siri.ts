import { Capacitor } from '@capacitor/core';
import { vi } from 'vitest';

/*
 * The shared fake iPhone-app environment for Siri on the device. Import this module BEFORE anything
 * that reaches `lib/siriOnDevice` (the page, the module): it registers the mock, and a module that is
 * already loaded keeps the real one.
 *
 * - Keychain plugin: `registerPlugin('SiriKeychain')` returns `keychain`, a fake (set, clear, get,
 *   updateApiOrigin) that keeps one item
 *   in `keychain.item`. Other plugins keep their real registration.
 * - Platform: `fakeNativeIos()` spies on Capacitor so the app reports as the iOS app.
 *
 * Call `resetSiriEnvironment()` in `beforeEach`, and `vi.restoreAllMocks()` in `afterEach`.
 */

export type KeychainItem = {
  secret: string;
  tokenId: string;
  memberId: string;
  apiOrigin: string;
};

export const keychain = {
  item: null as KeychainItem | null,
  set: vi.fn(),
  clear: vi.fn(),
  get: vi.fn(),
  updateApiOrigin: vi.fn(),
};

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return {
    ...actual,
    registerPlugin: ((name: string, ...rest: unknown[]) =>
      name === 'SiriKeychain'
        ? keychain
        : (actual.registerPlugin as (...args: unknown[]) => unknown)(
            name,
            ...rest,
          )) as typeof actual.registerPlugin,
  };
});

/** An empty, working fake Keychain. */
export function resetSiriEnvironment() {
  keychain.item = null;
  keychain.set.mockReset().mockImplementation(async (item: KeychainItem) => {
    keychain.item = item;
  });
  keychain.clear.mockReset().mockImplementation(async () => {
    keychain.item = null;
  });
  keychain.get.mockReset().mockImplementation(async () => ({
    tokenId: keychain.item?.tokenId,
    memberId: keychain.item?.memberId,
    apiOrigin: keychain.item?.apiOrigin,
  }));
  keychain.updateApiOrigin
    .mockReset()
    .mockImplementation(async ({ apiOrigin }: { apiOrigin: string }) => {
      if (keychain.item) keychain.item = { ...keychain.item, apiOrigin };
    });
}

/** Makes the app report as the iOS app. */
export function fakeNativeIos() {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
}
