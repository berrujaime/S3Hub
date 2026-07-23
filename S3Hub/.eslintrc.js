module.exports = {
  root: true,
  extends: ['expo', 'prettier'],
  overrides: [
    {
      files: ['**/__tests__/**/*.js', '**/*.test.js', 'jest.setup.js'],
      env: { jest: true },
    },
  ],
};
