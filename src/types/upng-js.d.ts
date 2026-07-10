declare module "upng-js" {
  export function decode(buffer: ArrayBuffer | Uint8Array): {
    width: number;
    height: number;
    data: ArrayBuffer;
    tabs?: Record<string, unknown>;
  };
  export function toRGBA8(img: {
    width: number;
    height: number;
    data: ArrayBuffer;
    tabs?: Record<string, unknown>;
  }): ArrayBuffer[];
}
