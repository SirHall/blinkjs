export type DataTypeBytes = 1 | 2 | 4;

// Buffer types.
export interface DataType {
    name: string;
    bytes: DataTypeBytes;
    integer: boolean;
    unsigned: boolean;
}
const type = (
    name: string,
    bytes: DataTypeBytes,
    integer: boolean,
    unsigned: boolean
) => Object.freeze({ name, bytes, integer, unsigned });

export const FLOAT: DataType = type("float", 4, false, false);
export const INT32: DataType = type("int32", 4, true, false);
export const INT16: DataType = type("int16", 2, true, false);
export const INT8: DataType = type("int8", 1, true, false);
export const UINT32: DataType = type("uint32", 4, true, true);
export const UINT16: DataType = type("uint16", 2, true, true);
export const UINT8: DataType = type("uint8", 1, true, true);

// Wrap modes for the textures.
export const CLAMP = 33071;
export const REPEAT = 10497;
export const MIRROR = 33648;
export type WrapMode = typeof CLAMP | typeof REPEAT | typeof MIRROR;

// TypedArray helpers.
export const ARRAY_CONSTRUCTORS = new Map<
    DataType,
    new (size?: number) => TypedArray
>([
    [FLOAT, Float32Array],
    [INT32, Int32Array],
    [INT16, Int16Array],
    [INT8, Int8Array],
    [UINT32, Uint32Array],
    [UINT16, Uint16Array],
    [UINT8, Uint8Array],
]);

export const ARRAY_TYPES = new Map<new () => TypedArray, DataType>([
    [Float32Array, FLOAT],
    [Int32Array, INT32],
    [Int16Array, INT16],
    [Int8Array, INT8],
    [Uint32Array, UINT32],
    [Uint16Array, UINT16],
    [Uint8Array, UINT8],
    [Uint8ClampedArray, UINT8],
]);

export type VecSizes = 1 | 2 | 3 | 4;
export type OutType =
    | "uint"
    | "int"
    | "float"
    | `uvec${VecSizes}`
    | `ivec${VecSizes}`
    | `vec${VecSizes}`;

export interface FormatInfo {
    bytes: DataTypeBytes;
    format: Formats;
    internalFormat: InternalFormat;
    inputType: "usampler2D" | "isampler2D" | "sampler2D";
    integer: boolean;
    outputType: OutType;
    precision: PrecisionOption;
    type: FormatType;
    unsigned: boolean;
}

const formatChannels = ["R", "RG", "RGB", "RGBA"] as const;
export type InternalFormat =
    `${(typeof formatChannels)[number]}${"8" | "16" | "32"}${"UI" | "I" | "F"}`;

const formatOptions = ["RED", "RG", "RGB", "RGBA"] as const;

const precisionOptions = ["lowp", "mediump", null, "highp"] as const;
export type PrecisionOption = (typeof precisionOptions)[number];

export type FormatType =
    `${`${"UNSIGNED_" | "INT"}${"BYTE" | "SHORT" | "INT"}` | "FLOAT"}`;

export type Formats = `${(typeof formatOptions)[number]}${"_INTEGER" | ""}`;

// Hands out all the types associated with a Buffer's data.
export function formatInfo(
    dataType: DataType,
    vectorSize: VecSizes = 1
): FormatInfo {
    const { bytes, integer, unsigned } = dataType;

    const precision = precisionOptions[bytes - 1];

    const inputType =
        integer && unsigned ? "usampler2D"
        : integer ? "isampler2D"
        : "sampler2D";

    const outputType: OutType =
        vectorSize === 1 ?
            integer && unsigned ? "uint"
            : integer ? "int"
            : "float"
        : integer && unsigned ? `uvec${vectorSize}`
        : integer ? `ivec${vectorSize}`
        : `vec${vectorSize}`;

    // Size is: 8, 16 or 32
    // TODO: TypeScript doesn't seem to support this
    const bits: 8 | 16 | 32 = (bytes * 8) as any;
    let internalFormat: InternalFormat = `${formatChannels[vectorSize - 1]}${bits}${
        integer && unsigned ? "UI"
        : integer ? "I"
        : "F"
    }`;

    let format: Formats =
        `${formatOptions[vectorSize - 1]}${integer ? "_INTEGER" : ""}` as const;

    const type: FormatType = `${
        integer ?
            `${unsigned ? "UNSIGNED_" : "INT"}${
                bytes == 1 ? "BYTE"
                : bytes == 2 ? "SHORT"
                : "INT"
            }`
        :   "FLOAT"
    }` as const as any; //TODO: TypeScript is expanding this to a `string`, figure out why

    return {
        bytes,
        format,
        internalFormat,
        inputType,
        integer,
        outputType,
        precision,
        type,
        unsigned,
    } as const;
}

// http://stackoverflow.com/a/16267018/4757748
export function closestDimensions(area: number): [number, number] {
    let width = Math.floor(Math.sqrt(area));
    while (area % width && width > 1) {
        width -= 1;
    }
    return [width, area / width];
}

/**
 * Generic Buffer Descriptor.
 * Though perhaps unnecessarily complex, it does force either `alloc` or `data` to be present.
 */
export type TypedArray =
    | Float32Array
    | Int32Array
    | Int16Array
    | Int8Array
    | Uint32Array
    | Uint16Array
    | Uint8Array
    | Uint8ClampedArray;

export function _throw(message: string): never {
    throw new Error(message);
}

export function lazy<T>(cons: () => T): () => T {
    let instance: T;
    return () => (instance ??= cons());
}
