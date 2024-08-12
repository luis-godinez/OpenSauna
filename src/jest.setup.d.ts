// jest.setup.d.ts

declare const mockDigitalWrite: jest.Mock<void, [number, 0 | 1]>;
declare const mockOpen: jest.Mock<void, [number, number, number]>;
declare const mockClose: jest.Mock<void, [number]>;
declare const mockPoll: jest.Mock<void, [number, () => void, number]>;
declare const mockRead: jest.Mock<number, [number]>;
declare const mockInit: jest.Mock<void, [Record<string, unknown>]>;

export { mockDigitalWrite, mockOpen, mockClose, mockPoll, mockRead, mockInit };