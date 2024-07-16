<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: Copyright 2024 Sam Blenny -->
# Making a Boing Ball from scratch

work in progress (alpha)

The Plan:

1. Make wireframes for the backdrop and ball. For the ball's vertices, start
   with
   [polar coordinates](https://en.wikipedia.org/wiki/Polar_coordinate_system),
   then convert to (x,y,z,w)
   [homogeneous coordinates](https://en.wikipedia.org/wiki/Homogeneous_coordinates),
   then do a
   [perspective projection](https://en.wikipedia.org/wiki/3D_projection#Perspective_projection)
   to get 2D vertex coordinates.

2. Add [bouncing ball](https://en.wikipedia.org/wiki/Bouncing_ball) physics to
   translate the ball's position relative to the backdrop

3. Make a texture for the ball's surface and a transparent drop shadow using
   thin stripes of indexed colors, then use
   [color cycling](https://en.wikipedia.org/wiki/Color_cycling) to animate the
   color palette so it looks like the ball is rotating


## Hardware

- Adafruit QT Py ESP32-S3 with 8MB Flash and no PSRAM
  ([product page](https://www.adafruit.com/product/5426),
  [learn guide](https://learn.adafruit.com/adafruit-qt-py-esp32-s3))

- Adafruit I2C Stemma QT Rotary Encoder Breakout with Encoder
  ([product page](https://www.adafruit.com/product/5880),
  [learn guide](https://learn.adafruit.com/adafruit-i2c-qt-rotary-encoder))

- Adafruit Violet Micro Potentiometer Knob - 4 pack
  ([product page](https://www.adafruit.com/product/5537))

- Adafruit STEMMA QT / Qwiic JST SH 4-pin Cable - 100mm
  ([product page](https://www.adafruit.com/product/4210))


## Getting Started

To begin, assemble the rotary encoder and knob,
[install CircuitPython 9.1](https://learn.adafruit.com/welcome-to-circuitpython/installing-circuitpython),
then copy the project bundle code to your CIRCUITPY drive. Once that's all done,
`code.py` will begin sending display frames over the serial console. To see the
display frames, you will need to:

1. Make sure your CircuitPython board is plugged in to your computer's USB port

2. Load the static web GUI page, CIRCUITPY/index.html, included in the project
   bundle using a modern browser that supports the Web Serial API (Chrome on
   macOS works well)

3. Click the big green "Connect" button on the web GUI page

4. Pick your your board from the list.

Once you pick your board, the web GUI's javascript code may take a second or
two to sync with the serial stream before it begins showing video frames.


## Understanding the Virtual Display

To provide a browser-based virtual display for CircuitPython bitmaps, this
project uses two main cooperating parts:

1. On the CircuitPython board, `CIRCUITPY/code.py` generates display frames,
   encodes the pixels as base64 text, then sends them over the serial port.

2. In a browser on the host computer, `CIRCUITPY/index.html` uses the Web
   Serial API to receive base64 encoded video frames which it draws to an HTML
   canvas element.
