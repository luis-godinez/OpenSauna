// setup.test.ts

import fs from 'fs';
import path from 'path';
import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory, API, Logger, PlatformConfig } from 'homebridge';
import { OpenSaunaConfig } from '../settings';
import { mockRead } from '../jest.setup';


// Mock Homebridge API and services
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
  getCharacteristic: jest.fn().mockReturnThis(),
  onSet: jest.fn(),
  updateCharacteristic: jest.fn(),
};

// Export mock services
export {
  mockSwitchService,
  mockAccessoryInformationService,
  mockContactSensorService,
  mockTemperatureSensorService,
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
    AccessoryInformation: jest.fn().mockImplementation(() => mockAccessoryInformationService),
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

export { mockAPI, mockLogger };

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
      return mockSwitchService;
    }),
    addService: jest.fn().mockImplementation(() => mockSwitchService),
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