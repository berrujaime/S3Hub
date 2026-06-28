module.exports = {
  root: true,
  extends: ['expo', 'prettier'],
  overrides: [
    {
      files: ['**/__tests__/**/*.js', '**/*.test.js'],
      env: { jest: true },
    },
  ],
};
