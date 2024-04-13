import * as common from "./common";
import { type DeviceBuffer } from "./DeviceBuffer";
import { device } from "./WebGL/Context";
import { Texture } from "./WebGL/Texture";

/**
 * The `Buffer` object allocates memory on the host. Once the `Buffer`
 * is requested on the device (GPU), the contents of `Buffer`'s data
 * are allocated and copied from the host to the device.
 *
 * Once te device is done computing, the contents of the `Buffer` on
 * the device are copied back to the host.
 *
 * All device copies are stored and maintained via WeakMaps.
 *
 * NOTE: The data of a `Buffer` is NOT retained on the device. Once
 * the data has been copied back to the host, the device copy will be
 * destroyed immediately. To retain data on the device, please use
 * the `DeviceBuffer` object.
 */
export interface BufferConstructorArgs {
    alloc?: number;
    data?: common.TypedArray;
    type?: common.DataType;
    vector?: number;
    wrap?: common.WrapMode | [common.WrapMode, common.WrapMode];
}

export let readablesMap = new WeakMap<Buffer | DeviceBuffer, Texture>();
export let writablesMap = new WeakMap();

export class Buffer {
    vector: number;
    dimensions: [number, number];
    wrap: [common.WrapMode, common.WrapMode];
    data: common.TypedArray | undefined;

    constructor({
        alloc,
        data,
        type = common.FLOAT,
        vector = 1,
        wrap = common.CLAMP,
    }: BufferConstructorArgs) {
        this.vector = Math.min(Math.max(vector, 1), 4);
        if (this.vector == 3) {
            console.warn(
                "Vector size of 3 not supported. Choosing vector size 4."
            );
            this.vector = 4;
        }

        let size = alloc || data?.length || 0;
        this.dimensions = common.closestDimensions(size / this.vector);

        // Wrap mode for S and T.
        this.wrap = Array.isArray(wrap) ? wrap : [wrap, wrap];

        const maxDimension = device.maxTextureSize ** 2;
        if (Math.max(...this.dimensions) > maxDimension) {
            throw new Error("Buffer size exceeds device limit.");
        }

        if (data != null) {
            if (data instanceof Uint8ClampedArray) {
                this.data = new Uint8Array(data.buffer);
            } else {
                this.data = data;
            }
        } else if (alloc != null) {
            const typedArray =
                common.ARRAY_CONSTRUCTORS.get(type) ??
                common._throw(
                    `Typed Array constructor for '${type}' doesn't exist`
                );
            this.data = new typedArray(size);
        } else {
            throw new Error("Must provide args: data or alloc.");
        }
    }

    delete() {
        this.data = undefined;
        this._finish();
    }

    copy() {
        return new Buffer({
            data: this.data?.slice(),
            vector: this.vector,
        });
    }

    /// Private methods / properties.

    get formatInfo() {
        for (const [constructor, type] of common.ARRAY_TYPES) {
            if (this.data instanceof constructor) {
                return common.formatInfo(type, this.vector);
            }
        }
        return null;
    }

    _getReadable(forceCreate = false) {
        if (!readablesMap.has(this) && forceCreate && this.data) {
            const readable = textureForBuffer(this, this.data);
            readablesMap.set(this, readable);
        }
        return readablesMap.get(this);
    }

    _getWritable(forceCreate = false) {
        if (!writablesMap.has(this) && forceCreate) {
            const writable = textureForBuffer(this, this.data);
            writablesMap.set(this, writable);
        }
        return writablesMap.get(this);
    }

    _finish() {
        let readable = this._getReadable();
        if (readable) {
            readable.delete();
            readablesMap.delete(this);
        }

        let writable = this._getWritable();
        if (writable) {
            writable.delete();
            writablesMap.delete(this);
        }
    }
}

function textureForBuffer(buffer: Buffer, data?: common.TypedArray): Texture {
    const { bytes, internalFormat, format, type } =
        buffer.formatInfo ?? common._throw(`Buffer has no data`);
    const [width, height] = buffer.dimensions;
    return new Texture(
        internalFormat,
        width,
        height,
        format,
        type,
        data ?? null,
        bytes,
        ...buffer.wrap
    );
}
