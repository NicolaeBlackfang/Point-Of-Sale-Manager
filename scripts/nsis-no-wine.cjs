// electron-builder only uses its pure-JS UninstallerReader to extract the NSIS
// uninstaller on macOS Catalina; on every other platform it shells out to wine
// to run the intermediate installer. Overriding isMacOsCatalina() lets the
// pure-JS path run on Linux too, so a Windows NSIS installer can be
// cross-built from Linux without installing wine.
//
// Used by the `electron:build:win` script. On Windows, use
// `electron:build:win:native` instead so the executable resources
// (icon/version metadata) are still written by rcedit.
const Module = require('module');
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  const exported = originalLoad.apply(this, arguments);
  if (
    exported &&
    typeof exported === 'object' &&
    typeof exported.isMacOsCatalina === 'function' &&
    /macosVersion/i.test(request)
  ) {
    return new Proxy(exported, {
      get(target, prop, receiver) {
        if (prop === 'isMacOsCatalina') return () => true;
        return Reflect.get(target, prop, receiver);
      },
    });
  }
  return exported;
};
