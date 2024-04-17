import { device, extensions } from "./WebGL/Context";
import { Texture } from "./WebGL/Texture";

import { readablesMap, writablesMap } from "./Buffer";
// import { TypedArray } from '../index';
import {
    CLAMP,
    FLOAT,
    DataType,
    WrapMode,
    TypedArray,
    ARRAY_TYPES,
    closestDimensions,
    formatInfo,
    ARRAY_CONSTRUCTORS,
    _throw,
    VecSizes,
} from "./common";

export interface DebugBufferConstructorArgs {
    alloc?: number;
    data?: TypedArray;
    type?: DataType;
    vector?: number;
    wrap?: WrapMode | [WrapMode, WrapMode];
}

/**
 * The `DeviceBuffer` only allocates memory on the device. Memory is
 * allocated the moment the `DeviceBuffer` is constructed. Memory
 * on the device is developer managed. Indeed, the device memory is
 * retained until the developer destroys the `DeviceBuffer` using
 * the `destroy()` method.
 *
 * Memory from the host can be copied to the device and vice versa.
 */
export class DeviceBuffer {
    vector: VecSizes;
    size: number;
    dimensions: [number, number];
    wrap: [WrapMode, WrapMode];
    type: DataType;

    constructor({
        alloc,
        data,
        type = FLOAT,
        vector = 1,
        wrap = CLAMP,
    }: DebugBufferConstructorArgs) {
        this.vector = Math.min(Math.max(vector, 1), 4) as VecSizes;
        if (this.vector == 3) {
            console.warn(
                "Vector size of 3 not supported. Choosing vector size 4."
            );
            this.vector = 4;
        }

        this.size = (alloc || data?.length) ?? 0;
        this.dimensions = closestDimensions(this.size / this.vector);

        // Wrap mode for S and T.
        this.wrap = Array.isArray(wrap) ? wrap : [wrap, wrap];

        const maxDimension = device.maxTextureSize ** 2;
        if (Math.max(...this.dimensions) > maxDimension) {
            throw new Error("Buffer size exceeds device limit.");
        }

        let associatedType = type;
        if (data) {
            for (const [constructor, type] of ARRAY_TYPES) {
                if (data instanceof constructor) {
                    associatedType = type;
                    break;
                }
            }
        }
        this.type = associatedType;

        // Allocate on the device, immediately.
        let texture = this._getReadable(true);

        if (data && texture) {
            if (data.constructor == Uint8ClampedArray) {
                data = new Uint8Array(data.buffer);
            }
            texture.upload(data);
        }
    }

    delete() {
        const tex = readablesMap.get(this);
        if (tex) {
            tex.delete();
            readablesMap.delete(this);
        }
    }

    copy() {
        const readable = this._getReadable() ?? _throw(`No texture set`);
        let copyReadable = readable.copy();
        let copyBuffer = new DeviceBuffer({
            alloc: this.size,
            type: this.type,
            vector: this.vector,
        });

        copyBuffer.setReadable(copyReadable);
        return copyBuffer;
    }

    setReadable(readable: Texture) {
        this.delete();
        readablesMap.set(this, readable);
    }

    toDevice(data: TypedArray) {
        this._getReadable()?.upload(data) ?? _throw(`No texture set`);
    }

    toHost(data: TypedArray) {
        data = this._prepareLocalData(data);
        this._getReadable()?.read(data) ?? _throw(`No texture set`);
        return data;
    }

    /// Private methods / properties.

    get formatInfo() {
        return formatInfo(this.type, this.vector);
    }

    _getReadable(forceCreate = false) {
        if (!readablesMap.has(this) && forceCreate) {
            const { bytes, internalFormat, format, type } = this.formatInfo;
            const [width, height] = this.dimensions;
            readablesMap.set(
                this,
                new Texture(
                    internalFormat,
                    width,
                    height,
                    format,
                    type,
                    null,
                    bytes,
                    ...this.wrap
                )
            );
        }
        return readablesMap.get(this);
    }

    _getWritable(forceCreate = false) {
        if (!writablesMap.has(this) && forceCreate) {
            const readable =
                this._getReadable(true) ?? _throw(`No texture set`);
            writablesMap.set(this, readable.copy());
        }
        return writablesMap.get(this);
    }

    _finish() {
        // Swap.
        let writableCopy = this._getWritable();
        if (writableCopy) {
            let readableCopy = this._getReadable();
            if (readableCopy) {
                readableCopy.delete();
            }
            readablesMap.set(this, writableCopy);
            writablesMap.delete(this);
        }
    }

    _prepareLocalData(data: TypedArray) {
        if (!data) {
            const typedArray =
                ARRAY_CONSTRUCTORS.get(this.type) ??
                _throw(
                    `Typed Array constructor for '${this.type}' doesn't exist`
                );
            data = new typedArray(this.size);
        }

        // Cast Uint8ClampedArray to Uint8Array.
        let ref = data;
        if (data instanceof Uint8ClampedArray) {
            ref = new Uint8Array(data.buffer);
        }

        return ref;
    }

    isToHostAsyncSupportted(): boolean {
        return extensions.getBufferSubDataAsync;
    }

    toHostAsync(data: TypedArray) {
        if (!this.isToHostAsyncSupportted())
            throw new Error("WEBGL_get_buffer_sub_data_async not supported");
        data = this._prepareLocalData(data);
        return this._getReadable()?.readAsync(data);
    }
}
