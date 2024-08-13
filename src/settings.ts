export const PLATFORM_NAME = 'OpenSauna';
export const PLUGIN_NAME = 'homebridge-opensauna';

export interface OpenSaunaConfig {
  manufacturer: string; // Name of the manufacturer
  platform: string; // Name of the platform
  name: string; // Custom name for the sauna system
  serial: string; // Custom serial for the sauna system
  hasSauna: boolean; // Indicates if the sauna is present
  hasSaunaSplitPhase: boolean; // Indicates if the sauna uses split phase power
  hasSteam: boolean; // Indicates if the steam room is present
  hasSteamSplitPhase: boolean; // Indicates if the steam room uses split phase power
  hasLight: boolean; // Indicates if a light control is available
  hasFan: boolean; // Indicates if a fan control is available
  inverseSaunaDoor: boolean; // If true, door sensor logic is inverted for the sauna
  inverseSteamDoor: boolean; // If true, door sensor logic is inverted for the steam room
  temperatureUnitFahrenheit: boolean; // If true, temperatures are in Fahrenheit; otherwise, Celsius
  gpioPins: GpioConfig; // Configuration of GPIO pins used in the system
  auxSensors: AuxSensorConfig[]; // Configuration of auxiliary sensors
  targetTemperatures: {
    sauna: number; // Target temperature for the sauna in degrees
    steam: number; // Target temperature for the steam room in degrees
  };
  saunaOnWhileDoorOpen: boolean; // Allows the sauna to be on while the door is open
  steamOnWhileDoorOpen: boolean; // Allows the steam room to be on while the door is open
  saunaTimeout: number; // Maximum runtime for the sauna in minutes before auto-shutdown
  steamTimeout: number; // Maximum runtime for the steam room in minutes before auto-shutdown
  saunaMaxTemperature: number; // Maximum user-configurable temperature for the sauna in degrees
  steamMaxTemperature: number; // Maximum user-configurable temperature for the steam room in degrees
  steamMaxHumidity: number; // Maximum user-configurable humidity for the steam room in percent
  saunaSafetyTemperature: number; // Safety limit for sauna temperature in degrees (hard-coded)
  steamSafetyTemperature: number; // Safety limit for steam room temperature in degrees (hard-coded)
  controllerSafetyTemperature: number; // Safety limit for the controller board temperature in degrees (hard-coded)
}

export interface GpioConfig {
  saunaPowerPins: number[]; // GPIO pins for sauna power control
  steamPowerPins: number[]; // GPIO pins for steam room power control
  lightPin?: number; // GPIO pin for light control (optional)
  fanPin?: number; // GPIO pin for fan control (optional)
  saunaDoorPin?: number; // GPIO pin for sauna door sensor (optional)
  steamDoorPin?: number; // GPIO pin for steam door sensor (optional)
}

export interface AuxSensorConfig {
  name: string; // Name of the auxiliary sensor
  channel: number; // ADC channel number associated with the sensor
  system: 'sauna' | 'steam' | 'controller' | null; // The sensor to system association, or null if not associated
  control: boolean; // Whether the sensor affects control logic (e.g., turns off power if overheating)
}