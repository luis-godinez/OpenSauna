import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite, mockRead } from '../jest.setup';
import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory } from 'homebridge';

describe('OpenSaunaAccessory Sauna Test', () => {
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

  it('should turn on sauna when switching to HEAT mode and sauna is not running', () => {
    saunaAccessory['saunaRunning'] = false; // Ensure sauna is off

    (saunaAccessory as any).handleStateSet('sauna',platform.Characteristic.TargetHeatingCoolingState.HEAT);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn on
    });
  });

  it('should not turn on sauna if already running when switching to HEAT mode', () => {
    saunaAccessory['saunaRunning'] = true; // Mock sauna already running

    (saunaAccessory as any).handleStateSet('sauna',platform.Characteristic.TargetHeatingCoolingState.HEAT);

    expect(mockDigitalWrite).not.toHaveBeenCalled(); // No GPIO change expected
  });

  it('should not turn off sauna if already off when switching to OFF mode', () => {
    saunaAccessory['saunaRunning'] = false; // Sauna is off

    (saunaAccessory as any).handleStateSet('sauna',platform.Characteristic.TargetHeatingCoolingState.OFF);

    expect(mockDigitalWrite).not.toHaveBeenCalled(); // No GPIO change expected
  });

  it('should correctly set and restore target temperature when switching to HEAT mode', () => {
    saunaAccessory['saunaRunning'] = false; // Sauna is not running

    const thermostatService = accessory.getService('sauna-thermostat');
    thermostatService?.getCharacteristic(platform.Characteristic.TargetTemperature).updateValue(0);  // Initial temperature is 0
    (saunaAccessory as any).handleStateSet('sauna',1); // Turn sauna power on

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn on
    });
    (saunaAccessory as any).handleTemperatureSet('sauna',75); // Set temperature

    expect(thermostatService?.getCharacteristic(platform.Characteristic.TargetTemperature).value).toBe(75); // Verify temperature


    (saunaAccessory as any).handleStateSet('sauna',0); // Turn sauna power off

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });

    (saunaAccessory as any).handleStateSet('sauna',1); // Turn sauna power on
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn on
    });

    expect(thermostatService?.getCharacteristic(platform.Characteristic.TargetTemperature).value).toBe(75); // Verify last temperature


  });

  it('should keep sauna heater on when door opens if saunaOnWhileDoorOpen is true', () => {
    saunaConfig.saunaOnWhileDoorOpen = true;
    saunaAccessory['saunaRunning'] = false; // Sauna is not running

    (saunaAccessory as any).handleStateSet('sauna',1); // Turn sauna power on

    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should remain on
    });
  });

  it('should turn off sauna heater when door opens if saunaOnWhileDoorOpen is false and inverseSaunaDoor is false', () => {
    saunaConfig.saunaOnWhileDoorOpen = false;
    saunaConfig.inverseSaunaDoor = false;
    saunaAccessory['saunaRunning'] = true; // Sauna is already on

    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });

    (saunaAccessory as any).handleDoorStateChange('sauna', false);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn back on
    });
  });

  it('should turn off sauna heater when door opens if saunaOnWhileDoorOpen is false and inverseSaunaDoor is true', () => {
    saunaConfig.saunaOnWhileDoorOpen = false;
    saunaConfig.inverseSaunaDoor = true;
    saunaAccessory['saunaRunning'] = true; // Sauna is already on

    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });

    (saunaAccessory as any).handleDoorStateChange('sauna', false);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn back on
    });
  });

  it('should turn off sauna after saunaTimeout period', () => {
    const highTemperature = saunaConfig.saunaMaxTemperature - 5;
    mockDigitalWrite.mockClear();
  
    // Mock the ADC read function to simulate a high temperature reading
    (saunaAccessory as any).adc.read = jest.fn((callback) => {
      callback(null, { value: highTemperature });
    });

    (saunaAccessory as any).handleStateSet('sauna',1); // Start sauna

    jest.advanceTimersByTime(saunaConfig.saunaTimeout * 1000);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off after timeout
    });
  });

  it('should turn off sauna if temperature exceeds maxTemperature', () => {
    const highTemperature = saunaConfig.saunaMaxTemperature + 5;
    mockDigitalWrite.mockClear();
  
    // Mock the ADC read function to simulate a high temperature reading
    (saunaAccessory as any).adc.read = jest.fn((callback) => {
      callback(null, { value: highTemperature });
    });
  
    // Start the sauna
    (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT);
  
    // Advance timers to simulate some time passing
    jest.advanceTimersByTime(5000);
  
    // Handle the high temperature scenario
    (saunaAccessory as any).handleTemperatureControl(saunaConfig.auxSensors[1], highTemperature);
  
    // Expect that the sauna was turned off due to the high temperature
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });
  });
});