export class Mcp3008 {
  static open(channel: number, options: any, cb: (err: Error | null) => void): Mcp3008 {
    cb(null);
    return new Mcp3008();
  }

  read(channel: number, cb: (err: Error | null, reading: { value: number }) => void): void {
    cb(null, { value: 0.5 }); // Mock value
  }
}