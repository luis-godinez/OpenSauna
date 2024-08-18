export const PLATFORM_NAME = 'OpenSauna';
export const PLUGIN_NAME = 'homebridge-opensauna';

export type SystemType = 'sauna' | 'steam' | 'fan' | 'light';

export interface OpenSaunaConfig {
  manufacturer: string; // Name of the manufacturer
  platform: string; // Name of the platform
  name: string; // Custom name for the sauna system
  serial: string; // Custom serial for the sauna system
  hasSauna: boolean; // Indicates if the sauna is present
  hasSaunaSplitPhase: boolean; // Indicates if the sauna uses split phase power
  hasSteam: boolean; // Indicates if the steam room is present
  hasSteamI2C: boolean; // Indicates if the I2C sensor the  I2C humidity/temp sensor is available
  hasSteamSplitPhase: boolean; // Indicates if the steam room uses split phase power
  hasLight: boolean; // Indicates if a light control is available
  hasFan: boolean; // Indicates if a fan control is available
  inverseSaunaDoor: boolean; // Door sensor setup: False for Normally-Closed, True for Normally-Open
  inverseSteamDoor: boolean; // Door sensor setup: False for Normally-Closed, True for Normally-Open
  temperatureUnitFahrenheit: boolean; // If true, temperatures are in Fahrenheit; otherwise, Celsius
  gpioConfigs: GpioConfig[]; // System to GPIO associations
  auxSensors: AuxSensorConfig[]; // Configuration of auxiliary sensors
  saunaDoorPin: number;
  saunaOnWhileDoorOpen: boolean; // Allows the sauna to be on while the door is open
  steamDoorPin: number;
  steamOnWhileDoorOpen: boolean; // Allows the steam room to be on while the door is open
  saunaTimeout: number; // Maximum runtime for the sauna in minutes before auto-shutdown
  steamTimeout: number; // Maximum runtime for the steam room in minutes before auto-shutdown
  controllerSafetyTemperature: number; // Safety limit for the controller board temperature in degrees (hard-coded)
  saunaMaxTemperature: number; // Maximum user-configurable temperature for the sauna in degrees
  saunaSafetyTemperature: number; // Safety limit for sauna temperature in degrees (hard-coded)
  steamMaxTemperature: number; // Maximum user-configurable temperature for the steam room in degrees
  steamSafetyTemperature: number; // Safety limit for steam room temperature in degrees (hard-coded)
  steamMaxHumidity: number; // Maximum user-configurable humidity for the steam room in percent
}

export interface GpioConfig {
  gpioPins: number[]; // GPIO pins for power control
  system: SystemType; // System type associated with these power pins
}

export interface AuxSensorConfig {
  name: string; // Name of the auxiliary sensor
  channel: number; // ADC channel number associated with the sensor
  system: 'sauna' | 'steam' | 'controller' | null; // The sensor to system association, or null if not associated
  control: boolean; // Whether the sensor affects control logic (e.g., turns off power if overheating)
  resistanceAt25C: number; // NTC resistance in Ohms @ 25°C
  bValue: number; // NTC beta value
}
