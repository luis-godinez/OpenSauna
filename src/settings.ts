export const PLATFORM_NAME = 'OpenSauna';
export const PLUGIN_NAME = 'homebridge-opensauna';

// Configuration interface
export interface OpenSaunaConfig {
  platform: string; // The platform identifier, should match PLATFORM_NAME
  name: string; // Name for the sauna system, displayed in Homebridge
  hasSauna: boolean; // Indicates if the sauna functionality is available
  hasSaunaSplitPhase: boolean; // False for 120V, True for 240V sauna configuration
  hasSteam: boolean; // Indicates if the steam functionality is available
  hasSteamSplitPhase: boolean; // False for 120V, True for 240V steam configuration
  hasLight: boolean; // Indicates if light control is available
  hasFan: boolean; // Indicates if fan control is available
  inverseSaunaDoor: boolean; // True if sauna door sensor logic is inverted
  inverseSteamDoor: boolean; // True if steam door sensor logic is inverted
  temperatureUnitFahrenheit: boolean; // True for Fahrenheit, False for Celsius
  gpioPins: GpioConfig; // GPIO configuration for controlling hardware
  auxSensors: AuxSensorConfig[]; // Array of auxiliary sensors for additional readings
  targetTemperatures: {
    sauna?: number; // Optional target temperature for sauna, in Celsius or Fahrenheit
    steam?: number; // Optional target temperature for steam, in Celsius or Fahrenheit
  };
}

// Configuration for GPIO pins
export interface GpioConfig {
  saunaPowerPins: number[]; // Array of GPIO pins for sauna power control
  steamPowerPins: number[]; // Array of GPIO pins for steam power control
  lightPin?: number; // Optional GPIO pin for light control
  fanPin?: number; // Optional GPIO pin for fan control
  saunaDoorPin: number; // GPIO pin for sauna door sensor
  steamDoorPin: number; // GPIO pin for steam door sensor
}

// Configuration for auxiliary sensors
export interface AuxSensorConfig {
  name: string; // Name or label for the auxiliary sensor
  channel: number; // ADC channel number for the auxiliary sensor
  associatedSystem?: 'sauna' | 'steam'; // System the sensor is associated with, if any
  impactControl: boolean; // Whether this sensor impacts system control logic
}