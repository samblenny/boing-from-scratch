# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: Copyright 2024 Sam Blenny
#
# boing-from-scratch: Making a Boing Ball from scratch
#
from binascii import b2a_base64
from gc import collect, mem_free
from sys import stdout
from time import sleep


def gcCol():
    # Collect garbage and print free memory
    collect()
    print("mem_free", mem_free())

def send(buf):
    # Encode the frame buffer (buf) as base64 and send it over the serial port.
    # CAUTION: This assumes len(buf) is evenly divisible by 96, which is
    # true for 96x96 and 240x240 frames.
    # Performance Notes: Caching function references as local vars is a
    # MicroPython speedup trick that avoids repeated dictionary lookups. Also,
    # using sys.stdout.write() here is *way* faster than using print().
    wr = stdout.write
    b64 = b2a_base64
    wr(b'-----BEGIN FRAME-----\n')
    stride = 96
    for i in range(0, len(buf), stride):
        wr(b64(buf[i:i+stride]))
    wr(b'-----END FRAME-----\n')

def main():
    # Make a buffer to hold captured pixel data
    gcCol()
    w = 312
    h = 192
    buf = bytearray(w * h)
    gcCol()
    # Send frames
    while True:
        sleep(0.15)
        send(buf)
        gcCol()

main()
