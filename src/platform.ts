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
    this.log.info('Starting device discovery...');

    // Cast config to OpenSaunaConfig
    const devices = this.config as OpenSaunaConfig;

    if (!this.isOpenSaunaConfig(devices)) {
      this.log.error('Invalid configuration for OpenSauna. Please check your config.json.');
      return;
    }

    this.log.info('Configuration validated, setting up devices...');

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

    this.log.info('Defaults applied, adding accessory...');
    this.addAccessory(devices);
    this.log.info('Device discovery completed.');
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

  private isOpenSaunaConfig(config: any): config is OpenSaunaConfig {
    // Check if config is an object and if it has the required properties
    if (typeof config !== 'object' || config === null) {
      return false;
    }

    // Validate the presence of required properties
    const requiredKeys: Array<keyof OpenSaunaConfig> = [
      'platform', 'name', 'manufacturer', 'serial',
      'hasSauna', 'hasSaunaSplitPhase', 'hasSteam', 'hasSteamI2C', 'hasSteamSplitPhase',
      'hasLight', 'hasFan', 'inverseSaunaDoor', 'inverseSteamDoor', 'temperatureUnitFahrenheit',
      'gpioPins', 'auxSensors', 'saunaOnWhileDoorOpen', 'steamOnWhileDoorOpen',
      'saunaTimeout', 'steamTimeout', 'controllerSafetyTemperature', 'saunaMaxTemperature',
      'saunaSafetyTemperature', 'steamMaxTemperature', 'steamSafetyTemperature', 'steamMaxHumidity',
    ];

    // Validate that all required keys are present
    for (const key of requiredKeys) {
      if (!(key in config)) {
        return false;
      }
    }

    // Further validation can be done if necessary, but if all keys exist, it's likely valid
    return true;
  }
}