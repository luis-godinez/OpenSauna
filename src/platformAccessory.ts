// Import necessary modules
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { OpenSaunaPlatform } from './platform.js';
import rpio from 'rpio'; // Updated import to use rpio
import {
  openMcp3008,
  McpInterface,
  McpReading,
  EightChannels,
} from 'mcp-spi-adc';
import i2c from 'i2c-bus'; // Assume types declared in typings.d.ts
import { OpenSaunaConfig, AuxSensorConfig } from './settings.js';

export class OpenSaunaAccessory {
  private auxTemperatureSensors: Map<string, Service> = new Map(); // Define auxTemperatureSensors
  private steamHumiditySensor?: Service; // Define steamHumiditySensor
  private steamTemperatureSensor?: Service; // Define steamTemperatureSensor
  private saunaRunning: boolean = false;
  private lastSaunaTargetTemperature: number = 0; // Store last set target temperature

  private steamRunning: boolean = false;
  private lastSteamTargetTemperature: number = 0; // Store last set target temperature

  private lightPowerSwitch?: Service; // Define lightPowerSwitch
  private fanPowerSwitch?: Service; // Define fanPowerSwitch

  private adc!: McpInterface; // Define adc as McpInterface
  private i2cBus!: i2c.PromisifiedBus; // Define i2cBus

  private saunaTimer: NodeJS.Timeout | null = null; // Timer for sauna power off
  private steamTimer: NodeJS.Timeout | null = null; // Timer for sauna power off
  private temperatureIntervals: NodeJS.Timeout[] = []; // Track temperature intervals
  private humidityInterval: NodeJS.Timeout | null = null; // Track humidity interval

  constructor(
    private readonly platform: OpenSaunaPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: OpenSaunaConfig,
  ) {
    // Set the accessory information
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
    rpio.init({
      mapping: 'gpio', // Use GPIO pin numbering
    });

    // Validate sensor configuration
    this.validateSensorConfiguration();

    // Initialize the ADC using openMcp3008
    openMcp3008(0, { speedHz: 1350000 }, (error: string) => {
      if (error) {
        this.platform.log.error('Failed to open ADC:', error);
      } else {
        this.platform.log.info('ADC opened successfully.');
      }
    });

    // Initialize I2C Bus
    i2c
      .openPromisified(1)
      .then((bus) => {
        this.i2cBus = bus;
      })
      .catch((err: unknown) => {
        if (err instanceof Error) {
          this.platform.log.error('Failed to open I2C bus:', err.message);
        } else {
          this.platform.log.error('Failed to open I2C bus:', String(err));
        }
      });

    // Initialize all necessary services based on the config
    this.setupAccessory();

    // Ensure GPIO pins are cleaned up on process exit
    process.on('exit', this.cleanupGpioPins.bind(this));
    process.on('SIGINT', () => {
      // Handle Ctrl+C signal
      this.cleanupGpioPins();
      process.exit();
    });
    process.on('SIGTERM', () => {
      // Handle termination signal
      this.cleanupGpioPins();
      process.exit();
    });
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

  // Initialize GPIO pins during setup
  private initializeGpioPins() {
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
      rpio.open(this.config.gpioPins.saunaDoorPin, rpio.INPUT, rpio.PULL_DOWN); // Or PULL_UP, as needed
    }
    if (this.config.gpioPins.steamDoorPin !== undefined) {
      rpio.open(this.config.gpioPins.steamDoorPin, rpio.INPUT, rpio.PULL_DOWN); // Or PULL_DOWN, as needed
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

  private setupAccessory() {
    this.initializeGpioPins();

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

    // Monitor temperatures, humidity, and door states
    this.monitorTemperatures();
    this.monitorHumidity();
    this.monitorDoors();
    process.on('exit', this.cleanupGpioPins.bind(this));
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

  private handleStateSet(system: AuxSensorConfig['system'], value: CharacteristicValue) {
    if (!system) {
      this.platform.log.warn('System is null or undefined. Cannot handle state.');
      return;
    }

    const isRunning = system === 'sauna' ? this.saunaRunning : this.steamRunning;
    const service = this.accessory.getService(`${system}-thermostat`);

    this.platform.log.info(`${system.charAt(0).toUpperCase() + system.slice(1)} Mode Request:`, value ? 'Heat' : 'Off');

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
          service
            .getCharacteristic(this.platform.Characteristic.TargetTemperature)
            .updateValue(system === 'sauna' ? this.lastSaunaTargetTemperature : this.lastSteamTargetTemperature); // Restore last target temperature

          this.startSystem(
            system,
            system === 'sauna' ? this.config.gpioPins.saunaPowerPins : this.config.gpioPins.steamPowerPins,
            system === 'sauna' ? this.config.saunaTimeout : this.config.steamTimeout,
          );
        }
      } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
        if (isRunning) {
          this.platform.log.info(`Turning ${system} to OFF mode.`);
          if (system === 'sauna') {
            this.saunaRunning = false;
          } else {
            this.steamRunning = false;
          }
          this.stopSystem(system, system === 'sauna' ? this.config.gpioPins.saunaPowerPins : this.config.gpioPins.steamPowerPins);
        }
      } else {
        this.platform.log.warn('Unexpected mode:', value);
      }
    }
  }

  private handleTemperatureSet(system: AuxSensorConfig['system'], value: CharacteristicValue) {
    if (!system) {
      this.platform.log.warn('System is null or undefined. Cannot handle state.');
      return;
    }
    this.platform.log.info(`${system.charAt(0).toUpperCase() + system.slice(1)} Temperature Request:`, value);

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

      this.platform.log.info(`${system.charAt(0).toUpperCase() + system.slice(1)} Target Updated: ${value}`);
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
              const temperatureCelsius = (reading.value * 3.3 - 0.5) * 100;
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
              } else{
                this.platform.log.info(`[Temp] ${sensor.name}:${temperatureCelsius}`);
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
        currentMode === this.platform.Characteristic.TargetHeatingCoolingState.HEAT &&
        temperatureCelsius < this.lastSaunaTargetTemperature
      ) {
        this.platform.log.info('Turning sauna ON due to HEAT mode and low temperature.');
        this.saunaRunning = true;
        this.setPowerState(powerPins, true);
      } else if (this.saunaRunning && temperatureCelsius >= this.lastSaunaTargetTemperature) {
        // Turn off heater if temperature reaches or exceeds target
        this.platform.log.info('Turning sauna OFF due to target temperature being reached.');
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
    this.temperatureIntervals.forEach((interval) => clearInterval(interval));
    this.temperatureIntervals = [];
    if (this.humidityInterval) {
      clearInterval(this.humidityInterval);
      this.humidityInterval = null;
    }
  }

  // Monitor door states using GPIO
  private monitorDoors() {
    const doorSensors = [
      {
        type: 'sauna',
        pin: this.config.gpioPins.saunaDoorPin,
        inverse: this.config.inverseSaunaDoor,
        allowOnWhileOpen: this.config.saunaOnWhileDoorOpen,
        powerPins: this.config.gpioPins.saunaPowerPins,
      },
      {
        type: 'steam',
        pin: this.config.gpioPins.steamDoorPin,
        inverse: this.config.inverseSteamDoor,
        allowOnWhileOpen: this.config.steamOnWhileDoorOpen,
        powerPins: this.config.gpioPins.steamPowerPins,
      },
    ];

    doorSensors.forEach(
      ({ type, pin, inverse, allowOnWhileOpen, powerPins }) => {
        if (pin !== undefined) {
          try {
            rpio.poll(pin, null); // Unregister existing poll to avoid duplicate listeners
          } catch (error) {
            this.platform.log.error(
              `Error unregistering poll for pin ${pin}: ${error}`,
            );
          }

          rpio.poll(
            pin,
            () => {
              const doorOpen = inverse
                ? rpio.read(pin) === 0
                : rpio.read(pin) === 1;
              this.platform.log.info(
                `${type.charAt(0).toUpperCase() + type.slice(1)} Door ${doorOpen ? 'Open' : 'Closed'
                }`,
              );

              const doorServiceName = `${type.charAt(0).toUpperCase() + type.slice(1)
              } Door`;
              const doorService = this.accessory.getService(doorServiceName);

              if (doorService) {
                doorService.updateCharacteristic(
                  this.platform.Characteristic.ContactSensorState,
                  doorOpen
                    ? this.platform.Characteristic.ContactSensorState
                      .CONTACT_DETECTED
                    : this.platform.Characteristic.ContactSensorState
                      .CONTACT_NOT_DETECTED,
                );
              }
              // Ensure the heater turns off if set to not operate with door open.
              if (doorOpen && !allowOnWhileOpen && powerPins) {
                this.setPowerState(powerPins, false);
                this.platform.log.warn(`${type} power off due to door open.`);
              } else if (!doorOpen && !allowOnWhileOpen && powerPins) {
                // Ensure the heater is resumed only when it was initially turned off due to the door open state
                this.setPowerState(powerPins, true);
                this.platform.log.info(`${type} power resumed as door closed.`);
              }
            },
            rpio.POLL_BOTH,
          ); // Ensure both rising and falling edges are detected
        } else {
          this.platform.log.warn(`No door pin configured for ${type}`);
        }
      },
    );
  }

  // Utility function to convert Celsius to Fahrenheit
  private convertToFahrenheit(celsius: number): number {
    return celsius * 1.8 + 32;
  }
}
