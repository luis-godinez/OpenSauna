import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings.js';
import { OpenSaunaPlatform } from './platform.js';

// Register the platform with Homebridge using default export
const registerPlatform = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, OpenSaunaPlatform);
};

export default registerPlatform;