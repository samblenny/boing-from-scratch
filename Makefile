# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: Copyright 2024 Sam Blenny

.PHONY: all bundle list sync tty clean

all:
	@echo "build project bundle:    make bundle"
	@echo "sync code to CIRCUITPY:  make sync"
	@echo "open serial terminal:    make tty"

# This is for use by .github/workflows/buildbundle.yml GitHub Actions workflow
bundle:
	@mkdir -p build
	python3 bundle_builder.py

list:
	unzip -l 'build/*.zip'

# This is for syncing current code and libraries to CIRCUITPY drive on macOS.
# To use this on other operating systems, adjust the "/Volumes/CIRCUITPY" path
# as needed. You might also want to read the rsync manual (try "man rsync" from
# a Terminal shell on macOS or Linux).
sync: bundle
	xattr -cr build/boing-from-scratch
	rsync -rcvO 'build/boing-from-scratch/CircuitPython 9.x/' /Volumes/CIRCUITPY
	sync

# Start serial terminal at fast baud rate with no flow control (-fn) using the
# serial device that happens to enumerate when I plug my Pi Pico into my mac.
# It's very likely the device name may be different on other systems.
tty:
	screen -fn /dev/tty.usbmodem* 256000

clean:
	rm -rf build
