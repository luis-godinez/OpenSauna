import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite } from '../jest.setup';

import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory } from 'homebridge';

describe('OpenSaunaAccessory Lights Test', () => {
  let platform: OpenSaunaPlatform;
  let accessory: PlatformAccessory;
  let saunaAccessory: OpenSaunaAccessory;

  beforeEach(() => {
    jest.useFakeTimers(); // Enable fake timers for this test suite
    jest.clearAllMocks();
    ({ platform, accessory, saunaAccessory } = createTestPlatformAndAccessory());
  });

  afterEach(() => {
    saunaAccessory.clearIntervalsAndTimeouts(); // Ensure all timers are cleared
    jest.runAllTimers(); // Run and clear any pending timers
    jest.clearAllTimers(); // Clear any remaining timers
    process.removeAllListeners('exit');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  });

  test('should turn on the light when lightPowerSwitch is set to true', () => {
    const lightPins = saunaConfig.relayPins.find((config) => config.system === 'light');
    const lightPin = lightPins?.GPIO[0];

    if (lightPin !== undefined) {
      // Simulate turning the light on
      saunaAccessory['setPowerState']('light', true);

      // Verify that the light pin was turned on
      expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 1); // Light on
    } else {
      throw new Error('Light pin is undefined');
    }
  });

  test('should turn off the light when lightPowerSwitch is set to false', () => {
    const lightPins = saunaConfig.relayPins.find((config) => config.system === 'light');
    const lightPin = lightPins?.GPIO[0];

    if (lightPin !== undefined) {
      // Simulate turning the light off
      saunaAccessory['setPowerState']('light', false);

      // Verify that the light pin was turned off
      expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 0); // Light off
    } else {
      throw new Error('Light pin is undefined');
    }
  });
});
