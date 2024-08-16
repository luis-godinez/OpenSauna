import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite, mockRead } from '../jest.setup';

import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory } from 'homebridge';

describe('OpenSaunaAccessory Temperature Regulation Test', () => {
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

  it('should turn on sauna heater when temperature is below target and in HEAT mode', () => {
    // Initialize the accessory with the sauna not running
    saunaAccessory['saunaRunning'] = false; 
    saunaAccessory['lastSaunaTargetTemperature'] = 75; // Set target temperature to 75°C
    
    // Ensure that the sauna is in HEAT mode using the logic inside handleStateSet
    saunaAccessory['handleStateSet']('sauna',saunaAccessory['platform'].Characteristic.TargetHeatingCoolingState.HEAT);
    
    // Simulate a temperature reading below the target
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], 70); // Below target temperature
  
    // Verify that the sauna heater is turned on (GPIO pins set to HIGH)
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should turn on
    });
  });

  it('should turn off sauna heater when temperature reaches target and in HEAT mode', () => {
    saunaAccessory['saunaRunning'] = true; // Ensure sauna is running initially
    saunaAccessory['lastSaunaTargetTemperature'] = 75; // Set target temperature to 75°C

    // Mock current temperature to be above the safety temperature
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], saunaAccessory['lastSaunaTargetTemperature']);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });
  });

  it('should keep sauna heater off when temperature exceeds maxTemperature', () => {
    saunaAccessory['saunaRunning'] = true; // Ensure sauna is running initially
    saunaConfig.saunaMaxTemperature = 80; // Set max temperature to 80°C

    // Mock current temperature to be above the safety temperature
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], saunaConfig.saunaMaxTemperature); // Meet or exceeds

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });
  });

  it('should turn off sauna heater if safety temperature is exceeded', () => {
    saunaAccessory['saunaRunning'] = true; // Ensure sauna is running initially
    saunaConfig.saunaSafetyTemperature = 90; // Set safety temperature to 90°C

    // Mock current temperature to be above the safety temperature
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], 130); // Exceeds max temperature

    // Expect that all sauna power-related GPIO pins are turned off
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off sauna power
    });
  });

  it('should not turn on heater if the sauna is set to OFF mode, even if temperature is below target', () => {
    saunaAccessory['saunaRunning'] = false; // Ensure sauna is not running initially
    saunaAccessory['lastSaunaTargetTemperature'] = 75; // Set target temperature to 75°C

    // Mock current temperature to be below the target
    mockRead.mockReturnValueOnce(0.5); // Mock ADC value corresponding to a temperature below 75°C

    // Simulate the sauna being in OFF mode
    saunaAccessory['handleStateSet']('sauna',platform.Characteristic.TargetHeatingCoolingState.OFF);

    saunaAccessory['monitorTemperatures']();

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).not.toHaveBeenCalled(); // Heater should not turn on
    });
  });

  it('should restore the last target temperature when turning sauna back on', () => {
    saunaAccessory['lastSaunaTargetTemperature'] = 75; // Set last target temperature

    saunaAccessory['handleStateSet']('sauna',platform.Characteristic.TargetHeatingCoolingState.HEAT);

    const saunaService = accessory.getService('sauna-thermostat');
    expect(saunaService?.getCharacteristic(platform.Characteristic.TargetTemperature).value).toBe(75); // Check if the temperature is restored
  });
});