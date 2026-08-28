const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// expo/metro-config auto-detects the pnpm monorepo (node-linker=hoisted).
const config = getDefaultConfig(__dirname);

config.watchFolders = [path.resolve(__dirname, '../..')];

module.exports = config;
