import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { OpenSaunaPlatform } from './platform';
import { Gpio } from 'pigpio'; // Updated import from pigpio
import { Mcp3008 } from 'mcp-spi-adc'; // Import Mcp3008
import i2c from 'i2c-bus'; // Assume types declared in typings.d.ts
import { OpenSaunaConfig, AuxSensorConfig } from './settings';

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
  private adc: Mcp3008; // Define adc
  private i2cBus!: i2c.PromisifiedBus; // Define i2cBus

  constructor(
    private readonly platform: OpenSaunaPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: OpenSaunaConfig,
    private readonly accessoryType: 'sauna' | 'steam' | 'light' | 'fan',
  ) {
    // Initialize the ADC
    this.adc = Mcp3008.open(0, { speedHz: 1350000 }, (err: Error | null) => {
      if (err) {
        this.platform.log.error('Failed to open ADC:', err.message);
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

      this.auxTemperatureSensors.set(sensorName, auxSensorService);
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

  // Handle target temperature set events
  private handleSaunaTargetTemperatureSet(value: CharacteristicValue) {
    this.platform.log.info('Sauna Target Temperature set to:', value);
    // Implement additional logic for sauna temperature control if needed
  }

  private handleSteamTargetTemperatureSet(value: CharacteristicValue) {
    this.platform.log.info('Steam Target Temperature set to:', value);
    // Implement additional logic for steam temperature control if needed
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
  private monitorTemperatures() {
  // Add monitoring for configured auxiliary sensors
    this.config.auxSensors.forEach((sensor) => {
      setInterval(() => {
        this.adc.read(sensor.channel, (err: Error | null, reading: { value: number }) => {
          if (err) {
            this.platform.log.error(`Failed to read temperature for ${sensor.name}: ${err.message}`);
            return;
          }

          const temperatureCelsius = (reading.value * 3.3 - 0.5) * 100;
          const displayTemperature = this.config.temperatureUnitFahrenheit
            ? this.convertToFahrenheit(temperatureCelsius)
            : temperatureCelsius;

          const auxSensorService = this.auxTemperatureSensors.get(sensor.name);

          if (auxSensorService) {
            auxSensorService.updateCharacteristic(
              this.platform.Characteristic.CurrentTemperature,
              displayTemperature,
            );
          }

          this.platform.log.info(
            `${sensor.name} Temperature: ${displayTemperature.toFixed(2)} °${
              this.config.temperatureUnitFahrenheit ? 'F' : 'C'
            }`,
          );
        });
      }, 5000); // Check temperature every 5 seconds
    });
  }

  // Monitor humidity using I2C sensor
  private monitorHumidity() {
    setInterval(async () => {
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
      } catch (err) {
        this.platform.log.error(
          `Failed to read humidity and temperature: ${(err as Error).message}`,
        );
      }
    }, 10000); // Check humidity every 10 seconds
  }

  // Monitor door states using GPIO
  private monitorDoors() {
    const doorSensors = [
      {
        type: 'sauna',
        pin: this.config.gpioPins.saunaDoorPin,
        inverse: this.config.inverseSaunaDoor,
      },
      {
        type: 'steam',
        pin: this.config.gpioPins.steamDoorPin,
        inverse: this.config.inverseSteamDoor,
      },
    ];

    doorSensors.forEach(({ type, pin, inverse }) => {
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
                ? this.platform.Characteristic.ContactSensorState
                  .CONTACT_DETECTED
                : this.platform.Characteristic.ContactSensorState
                  .CONTACT_NOT_DETECTED,
            );
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

  private convertToFahrenheit(celsius: number): number {
    return celsius * 1.8 + 32;
  }
}