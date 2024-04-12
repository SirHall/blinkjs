import {
    _throw,
    DataType,
    DataTypeBytes,
    Formats,
    FormatType,
    InternalFormat,
    TypedArray,
    WrapMode,
} from "../common";
import { gl, extensions } from "./Context";

/**
 * Internal (helper) class.
 */
export class Texture {
    id: WebGLTexture | undefined;
    internalFormat: InternalFormat;
    width: number;
    height: number;
    format: Formats;
    type: FormatType;
    alignment: DataTypeBytes;

    constructor(
        internalFormat: InternalFormat,
        width: number,
        height: number,
        format: Formats,
        type: FormatType,
        data: TypedArray | null,
        alignment: DataTypeBytes,
        wrapS?: WrapMode,
        wrapT?: WrapMode
    ) {
        const previousTex = gl.getParameter(gl.TEXTURE_BINDING_2D);

        this.internalFormat = internalFormat;
        this.width = width;
        this.height = height;
        this.format = format;
        this.type = type;
        this.alignment = alignment;

        this.id =
            gl.createTexture() ?? _throw(`Failed to create texture on GPU`);
        gl.bindTexture(gl.TEXTURE_2D, this.id);
        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_WRAP_S,
            wrapS || gl.CLAMP_TO_EDGE
        );
        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_WRAP_T,
            wrapT || gl.CLAMP_TO_EDGE
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            (gl as any)[this.internalFormat] ??
                _throw(
                    `gl field for format '${this.internalFormat}' does not exist!`
                ),
            width,
            height,
            0,
            gl[this.format],
            (gl as any)[this.type] ??
                _throw(`gl field for type '${this.type}' does not exist!`),
            data
        );

        gl.bindTexture(gl.TEXTURE_2D, previousTex);
    }

    delete() {
        if (gl.getParameter(gl.TEXTURE_BINDING_2D) == this.id) {
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
        if (this.id != null) {
            gl.deleteTexture(this.id);
            this.id = undefined;
        }
    }

    copy() {
        let copy = new Texture(
            this.internalFormat,
            this.width,
            this.height,
            this.format,
            this.type,
            null,
            this.alignment
        );

        withTemporaryFBO(() => {
            if (this.id == null)
                throw new Error(`Tried to copy an invalid texture`);
            if (copy.id == null)
                throw new Error(`Newly copied texture's id is null`);

            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                gl.TEXTURE_2D,
                this.id,
                0
            );
            gl.readBuffer(gl.COLOR_ATTACHMENT0);

            gl.bindTexture(gl.TEXTURE_2D, copy.id);
            gl.copyTexSubImage2D(
                gl.TEXTURE_2D,
                0,
                0,
                0,
                0,
                0,
                this.width,
                this.height
                // 0
            );
            gl.bindTexture(gl.TEXTURE_2D, null);
        });

        return copy;
    }

    upload(data: TypedArray) {
        if (this.id == null)
            throw new Error(`Cannot upload data to an invalid GPU texture`);

        gl.bindTexture(gl.TEXTURE_2D, this.id);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            (gl as any)[this.internalFormat] ??
                _throw(
                    `gl field for format '${this.internalFormat}' does not exist!`
                ),
            this.width,
            this.height,
            0,
            gl[this.format],
            (gl as any)[this.type] ??
                _throw(`gl field for type '${this.type}' does not exist!`),
            data
        );
        gl.bindTexture(gl.TEXTURE_2D, null);
        return this;
    }

    read(data: TypedArray) {
        withTemporaryFBO(() => {
            if (this.id == null)
                throw new Error(
                    `Cannot perform texture read if texture is invalid`
                );
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                gl.TEXTURE_2D,
                this.id,
                0
            );
            gl.readBuffer(gl.COLOR_ATTACHMENT0);
            gl.readPixels(
                0,
                0,
                this.width,
                this.height,
                gl[this.format],
                (gl as any)[this.type] ??
                    _throw(`gl field for type '${this.type}' does not exist!`),
                data,
                0
            );
        });
        return true;
    }

    readAsync(data: TypedArray) {
        return new Promise((resolve, reject) => {
            withTemporaryFBO(() => {
                if (this.id == null)
                    throw new Error(
                        `Cannot perform texture read if texture is invalid`
                    );
                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D,
                    this.id,
                    0
                );
                gl.readBuffer(gl.COLOR_ATTACHMENT0);

                let pixelBuffer = gl.createBuffer();
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pixelBuffer);
                gl.bufferData(
                    gl.PIXEL_PACK_BUFFER,
                    data.byteLength,
                    gl.STATIC_READ
                );
                gl.readPixels(
                    0,
                    0,
                    this.width,
                    this.height,
                    gl[this.format],
                    (gl as any)[this.type] ??
                        _throw(
                            `gl field for type '${this.type}' does not exist!`
                        ),
                    0
                );

                const cleanup = () => {
                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                    gl.deleteBuffer(pixelBuffer);
                };

                const ext = extensions.getBufferSubDataAsync;
                ext.getBufferSubDataAsync(gl.PIXEL_PACK_BUFFER, 0, data, 0, 0)
                    .then(() => {
                        cleanup();
                        resolve(data);
                    })
                    .catch((err: any) => {
                        cleanup();
                        reject(err);
                    });
            });
        });
    }
}

function withTemporaryFBO(fn: () => void) {
    let previousFBO = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    fn();
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFBO);
    gl.deleteFramebuffer(fbo);
}
