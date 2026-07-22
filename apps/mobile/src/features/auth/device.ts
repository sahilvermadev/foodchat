import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { MobileDevice } from './types';

const INSTALLATION_KEY = 'rekky.installation-id.v1';

const newInstallationId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export async function getMobileDevice(): Promise<MobileDevice> {
  let installationId = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (!installationId) {
    installationId = newInstallationId();
    await SecureStore.setItemAsync(INSTALLATION_KEY, installationId);
  }
  return {
    installationId,
    deviceName: Device.deviceName ?? `${Platform.OS} device`,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: Constants.expoConfig?.version ?? '0.1.0',
  };
}
