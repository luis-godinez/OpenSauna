import fs from 'fs';
import path from 'path';
import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory, API, Logger, PlatformConfig } from 'homebridge';
import { mockDigitalWrite } from '../jest.setup';
import { OpenSaunaConfig } from '../settings';

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

const mockSwitchService = {
  setCharacteristic: jest.fn(),
  getCharacteristic: jest.fn().mockReturnThis(),
  onSet: jest.fn(),
  updateCharacteristic: jest.fn(),
};

const mockHap = {
  Service: {
    Switch: jest.fn().mockImplementation(() => mockSwitchService),
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

describe('OpenSaunaAccessory Safety Tests', () => {
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
        return mockSwitchService; // Return the mocked Switch service
      }),
      addService: jest.fn().mockImplementation(() => mockSwitchService),
    } as unknown as PlatformAccessory;

    saunaAccessory = new OpenSaunaAccessory(platform, accessory, saunaConfig);
  });

  afterEach(() => {
    // Ensure cleanup of timers and intervals
    saunaAccessory['clearIntervalsAndTimeouts']();
    jest.clearAllTimers();
  });

  test('controller overheat: turn off all relays and flash lights if PCB temperature exceeds safety limit', () => {
    // Simulate PCB temperature exceeding the safety limit
    saunaAccessory['monitorPcbTemperatureSafety'](saunaConfig.controllerSafetyTemperature + 10);

    // Expect that all power-related GPIO pins are turned off
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off sauna power
    });
    saunaConfig.gpioPins.steamPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off steam power
    });

    if (saunaConfig.gpioPins.lightPin !== undefined) {
      expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.lightPin, 0); // Lights off
    }
    if (saunaConfig.gpioPins.fanPin !== undefined) {
      expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.fanPin, 0); // Fan off
    }

    // Check for flashing sequence
    const flashingSequence = 10 * 2; // 10 flashes (on + off)
    const expectedCalls =
      saunaConfig.gpioPins.saunaPowerPins.length +
      saunaConfig.gpioPins.steamPowerPins.length +
      2 + // Turn off commands for sauna, steam, light, and fan
      flashingSequence;
    expect(mockDigitalWrite).toHaveBeenCalledTimes(expectedCalls); // Flashing lights + turn off commands
  });

  test('sauna overheat: turn off sauna if it exceeds max safety temperature and flash lights', () => {
    // Ensure light is initially on if it is configured
    if (typeof saunaConfig.gpioPins.lightPin === 'number') {
      saunaAccessory['setPowerState']([saunaConfig.gpioPins.lightPin], true);
    }

    // Simulate exceeding the max temperature
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], 130); // Exceeds max temperature

    // Expect that all sauna power-related GPIO pins are turned off
    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off sauna power
    });

    // Flashing sequence for sauna
    const flashingSequence = 10 * 2; // 10 flashes (on + off)
    const expectedOffCommands = saunaConfig.gpioPins.saunaPowerPins.length; // Number of sauna pins
    const expectedCalls = expectedOffCommands + flashingSequence + 1; // +1 for initial light off

    expect(mockDigitalWrite).toHaveBeenCalledWith(saunaConfig.gpioPins.lightPin, 0); // Ensure lights are off after overheat
    expect(mockDigitalWrite).toHaveBeenCalledTimes(expectedCalls);
  });

  test('no temperature: no power if no signal from any temperature sensor', () => {
    // Simulate no signal
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], NaN);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Ensure sauna power is off
    });
  });

  test('invalid temperature: no power if invalid temperature due to disconnected NTC', () => {
    // Simulate no signal
    saunaAccessory['handleTemperatureControl'](saunaConfig.auxSensors[1], -50);

    saunaConfig.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Ensure sauna power is off
    });
  });

});