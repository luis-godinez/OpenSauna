import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite } from '../jest.setup';
import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory } from 'homebridge';

describe('OpenSaunaAccessory Safety Test', () => {
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

  const saunarelayPin = saunaConfig.relayPins.find((config) => config.system === 'sauna');
  const lightConfig = saunaConfig.relayPins.find((config) => config.system === 'light');

  test('controller overheat: turn off all relays and flash lights if PCB temperature exceeds safety limit', () => {
    // Simulate PCB temperature exceeding the safety limit
    saunaAccessory['monitorPcbTemperatureSafety'](saunaConfig.controllerSafetyTemperature + 10);

    saunaConfig.relayPins.forEach((config) => {
      config.GPIO.forEach((pin: number) => {
        expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off power
      });
    });

    // Check for flashing sequence
    const flashingSequence = 10 * 2; // 10 flashes (on + off)
    const expectedCalls =
      saunaConfig.relayPins.reduce((count, config) => count + config.GPIO.length, 0) +
      flashingSequence;
    expect(mockDigitalWrite).toHaveBeenCalledTimes(expectedCalls); // Flashing lights + turn off commands
  });

  test('sauna overheat: turn off sauna if it exceeds max safety temperature and flash lights', () => {
    // Ensure the steam system is off at the start of the test
    saunaAccessory['handleStateSet']('steam', false);

    // Mock the handleStateSet function to prevent system switching logic
    saunaAccessory['handleStateSet']('sauna', true);

    if (lightConfig) {
      saunaAccessory['setPowerState']('light', true);
    }

    // Simulate exceeding the max temperature
    saunaAccessory['handleTemperatureControl']('sauna', 130); // Exceeds max temperature

    saunarelayPin?.GPIO.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off sauna power
    });

    // Check for flashing sequence
    const flashingSequence = 10 * 2; // 10 flashes (on + off)
    const expectedCalls = (saunarelayPin?.GPIO.length || 0) + flashingSequence + 1; // plus 1 for light turned on
    expect(mockDigitalWrite).toHaveBeenCalledTimes(expectedCalls);
  });

  test('no temperature: no power if no signal from any temperature sensor', () => {
    saunaAccessory['startSystem']('sauna');

    // Simulate no signal
    saunaAccessory['handleTemperatureControl']('sauna', NaN);

    saunarelayPin?.GPIO.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Ensure sauna power is off
    });
  });

  test('invalid temperature: no power if invalid temperature due to disconnected NTC', () => {
    saunaAccessory['startSystem']('sauna');

    // Simulate invalid temperature
    saunaAccessory['handleTemperatureControl']('sauna', -50);

    saunarelayPin?.GPIO.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Ensure sauna power is off
    });
  });
});
