module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@vaira/core$": "<rootDir>/../../packages/core/src/index.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // jose v6 ships ESM only; let ts-jest transpile it (and our TS) to CommonJS.
  transformIgnorePatterns: ["/node_modules/(?!(jose)/)"],
  transform: {
    "^.+\.[tj]sx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          jsx: "react-jsx",
          esModuleInterop: true,
          allowJs: true,
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          types: ["jest", "node"],
          strict: true,
          resolveJsonModule: true,
          rootDir: "<rootDir>",
          ignoreDeprecations: "6.0",
        },
      },
    ],
  },
};
