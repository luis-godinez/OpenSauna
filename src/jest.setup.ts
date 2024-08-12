// jest.setup.ts

// Mock for mcp-spi-adc
jest.mock('mcp-spi-adc', () => ({
  openMcp3008: jest.fn().mockImplementation((channel, options, callback) => {
    callback(null); // No error, simulate successful opening
    return {
      read: (cb: (err: string | null, reading: { value: number }) => void) => {
        cb(null, { value: 0.5 }); // Simulate a reading
      },
    };
  }),
}));


const mockDigitalWrite = jest.fn();
const mockOpen = jest.fn();
const mockClose = jest.fn();
const mockPoll = jest.fn();
const mockRead = jest.fn();
const mockInit = jest.fn();

jest.mock('rpio', () => ({
  open: mockOpen,
  write: mockDigitalWrite,
  read: mockRead,
  poll: mockPoll,
  close: mockClose,
  init: mockInit, // Mock the init method
  INPUT: 0,
  OUTPUT: 1,
  HIGH: 1,
  LOW: 0,
}));

export { mockDigitalWrite, mockOpen, mockClose, mockPoll, mockRead, mockInit };