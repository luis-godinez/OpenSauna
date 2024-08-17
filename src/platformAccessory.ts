// platformAccessory.ts

import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { OpenSaunaPlatform } from './platform.js';
import rpio from 'rpio';
import {
  openMcp3008,
  McpInterface,
  McpReading,
  EightChannels,
} from 'mcp-spi-adc';
import i2c from 'i2c-bus';
import { OpenSaunaConfig, AuxSensorConfig } from './settings.js';

export class OpenSaunaAccessory {
  private auxTemperatureSensors: Map<string, Service> = new Map();
  private steamHumiditySensor?: Service;
  private steamTemperatureSensor?: Service;
  private saunaRunning: boolean = false;
  private lastSaunaTargetTemperature: number = 0;
  private steamRunning: boolean = false;
  private lastSteamTargetTemperature: number = 0;
  private lightPowerSwitch?: Service;
  private fanPowerSwitch?: Service;
  private adc!: McpInterface;
  private i2cBus!: i2c.PromisifiedBus;
  private saunaTimer: NodeJS.Timeout | null = null;
  private steamTimer: NodeJS.Timeout | null = null;
  private temperatureIntervals: NodeJS.Timeout[] = [];
  private humidityInterval: NodeJS.Timeout | null = null;
  private doorPollRegistered: { [pin: number]: boolean } = {};

  constructor(
    private readonly platform: OpenSaunaPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: OpenSaunaConfig,
  ) {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        `${this.config.manufacturer}`,
      )
      .setCharacteristic(
        this.platform.Characteristic.Name,
        `${this.config.name}`,
      )
      .setCharacteristic(this.platform.Characteristic.Model, 'OpenSauna')
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        `${this.config.serial}`,
      );

    // Initialize RPIO with desired options
    rpio.init({ mapping: 'gpio' });

    // Initialize peripherals with error handling and timeouts
    this.initializePeripherals()
      .then(() => {
        this.setupAccessory();
      })
      .catch((error) => {
        this.platform.log.error('Initialization failed:', error);
        this.cleanupGpioPins(); // Ensure GPIO pins are cleaned up on error
      });

    process.on('exit', this.cleanupGpioPins.bind(this));
    process.on('SIGINT', () => {
      this.cleanupGpioPins();
      process.exit();
    });
    process.on('SIGTERM', () => {
      this.cleanupGpioPins();
      process.exit();
    });
  }

  // Initialize all hardware peripherals asynchronously with error handling
  private async initializePeripherals() {
    this.platform.log.info('Starting peripheral initialization...');

    try {
      this.validateSensorConfiguration();

      await Promise.all([
        this.initializeAdc(),
        this.initializeI2C(),
        this.initializeGpioPinsAsync(),
      ]);

      this.platform.log.info('Peripheral initialization completed.');
    } catch (error) {
      this.platform.log.error('Peripheral initialization failed:', error);
      throw error;
    }
  }

  private validateSensorConfiguration() {
    const systemCount: { [key: string]: number } = {};

    this.config.auxSensors.forEach((sensor) => {
      if (sensor.system) {
        if (!systemCount[sensor.system]) {
          systemCount[sensor.system] = 0;
        }
        systemCount[sensor.system]++;
      }
    });

    for (const system in systemCount) {
      if (systemCount[system] > 1) {
        throw new Error(
          `Only one NTC sensor is allowed for the ${system} system.`,
        );
      }
    }
  }

  // Initialize GPIO pins asynchronously with error handling
  private async initializeGpioPinsAsync() {
    try {
      this.config.gpioPins.saunaPowerPins.forEach((pin) =>
        rpio.open(pin, rpio.OUTPUT, rpio.LOW),
      );
      this.config.gpioPins.steamPowerPins.forEach((pin) =>
        rpio.open(pin, rpio.OUTPUT, rpio.LOW),
      );
      if (this.config.gpioPins.lightPin !== undefined) {
        rpio.open(this.config.gpioPins.lightPin, rpio.OUTPUT, rpio.LOW);
      }
      if (this.config.gpioPins.fanPin !== undefined) {
        rpio.open(this.config.gpioPins.fanPin, rpio.OUTPUT, rpio.LOW);
      }
      if (this.config.gpioPins.saunaDoorPin !== undefined) {
        rpio.open(
          this.config.gpioPins.saunaDoorPin,
          rpio.INPUT,
          rpio.PULL_DOWN,
        );
      }
      if (this.config.gpioPins.steamDoorPin !== undefined) {
        rpio.open(
          this.config.gpioPins.steamDoorPin,
          rpio.INPUT,
          rpio.PULL_DOWN,
        );
      }
    } catch (error) {
      this.platform.log.error('Failed to initialize GPIO pins:', error);
      throw error;
    }
  }

  // Close GPIO pins during cleanup
  private cleanupGpioPins() {
    this.config.gpioPins.saunaPowerPins.forEach((pin) => rpio.close(pin));
    this.config.gpioPins.steamPowerPins.forEach((pin) => rpio.close(pin));
    if (this.config.gpioPins.lightPin !== undefined) {
      rpio.close(this.config.gpioPins.lightPin);
    }
    if (this.config.gpioPins.fanPin !== undefined) {
      rpio.close(this.config.gpioPins.fanPin);
    }
    if (this.config.gpioPins.saunaDoorPin !== undefined) {
      rpio.close(this.config.gpioPins.saunaDoorPin);
    }
    if (this.config.gpioPins.steamDoorPin !== undefined) {
      rpio.close(this.config.gpioPins.steamDoorPin);
    }
  }

  // Initialize the ADC with a timeout and error handling
  private initializeAdc(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('ADC initialization timeout'));
      }, 5000); // 5-second timeout

      openMcp3008(0, { speedHz: 1350000 }, (error) => {
        clearTimeout(timeout);
        if (error) {
          this.platform.log.error('Failed to open ADC:', error);
          reject(error);
        } else {
          this.platform.log.info('ADC opened successfully.');
          resolve();
        }
      });
    });
  }

  // Initialize the I2C bus with error handling and optional timeout
  private initializeI2C(): Promise<void> {
    if (!this.config.hasSteamI2C) {
      this.platform.log.info(
        'I2C initialization skipped as hasSteamI2C is set to false.',
      );
      return Promise.resolve();
    }

    return i2c
      .openPromisified(1)
      .then((bus) => {
        this.i2cBus = bus;
        this.platform.log.info('I2C bus opened successfully.');
      })
      .catch((err) => {
        this.platform.log.error('Failed to open I2C bus:', err);
        throw err;
      });
  }

  private setupAccessory() {
    // GPIO initialization is already done in initializeGpioPinsAsync
    // Setup other services and monitoring

    // Setup thermostats based on config
    if (this.config.hasSauna) {
      this.addThermostatService(
        'Sauna Thermostat',
        'sauna-thermostat',
        this.handleStateSet.bind(this, 'sauna'),
        this.handleTemperatureSet.bind(this, 'sauna'),
      );
    }

    if (this.config.hasSteam) {
      this.addThermostatService(
        'Steam Thermostat',
        'steam-thermostat',
        this.handleStateSet.bind(this, 'steam'),
        this.handleTemperatureSet.bind(this, 'steam'),
      );
    }

    if (this.config.hasLight) {
      this.lightPowerSwitch = this.addSwitchService(
        'Light Power',
        'light-power',
        this.handleLightPowerSet.bind(this),
      );
    }

    if (this.config.hasFan) {
      this.fanPowerSwitch = this.addSwitchService(
        'Fan Power',
        'fan-power',
        this.handleFanPowerSet.bind(this),
      );
    }

    // Setup auxiliary temperature sensors
    this.config.auxSensors.forEach((sensor) => {
      const sensorName = sensor.name;
      const auxSensorService =
        this.accessory.getService(sensorName) ||
        this.accessory.addService(
          this.platform.Service.TemperatureSensor,
          sensorName,
          `aux-${sensor.channel}`,
        );

      // Store the service in the map for later updates
      if (auxSensorService) {
        this.auxTemperatureSensors.set(sensorName, auxSensorService);
      }
    });

    // Setup steam temperature and humidity sensors
    if (this.config.hasSteam) {
      this.steamTemperatureSensor = this.addTemperatureSensorService(
        'Steam Temperature',
        'steam-temperature',
      );
      this.steamHumiditySensor = this.addHumiditySensorService(
        'Steam Humidity',
        'steam-humidity',
      );
    }

    // Setup door sensors
    if (this.config.hasSauna) {
      this.addContactSensorService('Sauna Door', 'sauna-door');
    }

    if (this.config.hasSteam) {
      this.addContactSensorService('Steam Door', 'steam-door');
    }

    // Monitor temperatures and humidity
    this.monitorTemperatures();
    if (this.config.hasSteamI2C) {
      this.monitorHumidity();
    }
  }

  // Set the name characteristic for the power switch
  private addSwitchService(
    name: string,
    subtype: string,
    onSetHandler: (value: CharacteristicValue) => void,
  ): Service {
    const switchService =
      this.accessory.getService(subtype) ||
      this.accessory.addService(this.platform.Service.Switch, name, subtype);
    switchService
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(onSetHandler);
    switchService.setCharacteristic(this.platform.Characteristic.Name, name); // Set the name
    return switchService;
  }

  // Set the name characteristic for the thermostat
  private addThermostatService(
    name: string,
    subtype: string,
    powerSetHandler: (value: CharacteristicValue) => void,
    temperatureSetHandler: (value: CharacteristicValue) => void,
  ): Service {
    const thermostatService =
      this.accessory.getService(subtype) ||
      this.accessory.addService(
        this.platform.Service.Thermostat,
        name,
        subtype,
      );

    // Restrict modes to "Off" and "Heat"
    thermostatService
      .getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHeatingCoolingState.OFF,
          this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
        ],
      })
      .onSet(powerSetHandler);

    // Initialize the mode to "Off" to avoid unexpected behavior
    thermostatService
      .getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .updateValue(this.platform.Characteristic.TargetHeatingCoolingState.OFF);

    // Set the temperature properties based on config
    const maxTemperature =
      subtype === 'sauna-thermostat'
        ? this.config.saunaMaxTemperature
        : this.config.steamMaxTemperature;

    this.platform.log.info(`Setup ${name}`);

    thermostatService
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: 0, // Minimum temperature is 0°C
        maxValue: maxTemperature, // Maximum temperature based on user config
        minStep: 1, // Example: 1°C increments
      })
      .onSet(temperatureSetHandler)
      .updateValue(0); // Set initial temperature to 0 to prevent inadvertent heating

    // Set the name characteristic
    thermostatService.setCharacteristic(
      this.platform.Characteristic.Name,
      name,
    );

    return thermostatService;
  }

  // Set the name characteristic for the temperature sensor
  private addTemperatureSensorService(name: string, subtype: string): Service {
    const tempService =
      this.accessory.getService(subtype) ||
      this.accessory.addService(
        this.platform.Service.TemperatureSensor,
        name,
        subtype,
      );
    tempService.setCharacteristic(this.platform.Characteristic.Name, name); // Set the name
    return tempService;
  }

  // Set the name characteristic for the humidity sensor
  private addHumiditySensorService(name: string, subtype: string): Service {
    const humidityService =
      this.accessory.getService(subtype) ||
      this.accessory.addService(
        this.platform.Service.HumiditySensor,
        name,
        subtype,
      );
    humidityService.setCharacteristic(this.platform.Characteristic.Name, name); // Set the name
    return humidityService;
  }

  // Set the name characteristic for the contact sensor
  private addContactSensorService(name: string, subtype: string): Service {
    const contactService =
      this.accessory.getService(subtype) ||
      this.accessory.addService(
        this.platform.Service.ContactSensor,
        name,
        subtype,
      );
    contactService.setCharacteristic(this.platform.Characteristic.Name, name); // Set the name
    return contactService;
  }

  private handleLightPowerSet(value: CharacteristicValue) {
    this.platform.log.info('Light Power:', value);
    if (this.config.gpioPins.lightPin !== undefined) {
      rpio.write(this.config.gpioPins.lightPin, value ? rpio.HIGH : rpio.LOW);
    }

    // Update the characteristic value to reflect the current state
    this.lightPowerSwitch?.updateCharacteristic(
      this.platform.Characteristic.On,
      value,
    );
  }

  private handleFanPowerSet(value: CharacteristicValue) {
    this.platform.log.info('Fan Power:', value);
    if (this.config.gpioPins.fanPin !== undefined) {
      rpio.write(this.config.gpioPins.fanPin, value ? rpio.HIGH : rpio.LOW);
    }

    // Update the characteristic value to reflect the current state
    this.fanPowerSwitch?.updateCharacteristic(
      this.platform.Characteristic.On,
      value,
    );
  }

  private async handleStateSet(
    system: AuxSensorConfig['system'],
    value: CharacteristicValue,
  ) {
    if (!system) {
      this.platform.log.warn('System is null or undefined. Cannot handle state.');
      return;
    }

    const isRunning = system === 'sauna' ? this.saunaRunning : this.steamRunning;
    const otherSystem = system === 'sauna' ? 'steam' : 'sauna';
    const otherSystemRunning =
      system === 'sauna' ? this.steamRunning : this.saunaRunning;
    const service = this.accessory.getService(`${system}-thermostat`);

    this.platform.log.info(
      `${system.charAt(0).toUpperCase() + system.slice(1)} Mode Request:`,
      value ? 'Heat' : 'Off',
    );

    if (otherSystemRunning && value === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      this.platform.log.warn(
        `${system.charAt(0).toUpperCase() + system.slice(1)} cannot be started because the other system is already running. Turning off ${otherSystem}.`,
      );

      // Turn off the other system before turning on the requested one
      await this.turnOffOtherSystem(otherSystem);

      this.platform.log.info(`${otherSystem} turned off. Starting ${system}.`);
    }

    if (service) {
      service
        .getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
        .updateValue(value);

      if (value === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
        if (!isRunning) {
          this.platform.log.info(`${system.charAt(0).toUpperCase() + system.slice(1)} Mode Changed: Heat`);
          if (system === 'sauna') {
            this.saunaRunning = true;
          } else {
            this.steamRunning = true;
          }
          this.platform.log.info(`Sauna Running: ${this.saunaRunning}`);
          service
            .getCharacteristic(this.platform.Characteristic.TargetTemperature)
            .updateValue(
              system === 'sauna'
                ? this.lastSaunaTargetTemperature
                : this.lastSteamTargetTemperature,
            ); // Restore last target temperature

          this.startSystem(
            system,
            system === 'sauna'
              ? this.config.gpioPins.saunaPowerPins
              : this.config.gpioPins.steamPowerPins,
            system === 'sauna'
              ? this.config.saunaTimeout
              : this.config.steamTimeout,
          );

          // Start monitoring the doors when the system is turned on
          this.monitorDoors(system as 'sauna' | 'steam', true);
        }
      } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
        if (isRunning) {
          this.platform.log.info(`Turning ${system} to OFF mode.`);
          if (system === 'sauna') {
            this.saunaRunning = false;
          } else {
            this.steamRunning = false;
          }
          this.platform.log.info(`Sauna Running: ${this.saunaRunning}`);
          this.stopSystem(
            system,
            system === 'sauna'
              ? this.config.gpioPins.saunaPowerPins
              : this.config.gpioPins.steamPowerPins,
          );

          // Stop monitoring the doors when the system is turned off
          this.monitorDoors(system as 'sauna' | 'steam', true);
        }
      } else {
        this.platform.log.warn('Unexpected mode:', value);
      }
    }
  }

  private async turnOffOtherSystem(system: 'sauna' | 'steam') {
    if (system === 'sauna' && this.saunaRunning) {
      this.platform.log.info('Turning off sauna before starting steam.');
      this.stopSystem('sauna', this.config.gpioPins.saunaPowerPins);
      this.saunaRunning = false;
    } else if (system === 'steam' && this.steamRunning) {
      this.platform.log.info('Turning off steam before starting sauna.');
      this.stopSystem('steam', this.config.gpioPins.steamPowerPins);
      this.steamRunning = false;
    }

    // Add a short delay to ensure the system has fully turned off before proceeding
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  private handleTemperatureSet(
    system: AuxSensorConfig['system'],
    value: CharacteristicValue,
  ) {
    if (!system) {
      this.platform.log.warn(
        'System is null or undefined. Cannot handle state.',
      );
      return;
    }
    this.platform.log.info(
      `${system.charAt(0).toUpperCase() + system.slice(1)
      } Temperature Request:`,
      value,
    );

    if (typeof value === 'number') {
      if (system === 'sauna') {
        this.lastSaunaTargetTemperature = value;
      } else {
        this.lastSteamTargetTemperature = value;
      }
    }

    const service = this.accessory.getService(`${system}-thermostat`);
    if (service) {
      service
        .getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .updateValue(value);

      this.platform.log.info(
        `${system.charAt(0).toUpperCase() + system.slice(1)
        } Target Updated: ${value}`,
      );
    }
  }

  // Start a system with timeout logic
  private startSystem(
    system: AuxSensorConfig['system'],
    powerPins: number[],
    timeout: number,
  ) {
    this.platform.log.info(`Starting ${system} with timeout...`);
    this.setPowerState(powerPins, true);

    // Clear the appropriate timer based on the system
    if (system === 'sauna') {
      if (this.saunaTimer) {
        clearTimeout(this.saunaTimer);
      }
      this.saunaTimer = setTimeout(() => {
        this.stopSystem(system, powerPins);
      }, timeout * 1000);
    } else if (system === 'steam') {
      if (this.steamTimer) {
        clearTimeout(this.steamTimer);
      }
      this.steamTimer = setTimeout(() => {
        this.stopSystem(system, powerPins);
      }, timeout * 1000);
    }
  }

  // Stop a system and clear the timer
  private stopSystem(system: AuxSensorConfig['system'], powerPins: number[]) {
    this.platform.log.info(`Stopping ${system}...`);
    this.setPowerState(powerPins, false);

    // Clear the appropriate timer based on the system
    if (system === 'sauna') {
      if (this.saunaTimer) {
        clearTimeout(this.saunaTimer);
        this.saunaTimer = null;
      }
    } else if (system === 'steam') {
      if (this.steamTimer) {
        clearTimeout(this.steamTimer);
        this.steamTimer = null;
      }
    }
  }

  // Utility to set power state on GPIO
  private setPowerState(pins: number[], state: CharacteristicValue) {
    const powerState = state ? rpio.HIGH : rpio.LOW;
    pins.forEach((pin) => {
      rpio.open(pin, rpio.OUTPUT);
      rpio.write(pin, powerState);
      rpio.close(pin);
    });
  }

  // Monitor temperatures using ADC channels
  private monitorTemperatures() {
    this.config.auxSensors.forEach((sensor) => {
      const adcChannel = sensor.channel as EightChannels;

      // Open ADC channel for each sensor
      this.adc = openMcp3008(
        adcChannel,
        { speedHz: 1350000 },
        (err: string) => {
          if (err) {
            this.platform.log.error(
              `Failed to open ADC channel ${adcChannel} for sensor "${sensor.name}": ${err}`,
            );
            return;
          }

          // Set up a regular interval to read from the ADC channel
          const interval = setInterval(() => {
            this.adc.read((err: string | null, reading: McpReading) => {
              if (err) {
                this.platform.log.error(
                  `Failed to read temperature for sensor "${sensor.name}": ${err}`,
                );
                return;
              }

              // Convert the ADC reading to a temperature value
              const temperatureCelsius = this.calculateTemperature(reading.value, sensor.resistanceAt25C, sensor.bValue);
              const displayTemperature = this.config.temperatureUnitFahrenheit
                ? this.convertToFahrenheit(temperatureCelsius)
                : temperatureCelsius;

              // Check for invalid readings (e.g., sensor disconnected)
              const isInvalidReading =
                temperatureCelsius < -20 || temperatureCelsius > 150;
              if (isInvalidReading) {
                this.platform.log.warn(
                  `${sensor.name
                  } Invalid Temperature: ${displayTemperature.toFixed(2)} °${this.config.temperatureUnitFahrenheit ? 'F' : 'C'
                  }`,
                );
                // Reflect the invalid state in the HomeKit UI or log
                this.reflectInvalidReadingState(sensor);
                return;
              } else {
                this.platform.log.info(
                  `[Temp] ${sensor.name}:${temperatureCelsius}`,
                );
              }

              // Update the HomeKit characteristic with the current temperature
              const auxSensorService = this.auxTemperatureSensors.get(
                sensor.name,
              );
              if (auxSensorService) {
                auxSensorService.updateCharacteristic(
                  this.platform.Characteristic.CurrentTemperature,
                  displayTemperature,
                );
              }

              this.platform.log.info(
                `${sensor.name} Temperature: ${displayTemperature.toFixed(
                  2,
                )} °${this.config.temperatureUnitFahrenheit ? 'F' : 'C'}`,
              );

              // Perform actions based on the temperature reading
              this.handleTemperatureControl(sensor, temperatureCelsius);

              // Perform additional safety checks for PCB temperature
              if (sensor.name === 'PCB_NTC') {
                this.monitorPcbTemperatureSafety(temperatureCelsius);
              }
            });
          }, 5000); // check temperature every 5 seconds

          this.temperatureIntervals.push(interval);
        },
      );
    });
  }

  private handleTemperatureControl(
    sensor: AuxSensorConfig,
    temperatureCelsius: number,
  ) {
    let powerPins: number[] | undefined;
    let maxTemperature: number | undefined;
    let safetyTemperature: number | undefined;
    let switchService: Service | undefined;

    switch (sensor.system) {
      case 'sauna':
        powerPins = this.config.gpioPins.saunaPowerPins;
        maxTemperature = this.config.saunaMaxTemperature;
        safetyTemperature = this.config.saunaSafetyTemperature;
        break;
      case 'steam':
        powerPins = this.config.gpioPins.steamPowerPins;
        maxTemperature = this.config.steamMaxTemperature;
        safetyTemperature = this.config.steamSafetyTemperature;
        break;
    }

    // Check for invalid readings or NaN values
    const isInvalidReading =
      isNaN(temperatureCelsius) ||
      temperatureCelsius < -20 ||
      temperatureCelsius > 150;

    if (powerPins) {
      if (isInvalidReading) {
        // Ensure power remains off for invalid readings
        this.handleStateSet(sensor.system, 0);
        switchService?.updateCharacteristic(
          this.platform.Characteristic.On,
          false,
        ); // Update UI state
        this.platform.log.error(
          `${sensor.name} has an invalid signal. Power off due to invalid reading.`,
        );
        return; // Exit early since the reading is invalid
      }

      // Check safety temperature for critical shutdown
      if (
        safetyTemperature !== undefined &&
        temperatureCelsius >= safetyTemperature
      ) {
        this.setPowerState(powerPins, false);
        switchService?.updateCharacteristic(
          this.platform.Characteristic.On,
          false,
        ); // Update UI state
        this.flashLights(10); // Flash warning lights
        this.platform.log.error(
          `${sensor.name} exceeded safety temperature! Immediate power off and flashing lights.`,
        );
        return; // Exit to ensure no further action is taken
      }

      // Check normal operational max temperature
      if (
        maxTemperature !== undefined &&
        temperatureCelsius >= maxTemperature
      ) {
        this.setPowerState(powerPins, false);
        switchService?.updateCharacteristic(
          this.platform.Characteristic.On,
          false,
        ); // Update UI state
        this.flashLights(10); // Flash warning lights
        this.platform.log.warn(
          `${sensor.name} exceeded max temperature. Power off and flashing lights.`,
        );
        return; // Exit to ensure no further action is taken
      }

      // If none of the safety conditions are met, handle normal operation
      const saunaService = this.accessory.getService('sauna-thermostat');
      const currentMode = saunaService?.getCharacteristic(
        this.platform.Characteristic.TargetHeatingCoolingState,
      ).value;

      // If in HEAT mode and temperature is below target, turn on the heater
      if (
        currentMode ===
        this.platform.Characteristic.TargetHeatingCoolingState.HEAT &&
        temperatureCelsius < this.lastSaunaTargetTemperature
      ) {
        this.platform.log.info(
          'Turning sauna ON due to HEAT mode and low temperature.',
        );
        this.saunaRunning = true;
        this.setPowerState(powerPins, true);
      } else if (
        this.saunaRunning &&
        temperatureCelsius >= this.lastSaunaTargetTemperature
      ) {
        // Turn off heater if temperature reaches or exceeds target
        this.platform.log.info(
          'Turning sauna OFF due to target temperature being reached.',
        );
        this.saunaRunning = false;
        this.setPowerState(powerPins, false);
      }
    }
  }

  // Method to reflect invalid sensor state in the HomeKit UI or log
  private reflectInvalidReadingState(sensor: AuxSensorConfig) {
    // Optionally, update the UI to reflect an error state if supported
    // For example, using a custom characteristic or accessory to indicate the error
    const auxSensorService = this.auxTemperatureSensors.get(sensor.name);
    if (auxSensorService) {
      auxSensorService.updateCharacteristic(
        this.platform.Characteristic.StatusFault,
        this.platform.Characteristic.StatusFault.GENERAL_FAULT,
      );
    }
  }

  // Monitor PCB temperature to ensure it doesn't exceed safety limits
  private monitorPcbTemperatureSafety(temperatureCelsius: number) {
    const safetyTemperature = this.config.controllerSafetyTemperature;
    if (temperatureCelsius > safetyTemperature) {
      this.disableAllRelays();
      this.flashLights(10); // Flash warning lights
      this.platform.log.error(
        'Controller PCB temperature exceeded safety limit! All relays disabled and flashing lights.',
      );
    }
  }

  private flashLights(times: number) {
    if (typeof this.config.gpioPins.lightPin === 'number') {
      for (let i = 0; i < times; i++) {
        this.setPowerState([this.config.gpioPins.lightPin], true);
        // Use a delay mechanism here if needed
        this.setPowerState([this.config.gpioPins.lightPin], false);
      }
    } else {
      this.platform.log.error('Light pin is not configured.');
    }
  }

  // Disable all relays and flash warning lights
  private disableAllRelays() {
    const allPins = [
      ...this.config.gpioPins.saunaPowerPins,
      ...this.config.gpioPins.steamPowerPins,
      this.config.gpioPins.lightPin,
      this.config.gpioPins.fanPin,
    ].filter((pin): pin is number => pin !== undefined);

    // Turn off all relays
    this.setPowerState(allPins, false);
  }

  private monitorHumidity() {
    this.humidityInterval = setInterval(async () => {
      try {
        await this.i2cBus.writeByte(0x5c, 0x00, 0x00);
        await new Promise((resolve) => setTimeout(resolve, 1)); // Delay for wake-up
        const buffer = Buffer.alloc(8);
        await this.i2cBus.readI2cBlock(0x5c, 0x03, 8, buffer);

        const humidity = ((buffer[2] << 8) + buffer[3]) / 10.0;
        const temperatureCelsius = ((buffer[4] << 8) + buffer[5]) / 10.0;
        const displayTemperature = this.config.temperatureUnitFahrenheit
          ? this.convertToFahrenheit(temperatureCelsius)
          : temperatureCelsius;

        this.platform.log.info(`Steam Humidity: ${humidity} %`);
        this.platform.log.info(
          `Steam Temperature: ${displayTemperature.toFixed(2)} °${this.config.temperatureUnitFahrenheit ? 'F' : 'C'
          }`,
        );

        if (this.steamHumiditySensor) {
          this.steamHumiditySensor.updateCharacteristic(
            this.platform.Characteristic.CurrentRelativeHumidity,
            humidity,
          );
        }

        if (this.steamTemperatureSensor) {
          this.steamTemperatureSensor.updateCharacteristic(
            this.platform.Characteristic.CurrentTemperature,
            displayTemperature,
          );
        }

        if (humidity > this.config.steamMaxHumidity) {
          this.stopSystem('steam', this.config.gpioPins.steamPowerPins);
          this.platform.log.warn(
            'Steam humidity exceeded max humidity. Steam power off.',
          );
          this.handleStateSet('steam', 0); //Power off
        }
      } catch (err) {
        this.platform.log.error(
          `Failed to read humidity and temperature: ${(err as Error).message}`,
        );
        this.handleStateSet('steam', 0); // Power off
      }
    }, 10000); // Check humidity every 10 seconds
  }

  public clearIntervalsAndTimeouts() {
    if (this.saunaTimer) {
      clearTimeout(this.saunaTimer);
      this.saunaTimer = null;
    }
    if (this.steamTimer) {
      clearTimeout(this.steamTimer);
      this.steamTimer = null;
    }
    this.temperatureIntervals.forEach((interval) => clearInterval(interval));
    this.temperatureIntervals = [];
    if (this.humidityInterval) {
      clearInterval(this.humidityInterval);
      this.humidityInterval = null;
    }
  }

  // Monitor or stop monitoring door states using GPIO
  private monitorDoors(system: 'sauna' | 'steam', monitor: boolean) {
    const doorSensor = system === 'sauna' ? this.config.gpioPins.saunaDoorPin : this.config.gpioPins.steamDoorPin;
    const inverse = system === 'sauna' ? this.config.inverseSaunaDoor : this.config.inverseSteamDoor;
    const allowOnWhileOpen = system === 'sauna' ? this.config.saunaOnWhileDoorOpen : this.config.steamOnWhileDoorOpen;
    const powerPins = system === 'sauna' ? this.config.gpioPins.saunaPowerPins : this.config.gpioPins.steamPowerPins;

    if (doorSensor !== undefined) {
      if (monitor) {
        try {
        // Check if poll was registered
          if (this.doorPollRegistered[doorSensor]) {
            this.platform.log.info(`Poll for ${system} door already registered.`);
            return;
          }

          rpio.poll(
            doorSensor,
            () => {
              const doorOpen = inverse
                ? rpio.read(doorSensor) === 0
                : rpio.read(doorSensor) === 1;
              this.platform.log.info(
                `${system.charAt(0).toUpperCase() + system.slice(1)} Door ${
                  doorOpen ? 'Open' : 'Closed'
                }`,
              );

              const doorServiceName = `${system.charAt(0).toUpperCase() + system.slice(1)} Door`;
              const doorService = this.accessory.getService(doorServiceName);

              if (doorService) {
                doorService.updateCharacteristic(
                  this.platform.Characteristic.ContactSensorState,
                  doorOpen
                    ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
                    : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
                );
              }
              // Ensure the heater turns off if set to not operate with door open.
              if (doorOpen && !allowOnWhileOpen && powerPins) {
                this.setPowerState(powerPins, false);
                this.platform.log.warn(`${system} power off due to door open.`);
              } else if (!doorOpen && !allowOnWhileOpen && powerPins) {
              // Ensure the heater is resumed only when it was initially turned off due to the door open state
                this.setPowerState(powerPins, true);
                this.platform.log.info(`${system} power resumed as door closed.`);
              }
            },
            rpio.POLL_BOTH,
          );

          // Mark the poll as registered
          this.doorPollRegistered[doorSensor] = true;
        } catch (error) {
          this.platform.log.error(`Error setting up poll for ${system} door: ${error}`);
        }
      } else {
      // Unregister the poll if it exists
        if (this.doorPollRegistered[doorSensor]) {
          try {
            rpio.poll(doorSensor, null);
            this.doorPollRegistered[doorSensor] = false;
            this.platform.log.info(`Stopped monitoring ${system} door.`);
          } catch (error) {
            this.platform.log.error(`Error unregistering poll for ${system} door: ${error}`);
          }
        }
      }
    } else {
      this.platform.log.warn(`No door pin configured for ${system}`);
    }
  }

  private calculateTemperature(adcValue: number, resistanceAt25C: number, bValue: number): number {
    const pullUpResistor = 10000; // 10k ohm pull-up resistor

    // Calculate the resistance of the thermistor based on the ADC value
    let resistance = (1023 / adcValue) - 1;
    resistance = pullUpResistor / resistance;

    // Apply the Steinhart-Hart equation
    let steinhart = resistance / resistanceAt25C; // (R/Ro)
    steinhart = Math.log(steinhart); // ln(R/Ro)
    steinhart /= bValue; // 1/B * ln(R/Ro)
    steinhart += 1.0 / (25 + 273.15); // + (1/To)
    steinhart = 1.0 / steinhart; // Invert
    steinhart -= 273.15; // convert to Celsius

    return steinhart;
  }

  // Utility function to convert Celsius to Fahrenheit
  private convertToFahrenheit(celsius: number): number {
    return celsius * 1.8 + 32;
  }
}
