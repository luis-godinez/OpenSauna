import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory, API, Logger, PlatformConfig } from 'homebridge';
import { OpenSaunaConfig } from '../settings';
import { mockDigitalWrite } from '../../jest.setup';

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
} as any;

const mockLogger: Logger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
} as any;

describe('OpenSaunaAccessory Safety Tests', () => {
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
    // Ensure cleanup of timers and intervals
    saunaAccessory['clearIntervalsAndTimeouts']();
    jest.clearAllTimers();
  });

  test('controller overheat: turn off all relays and flash lights if PCB temperature exceeds safety limit', () => {
    // Simulate PCB temperature exceeding the safety limit
    saunaAccessory['monitorPcbTemperatureSafety'](config.controllerSafetyTemperature + 10);

    // Expect that all power-related GPIO pins are turned off
    config.gpioPins.saunaPowerPins.forEach((pin) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off sauna power
    });
    config.gpioPins.steamPowerPins.forEach((pin) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off steam power
    });

    expect(mockDigitalWrite).toHaveBeenCalledWith(config.gpioPins.lightPin, 0); // Lights off
    expect(mockDigitalWrite).toHaveBeenCalledWith(config.gpioPins.fanPin, 0); // Fan off

    // Check for flashing sequence
    const flashingSequence = 10 * 2; // 10 flashes (on + off)
    const expectedCalls =
      config.gpioPins.saunaPowerPins.length +
      config.gpioPins.steamPowerPins.length +
      2 + // Turn off commands for sauna, steam, light, and fan
      flashingSequence;
    expect(mockDigitalWrite).toHaveBeenCalledTimes(expectedCalls); // Flashing lights + turn off commands
  });

  test('sauna overheat: turn off sauna if it exceeds max safety temperature and flash lights', () => {
    // Ensure light is initially on if it is configured
    if (typeof config.gpioPins.lightPin === 'number') {
      saunaAccessory['setPowerState']([config.gpioPins.lightPin], true);
    }

    // Simulate exceeding the max temperature
    saunaAccessory['handleTemperatureControl'](config.auxSensors[1], 130); // Exceeds max temperature

    // Expect that all sauna power-related GPIO pins are turned off
    config.gpioPins.saunaPowerPins.forEach((pin) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off sauna power
    });

    // Flashing sequence for sauna
    const flashingSequence = 10 * 2; // 10 flashes (on + off)
    const expectedOffCommands = config.gpioPins.saunaPowerPins.length; // Number of sauna pins
    const expectedCalls = expectedOffCommands + flashingSequence + 1; // +1 for initial light off

    expect(mockDigitalWrite).toHaveBeenCalledWith(config.gpioPins.lightPin, 0); // Ensure lights are off after overheat
    expect(mockDigitalWrite).toHaveBeenCalledTimes(expectedCalls);
  });

  test('no temperature: no power if no signal from any temperature sensor', () => {
    // Simulate no signal
    saunaAccessory['handleTemperatureControl'](config.auxSensors[1], NaN);

    config.gpioPins.saunaPowerPins.forEach((pin) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Ensure sauna power is off
    });
  });
});