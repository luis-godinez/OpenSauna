// __mocks__/i2c-bus.js

const i2cBusMock = {
  writeByte: jest.fn(),
  readI2cBlock: jest.fn((addr, cmd, length, buffer, cb) => {
    // Simulate reading data into buffer
    buffer.fill(0);
    cb(null, length); // Indicate success and length of data read
  }),
  closeSync: jest.fn(),
};

const openPromisified = jest.fn().mockResolvedValue(i2cBusMock);

module.exports = {
  openPromisified,
};
