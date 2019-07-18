import typescript from 'rollup-plugin-typescript2';
import gzip from "rollup-plugin-gzip";
import minify from 'rollup-plugin-minify-es';

import * as path from 'path';

export default {
  input: path.join(__dirname, "samples.ts"),
  output: {
    file: "dist/samples/samples.js",
    sourcemap: true,
    format: "cjs"
  },
  plugins: [typescript(), minify(), gzip()],
  external: ['typescript']
};
