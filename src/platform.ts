import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, OpenSaunaConfig } from './settings';
import { OpenSaunaAccessory } from './platformAccessory';

export class OpenSaunaPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
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
        'Invalid configuration for OpenSauna. Please check your config.json.'
      );
      return;
    }

    const devices = this.config as OpenSaunaConfig;

    // Conditionally add Sauna accessory
    if (devices.hasSauna) {
      this.addAccessory(devices, 'sauna');
    }

    // Conditionally add Steam accessory
    if (devices.hasSteam) {
      this.addAccessory(devices, 'steam');
    }

    // Add Light and Fan accessories if they exist
    if (devices.hasLight) {
      this.addAccessory(devices, 'light');
    }

    if (devices.hasFan) {
      this.addAccessory(devices, 'fan');
    }
  }

  private addAccessory(
    devices: OpenSaunaConfig,
    type: 'sauna' | 'steam' | 'light' | 'fan'
  ) {
    // Generate a unique UUID for each accessory
    const uuid = this.api.hap.uuid.generate(`${devices.name}-${type}`);
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid
    );

    if (existingAccessory) {
      // The accessory already exists, update it
      this.log.info(
        'Restoring existing accessory from cache:',
        existingAccessory.displayName
      );
      new OpenSaunaAccessory(this, existingAccessory, devices, type);
    } else {
      // Create a new accessory
      this.log.info('Adding new accessory:', devices.name, type);
      const accessory = new this.api.platformAccessory(devices.name, uuid);

      // Create the accessory handler
      new OpenSaunaAccessory(this, accessory, devices, type);

      // Register the accessory
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
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
    Array.isArray(config.gpioPins.steamPowerPins)
  );
}
