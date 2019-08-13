module.exports = {
  clearMocks: true,
  coverageDirectory: "coverage",
  collectCoverageFrom: ["<rootDir>/src/core/**/*.ts"],
  moduleFileExtensions: ["ts", "js", "svelte"],
  testEnvironment: "jest-environment-jsdom-fourteen",
  resolver: "./jest-resolver",
  transform: {
    "^.+\\.svelte$": "./jest-svelte",
    "^.+\\.ts$": "ts-jest"
  },
  globals: {
    "ts-jest": {
      tsConfig: "tsconfig.test.json"
    }
  }
};
