module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    setupFiles: ['dotenv/config'],
    moduleNameMapper: {
        '^rsp-js$': '<rootDir>/src/test/rsp-js.ts',
    },
    testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/scripts/uma/test.ts',
    ],
};
  
