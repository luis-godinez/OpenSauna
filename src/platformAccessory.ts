// Import necessary modules
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { OpenSaunaPlatform } from './platform.js';
import { Gpio } from 'pigpio'; // Updated import from pigpio
import { openMcp3008, McpInterface, McpReading, EightChannels } from 'mcp-spi-adc';
import i2c from 'i2c-bus'; // Assume types declared in typings.d.ts
import { OpenSaunaConfig, AuxSensorConfig } from './settings.js';

export class OpenSaunaAccessory {
  private saunaPowerSwitch?: Service;
  private steamPowerSwitch?: Service;
  private lightPowerSwitch?: Service;
  private fanPowerSwitch?: Service;
  private saunaThermostat?: Service;
  private steamThermostat?: Service;
  private saunaTemperatureSensor?: Service;
  private pcbTemperatureSensor?: Service;
  private steamTemperatureSensor?: Service;
  private steamHumiditySensor?: Service;
  private saunaDoorSensor?: Service;
  private steamDoorSensor?: Service;
  private auxTemperatureSensors: Map<string, Service> = new Map();

  private gpioPins: Gpio[] = [];
  private adc!: McpInterface; // Define adc as McpInterface
  private i2cBus!: i2c.PromisifiedBus; // Define i2cBus

  private saunaTimer: NodeJS.Timeout | null = null; // Timer for sauna power off
  private temperatureIntervals: NodeJS.Timeout[] = []; // Track temperature intervals
  private humidityInterval: NodeJS.Timeout | null = null; // Track humidity interval

  constructor(
    private readonly platform: OpenSaunaPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: OpenSaunaConfig,
    private readonly accessoryType: 'sauna' | 'steam' | 'light' | 'fan',
  ) {
    // Validate sensor configuration
    this.validateSensorConfiguration();

    // Initialize the ADC
    // Initialize the ADC using openMcp3008
    openMcp3008(0, { speedHz: 1350000 }, (error: string) => {
      if (error) {
        console.error('Failed to open ADC:', error);
      } else {
        console.log('ADC opened successfully.');
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

    // Initialize all necessary services based on the type of accessory
    this.setupAccessory();
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
        throw new Error(`Only one NTC sensor is allowed for the ${system} system.`);
      }
    }
  }

  private setupAccessory() {
    // Setup switches
    this.saunaPowerSwitch =
      this.accessory.getService('Sauna Power') ||
      this.accessory.addService(
        this.platform.Service.Switch,
        'Sauna Power',
        'sauna-power',
      );
    this.saunaPowerSwitch
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.handleSaunaPowerSet.bind(this));

    this.steamPowerSwitch =
      this.accessory.getService('Steam Power') ||
      this.accessory.addService(
        this.platform.Service.Switch,
        'Steam Power',
        'steam-power',
      );
    this.steamPowerSwitch
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.handleSteamPowerSet.bind(this));

    this.lightPowerSwitch =
      this.accessory.getService('Light Power') ||
      this.accessory.addService(
        this.platform.Service.Switch,
        'Light Power',
        'light-power',
      );
    this.lightPowerSwitch
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.handleLightPowerSet.bind(this));

    this.fanPowerSwitch =
      this.accessory.getService('Fan Power') ||
      this.accessory.addService(
        this.platform.Service.Switch,
        'Fan Power',
        'fan-power',
      );
    this.fanPowerSwitch
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.handleFanPowerSet.bind(this));

    // Setup thermostats
    this.saunaThermostat =
      this.accessory.getService('Sauna Thermostat') ||
      this.accessory.addService(
        this.platform.Service.Thermostat,
        'Sauna Thermostat',
        'sauna-thermostat',
      );
    this.saunaThermostat
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(this.handleSaunaTargetTemperatureSet.bind(this));

    this.steamThermostat =
      this.accessory.getService('Steam Thermostat') ||
      this.accessory.addService(
        this.platform.Service.Thermostat,
        'Steam Thermostat',
        'steam-thermostat',
      );
    this.steamThermostat
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(this.handleSteamTargetTemperatureSet.bind(this));

    // Setup temperature sensors
    this.saunaTemperatureSensor =
      this.accessory.getService('Sauna Temperature') ||
      this.accessory.addService(
        this.platform.Service.TemperatureSensor,
        'Sauna Temperature',
        'sauna-temperature',
      );

    this.pcbTemperatureSensor =
      this.accessory.getService('PCB Temperature') ||
      this.accessory.addService(
        this.platform.Service.TemperatureSensor,
        'PCB Temperature',
        'pcb-temperature',
      );

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
    this.steamTemperatureSensor =
      this.accessory.getService('Steam Temperature') ||
      this.accessory.addService(
        this.platform.Service.TemperatureSensor,
        'Steam Temperature',
        'steam-temperature',
      );

    this.steamHumiditySensor =
      this.accessory.getService('Steam Humidity') ||
      this.accessory.addService(
        this.platform.Service.HumiditySensor,
        'Steam Humidity',
        'steam-humidity',
      );

    // Setup door sensors
    this.saunaDoorSensor =
      this.accessory.getService('Sauna Door') ||
      this.accessory.addService(
        this.platform.Service.ContactSensor,
        'Sauna Door',
        'sauna-door',
      );

    this.steamDoorSensor =
      this.accessory.getService('Steam Door') ||
      this.accessory.addService(
        this.platform.Service.ContactSensor,
        'Steam Door',
        'steam-door',
      );

    // Monitor temperatures, humidity, and door states
    this.monitorTemperatures();
    this.monitorHumidity();
    this.monitorDoors();
  }

  // Handle power switch onSet events
  private handleSaunaPowerSet(value: CharacteristicValue) {
    this.platform.log.info('Sauna Power set to:', value);
    this.setPowerState(this.config.gpioPins.saunaPowerPins, value);

    if (value) {
      this.startSauna(); // Start the sauna with timeout
    } else {
      this.stopSauna(); // Stop the sauna immediately
    }
  }

  private handleSteamPowerSet(value: CharacteristicValue) {
    this.platform.log.info('Steam Power set to:', value);
    this.setPowerState(this.config.gpioPins.steamPowerPins, value);
  }

  private handleLightPowerSet(value: CharacteristicValue) {
    this.platform.log.info('Light Power set to:', value);
    if (this.config.gpioPins.lightPin !== undefined) {
      const gpio = new Gpio(this.config.gpioPins.lightPin, {
        mode: Gpio.OUTPUT,
      });
      gpio.digitalWrite(value ? 1 : 0);
    }
  }

  private handleFanPowerSet(value: CharacteristicValue) {
    this.platform.log.info('Fan Power set to:', value);
    if (this.config.gpioPins.fanPin !== undefined) {
      const gpio = new Gpio(this.config.gpioPins.fanPin, { mode: Gpio.OUTPUT });
      gpio.digitalWrite(value ? 1 : 0);
    }
  }

  // Handle target temperature set events for sauna
  private handleSaunaTargetTemperatureSet(value: CharacteristicValue) {
    this.platform.log.info('Sauna Target Temperature set to:', value);
    // Implement additional logic for sauna temperature control if needed
  }

  // Handle target temperature set events for steam
  private handleSteamTargetTemperatureSet(value: CharacteristicValue) {
    this.platform.log.info('Steam Target Temperature set to:', value);
    // Implement additional logic for steam temperature control if needed
  }

  // Start the sauna with timeout logic
  private startSauna() {
    this.platform.log.info('Starting sauna with timeout...');
    this.setPowerState(this.config.gpioPins.saunaPowerPins, true);

    if (this.saunaTimer) {
      clearTimeout(this.saunaTimer);
    }

    this.saunaTimer = setTimeout(() => {
      this.stopSauna();
    }, this.config.saunaTimeout * 1000);
  }

  // Stop the sauna and clear the timer
  private stopSauna() {
    this.platform.log.info('Stopping sauna...');
    this.setPowerState(this.config.gpioPins.saunaPowerPins, false);

    if (this.saunaTimer) {
      clearTimeout(this.saunaTimer);
      this.saunaTimer = null;
    }
  }

  // Utility to set power state on GPIO
  private setPowerState(pins: number[], state: CharacteristicValue) {
    const powerState = state ? 1 : 0;
    pins.forEach((pin) => {
      const gpio = new Gpio(pin, { mode: Gpio.OUTPUT });
      gpio.digitalWrite(powerState);
    });
  }

  // Monitor temperatures using ADC channels
  // Monitor temperatures using ADC channels
  private monitorTemperatures() {
    this.config.auxSensors.forEach((sensor) => {
      const adcChannel = sensor.channel as EightChannels;

      // Open ADC channel for each sensor
      this.adc = openMcp3008(adcChannel, { speedHz: 1350000 }, (err: string) => {
        if (err) {
          this.platform.log.error(`Failed to open ADC channel ${adcChannel} for sensor "${sensor.name}": ${err}`);
          return;
        }

        // Set up a regular interval to read from the ADC channel
        const interval = setInterval(() => {
          this.adc.read((err: string | null, reading: McpReading) => {
            if (err) {
              this.platform.log.error(`Failed to read temperature for sensor "${sensor.name}": ${err}`);
              return;
            }

            // Convert the ADC reading to a temperature value
            const temperatureCelsius = (reading.value * 3.3 - 0.5) * 100;
            const displayTemperature = this.config.temperatureUnitFahrenheit
              ? this.convertToFahrenheit(temperatureCelsius)
              : temperatureCelsius;

            // Update the HomeKit characteristic with the current temperature
            const auxSensorService = this.auxTemperatureSensors.get(sensor.name);
            if (auxSensorService) {
              auxSensorService.updateCharacteristic(
                this.platform.Characteristic.CurrentTemperature,
                displayTemperature,
              );
            }

            this.platform.log.info(
              `${sensor.name} Temperature: ${displayTemperature.toFixed(2)} °${this.config.temperatureUnitFahrenheit ? 'F' : 'C'}`,
            );

            // Perform actions based on the temperature reading
            this.handleTemperatureControl(sensor, temperatureCelsius);

            // Perform additional safety checks for PCB temperature
            if (sensor.name === 'PCB_NTC') {
              this.monitorPcbTemperatureSafety(temperatureCelsius);
            }
          });
        }, 5000);

        this.temperatureIntervals.push(interval);
      });
    });
  }

  private handleTemperatureControl(sensor: AuxSensorConfig, temperatureCelsius: number) {
    let powerPins: number[] | undefined;
    let maxTemperature: number | undefined;
    let safetyTemperature: number | undefined;

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

    if (powerPins) {
      if (isNaN(temperatureCelsius)) {
        // Handle the case where there is no signal
        this.setPowerState(powerPins, false);
        this.platform.log.error(`${sensor.name} has no valid signal. Power off due to no signal.`);
      } else {
        // First, check safety temperature to ensure critical shutdown
        if (safetyTemperature !== undefined && temperatureCelsius > safetyTemperature) {
          this.setPowerState(powerPins, false);
          this.flashLights(10); // Flash warning lights
          this.platform.log.error(`${sensor.name} exceeded safety temperature! Immediate power off and flashing lights.`);
        }
        // Then check normal operational max temperature
        else if (maxTemperature !== undefined && temperatureCelsius > maxTemperature) {
          this.setPowerState(powerPins, false);
          this.flashLights(10); // Flash warning lights
          this.platform.log.warn(`${sensor.name} exceeded max temperature. Power off and flashing lights.`);
        }
      }
    }
  }

  // Monitor PCB temperature to ensure it doesn't exceed safety limits
  private monitorPcbTemperatureSafety(temperatureCelsius: number) {
    const safetyTemperature = this.config.controllerSafetyTemperature;
    if (temperatureCelsius > safetyTemperature) {
      this.disableAllRelays();
      this.flashLights(10); // Flash warning lights
      this.platform.log.error('Controller PCB temperature exceeded safety limit! All relays disabled and flashing lights.');
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

  // Monitor humidity using I2C sensor
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
          `Steam Temperature: ${displayTemperature.toFixed(2)} °${
            this.config.temperatureUnitFahrenheit ? 'F' : 'C'
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
          this.setPowerState(this.config.gpioPins.steamPowerPins, false);
          this.platform.log.warn('Steam humidity exceeded max humidity. Steam power off.');
        }
      } catch (err) {
        this.platform.log.error(
          `Failed to read humidity and temperature: ${(err as Error).message}`,
        );
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

    doorSensors.forEach(({ type, pin, inverse, allowOnWhileOpen, powerPins }) => {
      if (pin !== undefined) {
        const doorSensor = new Gpio(pin, { mode: Gpio.INPUT, alert: true });
        doorSensor.on('alert', (level) => {
          const doorOpen = inverse ? level === 0 : level === 1;
          this.platform.log.info(
            `${type.charAt(0).toUpperCase() + type.slice(1)} Door ${
              doorOpen ? 'Open' : 'Closed'
            }`,
          );

          const doorServiceName = `${
            type.charAt(0).toUpperCase() + type.slice(1)
          } Door`;
          const doorService = this.accessory.getService(doorServiceName);

          if (doorService) {
            doorService.updateCharacteristic(
              this.platform.Characteristic.ContactSensorState,
              doorOpen
                ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
                : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
            );
          }

          if (doorOpen && !allowOnWhileOpen && powerPins) {
            this.setPowerState(powerPins, false);
            this.platform.log.warn(`${type} power off due to door open.`);
          } else if (!doorOpen && !allowOnWhileOpen && powerPins) {
            // Ensure the heater is resumed only when it was initially turned off due to the door open state
            this.setPowerState(powerPins, true);
            this.platform.log.info(`${type} power resumed as door closed.`);
          }
        });

        // Clean up on shutdown
        process.on('exit', () => {
          doorSensor.digitalWrite(0); // Ensure the pin is in a safe state
        });
      } else {
        this.platform.log.warn(`No door pin configured for ${type}`);
      }
    });
  }

  // Utility function to convert Celsius to Fahrenheit
  private convertToFahrenheit(celsius: number): number {
    return celsius * 1.8 + 32;
  }
}