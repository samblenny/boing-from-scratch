// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: Copyright 2024 Sam Blenny
//
// This provides a virtual CircuitPython display over Web Serial
//
// Related Docs:
// - https://developer.chrome.com/docs/capabilities/serial
// - https://codelabs.developers.google.com/codelabs/web-serial#0
// - https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
// - https://developer.mozilla.org/en-US/docs/Web/API/SerialPort
// - https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Concepts
// - https://developer.mozilla.org/en-US/docs/Web/API/TextDecoderStream
// - https://developer.mozilla.org/en-US/docs/Glossary/Base64
// - https://en.wikipedia.org/wiki/Endianness
//
"use strict";

const STATUS = document.querySelector('#status');   // Status span
const SER_BTN = document.querySelector('#serial');  // Start Serial button
const CANVAS = document.querySelector('#canvas');   // Canvas

const CTX = CANVAS.getContext("2d", { willReadFrequently: true });
CTX.imageSmoothingEnabled = false;

const CANVAS_W = 160;  // Canvas height at 1x zoom
const CANVAS_H = 128;  // Canvas width at 1x zoom

// Serial Port
var SER_PORT = null;

// Update status line span
function setStatus(s) {
    STATUS.textContent = s;
}

// Disconnect serial port and stop updating the canvas
async function disconnect(status) {
    if (SER_PORT) {
        await SER_PORT.forget();
        SER_PORT = null;
    }
    SER_BTN.classList.remove('on');
    SER_BTN.textContent = 'Connect';
    setStatus(status ? status : 'disconnected');
}

// Update HTML canvas element with pixels for a new virtual display frame
async function paintFrame(data, palette) {
    // Set size of virtual display size
    const zoom = 2;
    const bits_per_px = 4;
    const mask = 15;
    const max_value = palette.length - 1;
    const w = CANVAS_W;
    const h = CANVAS_H;
    CANVAS.width = w;
    CANVAS.height = h;
    // getImageData returns RGBA Uint8ClampedArray of pixels in row-major order
    const imageData = CTX.getImageData(0, 0, w, h, {colorSpace: "srgb"});
    const rgba = imageData.data;
    // Expand packed indexed color pixel data into RGBA (palette is RGB, no A).
    // CAUTION: This is tricky! Color indexes are packed 2 nibbles per byte in
    // groups of 4 bytes (8 pixels per uint32). To unpack pixels in the right
    // order, this must account for endianness of nibbles within a byte and of
    // bytes within a uint32. It's rather confusing. For the destination array,
    // each pixel uses 4 bytes (RGBA). So, each group of 4 source array bytes
    // expands into 4*2*4=32 destination array bytes.
    const srcLen = data.length;
    const dstLen = rgba.length;
    for(let s=0, d=0; (s+3<srcLen) && (d+31<dstLen); s+=4, d+=32) {
        // Gather 4 source bytes into a little-endian uint32
        let n = data[s] | (data[s+1]<<8) | (data[s+2]<<16) | (data[s+3]<<24);
        // Unpack 4-bit source nibbles into RGBA pixeles in destination buffer,
        // taking nibbles from the big end of the unint32 (pixel at (x=0,y=0)
        // is surprisingly stored in the high nibble of the 4th byte of the
        // source buffer; low nibble of first byte has the pixel at (x=7,y=0))
        for(let i=0; i<8; i++) {
            const colorIndex = (n >> 28) & 0xf;
            const rgb = palette[colorIndex];
            n <<= 4;
            const px = d + (i * 4);
            rgba[px]   = (rgb >> 16) & 255;  // R
            rgba[px+1] = (rgb >>  8) & 255;  // G
            rgba[px+2] =  rgb        & 255;  // B
            rgba[px+3] = 255;                // A
        }
    }
    CTX.putImageData(imageData, 0, 0);
}

// Return RRGGBB (no AA!) CSS hex string for a unit32 RGBA color value
// This provides zero fill and avoids the signed prefix quirk of toString(16)
function hexColor(c) {
    let a = [
        ((c >> 20) & 0xf).toString(16) || '0',
        ((c >> 16) & 0xf).toString(16) || '0',
        ((c >> 12) & 0xf).toString(16) || '0',
        ((c >>  8) & 0xf).toString(16) || '0',
        ((c >>  4) & 0xf).toString(16) || '0',
        ( c        & 0xf).toString(16) || '0',
    ];
    return a.join('');
}

// Update the color palette
async function updatePalette(data, state) {
    const colors = Math.floor(data.length / 3);
    state.palette = [];
    for(let i=0; i<colors; i++) {
        const n = i * 3;
        const rgb = (data[n]<<16) | (data[n+1]<<8) | data[n+2];
        state.palette[i] = rgb;
    }
    let s = [];
    for(let c of state.palette) {
        s.push(hexColor(c));
    }
}

// Parse complete lines to assemble frames
async function parseLine(line, state) {
    if(!(state.frameSync || state.paletteSync)) {
        // Ignore lines until the first start of frame marker
        // Wait to sync with start of frame
        if (line == '-----BEGIN FRAME-----') {
            state.frameSync = true;
            state.data = [];
        } else if (line == '-----BEGIN PALETTE-----') {
            state.paletteSync = true;
            state.data = [];
        } else if (line.startsWith('mem_free ')) {
            // Only log mem_free lines when the number has changed
            if (line != state.memFree) {
                state.memFree = line;
                console.log(line);
            }
        } else if (line != '') {
            console.log(line);
        }
    } else {
        // When frame or palette sync is locked, save base64 data until end of
        // frame mark
        if (state.frameSync && line == '-----END FRAME-----') {
            state.frameSync = false;
            try {
                // Decode the base64 using the Data URL decoder because the
                // old school btoa() decoder function is problematic
                const dataUrlPrefix = 'data:application/octet-stream;base64,';
                const buf = await fetch(dataUrlPrefix + state.data.join(''));
                const data = new Uint8Array(await buf.arrayBuffer());
                state.pxBuf = data;
                paintFrame(data, state.palette);
            } catch (e) {
                console.log("bad frame", e);
            }
        } else if (state.paletteSync && line == '-----END PALETTE-----') {
            state.paletteSync = false;
            try {
                // Decode the base64 using the Data URL decoder
                const dataUrlPrefix = 'data:application/octet-stream;base64,';
                const buf = await fetch(dataUrlPrefix + state.data.join(''));
                const data = new Uint8Array(await buf.arrayBuffer());
                updatePalette(data, state);
                if (state.pxBuf) {
                    paintFrame(state.pxBuf, state.palette);
                } else {
                    console.log("I don't have any pixels");
                }
            } catch (e) {
                console.log("bad palette", e);
            }
        } else {
            // This is a base64 data chunk
            state.data.push(line);
        }
    }
}

// Parse a chunk of serial data to assemble complete lines.
// CAUTION: This expects '\r\n' line endings!
async function parseChunk(chunk, state) {
    if (!state.lineSync) {
        // Ignore everything up to the first line ending, then start buffering
        // the next line
        const n = chunk.indexOf('\r\n');
        if (n >= 0) {
            state.lineBuf = (chunk.slice(n+2));
            state.lineSync = true;
        }
    } else {
        // Once line sync is locked, just append the next chunk
        state.lineBuf += chunk;
    }
    // Parse complete lines off the front of the buffered chunks
    var i = state.lineBuf.indexOf('\r\n');
    while(i >= 0) {
        const line = state.lineBuf.substr(0, i);
        state.lineBuf = state.lineBuf.substr(i+2);
        parseLine(line, state);
        i = state.lineBuf.indexOf('\r\n');
    }
}

// Decode base64 encoded frame buffer updates from the serial port
async function readFrames(port) {
    // Send newline wakeup sequence so the board knows to send a full frame
    const wr = port.writable.getWriter();
    await wr.write(new Uint8Array('\n'.charCodeAt(0)));
    wr.releaseLock();
    // Now start reading
    const reader = port.readable
        .pipeThrough(new TextDecoderStream())
        .getReader();
    const state = {
        lineSync: false,
        frameSync: false,
        paletteSync: false,
        lineBuf: '',
        data: [],
        pxBuf: null,
        palette: [0,0,0,0,0,0,0,0,0,0,0,0],
        memFree: '',
    };
    while(port.readable) {
        try {
            const {done, value} = await reader.read();
            if (done) {
                reader.releaseLock();
                break;
            }
            if (value.length > 0) {
                parseChunk(value, state);
            }
        } catch(err) {
            // This is normal for a disconnect (button or USB cable)
            break;
        }
    }
}

// Attempt to start virtual display with data feed over Web Serial
function connect() {
    if (!('serial' in navigator)) {
        setStatus('Browser does not support Web Serial');
        alert('This browser does not support Web Serial');
        return;
    }
    // Define a filter for Adafruit's USB vendor ID (works for Pi Pico)
    const circuitpyFilter = [{usbVendorId: 0x239a}];
    // Request access to serial port (trigger a browser permission prompt)
    navigator.serial
    .requestPort({filters: circuitpyFilter})
    .then(async (response) => {
        SER_PORT = await response;
        SER_PORT.ondisconnect = async (event) => {
            try {
                await event.target.close();
            } catch(e) { /* whatever... I tried. */ }
            disconnect('serial device unplugged');
        };
        await SER_PORT.open({baudRate: 115200});
        // Update HTML button
        SER_BTN.classList.add('on');
        SER_BTN.textContent = 'disconnect';
        // Update status line
        setStatus('connected');
        // Begin reading frame buffer updates
        readFrames(SER_PORT);
    })
    .catch((err) => {
        SER_PORT = null;
        setStatus('no serial port selected');
    });
}

// Add on/off event handlers to the button
SER_BTN.addEventListener('click', function() {
    if(SER_BTN.classList.contains('on')) {
        disconnect();
    } else {
        connect();
    }
});

setStatus("ready");
