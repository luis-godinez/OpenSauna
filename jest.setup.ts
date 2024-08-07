// jest.setup.ts

// Mock for mcp-spi-adc
jest.mock('mcp-spi-adc', () => {
  return {
    Mcp3008: {
      open: jest.fn().mockImplementation((channel, options, callback) => {
        if (callback) {
          callback(null); // No error
        }
        return {
          read: (cb: (err: Error | null, result: { value: number }) => void) => {
            if (typeof cb === 'function') {
              cb(null, { value: 0.5 }); // Example reading value
            }
          },
          close: jest.fn(), // Mock close function if used
        };
      }),
    },
  };
});

const mockDigitalWrite = jest.fn();
const mockOn = jest.fn();

jest.mock('pigpio', () => {
  return {
    Gpio: jest.fn().mockImplementation((pin: number) => ({
      digitalWrite: (state: number) => mockDigitalWrite(pin, state),
      on: mockOn,
    })),
    gpioInitialise: jest.fn(),
    gpioTerminate: jest.fn(),
  };
});

export { mockDigitalWrite, mockOn };