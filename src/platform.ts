// src/platform.ts

import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, OpenSaunaConfig } from './settings.js';
import { OpenSaunaAccessory } from './platformAccessory.js';

export class OpenSaunaPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.api.on('didFinishLaunching', () => {
      this.log.info('OpenSauna Plugin finished launching');
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  discoverDevices() {
    if (!isOpenSaunaConfig(this.config)) {
      this.log.error(
        'Invalid configuration for OpenSauna. Please check your config.json.',
      );
      return;
    }

    const devices = this.config as OpenSaunaConfig;

    // Set default values for new settings if not provided
    devices.saunaOnWhileDoorOpen = devices.saunaOnWhileDoorOpen ?? true;
    devices.steamOnWhileDoorOpen = devices.steamOnWhileDoorOpen ?? true;
    devices.saunaTimeout = devices.saunaTimeout ?? 60; // in minutes
    devices.steamTimeout = devices.steamTimeout ?? 60; // in minutes
    devices.saunaMaxTemperature =
      devices.saunaMaxTemperature ?? (devices.temperatureUnitFahrenheit ? 212 : 100);
    devices.steamMaxTemperature =
      devices.steamMaxTemperature ?? (devices.temperatureUnitFahrenheit ? 140 : 60);
    devices.steamMaxHumidity = devices.steamMaxHumidity ?? 60; // in percent
    devices.saunaSafetyTemperature = devices.saunaSafetyTemperature ?? (devices.temperatureUnitFahrenheit ? 248 : 120);
    devices.steamSafetyTemperature = devices.steamSafetyTemperature ?? (devices.temperatureUnitFahrenheit ? 140 : 60);
    devices.controllerSafetyTemperature = devices.controllerSafetyTemperature ?? (devices.temperatureUnitFahrenheit ? 194 : 90);

    // Add a single accessory with all configured services
    this.addAccessory(devices);
  }

  private addAccessory(devices: OpenSaunaConfig) {
    // Generate a unique UUID for the combined accessory
    const uuid = this.api.hap.uuid.generate(devices.name);

    // Find existing accessory by UUID
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid,
    );

    if (existingAccessory) {
      // The accessory already exists, update it
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      // Update the existing accessory's information and services
      new OpenSaunaAccessory(this, existingAccessory, devices);

      // Ensure the accessory is up-to-date
      this.api.updatePlatformAccessories([existingAccessory]);

    } else {
      // Create a new accessory
      this.log.info('Adding new accessory:', devices.name);
      const accessory = new this.api.platformAccessory(devices.name, uuid);

      // Create the accessory handler
      new OpenSaunaAccessory(this, accessory, devices);

      // Register the new accessory
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

      // Add to the accessory cache
      this.accessories.push(accessory);
    }
  }
}

function isOpenSaunaConfig(config: PlatformConfig): config is OpenSaunaConfig {
  return (
    typeof config.platform === 'string' &&
    config.platform === PLATFORM_NAME &&
    typeof config.name === 'string' &&
    typeof config.hasSauna === 'boolean' &&
    typeof config.hasSteam === 'boolean' &&
    typeof config.hasLight === 'boolean' &&
    typeof config.hasFan === 'boolean' &&
    config.gpioPins !== undefined &&
    typeof config.gpioPins.saunaDoorPin === 'number' &&
    typeof config.gpioPins.steamDoorPin === 'number' &&
    config.auxSensors !== undefined &&
    Array.isArray(config.auxSensors) &&
    Array.isArray(config.gpioPins.saunaPowerPins) &&
    Array.isArray(config.gpioPins.steamPowerPins) &&
    typeof config.saunaOnWhileDoorOpen === 'boolean' &&
    typeof config.steamOnWhileDoorOpen === 'boolean' &&
    typeof config.saunaTimeout === 'number' &&
    typeof config.steamTimeout === 'number' &&
    typeof config.saunaMaxTemperature === 'number' &&
    typeof config.steamMaxTemperature === 'number' &&
    typeof config.steamMaxHumidity === 'number' &&
    typeof config.controllerSafetyTemperature === 'number'
  );
}