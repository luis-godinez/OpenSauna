import fs from "fs";
import path from "path";
import { OpenSpaAccessory } from "../platformAccessory";
import { OpenSpaPlatform } from "../platform";
import { PlatformAccessory, API, Logger, PlatformConfig } from "homebridge";
import { OpenSpaConfig } from "../settings";
import { mockRead } from "../jest.setup";

// Mock Homebridge API and services
const mockCharacteristic = {
  setProps: jest.fn().mockReturnThis(),
  onSet: jest.fn().mockReturnThis(),
  onGet: jest.fn().mockReturnThis(),
  updateCharacteristic: jest.fn().mockImplementation((newValue) => {
    mockCharacteristic.value = newValue; // Update the internal value
    return mockCharacteristic; // Allows method chaining
  }),
  updateValue: jest.fn().mockImplementation((newValue) => {
    mockCharacteristic.value = newValue; // Update the internal value
    return mockCharacteristic; // Allows method chaining
  }),
  setValue: jest.fn().mockImplementation((newValue) => {
    mockCharacteristic.value = newValue; // Update the internal value
    return mockCharacteristic; // Allows method chaining
  }),
  getValue: jest.fn().mockImplementation(() => {
    return mockCharacteristic.value; // Return the internal value
  }),
  value: 0, // Default value, can be overridden per test case
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
const configPath = path.resolve(__dirname, "../config.json");
const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Extract the first OpenSpaConfig from the platforms array
const saunaConfig: OpenSpaConfig = configData.platforms[0];
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
  info: jest.fn((...args) => console.info(...args)), // Print info logs to console
  log: jest.fn(),
  warn: jest.fn((...args) => console.warn(...args)), // Print warnings to console
} as any;

// Setup function to initialize platform and accessory for tests
export function createTestPlatformAndAccessory() {
  const platform = new OpenSpaPlatform(mockLogger, { platform: "OpenSpa" } as PlatformConfig, mockAPI);

  const accessory = {
    getService: jest.fn().mockImplementation((serviceName) => {
      if (serviceName === platform.Service.AccessoryInformation) {
        return mockAccessoryInformationService;
      }
      if (serviceName.includes("Temperature")) {
        return mockTemperatureSensorService;
      }
      if (serviceName.includes("ContactSensor")) {
        return mockContactSensorService;
      }
      if (serviceName.includes("Thermostat")) {
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

  const saunaAccessory = new OpenSpaAccessory(platform, accessory, saunaConfig);

  type DoorType = "sauna" | "steam";
  type DoorStateKeys = "saunaOnWhileDoorOpen" | "steamOnWhileDoorOpen";

  function getDoorStateKey(doorType: DoorType): DoorStateKeys {
    return `${doorType}OnWhileDoorOpen` as DoorStateKeys;
  }

  (saunaAccessory as any).handleDoorStateChange = (doorType: DoorType, doorOpen: boolean) => {
    const pin = doorType === "sauna" ? saunaConfig.saunaDoorPin : saunaConfig.steamDoorPin;
    const inverse = doorType === "sauna" ? saunaConfig.saunaDoorNO : saunaConfig.steamDoorNO;
    const expectedLevel = inverse ? (doorOpen ? 0 : 1) : doorOpen ? 1 : 0;

    mockRead.mockReturnValueOnce(expectedLevel);

    if (pin !== undefined) {
      const currentLevel = mockRead(pin);
      const doorStateKey = getDoorStateKey(doorType);

      if (currentLevel === expectedLevel) {
        if (doorOpen && !saunaConfig[doorStateKey]) {
          console.log("Door open, heat disabled");
          saunaAccessory["setPowerState"](doorType, false);
        } else if (!doorOpen && !saunaConfig[doorStateKey]) {
          console.log("Door closed, heat enabled");
          saunaAccessory["setPowerState"](doorType, true);
        }
      }
    }
  };

  return { platform, accessory, saunaAccessory };
}
