import { _throw } from "../common";

/**
 * WebGL 2.0 related objects and helpers.
 */
export const gl = (function () {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;

    const options = {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
    };

    let gl: WebGL2RenderingContext =
        (canvas.getContext(
            "webgl2",
            options
        ) as WebGL2RenderingContext | null) ??
        _throw("WebGL 2.0 not supported by the browser.");

    if (!gl) {
        throw new Error("WebGL 2.0 not supported by the browser.");
    } else if (
        !((gl as any).floatExt = gl.getExtension("EXT_color_buffer_float"))
    ) {
        throw new Error("EXT_color_buffer_float not supported.");
    }

    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    return gl;
})();

export const extensions = (function () {
    return {
        debugRendererInfo: gl.getExtension("WEBGL_debug_renderer_info"),
        debugShaders: gl.getExtension("WEBGL_debug_shaders"),
        getBufferSubDataAsync: gl.getExtension(
            "WEBGL_get_buffer_sub_data_async"
        ),
    } as const;
})();

export const device = (function () {
    let { debugRendererInfo } = extensions;

    return Object.freeze({
        glslVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        maxColorAttachments: gl.getParameter(gl.MAX_DRAW_BUFFERS),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
        renderer: gl.getParameter(gl.RENDERER),
        vendor: gl.getParameter(gl.VENDOR),
        unmaskedRenderer:
            debugRendererInfo ?
                gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
            :   undefined,
        unmaskedVendor:
            debugRendererInfo ?
                gl.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
            :   undefined,
    });
})();
