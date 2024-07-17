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
//
"use strict";

const STATUS = document.querySelector('#status');   // Status span
const SER_BTN = document.querySelector('#serial');  // Start Serial button
const CANVAS = document.querySelector('#canvas');   // Canvas

const CTX = CANVAS.getContext("2d", {willReadFrequently: true});
const CANVAS_W = 240;  // Canvas height at 1x zoom
const CANVAS_H = 192;  // Canvas width at 1x zoom

// Serial Port
var SER_PORT = null;

// Update status line span
function setStatus(s) {
    STATUS.textContent = s;
}

// Exapand pixel values from the luma array into the RGBA array as grayscale
function expandIntoRGBA(luma, rgba) {
    // luma is Uint8ClampedArray using 1 byte per pixel
    // rgba is Uing8ClampedArray using 4 bytes per pixel
    let i = 0;
    for (const Y of luma) {
        rgba[i] = Y;
        rgba[i+1] = Y;
        rgba[i+2] = Y;
        rgba[i+3] = 255;
        i += 4;
    }
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
async function paintFrame(data) {
    // Set size of virtual display size
    const zoom = 2;
    const w = CANVAS_W;
    const h = CANVAS_H;
    CANVAS.width = w;
    CANVAS.height = h;
    // getImageData returns RGBA Uint8ClampedArray of pixels in row-major order
    const imageData = CTX.getImageData(0, 0, w, h);
    const rgba = imageData.data;
    const luma = Uint8ClampedArray.from(data);
    expandIntoRGBA(luma, rgba);
    CTX.putImageData(imageData, 0, 0);
}

// Parse complete lines to assemble frames
async function parseLine(line, state) {
    if(!state.frameSync) {
        // Ignore lines until the first start of frame marker
        // Wait to sync with start of frame
        if (line == '-----BEGIN FRAME-----') {
            state.frameSync = true;
            state.data = [];
        } else if (line.startsWith('mem_free ')) {
            // Only log mem_free lines when the number has changed
            if (line != state.memFree) {
                state.memFree = line;
                console.log(line);
            }
        }
    } else {
        // When frame sync is locked, save base64 data until end of frame mark
        if (line == '-----END FRAME-----') {
            state.frameSync = false;
            try {
                // Decode the base64 using the Data URL decoder because the
                // old school btoa() decoder function is problematic
                const dataUrlPrefix = 'data:application/octet-stream;base64,';
                const buf = await fetch(dataUrlPrefix + state.data.join(''));
                const data = new Uint8Array(await buf.arrayBuffer());
                paintFrame(data);
            } catch (e) {
                console.log("bad frame", e);
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
    const reader = port.readable
        .pipeThrough(new TextDecoderStream())
        .getReader();
    const state = {
        lineSync: false,
        frameSync: false,
        lineBuf: '',
        data: [],
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
            await event.target.close();
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
