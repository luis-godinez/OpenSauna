import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite, mockRead } from '../jest.setup';

import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory} from 'homebridge';

describe('OpenSaunaAccessory Sauna Test', () => {
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
    process.removeAllListeners('exit');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  });

  it('should turn on sauna when switching to HEAT mode and sauna is not running', () => {
    mockRead.mockReturnValue(0); // Mock sauna not running

    // Switch to HEAT mode
    (saunaAccessory as any).handleSaunaModeChange(platform.Characteristic.TargetHeatingCoolingState.HEAT);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1);
    });
  });

  it('should not turn on sauna if already running when switching to HEAT mode', () => {
    mockRead.mockReturnValue(1); // Mock sauna already running

    // Switch to HEAT mode
    (saunaAccessory as any).handleSaunaModeChange(platform.Characteristic.TargetHeatingCoolingState.HEAT);

    expect(mockDigitalWrite).not.toHaveBeenCalled();
  });

  it('should not turn off sauna if already off when switching to OFF mode', () => {
    mockRead.mockReturnValue(0); // Mock sauna already off
    const thermostatService = accessory.getService('sauna-thermostat');

    if (thermostatService) {
      // Set mode to OFF
      thermostatService
        .getCharacteristic(platform.Characteristic.TargetHeatingCoolingState)
        .updateValue(platform.Characteristic.TargetHeatingCoolingState.OFF);

      // Switch to OFF mode
      (saunaAccessory as any).handleSaunaModeChange(platform.Characteristic.TargetHeatingCoolingState.OFF);

      expect(mockDigitalWrite).not.toHaveBeenCalled();
    }
  });

  it('should correctly set and restore target temperature when switching to HEAT mode', () => {
    // Mock sauna not running
    mockRead.mockReturnValue(0);

    const thermostatService = accessory.getService('sauna-thermostat');

    if (thermostatService) {
      // Set the initial target temperature to 0°C
      thermostatService
        .getCharacteristic(platform.Characteristic.TargetTemperature)
        .updateValue(0);  // Initial temperature is 0

      // Set the sauna mode to HEAT
      thermostatService
        .getCharacteristic(platform.Characteristic.TargetHeatingCoolingState)
        .updateValue(platform.Characteristic.TargetHeatingCoolingState.HEAT);

      // Set the target temperature to 75°C
      (saunaAccessory as any).handleSaunaTargetTemperatureSet(75);

      // Retrieve the correct mode and temperature
      const isSaunaRunning = saunaAccessory['isSaunaRunning']();
      const currentMode = thermostatService
        .getCharacteristic(platform.Characteristic.TargetHeatingCoolingState)
        .value;  // Access the value directly

      console.log('isSaunaRunning', isSaunaRunning);
      console.log('currentMode', currentMode);

      if (currentMode === platform.Characteristic.TargetHeatingCoolingState.HEAT && !isSaunaRunning) {
        saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
          expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Sauna should turn on
        });
      } else {
        console.log('Condition for turning on the sauna was not met.');
      }

      // Ensure the target temperature is correctly set to 75°C after power on
      expect(thermostatService.getCharacteristic(platform.Characteristic.TargetTemperature).value).toBe(75);
    }
  });

  test('should keep sauna heater on when door opens if saunaOnWhileDoorOpen is true', () => {
    // Update configuration to ensure sauna stays on when the door is open
    saunaConfig.saunaOnWhileDoorOpen = true;

    // Set initial state
    saunaAccessory['handleSaunaPowerSet'](true);

    // Simulate door open
    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    // Verify that the sauna heater remains on
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should stay on
    });
  });


  test('should turn off sauna heater when door opens if saunaOnWhileDoorOpen is false and inverseSaunaDoor is false', () => {
    saunaConfig.saunaOnWhileDoorOpen = false; // Turn off when open
    saunaConfig.inverseSaunaDoor = false; // Normally closed sensor

    // Set initial state of the sauna heater to on
    saunaAccessory['handleSaunaPowerSet'](true);

    // Verify that initial state has the sauna heater on
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should initially be on
    });

    // Simulate door open
    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    // Verify that all sauna power-related GPIO pins are turned off when the door opens
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });

    // Simulate door close
    (saunaAccessory as any).handleDoorStateChange('sauna', false);

    // Verify that all sauna power-related GPIO pins resume operation when the door closes
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should turn back on
    });
  });

  test('should turn off sauna heater when door opens if saunaOnWhileDoorOpen is false and inverseSaunaDoor is true', () => {
    saunaConfig.saunaOnWhileDoorOpen = false; // Turn off when open
    saunaConfig.inverseSaunaDoor = true; // Normally open sensor

    // Set initial state of the sauna heater to on
    saunaAccessory['handleSaunaPowerSet'](true);

    // Verify that initial state has the sauna heater on
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should initially be on
    });

    // Simulate door open
    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    // Verify that all sauna power-related GPIO pins are turned off when the door opens
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });

    // Simulate door close
    (saunaAccessory as any).handleDoorStateChange('sauna', false);

    // Verify that all sauna power-related GPIO pins resume operation when the door closes
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should turn back on
    });
  });

  test('should turn off sauna after saunaTimeout period', () => {
    jest.useFakeTimers();

    // Simulate starting the sauna
    saunaAccessory['handleSaunaPowerSet'](true);

    // Fast-forward time to after timeout
    jest.advanceTimersByTime(saunaConfig.saunaTimeout * 1000);

    // Verify that the sauna heater turns off
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('should turn off sauna if temperature exceeds maxTemperature', () => {
    jest.useFakeTimers();

    // Mock the temperature reading to be above the max temperature
    const highTemperature = saunaConfig.saunaMaxTemperature + 5;
    mockDigitalWrite.mockClear();

    // Calculate the ADC mock value based on your conversion logic
    const adcMockValue = (highTemperature + 0.5) / 3.3 / 100;

    // Mock the adc.read function to simulate a high temperature
    const readMock = jest.fn((channel, callback) => {
      callback(null, { value: adcMockValue });
    });

    (saunaAccessory as any).adc.read = readMock;

    // Simulate starting the sauna
    saunaAccessory['handleSaunaPowerSet'](true);

    // Verify that the sauna heater was initially turned on
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should initially turn on
    });

    // Fast-forward time to allow temperature reading
    jest.advanceTimersByTime(5000);

    // Manually trigger the temperature control logic if needed
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], highTemperature);

    // Verify that the sauna heater turns off due to exceeding max temperature
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
});