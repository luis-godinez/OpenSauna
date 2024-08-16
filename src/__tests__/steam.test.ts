import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite } from '../jest.setup';

import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory } from 'homebridge';

describe('OpenSaunaAccessory Steam Test', () => {
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

  it('should start the sauna and prevent the steamer from turning on until the sauna is turned off', async () => {
    // Mock the GPIO write
    mockDigitalWrite.mockImplementation(() => {});

    // Turn on the sauna
    await (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT);

    // Ensure the sauna is running before advancing timers
    expect(saunaAccessory['saunaRunning']).toBe(true);
    console.log('Test Check - Sauna Running:', saunaAccessory['saunaRunning']);

    // Attempt to turn on the steamer
    const steamPromise = (saunaAccessory as any).handleStateSet('steam', platform.Characteristic.TargetHeatingCoolingState.HEAT);

    // Advance timers to simulate the delay for turning off the sauna
    jest.advanceTimersByTime(1500);

    await steamPromise;

    // Now check that the sauna has been turned off before the steamer turns on
    expect(saunaAccessory['saunaRunning']).toBe(false);
    expect(saunaAccessory['steamRunning']).toBe(true);

    // Expect the steamer to be running now that the sauna is off
    expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.steamPowerPins[0], expect.any(Number));
}); // Increase the timeout for this test case to 10 seconds

  it('should turn off the sauna before allowing the steamer to be turned on', async () => {
    jest.useFakeTimers(); // Ensure fake timers are enabled
  
    // Mock the GPIO write
    mockDigitalWrite.mockImplementation(() => {});
  
    // Turn on the sauna
    await (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT);
  
    // Expect the sauna to be running
    expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.saunaPowerPins[0], expect.any(Number));
    expect(saunaAccessory['saunaRunning']).toBe(true);
  
    // Now turn on the steamer, which should turn off the sauna first
    const steamPromise = (saunaAccessory as any).handleStateSet('steam', platform.Characteristic.TargetHeatingCoolingState.HEAT);
  
    // Advance the timers to allow the delay to complete
    jest.advanceTimersByTime(1500);
  
    await steamPromise;
  
    // Expect the sauna to be turned off
    expect(saunaAccessory['saunaRunning']).toBe(false);
    expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.saunaPowerPins[0], expect.any(Number));
  
    // Expect the steamer to be running
    expect(saunaAccessory['steamRunning']).toBe(true);
    expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.steamPowerPins[0], expect.any(Number));
  });
});