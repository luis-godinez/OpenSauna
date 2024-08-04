import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { OpenSaunaPlatform } from './platform';
import { Gpio } from 'pigpio'; // Updated import from pigpio
import { Mcp3008 } from 'mcp-spi-adc'; // Import Mcp3008
import i2c from 'i2c-bus'; // Assume types declared in typings.d.ts
import { OpenSaunaConfig } from './settings';

export class OpenSaunaAccessory {
  private service: Service;
  private temperatureService?: Service;
  private targetTemperatureService?: Service;
  private doorService?: Service;
  private gpioPins: Gpio[] = [];
  private adc: Mcp3008; // Define adc
  private i2cBus!: i2c.PromisifiedBus; // Define i2cBus

  constructor(
    private readonly platform: OpenSaunaPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: OpenSaunaConfig,
    private readonly accessoryType: 'sauna' | 'steam' | 'light' | 'fan'
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

    // Initialize On/Off Service
    this.service =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.config.name} ${accessoryType}`
    );
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.handleOnSet.bind(this));

    // Set up specific services based on accessory type
    switch (accessoryType) {
      case 'sauna':
        this.setupSauna();
        break;
      case 'steam':
        this.setupSteam();
        break;
      case 'light':
        this.setupLight();
        break;
      case 'fan':
        this.setupFan();
        break;
    }
  }

  private async initializeI2CBus() {
    try {
      this.i2cBus = await i2c.openPromisified(1);
    } catch (err) {
      if (err instanceof Error) {
        this.platform.log.error('Failed to open I2C bus:', err.message);
      } else {
        this.platform.log.error('Failed to open I2C bus:', String(err));
      }
    }
  }

  private setupSauna() {
    this.gpioPins = this.config.gpioPins.saunaPowerPins.map(
      (pin) => new Gpio(pin, { mode: Gpio.OUTPUT })
    );

    this.temperatureService =
      this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(
        this.platform.Service.TemperatureSensor,
        `${this.config.name} Sauna Temperature`
      );

    this.temperatureService.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.config.name} Sauna Temperature`
    );

    this.targetTemperatureService =
      this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(
        this.platform.Service.Thermostat,
        `${this.config.name} Sauna Target Temperature`
      );
    this.targetTemperatureService.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.config.name} Sauna Target Temperature`
    );
    this.targetTemperatureService
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(this.handleTargetTemperatureSet.bind(this));

    this.monitorTemperature('sauna');
    this.setupDoorMonitoring('sauna');
  }

  private setupSteam() {
    this.gpioPins = this.config.gpioPins.steamPowerPins.map(
      (pin) => new Gpio(pin, { mode: Gpio.OUTPUT })
    );

    this.temperatureService =
      this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(
        this.platform.Service.TemperatureSensor,
        `${this.config.name} Steam Temperature`
      );

    this.temperatureService.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.config.name} Steam Temperature`
    );

    this.targetTemperatureService =
      this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(
        this.platform.Service.Thermostat,
        `${this.config.name} Steam Target Temperature`
      );
    this.targetTemperatureService.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.config.name} Steam Target Temperature`
    );
    this.targetTemperatureService
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(this.handleTargetTemperatureSet.bind(this));

    this.monitorTemperature('steam');
    this.monitorHumidity();
    this.setupDoorMonitoring('steam');
  }

  private setupLight() {
    if (this.config.gpioPins.lightPin !== undefined) {
      this.service =
        this.accessory.getService(this.platform.Service.Switch) ||
        this.accessory.addService(
          this.platform.Service.Switch,
          `${this.config.name} Light`
        );

      this.service.setCharacteristic(
        this.platform.Characteristic.Name,
        `${this.config.name} Light`
      );
      this.service
        .getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleOnSet.bind(this));

      this.gpioPins = [
        new Gpio(this.config.gpioPins.lightPin, { mode: Gpio.OUTPUT }),
      ];
    }
  }

  private setupFan() {
    if (this.config.gpioPins.fanPin !== undefined) {
      this.service =
        this.accessory.getService(this.platform.Service.Switch) ||
        this.accessory.addService(
          this.platform.Service.Switch,
          `${this.config.name} Fan`
        );

      this.service.setCharacteristic(
        this.platform.Characteristic.Name,
        `${this.config.name} Fan`
      );
      this.service
        .getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleOnSet.bind(this));

      this.gpioPins = [
        new Gpio(this.config.gpioPins.fanPin, { mode: Gpio.OUTPUT }),
      ];
    }
  }

  private handleOnSet(value: CharacteristicValue) {
    const isOn = value as boolean;
    this.gpioPins.forEach((gpio) => gpio.digitalWrite(isOn ? 1 : 0));
    this.platform.log.info(
      `${this.accessoryType} power ${isOn ? 'ON' : 'OFF'}`
    );
  }

  private async handleTargetTemperatureSet(value: CharacteristicValue) {
    const targetTemperature = value as number;
    this.platform.log.info(
      `Target Temperature set to ${targetTemperature} °${
        this.config.temperatureUnitFahrenheit ? 'F' : 'C'
      }`
    );
    // Implement logic to handle target temperature setting if necessary
  }

  private monitorTemperature(type: 'sauna' | 'steam') {
    const channel = type === 'sauna' ? 1 : 2; // Example channel numbers

    const intervalId = setInterval(() => {
      this.adc.read(
        channel,
        (err: Error | null, reading: { value: number }) => {
          if (err) {
            this.platform.log.error(
              `Failed to read temperature for ${type}: ${err.message}`
            );
            return;
          }

          const temperatureCelsius = (reading.value * 3.3 - 0.5) * 100;
          const displayTemperature = this.config.temperatureUnitFahrenheit
            ? this.convertToFahrenheit(temperatureCelsius)
            : temperatureCelsius;

          const unit = this.config.temperatureUnitFahrenheit ? 'F' : 'C';
          this.platform.log.info(
            `${
              type.charAt(0).toUpperCase() + type.slice(1)
            } Temperature: ${displayTemperature.toFixed(2)} °${unit}`
          );

          const targetTemperatureCelsius =
            this.config.targetTemperatures[type] ?? 0;
          if (temperatureCelsius > targetTemperatureCelsius) {
            this.handleOnSet(false);
          } else {
            this.handleOnSet(true);
          }

          if (this.temperatureService) {
            this.temperatureService.updateCharacteristic(
              this.platform.Characteristic.CurrentTemperature,
              displayTemperature
            );
          }
        }
      );
    }, 5000); // Check temperature every 5 seconds

    // Ensure interval cleanup
    process.on('exit', () => clearInterval(intervalId));
  }

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

        const unit = this.config.temperatureUnitFahrenheit ? 'F' : 'C';
        this.platform.log.info(`Steam Humidity: ${humidity} %`);
        this.platform.log.info(
          `Steam Temperature: ${displayTemperature.toFixed(2)} °${unit}`
        );

        if (this.temperatureService) {
          this.temperatureService.updateCharacteristic(
            this.platform.Characteristic.CurrentTemperature,
            displayTemperature
          );
        }
      } catch (err) {
        this.platform.log.error(
          `Failed to read humidity and temperature: ${(err as Error).message}`
        );
      }
    }, 10000); // Check humidity every 10 seconds
  }

  private setupDoorMonitoring(type: 'sauna' | 'steam') {
    const doorPin =
      type === 'sauna'
        ? this.config.gpioPins.saunaDoorPin
        : this.config.gpioPins.steamDoorPin;
    const inverseLogic =
      type === 'steam'
        ? this.config.inverseSaunaDoor
        : this.config.inverseSteamDoor;
    if (doorPin !== undefined) {
      const doorSensor = new Gpio(doorPin, { mode: Gpio.INPUT, alert: true });
      doorSensor.on('alert', (level) => {
        // Determine the door state based on the sensor value and inverse logic
        const doorOpen = inverseLogic ? level === 0 : level === 1;
        this.platform.log.info(
          `${type.charAt(0).toUpperCase() + type.slice(1)} Door ${
            doorOpen ? 'Open' : 'Closed'
          }`
        );

        // Update the door service state if applicable
        if (this.doorService) {
          this.doorService.updateCharacteristic(
            this.platform.Characteristic.ContactSensorState,
            doorOpen
              ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
              : this.platform.Characteristic.ContactSensorState
                  .CONTACT_NOT_DETECTED
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
  }

  private convertToFahrenheit(celsius: number): number {
    return celsius * 1.8 + 32;
  }
}
