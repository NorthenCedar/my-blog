/* 来源：three.js r186.1（node_modules/three@0.186.1）的
 * examples/jsm/postprocessing/Pass.js —— **逐字照抄，未改一行**。
 *
 * ★ 为什么要 vendor 它：`n8ao` 对 three 的引用里，裸 `three` 由 astro.config 的
 *   alias 指向本仓的单文件 vendor（three.module.min.js），但 **`three/examples/jsm/**`
 *   没有对应物**（vendored three 只有一个 bundle），所以 n8ao 里那行
 *   `import { Pass } from "three/examples/jsm/postprocessing/Pass.js"`
 *   解析失败（UNLOADABLE_DEPENDENCY，构建直接挂）。
 *   它只依赖裸 `three` 的 4 个具名导出（BufferGeometry / Float32BufferAttribute /
 *   OrthographicCamera / Mesh），**没有二级依赖** ⇒ vendoring 这一个文件就够。
 *   ⚠ 换 three 版本时必须重新从 node_modules 拷一份（版本断言在 tests/fin-infinity.test.ts）。
 */
import {
	BufferGeometry,
	Float32BufferAttribute,
	OrthographicCamera,
	Mesh
} from 'three';

/**
 * Abstract base class for all post processing passes.
 *
 * This module is only relevant for post processing with {@link WebGLRenderer}.
 *
 * @abstract
 * @three_import import { Pass } from 'three/addons/postprocessing/Pass.js';
 */
class Pass {

	/**
	 * Constructs a new pass.
	 */
	constructor() {

		/**
		 * This flag can be used for type testing.
		 *
		 * @type {boolean}
		 * @readonly
		 * @default true
		 */
		this.isPass = true;

		/**
		 * If set to `true`, the pass is processed by the composer.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.enabled = true;

		/**
		 * If set to `true`, the pass indicates to swap read and write buffer after rendering.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.needsSwap = true;

		/**
		 * If set to `true`, the pass clears its buffer before rendering
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.clear = false;

		/**
		 * If set to `true`, the result of the pass is rendered to screen. The last pass in the composers
		 * pass chain gets automatically rendered to screen, no matter how this property is configured.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.renderToScreen = false;

	}

	/**
	 * Sets the size of the pass.
	 *
	 * @abstract
	 * @param {number} width - The width to set.
	 * @param {number} height - The height to set.
	 */
	setSize( /* width, height */ ) {}

	/**
	 * This method holds the render logic of a pass. It must be implemented in all derived classes.
	 *
	 * @abstract
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
	 * destination for the pass.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
	 * previous pass from this buffer.
	 * @param {number} deltaTime - The delta time in seconds.
	 * @param {boolean} maskActive - Whether masking is active or not.
	 */
	render( /* renderer, writeBuffer, readBuffer, deltaTime, maskActive */ ) {

		console.error( 'THREE.Pass: .render() must be implemented in derived pass.' );

	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever the pass is no longer used in your app.
	 *
	 * @abstract
	 */
	dispose() {}

}

// Helper for passes that need to fill the viewport with a single quad.

const _camera = new OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

// https://github.com/mrdoob/three.js/pull/21358

class FullscreenTriangleGeometry extends BufferGeometry {

	constructor() {

		super();

		this.setAttribute( 'position', new Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
		this.setAttribute( 'uv', new Float32BufferAttribute( [ 0, 2, 0, 0, 2, 0 ], 2 ) );

	}

}

const _geometry = new FullscreenTriangleGeometry();


/**
 * This module is a helper for passes which need to render a full
 * screen effect which is quite common in context of post processing.
 *
 * The intended usage is to reuse a single full screen quad for rendering
 * subsequent passes by just reassigning the `material` reference.
 *
 * This module can only be used with {@link WebGLRenderer}.
 *
 * @augments Mesh
 * @three_import import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
 */
class FullScreenQuad {

	/**
	 * Constructs a new full screen quad.
	 *
	 * @param {?Material} material - The material to render te full screen quad with.
	 */
	constructor( material ) {

		this._mesh = new Mesh( _geometry, material );

	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever the instance is no longer used in your app.
	 */
	dispose() {

		this._mesh.geometry.dispose();

	}

	/**
	 * Renders the full screen quad.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 */
	render( renderer ) {

		renderer.render( this._mesh, _camera );

	}

	/**
	 * The quad's material.
	 *
	 * @type {?Material}
	 */
	get material() {

		return this._mesh.material;

	}

	set material( value ) {

		this._mesh.material = value;

	}

}

export { Pass, FullScreenQuad };
