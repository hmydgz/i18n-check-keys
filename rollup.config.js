import commonjs from '@rollup/plugin-commonjs';

export default {
  input: "src/index.js",
  output: [
    {
      file: "dist/index.js",
      format: "umd",
      name: "umd"
    },
    {
      file: "dist/index.esm.js",
      format: "esm",
      name: "esm"
    }
  ],
  plugins: [commonjs()]
};