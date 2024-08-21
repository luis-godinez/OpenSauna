import { createTestPlatformAndAccessory, saunaConfig } from "./setup";
import { mockDigitalWrite } from "../jest.setup";
import { OpenSaunaAccessory } from "../platformAccessory";
import { OpenSaunaPlatform } from "../platform";
import { PlatformAccessory } from "homebridge";

describe("OpenSaunaAccessory Safety Test", () => {
  let platform: OpenSaunaPlatform;
  let accessory: PlatformAccessory;
  let saunaAccessory: OpenSaunaAccessory;

  beforeEach(() => {
    jest.useFakeTimers(); // Enable fake timers for this test suite
    jest.clearAllMocks();
    ({ platform, accessory, saunaAccessory } = createTestPlatformAndAccessory());
  });

  afterEach(() => {
    saunaAccessory.clearIntervalsAndTimeouts(); // Ensure all timers are cleared
    jest.runAllTimers(); // Run and clear any pending timers
    jest.clearAllTimers(); // Clear any remaining timers
    process.removeAllListeners("exit");
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  const saunaPins = saunaConfig.relayPins.find((config) => config.system === "sauna");
  const lightPins = saunaConfig.relayPins.find((config) => config.system === "light");

  test("controller overheat: turn off all relays and flash lights if PCB temperature exceeds safety limit, and test relay power control", () => {
    // Simulate PCB temperature within normal range - relays should power up
    saunaAccessory["handleControllerTemperature"](saunaConfig.controllerSafetyTemperature - 5);

    saunaConfig.gpioPowerPins.forEach((pinConfig) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pinConfig.set, 1); // Power relays should be enabled
      expect(mockDigitalWrite).toHaveBeenCalledWith(pinConfig.reset, 0); // Reset should be low
    });

    // Simulate PCB temperature exceeding the safety limit
    saunaAccessory["handleControllerTemperature"](saunaConfig.controllerSafetyTemperature + 10);

    // Flash light 10 times
    for (let i = 0; i < 10; i++) {
      lightPins?.GPIO.forEach((lightPin) => {
        expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 0); // Power relays should be disabled
        expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 1); // Reset should be high
      });
    }

    // Power off all auxiliary relays
    saunaConfig.relayPins.forEach((config) => {
      config.GPIO.forEach((pin: number) => {
        expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Turn off power
      });
    });

    // Power down main 120v relays. Note: Pi will stay alive.
    saunaConfig.gpioPowerPins.forEach((pinConfig) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pinConfig.set, 0); // Power relays should be disabled
      expect(mockDigitalWrite).toHaveBeenCalledWith(pinConfig.reset, 1); // Reset should be high
    });

    console.log("main off");
  });

  test("sauna overheat: turn off sauna if it exceeds max safety temperature and flash lights", () => {
    // Mock the handleStateSet function to prevent system switching logic
    saunaAccessory["handleStateSet"]("sauna", true);

    const lightPinsLength = lightPins?.GPIO.length ?? 0;
    const saunaPinsLength = saunaPins?.GPIO.length ?? 0;

    saunaPins?.GPIO.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Turn on sauna power
    });

    if (lightPins) {
      saunaAccessory["setPowerState"]("light", true);
    }

    lightPins?.GPIO.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1); // Turn off sauna power
    });

    // Simulate exceeding the max temperature
    saunaAccessory["handleTemperatureControl"]("sauna", 130); // Exceeds max temperature

    // Flash light 10 times
    for (let i = 0; i < 10; i++) {
      lightPins?.GPIO.forEach((lightPin) => {
        expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 0); // Power relays should be disabled
        expect(mockDigitalWrite).toHaveBeenCalledWith(lightPin, 1); // Reset should be high
      });
    }
  });

  test("no temperature: no power if no signal from any temperature sensor", () => {
    saunaAccessory["startSystem"]("sauna");

    // Simulate no signal
    saunaAccessory["handleTemperatureControl"]("sauna", NaN);

    saunaPins?.GPIO.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Ensure sauna power is off
    });
  });

  test("invalid temperature: no power if invalid temperature due to disconnected NTC", () => {
    saunaAccessory["startSystem"]("sauna");

    // Simulate invalid temperature
    saunaAccessory["handleTemperatureControl"]("sauna", -50);

    saunaPins?.GPIO.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0); // Ensure sauna power is off
    });
  });

  test("controller temperature control: power up and power down the main power relays based on controller temperature", () => {
    // Simulate temperature below the safety limit, relays should power up
    saunaAccessory["handleControllerTemperature"](saunaConfig.controllerSafetyTemperature - 5);

    saunaConfig.gpioPowerPins.forEach((pinConfig) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pinConfig.set, 1); // Power relays should be enabled
      expect(mockDigitalWrite).toHaveBeenCalledWith(pinConfig.reset, 0); // Reset should be low
    });

    // Simulate temperature above the safety limit, relays should power down
    saunaAccessory["handleControllerTemperature"](saunaConfig.controllerSafetyTemperature + 5);

    saunaConfig.gpioPowerPins.forEach((pinConfig) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pinConfig.set, 0); // Power relays should be disabled
      expect(mockDigitalWrite).toHaveBeenCalledWith(pinConfig.reset, 1); // Reset should be high
    });
  });
});
