// jest.setup.ts

// Mock for mcp-spi-adc
jest.mock('mcp-spi-adc', () => ({
  Mcp3008: {
    open: jest.fn((channel, options, callback) => {
      callback(null, {
        read: jest.fn((callback) => {
          // Return a mock value, adjust based on your test needs
          callback(null, { value: 0.5 });
        }),
        close: jest.fn(),
      });
    }),
  },
}));


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