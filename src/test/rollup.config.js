import typescript from 'rollup-plugin-typescript2';

import * as path from 'path';

export default {
  input: path.join(__dirname, "index.spec.ts"),
  output: {
    file: "dist/test/index.js",
    sourcemap: true,
    format: "cjs"
  },
  plugins: [typescript()],
  external: ['mocha', 'typescript', 'assert']
};
