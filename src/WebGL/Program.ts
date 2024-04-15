import { gl } from "./Context";
import { _throw, lazy } from "../common";

// importing of plaintext doesn't work as well if you're just using the TypeScript compiler
const vertexSource = /*glsl*/ `#version 300 es

precision highp float;

out vec2 bl_UV;

void main() {
	float x = -1.0 + float((gl_VertexID & 1) << 2);
	float y = -1.0 + float((gl_VertexID & 2) << 1);
	gl_Position = vec4(x, y, 0, 1);
	bl_UV = gl_Position.xy * 0.5 + 0.5;
}
`;

// Keep the vertex shader in memory.
const vertexShader = lazy(
    () =>
        compileShader(gl.VERTEX_SHADER, vertexSource) ??
        _throw("Failed to compile default built-in vertex shader")
);

/**
 * Internal (helper) class.
 */
export class Program {
    id: WebGLProgram | undefined;
    uniforms: Record<
        string,
        { id: WebGLUniformLocation; uniform: WebGLActiveInfo }
    > = {};

    constructor(fragSource: string) {
        let fragShader =
            compileShader(gl.FRAGMENT_SHADER, fragSource) ??
            _throw("Failed to compile fragment shader.");

        this.id = gl.createProgram() ?? _throw("Unable to create program.");
        gl.attachShader(this.id, vertexShader());
        gl.attachShader(this.id, fragShader);
        gl.deleteShader(fragShader);

        gl.linkProgram(this.id);

        if (!gl.getProgramParameter(this.id, gl.LINK_STATUS)) {
            console.error("Unable to link program. Info log:");
            console.warn(gl.getProgramInfoLog(this.id));
            return;
        }

        // Get attributes and uniforms.
        // This isn't used outside of this function, hence why it's been moved to a local variable
        const attributes: Record<string, WebGLActiveInfo> = {};

        const attribCount = gl.getProgramParameter(
            this.id,
            gl.ACTIVE_ATTRIBUTES
        );

        for (let a = 0; a < attribCount; a++) {
            let attribute =
                gl.getActiveAttrib(this.id, a) ??
                _throw("Unable to get active attribute.");

            // TODO: Revisit this and see if we should assign id straight to this
            (attribute as any).id = gl.getAttribLocation(
                this.id,
                attribute.name
            );

            attributes[attribute.name] = attribute;
        }

        const uniformCount = gl.getProgramParameter(
            this.id,
            gl.ACTIVE_UNIFORMS
        );
        for (let u = 0; u < uniformCount; u++) {
            let uniform = gl.getActiveUniform(this.id, u) ?? _throw("");
            // TODO: Revisit this and see if we should assign id straight to this
            const id =
                gl.getUniformLocation(this.id, uniform.name) ??
                _throw(`Unable to get uniform location for ${uniform.name}`);

            this.uniforms[uniform.name] = {
                uniform,
                id,
            };
        }
    }

    delete() {
        if (this.id) gl.deleteProgram(this.id);
        this.id = undefined;
    }

    setUniform(name: string, ...values: unknown[]) {
        if (!this.uniforms[name]) {
            // console.warn(`${name} not a valid uniform.`)
            return;
        }

        const {
            id,
            uniform: { size, type },
        } = this.uniforms[name];

        // TODO: Assume this is valid, come back later to make this type-safe
        let fnName = (uniformsFnTable as any)[type];
        if (size > 1 && fnName[fnName.length - 1] != "v") {
            fnName += "v";
        }

        if (fnName.includes("Matrix")) {
            (gl as any)[fnName](id, false, ...values);
        } else {
            (gl as any)[fnName](id, ...values);
        }
    }
}

function compileShader(type: GLenum, source: string) {
    // Check if the shader defines glsl version.
    if (!/^#version 300 es/g.test(source))
        source = `#version 300 es\n\r${source}`;

    let shader = gl.createShader(type) ?? _throw("Unable to create shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        // TODO: Better error logging.
        const typeName = type == gl.VERTEX_SHADER ? "vertex" : "fragment";
        const infoLog = gl.getShaderInfoLog(shader);
        throw new Error(
            `Unable to compile ${typeName} shader.\nINFO LOG: ${infoLog}\nSOURCE SHADER:\n${source}`
        );
    }

    return shader;
}

const uniformsFnTable = {
    [gl.FLOAT]: "uniform1f",
    [gl.FLOAT_VEC2]: "uniform2f",
    [gl.FLOAT_VEC3]: "uniform3f",
    [gl.FLOAT_VEC4]: "uniform4f",
    [gl.INT]: "uniform1i",
    [gl.INT_VEC2]: "uniform2i",
    [gl.INT_VEC3]: "uniform3i",
    [gl.INT_VEC4]: "uniform4i",
    [gl.UNSIGNED_INT]: "uniform1ui",
    [gl.UNSIGNED_INT_VEC2]: "uniform2ui",
    [gl.UNSIGNED_INT_VEC3]: "uniform3ui",
    [gl.UNSIGNED_INT_VEC4]: "uniform4ui",
    [gl.BOOL]: "uniform1i",
    [gl.BOOL_VEC2]: "uniform2i",
    [gl.BOOL_VEC3]: "uniform3i",
    [gl.BOOL_VEC4]: "uniform4i",
    [gl.FLOAT_MAT2]: "uniformMatrix2fv",
    [gl.FLOAT_MAT2x3]: "uniformMatrix2x3fv",
    [gl.FLOAT_MAT2x4]: "uniformMatrix2x4fv",
    [gl.FLOAT_MAT3]: "uniformMatrix3fv",
    [gl.FLOAT_MAT3x2]: "uniformMatrix3x2fv",
    [gl.FLOAT_MAT3x4]: "uniformMatrix3x4fv",
    [gl.FLOAT_MAT4]: "uniformMatrix4fv",
    [gl.FLOAT_MAT4x2]: "uniformMatrix4x2fv",
    [gl.FLOAT_MAT4x3]: "uniformMatrix4x3fv",
    [gl.SAMPLER_2D]: "uniform1i",
    [gl.INT_SAMPLER_2D]: "uniform1i",
    [gl.UNSIGNED_INT_SAMPLER_2D]: "uniform1i",
} as const;
