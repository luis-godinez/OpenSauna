declare const mockDigitalWrite: jest.Mock<void, [number, 0 | 1]>;
declare const mockOn: jest.Mock<void, [string, () => void]>;

export { mockDigitalWrite, mockOn };