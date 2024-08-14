import fs from 'fs';
import path from 'path';
import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory, API, Logger, PlatformConfig } from 'homebridge';
import { OpenSaunaConfig } from '../settings';
import { mockRead } from '../jest.setup';

// Mock Homebridge API and services
const mockCharacteristic = {
  setProps: jest.fn().mockReturnThis(),
  onSet: jest.fn().mockReturnThis(),
  onGet: jest.fn().mockReturnThis(),
  updateCharacteristic: jest.fn().mockImplementation((newValue) => {
    mockCharacteristic.value = newValue; // Update the internal value
    return mockCharacteristic;           // Allows method chaining
  }),
  updateValue: jest.fn().mockImplementation((newValue) => {
    mockCharacteristic.value = newValue; // Update the internal value
    return mockCharacteristic;           // Allows method chaining
  }),
  setValue: jest.fn().mockImplementation((newValue) => {
    mockCharacteristic.value = newValue; // Update the internal value
    return mockCharacteristic;           // Allows method chaining
  }),
  getValue: jest.fn().mockImplementation(() => {
    return mockCharacteristic.value;      // Return the internal value
  }),
  value: 0,                 // Default value, can be overridden per test case
};

const mockTemperatureSensorService = {
  setCharacteristic: jest.fn().mockReturnThis(), // Ensure chaining works
  updateCharacteristic: jest.fn(),
};

const mockContactSensorService = {
  setCharacteristic: jest.fn().mockReturnThis(), // Ensure chaining works
  updateCharacteristic: jest.fn(),
};

const mockAccessoryInformationService = {
  setCharacteristic: jest.fn().mockReturnThis(), // Ensure chaining works
};

const mockSwitchService = {
  setCharacteristic: jest.fn().mockReturnThis(), // Ensure chaining works
  getCharacteristic: jest.fn().mockReturnValue(mockCharacteristic),
  onSet: jest.fn(),
  updateCharacteristic: jest.fn(),
};

// Thermostat service mock
const mockThermostatService = {
  setCharacteristic: jest.fn().mockReturnThis(),
  getCharacteristic: jest.fn().mockReturnValue(mockCharacteristic),
};

// Export mock services
export {
  mockAccessoryInformationService,
  mockContactSensorService,
  mockTemperatureSensorService,
  mockThermostatService,
  mockSwitchService,
};

// Load configuration from config.json
const configPath = path.resolve(__dirname, '../config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Extract the first OpenSaunaConfig from the platforms array
const saunaConfig: OpenSaunaConfig = configData.platforms[0];
export { saunaConfig };

const mockHap = {
  Service: {
    Switch: jest.fn().mockImplementation(() => ({
      setCharacteristic: jest.fn(),
      getCharacteristic: jest.fn().mockReturnThis(),
      onSet: jest.fn(),
    })),
    TemperatureSensor: jest.fn().mockImplementation(() => mockTemperatureSensorService),
    ContactSensor: jest.fn().mockImplementation(() => mockContactSensorService),
    Thermostat: jest.fn().mockImplementation(() => mockThermostatService),
    AccessoryInformation: jest.fn().mockImplementation(() => mockAccessoryInformationService),
  },
  Characteristic: {
    TargetHeatingCoolingState: {
      OFF: 0,
      HEAT: 1,
    },
    CurrentHeatingCoolingState: {
      OFF: 0,
      HEAT: 1,
    },
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

export { mockAPI };

const mockLogger: Logger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn((...args) => console.info(...args)),  // Print info logs to console
  log: jest.fn(),
  warn: jest.fn((...args) => console.warn(...args)),  // Print warnings to console
} as any;

// Setup function to initialize platform and accessory for tests
export function createTestPlatformAndAccessory() {
  const platform = new OpenSaunaPlatform(
    mockLogger,
    { platform: 'OpenSauna' } as PlatformConfig,
    mockAPI,
  );

  const accessory = {
    getService: jest.fn().mockImplementation((serviceName) => {
      if (serviceName === platform.Service.AccessoryInformation) {
        return mockAccessoryInformationService;
      }
      if (serviceName.includes('Temperature')) {
        return mockTemperatureSensorService;
      }
      if (serviceName.includes('ContactSensor')) {
        return mockContactSensorService;
      }
      if (serviceName.includes('Thermostat')) {
        return mockThermostatService; // Use the thermostat service mock for sauna and steam
      }
      return mockSwitchService; // Default to switch service for light and fan
    }),
    addService: jest.fn().mockImplementation((service) => {
      if (service === platform.Service.Thermostat) {
        return mockThermostatService;
      }
      return mockSwitchService; // Default to switch service for light and fan
    }),
  } as unknown as PlatformAccessory;

  const saunaAccessory = new OpenSaunaAccessory(platform, accessory, saunaConfig);

  (saunaAccessory as any).handleDoorStateChange = (doorType: string, doorOpen: boolean) => {
    const pin = saunaConfig.gpioPins.saunaDoorPin;
    const expectedLevel = saunaConfig.inverseSaunaDoor ? (doorOpen ? 0 : 1) : (doorOpen ? 1 : 0);

    mockRead.mockReturnValueOnce(expectedLevel);

    if (doorType === 'sauna') {
      const currentLevel = mockRead(pin);
      if (currentLevel === expectedLevel) {
        if (doorOpen && !saunaConfig.saunaOnWhileDoorOpen) {
          saunaAccessory['handleSaunaPowerSet'](false);
        } else if (!doorOpen && !saunaConfig.saunaOnWhileDoorOpen) {
          saunaAccessory['handleSaunaPowerSet'](true);
        }
      }
    }
  };

  (saunaAccessory as any).setTargetTemperature = jest.fn();
  (saunaAccessory as any).getCurrentTargetTemperature = jest.fn(() => saunaConfig.targetTemperatures.sauna);

  return { platform, accessory, saunaAccessory };
}