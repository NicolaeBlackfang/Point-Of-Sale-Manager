#!/usr/bin/env node
/**
 * electron-builder `afterPack` hook.
 *
 * Chromium's SUID sandbox refuses to start unless `chrome-sandbox` is owned by
 * root and has mode 4755. electron-builder stages the Electron runtime with
 * mode 0755, and fpm preserves whatever mode it finds, so the shipped package
 * has a sandbox helper that Electron aborts on:
 *
 *   FATAL:setuid_sandbox_host.cc The SUID sandbox helper binary was found,
 *   but is not configured correctly.
 *
 * The setuid bit is stripped again by dpkg's `postinst` unless the postinst
 * template is also patched — see `scripts/deb-after-install.tpl`.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;

  const helper = path.join(context.appOutDir, 'chrome-sandbox');
  if (!fs.existsSync(helper)) {
    console.log('[after-pack] chrome-sandbox not found, skipping');
    return;
  }

  fs.chmodSync(helper, 0o4755);
  console.log(`[after-pack] chrome-sandbox set to 4755 (${helper})`);
};
