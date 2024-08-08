// Declare module for mcp-spi-adc
declare module 'mcp-spi-adc' {
  interface Mcp3008Options {
    speedHz?: number;
  }

  interface Mcp3008Reading {
    value: number;
  }

  class Mcp3008 {
    static open(
      channel: number,
      options: Mcp3008Options,
      callback: (err: Error | null, adc: Mcp3008) => void
    ): void;

    read(callback: (err: Error | null, reading: Mcp3008Reading) => void): void;

    close(callback: (err: Error | null) => void): void;
  }

  export { Mcp3008, Mcp3008Options, Mcp3008Reading };
}

declare module 'onoff' {
  // Custom type definition
  export type GpioCallback = (
    err: Error | null | undefined,
    value: number
  ) => void;
}
