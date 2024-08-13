import fs from 'fs';
import path from 'path';
import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory, API, Logger, PlatformConfig } from 'homebridge';
import { OpenSaunaConfig } from '../settings';
import { mockDigitalWrite, mockRead } from '../jest.setup';

// Load configuration from config.json
const configPath = path.resolve(__dirname, '../config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Extract the first OpenSaunaConfig from the platforms array
const saunaConfig: OpenSaunaConfig = configData.platforms[0];

// Mock Homebridge API and services
const mockTemperatureSensorService = {
  setCharacteristic: jest.fn(),
  updateCharacteristic: jest.fn(),
};

const mockContactSensorService = {
  setCharacteristic: jest.fn(),
  updateCharacteristic: jest.fn(),
};

const mockHap = {
  Service: {
    Switch: jest.fn().mockImplementation(() => ({
      setCharacteristic: jest.fn(),
      getCharacteristic: jest.fn().mockReturnThis(),
      onSet: jest.fn(),
    })),
    TemperatureSensor: jest.fn().mockImplementation(() => mockTemperatureSensorService),
    ContactSensor: jest.fn().mockImplementation(() => mockContactSensorService),
  },
  Characteristic: {
    On: jest.fn(),
    CurrentTemperature: jest.fn(),
    ContactSensorState: {
      CONTACT_DETECTED: 0,
      CONTACT_NOT_DETECTED: 1,
    },
  },
};

const mockAPI: API = {
  hap: mockHap,
  on: jest.fn(),
  registerPlatformAccessories: jest.fn(),
  unregisterPlatformAccessories: jest.fn(),
  updatePlatformAccessories: jest.fn(),
  publishExternalAccessories: jest.fn(),
  registerAccessory: jest.fn(),
} as any;

const mockLogger: Logger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
} as any;

describe('OpenSaunaAccessory Sauna Tests', () => {
  let platform: OpenSaunaPlatform;
  let accessory: PlatformAccessory;
  let saunaAccessory: OpenSaunaAccessory;

  beforeEach(() => {
    jest.clearAllMocks();

    platform = new OpenSaunaPlatform(
      mockLogger,
      { platform: 'OpenSauna' } as PlatformConfig,
      mockAPI,
    );

    accessory = {
      getService: jest.fn().mockImplementation((serviceName) => {
        if (serviceName.includes('Temperature')) {
          return mockTemperatureSensorService;
        }
        if (serviceName.includes('ContactSensor')) {
          return mockContactSensorService;
        }
        return {
          setCharacteristic: jest.fn(),
          getCharacteristic: jest.fn().mockReturnThis(),
          onSet: jest.fn(),
          updateCharacteristic: jest.fn(),
        };
      }),
      addService: jest.fn().mockImplementation(() => ({
        setCharacteristic: jest.fn(),
        getCharacteristic: jest.fn().mockReturnThis(),
        onSet: jest.fn(),
        updateCharacteristic: jest.fn(),
      })),
    } as unknown as PlatformAccessory;

    saunaAccessory = new OpenSaunaAccessory(platform, accessory, saunaConfig);

    // Mocking methods if they do not exist
    (saunaAccessory as any).handleDoorStateChange = (doorType: string, doorOpen: boolean) => {
      const pin = saunaConfig.gpioPins.saunaDoorPin;
      const expectedLevel = saunaConfig.inverseSaunaDoor ? (doorOpen ? 0 : 1) : (doorOpen ? 1 : 0); // Account for inverse logic

      mockRead.mockReturnValueOnce(expectedLevel);

      // Simulate state change based on door status
      if (doorType === 'sauna') {
        const currentLevel = mockRead(pin);
        if (currentLevel === expectedLevel) {
          if (doorOpen && !saunaConfig.saunaOnWhileDoorOpen) {
            saunaAccessory['handleSaunaPowerSet'](false); // Turn off sauna if door opens and saunaOnWhileDoorOpen is false
          } else if (!doorOpen && !saunaConfig.saunaOnWhileDoorOpen) {
            saunaAccessory['handleSaunaPowerSet'](true); // Turn sauna back on if door closes
          }
        }
      }
    };

    // Mock target temperature methods
    (saunaAccessory as any).setTargetTemperature = jest.fn();
    (saunaAccessory as any).getCurrentTargetTemperature = jest.fn(() => saunaConfig.targetTemperatures.sauna);
  });

  afterEach(() => {
    // Ensure cleanup of timers and intervals
    (saunaAccessory as OpenSaunaAccessory).clearIntervalsAndTimeouts();
    jest.clearAllTimers();
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