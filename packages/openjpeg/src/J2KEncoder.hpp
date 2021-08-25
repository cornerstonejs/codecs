// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include <exception>
#include <memory>


#include "openjpeg.h"
#include <string.h>
#include <stdlib.h>
#define EMSCRIPTEN_API __attribute__((used))
#define J2K_MAGIC_NUMBER 0x51FF4FFF

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

#include "BufferStream.hpp"
#include "FrameInfo.hpp"
#include "Point.hpp"
#include "Size.hpp"

/// <summary>
/// JavaScript API for encoding images to J2K bitstreams with OpenJPH
/// </summary>
class J2KEncoder {
  public: 
  /// <summary>
  /// Constructor for encoding a HJ2K image from JavaScript.  
  /// </summary>
  J2KEncoder() :
    decompositions_(5),
    lossless_(true),
    progressionOrder_(2), // RPCL
    blockDimensions_(64,64)
  {
  }

#ifdef __EMSCRIPTEN__
  /// <summary>
  /// Resizes the decoded buffer to accomodate the specified frameInfo.
  /// Returns a TypedArray of the buffer allocated in WASM memory space that
  /// will hold the pixel data to be encoded.  JavaScript code needs
  /// to copy the pixel data into the returned TypedArray.  This copy
  /// operation is needed because WASM runs in a sandbox and cannot access 
  /// data managed by JavaScript
  /// </summary>
  /// <param name="frameInfo">FrameInfo that describes the pixel data to be encoded</param>
  /// <returns>
  /// TypedArray for the buffer allocated in WASM memory space for the 
  /// source pixel data to be encoded.
  /// </returns>
  emscripten::val getDecodedBuffer(const FrameInfo& frameInfo) {
    frameInfo_ = frameInfo;
    const size_t bytesPerPixel = (frameInfo_.bitsPerSample + 8 - 1) / 8;
    const size_t decodedSize = frameInfo_.width * frameInfo_.height * frameInfo_.componentCount * bytesPerPixel;
    for (int c = 0; c < frameInfo_.componentCount; ++c) {
        downSamples_[c].x = 1;
        downSamples_[c].y = 1;
    }

    decoded_.resize(decodedSize);
    return emscripten::val(emscripten::typed_memory_view(decoded_.size(), decoded_.data()));
  }
  
  /// <summary>
  /// Returns a TypedArray of the buffer allocated in WASM memory space that
  /// holds the encoded pixel data.
  /// </summary>
  /// <returns>
  /// TypedArray for the buffer allocated in WASM memory space for the 
  /// encoded pixel data.
  /// </returns>
  emscripten::val getEncodedBuffer() {
    return emscripten::val(emscripten::typed_memory_view(encoded_.size(), encoded_.data()));
  }
#else
  /// <summary>
  /// Returns the buffer to store the decoded bytes.  This method is not
  /// exported to JavaScript, it is intended to be called by C++ code
  /// </summary>
 std::vector<uint8_t>& getDecodedBytes(const FrameInfo& frameInfo) {
    frameInfo_ = frameInfo;
    for (int c = 0; c < frameInfo_.componentCount; ++c) {
        downSamples_[c].x = 1;
        downSamples_[c].y = 1;
    }
    return decoded_;
  }

  /// <summary>
  /// Returns the buffer to store the encoded bytes.  This method is not
  /// exported to JavaScript, it is intended to be called by C++ code
  /// </summary>
  const std::vector<uint8_t>& getEncodedBytes() const {
    return encoded_;
  }
#endif

  /// <summary>
  /// Sets the number of wavelet decompositions and clears any precincts
  /// </summary>
  void setDecompositions(size_t decompositions) {
    decompositions_ = decompositions;
    precincts_.resize(0);
  }

  /// <summary>
  /// Sets which wavelet to use (9/7 lossy or 5/3 lossless) and
  /// how many layers to encode.  Caller must set compression
  /// ratio for each layer via setCompressionRatio()
  /// </summary>
  void setQuality(bool lossless, size_t numEncodeLayers) {
    lossless_ = lossless;
    layerCompressionRatios_.resize(numEncodeLayers);
  }

  /// <summary>
  /// Sets which wavelet to use (9/7 lossy or 5/3 losslsess) and
  /// what compressionRatio to achieve - lossy quantization
  /// will be applied if necessary
  /// </summary>
  void setCompressionRatio(size_t layer, float  compressionRatio) {
    layerCompressionRatios_[layer] = compressionRatio;
  }

  /// <summary>
  /// Sets the progression order 
  /// 0 = LRCP
  /// 1 = RLCP
  /// 2 = RPCL
  /// 3 = PCRL
  /// 4 = CPRL 
  /// </summary>
  void setProgressionOrder(size_t progressionOrder) {
    progressionOrder_ = progressionOrder;
  }

  /// <summary>
  /// Sets the down sampling for component
  /// </summary>
  void setDownSample(size_t component, Point downSample) {
    downSamples_[component] = downSample;
  }

  /// <summary>
  /// Sets the image offset
  /// </summary>
  void setImageOffset(Point imageOffset) {
    imageOffset_ = imageOffset;
  }

  /// <summary>
  /// Sets the tile size
  /// </summary>
  void setTileSize(Size tileSize) {
    tileSize_ = tileSize;
  }

  /// <summary>
  /// Sets the tile offset
  /// </summary>
  void setTileOffset(Point tileOffset) {
    tileOffset_ = tileOffset;
  }

  /// <summary>
  /// Sets the block dimensions
  /// </summary>
  void setBlockDimensions(Size blockDimensions) {
    blockDimensions_ = blockDimensions;
  }

  /// <summary>
  /// Sets the number of precincts
  /// </summary>
  void setNumPrecincts(size_t numLevels) {
    precincts_.resize(numLevels);
  }

  /// <summary>
  /// Sets the precinct for the specified level.  You must
  /// call setNumPrecincts with the number of levels first
  /// </summary>
  void setPrecinct(size_t level, Size precinct) {
    precincts_[level] = precinct;
  }

  /**
  sample error debug callback expecting no client object
  */
  static void error_callback(const char *msg, void *client_data)
  {
      (void)client_data;
      fprintf(stdout, "[ERROR] %s", msg);
  }
  /**
  sample warning debug callback expecting no client object
  */
  static void warning_callback(const char *msg, void *client_data)
  {
      (void)client_data;
      fprintf(stdout, "[WARNING] %s", msg);
  }
  /**
  sample debug callback expecting no client object
  */
  static void info_callback(const char *msg, void *client_data)
  {
      (void)client_data;
      fprintf(stdout, "[INFO] %s", msg);
  }

  /// <summary>
  /// Executes an J2K encode using the data in the source buffer.  The
  /// JavaScript code must copy the source image frame into the source
  /// buffer before calling this method.  See documentation on getSourceBytes()
  /// above
  /// </summary>
  void encode() {
    opj_cparameters_t parameters;   /* compression parameters */
    opj_stream_t *l_stream = 00;
    opj_codec_t* l_codec = 00;
    opj_image_t *image = NULL;
    
    OPJ_COLOR_SPACE color_space = frameInfo_.componentCount > 1 ? OPJ_CLRSPC_SRGB : OPJ_CLRSPC_GRAY;
    
    std::vector<opj_image_cmptparm_t> cmptparm;
    cmptparm.resize(frameInfo_.componentCount);
    /* initialize image components */
    for (int i = 0; i < frameInfo_.componentCount; i++) {
        cmptparm[i].prec = (OPJ_UINT32)frameInfo_.bitsPerSample;
        cmptparm[i].bpp = (OPJ_UINT32)frameInfo_.bitsPerSample;
        cmptparm[i].sgnd = (OPJ_UINT32)frameInfo_.isSigned;
        cmptparm[i].dx = 1;//(OPJ_UINT32)(subsampling_dx * raw_cp->rawComps[i].dx);
        cmptparm[i].dy = 1;//(OPJ_UINT32)(subsampling_dy * raw_cp->rawComps[i].dy);
        cmptparm[i].w = (OPJ_UINT32)frameInfo_.width;
        cmptparm[i].h = (OPJ_UINT32)frameInfo_.height;
    }
    image = opj_image_create((OPJ_UINT32)frameInfo_.componentCount, cmptparm.data(), color_space);

    /* set image offset and reference grid */
    image->x0 = (OPJ_UINT32)imageOffset_.x;
    image->y0 = (OPJ_UINT32)imageOffset_.y;
    image->x1 = (OPJ_UINT32)frameInfo_.width; // TODO: revisit logic in terms of subsampling and offsets?
    image->y1 = (OPJ_UINT32)frameInfo_.height; // TODO: revisit logic in terms of subsampling and offsets?

    if(frameInfo_.bitsPerSample <= 8) {
      if(frameInfo_.componentCount == 1) {
        std::copy((uint8_t*)decoded_.data(), (uint8_t*)(decoded_.data() + decoded_.size()), image->comps[0].data);
      } else {
        for(size_t compno = 0; compno < frameInfo_.componentCount; compno++) {
          for(size_t i=0; i < frameInfo_.width * frameInfo_.height; i++) {
            image->comps[compno].data[i] = decoded_.data()[(i * frameInfo_.componentCount) + compno];
          }
        }
      }
    } else if(frameInfo_.bitsPerSample <= 16) {
      if(frameInfo_.isSigned) {
        std::copy((short*)decoded_.data(), (short*)(decoded_.data() + decoded_.size()), image->comps[0].data);
      } else {
        std::copy((unsigned short*)decoded_.data(), (unsigned short*)(decoded_.data() + decoded_.size()), image->comps[0].data);
      }
    }

    /* set encoding parameters to default values */
    opj_set_default_encoder_parameters(&parameters);
    parameters.tcp_mct = (char)frameInfo_.componentCount > 1 ? 1 : 0; // disable for grayscale: TODO - set this properly for color
    parameters.prog_order = (OPJ_PROG_ORDER)progressionOrder_;
    parameters.numresolution = decompositions_ + 1;
    parameters.irreversible = !lossless_;

    parameters.tcp_numlayers = layerCompressionRatios_.size();
    for(size_t layer = 0; layer < layerCompressionRatios_.size(); layer++) {
      parameters.tcp_rates[layer] = layerCompressionRatios_[layer];
    }
    parameters.cp_disto_alloc = 1;

    // TODO: add support for JP2 encoding via config parameter
    l_codec = opj_create_compress(OPJ_CODEC_J2K);

    /* catch events using our callbacks and give a local context */
    opj_set_info_handler(l_codec, info_callback, 00);
    opj_set_warning_handler(l_codec, warning_callback, 00);
    opj_set_error_handler(l_codec, error_callback, 00);

    // TODO: Add support for using tiles?

    if (! opj_setup_encoder(l_codec, &parameters, image)) {
      fprintf(stderr, "failed to encode image: opj_setup_encoder\n");
      opj_destroy_codec(l_codec);
      opj_image_destroy(image);
      return; // TODO: implement error handling
    }

    // HACK: For now - make encoded buffer the same size as decoded so we can
    // avoid messing with BufferStream malloc/free stuff
    encoded_.resize(decoded_.size());

    /* open a byte stream for writing and allocate memory for all tiles */
    opj_buffer_info_t buffer_info;
    buffer_info.buf = encoded_.data();
    buffer_info.cur = encoded_.data();
    buffer_info.len = encoded_.size();
    l_stream = opj_stream_create_buffer_stream(&buffer_info, OPJ_FALSE);

    /* encode the image */
    if (!opj_start_compress(l_codec, image, l_stream))  {
        fprintf(stderr, "failed to encode image: opj_start_compress\n");
        return; // todo: error handling
    }

    if(!opj_encode(l_codec, l_stream)) {
      fprintf(stderr, "failed to encode image: opj_encode\n");
      return; // todo: error handling
    }

    if(!opj_end_compress(l_codec, l_stream)) {
      fprintf(stderr, "failed to encode image: opj_end_compress\n");
      return; // todo: error handling
    }

    encoded_.resize(buffer_info.cur - buffer_info.buf);
  }

  private:
    std::vector<uint8_t> decoded_;
    std::vector<uint8_t> encoded_;

    FrameInfo frameInfo_;
    size_t decompositions_;
    bool lossless_;
    std::vector<float> layerCompressionRatios_;
    size_t progressionOrder_;

    std::vector<Point> downSamples_;
    Point imageOffset_;
    Size tileSize_;
    Point tileOffset_;
    Size blockDimensions_;
    std::vector<Size> precincts_;
};
