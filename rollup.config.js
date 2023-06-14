import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'

export default {
  input: "src/index.ts",
  output: [
    {
      file: "dist/index.js",
      format: "umd",
      name: "umd"
    },
    {
      file: "dist/index.cjs",
      format: "cjs",
      name: "cjs"
    },
    {
      file: "dist/index.esm.js",
      format: "esm",
      name: "esm"
    }
  ],
  plugins: [commonjs(), typescript()]
};