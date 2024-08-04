// Declare module for mcp-spi-adc
declare module 'mcp-spi-adc' {
  interface Mcp3008Options {
    speedHz: number;
  }

  interface Mcp3008Reading {
    value: number;
  }

  interface Mcp3008 {
    read(
      channel: number,
      callback: (err: Error | null, reading: Mcp3008Reading) => void
    ): void;
    close(callback: (err: Error | null) => void): void;
  }

  export class Mcp3008 {
    static open(
      channel: number,
      options: Mcp3008Options,
      callback: (err: Error | null) => void
    ): Mcp3008;
  }
}

declare module 'onoff' {
  // Custom type definition
  export type GpioCallback = (
    err: Error | null | undefined,
    value: number
  ) => void;
}
