import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory, API, Logger, PlatformConfig } from 'homebridge';
import { OpenSaunaConfig } from '../settings';
import { mockDigitalWrite } from '../jest.setup';

// Mock Homebridge API and services
const mockTemperatureSensorService = {
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
    Thermostat: jest.fn().mockImplementation(() => ({
      setCharacteristic: jest.fn(),
      getCharacteristic: jest.fn().mockReturnThis(),
      onSet: jest.fn(),
    })),
    HumiditySensor: jest.fn().mockImplementation(() => ({
      setCharacteristic: jest.fn(),
      updateCharacteristic: jest.fn(),
    })),
    ContactSensor: jest.fn().mockImplementation(() => ({
      setCharacteristic: jest.fn(),
      updateCharacteristic: jest.fn(),
    })),
  },
  Characteristic: {
    On: jest.fn(),
    Name: jest.fn(),
    CurrentTemperature: jest.fn(),
    TargetTemperature: jest.fn(),
    CurrentRelativeHumidity: jest.fn(),
    ContactSensorState: {
      CONTACT_DETECTED: jest.fn(),
      CONTACT_NOT_DETECTED: jest.fn(),
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
} as unknown as API;

const mockLogger: Logger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
} as unknown as Logger;

describe('OpenSaunaAccessory Light Tests', () => {
  let platform: OpenSaunaPlatform;
  let accessory: PlatformAccessory;
  let config: OpenSaunaConfig;
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
        return {
          setCharacteristic: jest.fn(),
          getCharacteristic: jest.fn().mockReturnThis(),
          onSet: jest.fn(),
        };
      }),
      addService: jest.fn().mockImplementation(() => ({
        setCharacteristic: jest.fn(),
        getCharacteristic: jest.fn().mockReturnThis(),
        onSet: jest.fn(),
      })),
    } as unknown as PlatformAccessory;

    config = {
      platform: 'OpenSauna',
      name: 'Test Sauna',
      hasSauna: true,
      hasSaunaSplitPhase: false,
      hasSteam: true,
      hasSteamSplitPhase: false,
      hasLight: true,
      hasFan: true,
      inverseSaunaDoor: false,
      inverseSteamDoor: false,
      temperatureUnitFahrenheit: false,
      gpioPins: {
        saunaPowerPins: [16, 20],
        steamPowerPins: [25, 24],
        lightPin: 23,
        fanPin: 18,
        saunaDoorPin: 19,
        steamDoorPin: 26,
      },
      auxSensors: [
        {
          name: 'PCB_NTC',
          channel: 0,
          system: 'controller',
          control: false,
        },
        {
          name: 'SAUNA_NTC',
          channel: 1,
          system: 'sauna',
          control: true,
        },
      ],
      targetTemperatures: {
        sauna: 80,
        steam: 40,
      },
      saunaOnWhileDoorOpen: true,
      steamOnWhileDoorOpen: true,
      saunaTimeout: 60,
      steamTimeout: 60,
      saunaMaxTemperature: 100,
      steamMaxTemperature: 60,
      steamMaxHumidity: 60,
      saunaSafetyTemperature: 120,
      steamSafetyTemperature: 60,
      controllerSafetyTemperature: 90,
    };

    saunaAccessory = new OpenSaunaAccessory(platform, accessory, config, 'sauna');
  });

  afterEach(() => {
    // Clear any remaining intervals and timeouts to prevent open handles
    saunaAccessory['clearIntervalsAndTimeouts']();
    jest.clearAllMocks();
  });

  test('should turn on the light when lightPowerSwitch is set to true', () => {
    const lightPin = config.gpioPins.lightPin;

    if (lightPin !== undefined) {
      // Simulate turning the light on
      saunaAccessory['setPowerState']([lightPin], true);

      // Verify that the light pin was turned on
      expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 1); // Light on
    } else {
      throw new Error('Light pin is undefined');
    }
  });

  test('should turn off the light when lightPowerSwitch is set to false', () => {
    const lightPin = config.gpioPins.lightPin;

    if (lightPin !== undefined) {
      // Simulate turning the light off
      saunaAccessory['setPowerState']([lightPin], false);

      // Verify that the light pin was turned off
      expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 0); // Light off
    } else {
      throw new Error('Light pin is undefined');
    }
  });
});