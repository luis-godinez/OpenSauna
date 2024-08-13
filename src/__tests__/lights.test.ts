import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite } from '../jest.setup';

import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory} from 'homebridge';

describe('OpenSaunaAccessory Lights Test', () => {
  let platform: OpenSaunaPlatform;
  let accessory: PlatformAccessory;
  let saunaAccessory: OpenSaunaAccessory;

  beforeEach(() => {
    jest.clearAllMocks();

    // Use the setup function to create instances
    ({ platform, accessory, saunaAccessory } = createTestPlatformAndAccessory());
  });

  afterEach(() => {
    // Ensure cleanup of timers and intervals
    (saunaAccessory as OpenSaunaAccessory).clearIntervalsAndTimeouts();
    jest.clearAllTimers();
  });

  test('should turn on the light when lightPowerSwitch is set to true', () => {
    const lightPin = saunaConfig.gpioPins.lightPin;

    if (lightPin !== undefined) {
      // Simulate turning the light on
      saunaAccessory['setPowerState']([lightPin], true);

      // Verify that the light pin was turned on
      expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 1); // Light on
    } else {
      throw new Error('Light pin is undefined');
    }
  });

  test('should turn off the light when lightPowerSwitch is set to false', () => {
    const lightPin = saunaConfig.gpioPins.lightPin;

    if (lightPin !== undefined) {
      // Simulate turning the light off
      saunaAccessory['setPowerState']([lightPin], false);

      // Verify that the light pin was turned off
      expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 0); // Light off
    } else {
      throw new Error('Light pin is undefined');
    }
  });
});