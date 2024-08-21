import { createTestPlatformAndAccessory, saunaConfig } from './setup';
import { mockDigitalWrite } from '../jest.setup';

import { OpenSaunaAccessory } from '../platformAccessory';
import { OpenSaunaPlatform } from '../platform';
import { PlatformAccessory } from 'homebridge';

describe("OpenSaunaAccessory Sauna Test", () => {
  let platform: OpenSaunaPlatform;
  let accessory: PlatformAccessory;
  let saunaAccessory: OpenSaunaAccessory;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    jest.useFakeTimers();
    jest.clearAllMocks();
    ({ platform, accessory, saunaAccessory } = createTestPlatformAndAccessory());
  });

  afterEach(() => {
    saunaAccessory.clearIntervalsAndTimeouts();
    jest.runAllTimers();
    jest.clearAllTimers();
    process.removeAllListeners("exit");
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  const saunaPins = saunaConfig.relayPins.find((config) => config.system === "sauna")?.GPIO;
  const steamPins = saunaConfig.relayPins.find((config) => config.system === "steam")?.GPIO;

  it("should start the sauna and prevent the steamer from turning on until the sauna is turned off", async () => {
    // Turn on the sauna
    await (saunaAccessory as any).handleStateSet("steam", platform.Characteristic.TargetHeatingCoolingState.HEAT);

    // Expect sauna relays to turn on
    steamPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1);
    });

    // Turn on steam
    await (saunaAccessory as any).handleStateSet("sauna", platform.Characteristic.TargetHeatingCoolingState.HEAT);

    // Expect sauna relays to turn off
    steamPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 0);
    });

    // Expect steam relays to turn off
    saunaPins?.forEach((pin: number) => {
      expect(mockDigitalWrite).toHaveBeenCalledWith(pin, 1);
    }); 
  });
});