#!/bin/bash

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# The SUID sandbox helper must stay root-owned with mode 4755.
#
# IMPORTANT: this script runs as root, and root can always create a user
# namespace -- so a capability probe executed here always "succeeds" and proves
# nothing about the unprivileged desktop user. The upstream electron-builder
# template probes with `unshare --user true` and therefore always downgrades
# chrome-sandbox to 0755 on any machine where the postinst runs as root.
#
# The result is an app that aborts on launch:
#
#   FATAL:setuid_sandbox_host.cc The SUID sandbox helper binary was found,
#   but is not configured correctly.
#
# and, on distros that restrict unprivileged user namespaces through AppArmor
# (Ubuntu 23.10+, incl. 24.04/26.04), the namespace sandbox is not available
# as a fallback either.
#
# So we always install the SUID helper as 4755. It is supported on every Linux
# distribution and needs no capability probe.
chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || \
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
