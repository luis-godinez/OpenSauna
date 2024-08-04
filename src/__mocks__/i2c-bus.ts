export default {
  openPromisified: async (busNumber: number) => ({
    writeByte: jest.fn(),
    readI2cBlock: jest.fn().mockResolvedValue(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])),
  }),
};