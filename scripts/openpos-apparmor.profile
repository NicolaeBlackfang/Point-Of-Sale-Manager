# AppArmor profile for the OpenPOS AppImage.
#
# Ubuntu 23.10+ (and 24.04/26.04) set
#   kernel.apparmor_restrict_unprivileged_userns=1
# which makes AppArmor deny unprivileged user namespaces to every profile that
# does not explicitly allow it. Chromium's *namespace* sandbox needs exactly
# that, so the AppImage cannot start:
#
#   FATAL:zygote_host_impl_linux.cc No usable sandbox!
#
# The .deb does not need this file - it uses the SUID chrome-sandbox helper
# (mode 4755) instead. This profile is only for the AppImage, where the helper
# is owned by the extracting user and the setuid bit is therefore ignored.
#
# Install it once:
#   sudo install -m 644 scripts/openpos-apparmor.profile /etc/apparmor.d/openpos
#   sudo apparmor_parser -r /etc/apparmor.d/openpos
#
# Remove it again with:
#   sudo apparmor_parser -R /etc/apparmor.d/openpos
#   sudo rm /etc/apparmor.d/openpos
#
abi <abi/4.0>,
include <tunables/global>

# The AppImage runs from a temporary FUSE mount whose name changes on every
# launch, so the profile has to match it with a wildcard.
profile openpos-appimage /tmp/.mount_*/openpos flags=(unconfined) {
  userns,
  include if exists <local/openpos-appimage>
}

# The .deb install.
profile openpos-deb /opt/OpenPOS/openpos flags=(unconfined) {
  userns,
  include if exists <local/openpos-deb>
}

# The extracted-AppImage layout (./squashfs-root/openpos).
profile openpos-extracted /**/squashfs-root/openpos flags=(unconfined) {
  userns,
  include if exists <local/openpos-extracted>
}
