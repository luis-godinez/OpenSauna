import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite } from '../jest.setup';

import { OpenSpaAccessory } from '../platformAccessory';
import { OpenSpaPlatform } from '../platform';
import { PlatformAccessory } from 'homebridge';

describe('OpenSpaAccessory Sauna Test', () => {
  let platform: OpenSpaPlatform;
  let accessory: PlatformAccessory;
  let saunaAccessory: OpenSpaAccessory;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    jest.useFakeTimers();
    jest.clearAllMocks();
    ({ platform, accessory, saunaAccessory } = createTestPlatformAndAccessory());
  });

  afterEach(() => {
    saunaAccessory.clearIntervalsAndTimeouts();
    jest.runAllTimers();
    jest.clearAllTimers();
    process.removeAllListeners('exit');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  });

  const saunaPins = saunaConfig.relayPins.find((config) => config.system === 'sauna')?.GPIO;
  const steamPins = saunaConfig.relayPins.find((config) => config.system === 'steam')?.GPIO;

  it('should start the sauna and prevent the steamer from turning on until the sauna is turned off', async () => {
    // Turn on the sauna
    await (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT);

    // Expect sauna relays to turn on
    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1);
    });

    // Turn on steam
    await (saunaAccessory as any).handleStateSet('steam', platform.Characteristic.TargetHeatingCoolingState.HEAT);

    // Expect sauna relays to turn off
    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0);
    });

    // Expect steam relays to turn off
    steamPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1);
    });
  });

  it('should turn on sauna when switching to HEAT mode and sauna is not running', () => {
    (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn on
    });
  });

  it('should not turn off relays if currently off but target changed from HEAT to OFF', () => {
    saunaAccessory['handleTemperatureSet']('sauna', 75);

    (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1);
    });

    // Turn off heater when above setpoint
    saunaAccessory['handleTemperatureControl']('sauna', 80);
    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0);
    });

    (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.OFF);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0);
    });
  });

  it('should keep sauna heater on when door opens if saunaOnWhileDoorOpen is true', () => {
    saunaConfig.saunaOnWhileDoorOpen = true;

    (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT); // Turn sauna power on

    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should remain on
    });
  });

  it('should turn off sauna heater when door opens if saunaOnWhileDoorOpen is false and saunaDoorNO is false', () => {
    saunaConfig.saunaOnWhileDoorOpen = false;
    saunaConfig.saunaDoorNO = false;

    // Ensure that the door monitoring is active
    (saunaAccessory as any).monitorDoors('sauna', true);

    // Simulate door open
    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });

    // Simulate door close
    (saunaAccessory as any).handleDoorStateChange('sauna', false);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn back on
    });
  });

  it('should turn off sauna heater when door opens if saunaOnWhileDoorOpen is false and saunaDoorNO is true', () => {
    saunaConfig.saunaOnWhileDoorOpen = false;
    saunaConfig.saunaDoorNO = true;

    (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT);
    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });

    (saunaAccessory as any).handleDoorStateChange('sauna', false);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn back on
    });
  });

  it('should turn off sauna after saunaTimeout period', () => {
    const safeTemperature = saunaConfig.saunaMaxTemperature - 5;
    mockDigitalWrite.mockClear();

    (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT); // Start sauna

    jest.advanceTimersByTime(saunaConfig.saunaTimeout * 1000);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off after timeout
    });
  });

  it('should turn off sauna if temperature exceeds maxTemperature', () => {
    const highTemperature = saunaConfig.saunaMaxTemperature + 5;
    mockDigitalWrite.mockClear();

    (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT); // Start sauna

    // Manually trigger the temperature control logic
    (saunaAccessory as any).handleTemperatureControl('sauna', highTemperature);

    jest.advanceTimersByTime(5000);

    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Sauna should turn off
    });
  });

  it('Temperature regulation when in HEAT mode', () => {
    saunaAccessory['handleTemperatureSet']('sauna', 75);

    (saunaAccessory as any).handleStateSet('sauna', platform.Characteristic.TargetHeatingCoolingState.HEAT);

    // Simulate temperature going above the setpoint
    saunaAccessory['handleTemperatureControl']('sauna', 80);
    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });

    // Simulate temperature going below the setpoint
    saunaAccessory['handleTemperatureControl']('sauna', 70);
    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should turn on
    });

    // Simulate temperature going above the setpoint again
    saunaAccessory['handleTemperatureControl']('sauna', 80);
    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });

    // Simulate temperature going below the setpoint again
    saunaAccessory['handleTemperatureControl']('sauna', 70);
    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should turn on
    });
  });
});
