# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: Copyright 2024 Sam Blenny
#
# boing-from-scratch: Making a Boing Ball from scratch
#
# Palette Colors:
# - gray 1:   #AAAAAA
# - purple 1: #AA00AA
# - gray 2:   #666666
# - purple 2: #660A66
# - red:      #FF0000
#
# Ball (hemisphere) specs:
# - 8 longitude divisions at π/8 = 0.39270 radians each
# - 8 latitude divisions at π/8 = 0.39270 radians each
#
# Docs:
# - https://learn.adafruit.com/adafruit-i2c-qt-rotary-encoder/python-circuitpython
# - https://docs.circuitpython.org/projects/seesaw/en/latest/api.html
# - https://learn.adafruit.com/ulab-crunch-numbers-fast-with-circuitpython
# - https://docs.circuitpython.org/en/latest/shared-bindings/ulab/index.html
# - https://docs.circuitpython.org/en/latest/shared-bindings/ulab/numpy/index.html
# - https://numpy.org/doc/stable/reference/generated/numpy.zeros.html
#
from binascii import b2a_base64
from board import STEMMA_I2C
from gc import collect, mem_free
from sys import stdout
from time import sleep
from ulab import numpy as np

from adafruit_seesaw import digitalio
from adafruit_seesaw.seesaw import Seesaw


def gcCol():
    # Collect garbage and print free memory
    collect()
    print("mem_free", mem_free())

def send(buf, tag):
    # Encode the buffer (buf) as base64 and send it over the serial port.
    # Performance Notes: Caching function references as local vars is a
    # MicroPython speedup trick that avoids repeated dictionary lookups. Also,
    # using sys.stdout.write() here is *way* faster than using print().
    wr = stdout.write
    b64 = b2a_base64
    wr('-----BEGIN %s-----\n' % tag)
    stride = 60
    last = 0
    for i in range(0, len(buf), stride):
        wr(b64(buf[i:i+stride]))
        last = i
    if i + stride < len(buf):
        wr(b64(buf[i+stride:]))
    wr('-----END %s-----\n' % tag)

def initPalette():
    # Return the initial color palette with 32 RGBA (32-bits each) colors
    return np.array([
        0xaa, 0xaa, 0xaa, 0xff,  # gray
        0xaa, 0x00, 0xaa, 0xff,  # purple
        0x66, 0x66, 0x66, 0xff,  # dark gray
        0x66, 0x00, 0x66, 0xff,  # dark purple
        0xff, 0xff, 0xff, 0xff,  # white
        0xff, 0x00, 0x00, 0xff,  # red
    ], dtype=np.uint8)

def colorCycle(pal, delta):
    # Rotate the color palette (CAUTION: delta can be negative)
    return np.roll(pal, 4 * ((32 + delta) & 31))

def paint(buf, w, h):
    # Paint a frame. (w: buf width, h: buf height)
    for y in range(h):
        base = y * w
        for x in range(w):
            buf[base+x] = x & 31

def main():
    # Make a buffer to hold captured pixel data
    gcCol()
    w = 312
    h = 192
    buf = bytearray(w * h)  # pixel buffer (indext, 8-bits per px)
    paint(buf, w, h)        # draw a pattern
    gcCol()
    pal = initPalette()     # color palette (RGBA 32 bits each)
    gcCol()
    # Set up rotary encoder
    ssw = Seesaw(STEMMA_I2C(), addr=0x36)  # address for no jumpers soldered
    # Configure Seesaw I2C rotary encoder (Adafruit #5880 or #4991)
    sswver = (ssw.get_version() >> 16) & 0xffff
    assert (sswver == 4991), "unexpected seesaw firmware version (not 4991)"
    # add pullup to knob-click button
    ssw.pin_mode(24, Seesaw.INPUT_PULLUP)
    # Cache function references to speed up the main loop
    #  delta: encoder position delta
    #  click: true when encoder knob button (seesaw pin 24) is pressed
    #  pr:    fast print to stdout
    #  gcc:   collect garbage
    delta = ssw.encoder_delta
    click = lambda: not ssw.digital_read(24)
    pr = stdout.write
    col = gcCol
    # SEND COLOR PALETTE AND FIRST FRAME
    send(pal, 'PALETTE')
    send(buf, 'FRAME')
    # MAIN EVENT LOOP
    prevClick = False
    while True:
        sleep(0.02)
        (c, d) = (click(), delta())  # read encoder (Seesaw I2C)
        if c and (c != prevClick):
            # send entire frame for click
            send(buf, 'FRAME')
            col()
        prevClick = c
        if d != 0:
            pal = colorCycle(pal, d)
            send(pal, 'PALETTE')
            col()

main()
