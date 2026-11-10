"use strict";
console.log('🚀 Starting backend with ts-node...');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'ES2020'
  }
});

require('./src/main.ts');