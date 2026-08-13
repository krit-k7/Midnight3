// SPDX-License-Identifier: Apache-2.0
//
// Test config for the browser DApp's application logic.
//
// Deliberately a `node` environment rather than jsdom: the units under test
// (wallet discovery/selection, tally mapping) touch only `window.midnight`,
// which the tests stub directly. That keeps CI free of a jsdom dependency and
// the suite in the tens of milliseconds.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules'],
    root: '.',
    reporters: ['default', ['junit', { outputFile: 'reports/report.xml' }]],
  },
});
