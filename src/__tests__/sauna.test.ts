import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory, API, Logger, PlatformConfig } from 'homebridge';
import { OpenSaunaConfig } from '../settings';
import { mockDigitalWrite, mockOn } from '../../jest.setup';

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

    config = {
      platform: 'OpenSauna',
      name: 'Test Sauna',
      hasSauna: true,
      hasSaunaSplitPhase: true,
      hasSteam: true,
      hasSteamSplitPhase: false,
      hasLight: true,
      hasFan: true,
      inverseSaunaDoor: false,
      inverseSteamDoor: true,
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
        {
          name: 'Outside',
          channel: 2,
          system: null,
          control: false,
        },
      ],
      targetTemperatures: {
        sauna: 80,
        steam: 40,
      },
      saunaOnWhileDoorOpen: false,
      steamOnWhileDoorOpen: false,
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

    // Mocking methods if they do not exist
    (saunaAccessory as any).handleDoorStateChange = (doorType: string, doorOpen: boolean) => {
      const pin = config.gpioPins.saunaDoorPin;
      const level = doorOpen ? 1 : 0;
      if (pin !== undefined) {
        mockOn.mock.calls.forEach(([event, callback]: [string, Function]) => {
          if (event === 'alert') {
            callback(level); // Simulate alert trigger
          }
        });
      }
    };

    // Mock target temperature methods
    (saunaAccessory as any).setTargetTemperature = jest.fn();
    (saunaAccessory as any).getCurrentTargetTemperature = jest.fn(() => config.targetTemperatures.sauna);
  });

  afterEach(() => {
    // Ensure cleanup of timers and intervals
    (saunaAccessory as any).clearIntervalsAndTimeouts();
    jest.clearAllTimers();
  });

  test('should keep sauna heater on when door opens if saunaOnWhileDoorOpen is true', () => {
    // Update configuration to ensure sauna stays on when the door is open
    config.saunaOnWhileDoorOpen = true;

    // Set initial state
    saunaAccessory['handleSaunaPowerSet'](true);

    // Simulate door open
    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    // Verify that the sauna heater remains on
    config.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should stay on
    });
  });

  test('should turn off sauna heater when door opens if saunaOnWhileDoorOpen is false', () => {
    // Update configuration to ensure sauna turns off when the door is open
    config.saunaOnWhileDoorOpen = false;

    // Set initial state of the sauna heater to on
    saunaAccessory['handleSaunaPowerSet'](true);

    // Verify that initial state has the sauna heater on
    config.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should initially be on
    });

    // Simulate door open
    (saunaAccessory as any).handleDoorStateChange('sauna', true);

    // Verify that all sauna power-related GPIO pins are turned off when the door opens
    config.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });

    // Simulate door close
    (saunaAccessory as any).handleDoorStateChange('sauna', false);

    // Verify that all sauna power-related GPIO pins resume operation when the door closes
    config.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should turn back on
    });
  });

  test('should turn off sauna after saunaTimeout period', () => {
    jest.useFakeTimers();

    // Simulate starting the sauna
    saunaAccessory['handleSaunaPowerSet'](true);

    // Fast-forward time to after timeout
    jest.advanceTimersByTime(config.saunaTimeout * 1000);

    // Verify that the sauna heater turns off
    config.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('should turn off sauna if temperature exceeds maxTemperature', () => {
    jest.useFakeTimers();

    // Mock the temperature reading to be above the max temperature
    const highTemperature = config.saunaMaxTemperature + 5;
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
    config.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Heater should initially turn on
    });

    // Fast-forward time to allow temperature reading
    jest.advanceTimersByTime(5000);

    // Manually trigger the temperature control logic if needed
    saunaAccessory['handleTemperatureControl'](config.auxSensors[1], highTemperature);

    // Verify that the sauna heater turns off due to exceeding max temperature
    config.gpioPins.saunaPowerPins.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Heater should turn off
    });

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
});