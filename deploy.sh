#!/bin/sh
# Build the installer and run it on a Pi-Star box over SSH.
#
#   HOST=pi-star@192.168.1.50 ./deploy.sh              install / upgrade
#   HOST=pi-star@pi-star.local ./deploy.sh --uninstall
#
# Any arguments are passed to the installer. Needs SSH access as a user with sudo.
set -e
if [ -z "$HOST" ]; then
  echo "Set HOST to your Pi-Star's SSH login, e.g.  HOST=pi-star@192.168.1.50 $0" >&2
  exit 2
fi
cd "$(dirname "$0")"
./build.sh
scp -q dist/pistar-live-install.sh "$HOST":/tmp/pistar-live-install.sh
ssh "$HOST" "sudo bash /tmp/pistar-live-install.sh $*; rc=\$?; rm -f /tmp/pistar-live-install.sh; exit \$rc"
