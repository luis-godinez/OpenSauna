<p align="center">
  <img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

<span align="center">

# OpenSauna Homebridge Plugin

</span>

OpenSauna is a Homebridge plugin that empowers users to control and monitor their sauna and/or steam rooms using Apple's HomeKit. This plugin integrates your sauna and steam room controls with HomeKit, providing an easy-to-use interface to manage temperature, humidity, lighting, and fans directly from your iOS devices.

## Purpose

OpenSauna is designed to provide a generic sauna controller that allows users to leverage HomeKit to manage and monitor their sauna and steam room environments. It offers flexibility and customization to fit a variety of hardware setups, enabling users to create a smart sauna experience with ease.

## Key Features

- **Sauna and Steam Control:** Turn your sauna and steam room on or off directly from HomeKit, with options for single-phase (120V) or split-phase (240V) power systems.
- **Temperature Monitoring:** Continuously monitor the temperature of your sauna and steam room with optional auxiliary sensors to ensure optimal comfort.
- **Humidity Monitoring:** Track steam room humidity levels in real-time using I2C sensors for a comfortable environment.
- **Lighting Control:** Manage sauna or steam room lighting through HomeKit, providing convenience and control.
- **Fan Control:** Integrate fan control to enhance ventilation and maintain desired environmental conditions.
- **Door Sensors:** Monitor door status (open/closed) for sauna and steam rooms with configurable logic for different sensor types.

## Optional Features

- **Auxiliary Sensors:** Add additional temperature sensors for more precise control or monitoring. Sensors can be associated with the sauna or steam room or used for monitoring without impacting control logic.
- **Customizable Temperature Units:** Users can select between Celsius and Fahrenheit for temperature display, ensuring compatibility with regional preferences.
- **Configurable GPIO Pins:** Users can customize the GPIO pins used for controlling various components, offering flexibility for different hardware setups.
- **Inverse Door Logic:** Supports inverse logic for door sensors to accommodate various installation configurations.

## Setup Development Environment

To develop Homebridge plugins, you must have Node.js 18 or later installed and a modern code editor such as [VS Code](https://code.visualstudio.com/). This plugin template uses [TypeScript](https://www.typescriptlang.org/) to make development easier and comes with pre-configured settings for [VS Code](https://code.visualstudio.com/) and ESLint. If you are using VS Code, install these extensions:

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

### Install Development Dependencies

Using a terminal, navigate to the project folder and run this command to install the development dependencies:

```shell
npm install
```
