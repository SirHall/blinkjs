import { device, gl } from "./WebGL/Context";
import { Program } from "./WebGL/Program";
import { Buffer } from "./Buffer";
import { _throw, OutType, PrecisionOption } from "./common";

const fragTemplate = /*glsl*/ `#version 300 es

precision highp float;
precision highp int;

uniform highp ivec2 bl_Size;

in vec2 bl_UV;

highp uint bl_Id() {
	highp ivec2 uv = ivec2(bl_UV * vec2(bl_Size));
	return uint(uv.x + uv.y * bl_Size.x);
}`;

export interface KernelIOOptions {
    inputs?: Record<string, Buffer>;
    outputs: Record<string, Buffer>;
}

export interface Descriptor {
    outputType: OutType;
    precision: PrecisionOption;
    location: number;
}

/**
 * Inputs and outputs have to be defined beforehand.
 * Although this means the pipeline is *fixed*, it does allow you
 * to swap Buffers before executing the `Kernel`.
 *
 * Depending on the number of allowed color attachments, a `Kernel`
 * may have to split the number of executions in numerous steps.
 */

export class Kernel {
    inputs: Record<string, Buffer> = {};
    outputs: Record<string, Buffer> = {};
    steps: Set<{ out: string[]; program: Program }>;

    constructor(io: KernelIOOptions, source: string) {
        this.inputs = io.inputs || {};
        this.outputs = io.outputs;

        if (!this.outputs || !Object.values(this.outputs).length) {
            throw new Error(`At least 1 output is required.`);
        }

        //
        // Check for conflicts.
        for (const output of Object.keys(this.outputs)) {
            for (const input of Object.keys(this.inputs)) {
                if (input === output) {
                    throw new Error(
                        `Conflicting input/output variable name: ${input}.`
                    );
                }
            }
        }

        //
        // Compare maximum input variabes allowed by the device.
        let inputCount = Object.values(this.inputs).length;
        if (inputCount > device.maxTextureUnits) {
            throw new Error(
                `Maximum number of inputs exceeded. Allowed: ${device.maxTextureUnits}, given: ${inputCount}.`
            );
        }

        //
        // Split the task in multiple programs based on the maximum number of outputs.
        const maxOutputs = device.maxColorAttachments;
        const outputNames = Object.keys(this.outputs);
        const outputGroupCount = Math.ceil(outputNames.length / maxOutputs);
        let outputDescriptors = [];

        let groupStartIndex = 0;
        for (let a = 0; a < outputGroupCount; a++) {
            let descriptors: Record<string, Descriptor> = {};

            for (const [i, name] of outputNames.entries()) {
                const { outputType, precision } =
                    this.outputs[name].formatInfo ??
                    _throw("Output buffer format not found.");

                descriptors[name] = { outputType, precision, location: -1 };

                if (i >= groupStartIndex && i < groupStartIndex + maxOutputs)
                    descriptors[name].location = i - groupStartIndex;
            }
            outputDescriptors.push(descriptors);
            groupStartIndex += maxOutputs;
        }

        // Create the set of programs.
        this.steps = new Set(
            outputDescriptors.map(descriptors => {
                const shaderSource = prepareFragmentShader(
                    this.inputs,
                    descriptors,
                    source
                );
                let program = new Program(shaderSource);

                let out = [];
                for (const [name, descriptor] of Object.entries(descriptors)) {
                    if (descriptor.location !== undefined) {
                        out.push(name);
                    }
                }

                return { out, program };
            })
        );
    }

    delete() {
        for (const step of this.steps) step.program.delete();
        this.steps.clear();

        this.inputs = {};
        this.outputs = {};
    }

    exec(uniforms: Record<string, unknown> = {}) {
        // Check dimensions.
        let size: number[] = [];
        for (const output of Object.values(this.outputs)) {
            const dimensions = [...output.dimensions];
            if (!size.length) {
                size = dimensions;
            } else if (size[0] != dimensions[0] || size[1] != dimensions[1]) {
                throw new Error("Outputs require consistent sizes.");
            }
        }

        //
        // Prepare Framebuffer.
        let fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

        //
        // Run every step.
        for (const step of this.steps) {
            // Output textures.
            for (const [index, name] of step.out.entries()) {
                const texture = this.outputs[name]._getWritable(true);
                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0 + index,
                    gl.TEXTURE_2D,
                    texture.id,
                    0
                );
            }

            const { program } = step;
            if (!program.id) _throw("Program not compiled.");
            gl.useProgram(program.id);

            gl.viewport(0, 0, size[0], size[1]);

            // Built-in uniforms.
            program.setUniform("bl_Size", ...size);

            // User uniforms.
            for (const [uniform, value] of Object.entries(uniforms)) {
                program.setUniform(uniform, value);
            }

            // Input textures.
            for (const [index, name] of Object.keys(this.inputs).entries()) {
                gl.activeTexture(gl.TEXTURE0 + index);
                const texture = this.inputs[name]._getReadable(true);

                if (!texture?.id) _throw("Texture not created.");
                gl.bindTexture(gl.TEXTURE_2D, texture.id);
                program.setUniform(name, index);
            }

            gl.drawBuffers(step.out.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // Unpacking time. But only for `Buffer`s.
            for (const [index, name] of step.out.entries()) {
                const buffer = this.outputs[name];
                if (buffer instanceof Buffer) {
                    const { bytes, format, type } =
                        buffer.formatInfo ?? _throw("Buffer format not found.");
                    gl.readBuffer(gl.COLOR_ATTACHMENT0 + index);
                    gl.readPixels(
                        0,
                        0,
                        size[0],
                        size[1],
                        gl[format],
                        (gl as any)[type] ?? _throw(`Invalid gl type: ${type}`),
                        buffer.data ?? _throw("Buffer data not found"),
                        0
                    );
                }
            }

            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        // Clean-up all resources.
        const allBuffers = new Set([
            ...Object.values(this.inputs),
            ...Object.values(this.outputs),
        ]);
        for (const buffer of allBuffers) {
            buffer._finish();
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fbo);
    }
}

function prepareFragmentShader(
    inputs: Record<string, Buffer>,
    outputDescriptors: Record<string, Descriptor>,
    source: string
) {
    let uniforms = Object.entries(inputs).map(([name, buffer]) => {
        const { inputType, precision } =
            buffer.formatInfo ?? _throw("Buffer format not found.");
        return `uniform ${precision} ${inputType} ${name};`;
    });

    let outs = Object.entries(outputDescriptors).map(([name, props]) => {
        const layout =
            props.location !== undefined ?
                `layout(location = ${props.location}) out `
            :   "";
        return `${layout}${props.precision} ${props.outputType} ${name};`;
    });

    return `${fragTemplate}

		${uniforms.join("\n\r")}

		${outs.join("\n\r")}

		${source}`;
}
