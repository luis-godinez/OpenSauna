import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings.js';
import { OpenSpaPlatform } from './platform.js';

// Register the platform with Homebridge using default export
const registerPlatform = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, OpenSpaPlatform);
};

export default registerPlatform;
