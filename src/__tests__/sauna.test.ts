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

  const saunaPowerPins = saunaConfig.relayPins.find(
    (config) => config.system === 'sauna'
  )?.GPIO;

  it('should turn on sauna when switching to HEAT mode and sauna is not running', () => {
    (saunaAccessory as any).handleStateSet(
      'sauna',
      platform.Characteristic.TargetHeatingCoolingState.HEAT
    );

    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn on
    });
  });

  it('should not turn off relays if currently off but target changed from HEAT to OFF', () => {
    saunaAccessory['handleTemperatureSet']('sauna', 75);

    (saunaAccessory as any).handleStateSet(
      'sauna',
      platform.Characteristic.TargetHeatingCoolingState.HEAT
    );

    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1);
    });

    // Turn off heater when above setpoint
    saunaAccessory['handleTemperatureControl']('sauna', 80);
    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0);
    });

    (saunaAccessory as any).handleStateSet(
      'sauna',
      platform.Characteristic.TargetHeatingCoolingState.OFF
    );

    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0);
    });
  });

  it('should keep sauna heater on when door opens if saunaOnWhileDoorOpen is true', () => {
    saunaConfig.saunaOnWhileDoorOpen = true;

    (saunaAccessory as any).handleStateSet(
      'sauna',
      platform.Characteristic.TargetHeatingCoolingState.HEAT
    ); // Turn sauna power on

    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should remain on
    });
  });

  it('should turn off sauna heater when door opens if saunaOnWhileDoorOpen is false and inverseSaunaDoor is false', () => {
    saunaConfig.saunaOnWhileDoorOpen = false;
    saunaConfig.inverseSaunaDoor = false;

    // Ensure that the door monitoring is active
    (saunaAccessory as any).monitorDoors('sauna', true);

    // Simulate door open
    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });

    // Simulate door close
    (saunaAccessory as any).handleDoorStateChange('sauna', false);

    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn back on
    });
  });

  it('should turn off sauna heater when door opens if saunaOnWhileDoorOpen is false and inverseSaunaDoor is true', () => {
    saunaConfig.saunaOnWhileDoorOpen = false;
    saunaConfig.inverseSaunaDoor = true;

    (saunaAccessory as any).handleStateSet(
      'sauna',
      platform.Characteristic.TargetHeatingCoolingState.HEAT
    );
    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    console.log('expect sauna on');
    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });

    (saunaAccessory as any).handleDoorStateChange('sauna', false);

    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn back on
    });
  });

  it('should turn off sauna after saunaTimeout period', () => {
    const safeTemperature = saunaConfig.saunaMaxTemperature - 5;
    mockDigitalWrite.mockClear();

    // Mock the ADC read function to simulate a high temperature reading
    (saunaAccessory as any).adc.read = jest.fn((callback) => {
      callback(null, { value: safeTemperature });
    });

    (saunaAccessory as any).handleStateSet(
      'sauna',
      platform.Characteristic.TargetHeatingCoolingState.HEAT
    ); // Start sauna

    jest.advanceTimersByTime(saunaConfig.saunaTimeout * 1000);

    saunaPowerPins?.forEach((pin: number) => {
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
    (saunaAccessory as any).handleStateSet(
      'sauna',
      platform.Characteristic.TargetHeatingCoolingState.HEAT
    );

    // Advance timers to simulate some time passing
    jest.advanceTimersByTime(5000);

    // Handle the high temperature scenario
    (saunaAccessory as any).handleTemperatureControl('sauna', highTemperature);

    // Expect that the sauna was turned off due to the high temperature
    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });
  });

  it('Temperature regulation when in HEAT mode', () => {
    saunaAccessory['handleTemperatureSet']('sauna', 75);

    (saunaAccessory as any).handleStateSet(
      'sauna',
      platform.Characteristic.TargetHeatingCoolingState.HEAT
    );

    // Turn off heater when above setpoint
    saunaAccessory['handleTemperatureControl']('sauna', 80);
    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1);
    });

    // Turn on heater when below setpoint
    saunaAccessory['handleTemperatureControl']('sauna', 70);

    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });

    // Turn off heater when above setpoint
    saunaAccessory['handleTemperatureControl']('sauna', 80);
    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1);
    });

    // Turn on heater when below setpoint
    saunaAccessory['handleTemperatureControl']('sauna', 70);

    saunaPowerPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });
  });
});
