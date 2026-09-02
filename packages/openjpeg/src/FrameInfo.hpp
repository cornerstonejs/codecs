// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include <stdint.h>

/// Every field is zero-initialised on purpose. J2KDecoder holds one of these by
/// value and does not initialise it, so getFrameInfo() before a successful
/// decode used to read uninitialised memory -- and because the wasm allocator
/// reuses freed blocks, a fresh decoder frequently landed on the block a
/// previous one had just released and reported THAT frame's geometry as its
/// own. Reading zeros is obviously wrong to a caller; reading 512x512 from the
/// last image decoded is not, which is the worse failure of the two.
struct FrameInfo {
    /// <summary>
    /// Width of the image, range [1, 65535].
    /// </summary>
    uint16_t width = 0;

    /// <summary>
    /// Height of the image, range [1, 65535].
    /// </summary>
    uint16_t height = 0;

    /// <summary>
    /// Number of bits per sample, range [2, 16]
    /// </summary>
    uint8_t bitsPerSample = 0;

    /// <summary>
    /// Number of components contained in the frame, range [1, 255]
    /// </summary>
    uint8_t componentCount = 0;

    /// <summary>
    /// true if signed, false if unsigned
    /// </summary>
    bool isSigned = false;
};