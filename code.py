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
from bitmaptools import draw_polygon
from board import STEMMA_I2C
from displayio import Bitmap, Palette
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
    wr('\n-----BEGIN %s-----\n' % tag)
    stride = 60
    last = 0
    for i in range(0, len(buf), stride):
        wr(b64(buf[i:i+stride]))
        last = i
    if i + stride < len(buf):
        wr(b64(buf[i+stride:]))
    wr('-----END %s-----\n' % tag)

def sendPalette(pal, angle):
    # Send color palette with red and white rotated by angle
    assert ((0 <= angle) and (angle <= 15)), 'angle out of range'
    n = len(pal)
    start = angle
    data = bytearray(n * 3)
    # Make a list of the new order of colors after rotating red and white
#     order = [0, 1, 2, 3] + list(range(start, n)) + list(range(4, start))
    order = list(range(start, n)) + list(range(start))
    # Make a buffer of colors in the rotated order (use MSB byte order)
    for i in range(n):
        c = pal[order[i]]
        m = i * 3
        data[m]   = (c >> 16) & 255
        data[m+1] = (c >>  8) & 255
        data[m+2] =  c        & 255
    send(data, 'PALETTE')

def initPalette():
    # Return the initial color palette
    p = Palette(16)
#     p[ 0] = 0xaaaaaa  # gray
#     p[ 1] = 0x666666  # dark gray
#     p[ 2] = 0xaa00aa  # purple
#     p[ 3] = 0x660066  # dark purple
    p[ 0] = 0xffffff
    p[ 1] = 0xf7f7f7
    p[ 2] = 0xefefef
    p[ 3] = 0xe7e7e7
    p[ 4] = 0xdfdfdf  # white
    p[ 5] = 0xd7d7d7
    p[ 6] = 0xcfcfcf
    p[ 7] = 0xc7c7c7
    p[ 8] = 0xff0000  # red
    p[ 9] = 0xf70000
    p[10] = 0xef0000
    p[11] = 0xe70000
    p[12] = 0xdf0000
    p[13] = 0xd70000
    p[14] = 0xcf0000
    p[15] = 0xc70000
    return p

def paint(bitmap, w, h):
    # Paint frame with a color cycleable red and white checkerboard pattern
    for y in range(h):
        for x in range(w):
#             angle = (x >> 1) & 3
#             grid = ((y >> 4) & 1) ^ ((x >> 4) & 1)   # checkerboard pattern
#             bitmap[x,y] = (grid * 8) + angle
            bitmap[x,y] = (((y * w) + x) >> 1) & 15

def main():
    # Make frame buffer (160x128px size matches Adafruit PyGamer)
    gcCol()
    w = 160
    h = 128
    bitmap = Bitmap(w, h, 11)    # 11 = number of possible values
    pal = initPalette()          # color palette (RGBA 32 bits each)
    gcCol()
    buf = np.frombuffer(bitmap, dtype=np.uint8)
    paint(bitmap, w, h)          # draw a pattern
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
    print('display size', w, h)
    print('bits per pixel', bitmap.bits_per_value)
    angle = 0
    sendPalette(pal, angle)
    send(buf, 'FRAME')
    # MAIN EVENT LOOP
    prevClick = False
    while True:
        sleep(0.01)
        (c, d) = (click(), delta())  # read encoder (Seesaw I2C)
        if c and (c != prevClick):
            # send entire frame for click
            send(buf, 'FRAME')
            col()
        prevClick = c
        if d != 0:
            angle = (32 + angle + d) & 15   # update angle, modulo 16
            sendPalette(pal, angle)
#             send(buf, 'FRAME')
            col()

main()
