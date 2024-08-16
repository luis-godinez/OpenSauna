import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite } from '../jest.setup';

import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory} from 'homebridge';

describe('OpenSaunaAccessory Safety Test', () => {
  let platform: OpenSaunaPlatform;
  let accessory: PlatformAccessory;
  let saunaAccessory: OpenSaunaAccessory;

  beforeEach(() => {
    jest.useFakeTimers();  // Enable fake timers for this test suite
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

  test('controller overheat: turn off all relays and flash lights if PCB temperature exceeds safety limit', () => {
    // Simulate PCB temperature exceeding the safety limit
    saunaAccessory['monitorPcbTemperatureSafety'](saunaConfig.controllerSafetyTemperature + 10);

    // Expect that all power-related GPIO pins are turned off
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off sauna power
    });
    saunaConfig.gpioPins.steamPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off steam power
    });

    if (saunaConfig.gpioPins.lightPin !== undefined) {
      expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.lightPin, 0); // Lights off
    }
    if (saunaConfig.gpioPins.fanPin !== undefined) {
      expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.fanPin, 0); // Fan off
    }

    // Check for flashing sequence
    const flashingSequence = 10 * 2; // 10 flashes (on + off)
    const expectedCalls =
      saunaConfig.gpioPins.saunaPowerPins.length +
      saunaConfig.gpioPins.steamPowerPins.length +
      2 + // Turn off commands for sauna, steam, light, and fan
      flashingSequence;
    expect(mockDigitalWrite).toHaveBeenCalledTimes(expectedCalls); // Flashing lights + turn off commands
  });

  test('sauna overheat: turn off sauna if it exceeds max safety temperature and flash lights', () => {
    // Ensure light is initially on if it is configured
    if (typeof saunaConfig.gpioPins.lightPin === 'number') {
      saunaAccessory['setPowerState']([saunaConfig.gpioPins.lightPin], true);
    }

    // Simulate exceeding the max temperature
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], 130); // Exceeds max temperature

    // Expect that all sauna power-related GPIO pins are turned off
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off sauna power
    });

    // Flashing sequence for sauna
    const flashingSequence = 10 * 2; // 10 flashes (on + off)
    const expectedOffCommands = saunaConfig.gpioPins.saunaPowerPins.length; // Number of sauna pins
    const expectedCalls = expectedOffCommands + flashingSequence + 1; // +1 for initial light off

    expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.lightPin, 0); // Ensure lights are off after overheat
    expect(mockDigitalWrite).toHaveBeenCalledTimes(expectedCalls);
  });

  test('no temperature: no power if no signal from any temperature sensor', () => {
    saunaAccessory['saunaRunning'] = true; 

    // Simulate no signal
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], NaN);
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Ensure sauna power is off
    });
  });

  test('invalid temperature: no power if invalid temperature due to disconnected NTC', () => {
    saunaAccessory['saunaRunning'] = true; 
    
    // Simulate no signal
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], -50);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Ensure sauna power is off
    });
  });

});