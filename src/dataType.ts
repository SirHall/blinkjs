export const DataType2 = [
    "float",
    "int32",
    "int16",
    "int8",
    "uint32",
    "uint16",
    "uint8",
] as const;
export type DataType2 = (typeof DataType2)[number];

export function getDataTypeBytes(type: DataType2): 1 | 2 | 4 {
    switch (type) {
        case "float":
        case "uint32":
        case "int32":
            return 4;
        case "uint16":
        case "int16":
            return 2;
        case "uint8":
        case "int8":
            return 1;
    }
}

export function getDataTypeInteger(type: DataType2): boolean {
    switch (type) {
        case "float":
            return false;
        case "uint32":
        case "uint16":
        case "uint8":
        case "int32":
        case "int16":
        case "int8":
            return true;
    }
}

export function getDataTypeUnsigned(type: DataType2): boolean {
    switch (type) {
        case "float":
        case "int32":
        case "int16":
        case "int8":
            return false;
        case "uint32":
        case "uint16":
        case "uint8":
            return true;
    }
}
