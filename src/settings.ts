export const PLATFORM_NAME = 'OpenSauna';
export const PLUGIN_NAME = 'homebridge-opensauna';

// Configuration interface
export interface OpenSaunaConfig {
  platform: string; // Add this line
  name: string;
  hasSauna: boolean;
  hasSaunaSplitPhase: boolean; // False is 120V, True is 240V
  hasSteam: boolean;
  hasSteamSplitPhase: boolean; // False is 120V, True is 240V
  hasLight: boolean;
  hasFan: boolean;
  inverseSaunaDoor: boolean;
  inverseSteamDoor: boolean;
  temperatureUnitFahrenheit: boolean; // Boolean to indicate Fahrenheit (true) or Celsius (false)
  gpioPins: GpioConfig;
  auxSensors: AuxSensorConfig[];
  targetTemperatures: {
    sauna?: number; // Optional target temperature for sauna
    steam?: number; // Optional target temperature for steam
  };
}

export interface GpioConfig {
  saunaPowerPins: number[]; // Array of GPIO pins for sauna power control
  steamPowerPins: number[]; // Array of GPIO pins for steam power control
  lightPin?: number; // Optional GPIO pin for light control
  fanPin?: number; // Optional GPIO pin for fan control
  saunaDoorPin: number; // GPIO pin for sauna door sensor
  steamDoorPin: number; // GPIO pin for steam door sensor
}

export interface AuxSensorConfig {
  name: string; // Name or label for the auxiliary sensor
  channel: number; // ADC channel for the auxiliary sensor
  associatedSystem?: 'sauna' | 'steam'; // System this sensor is associated with
  impactControl: boolean; // Whether this sensor impacts system control
}
