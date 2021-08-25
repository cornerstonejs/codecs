// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include <exception>
#include <memory>
#include <limits.h>

#include "openjpeg.h"
#include <string.h>
#include <stdlib.h>
#define EMSCRIPTEN_API __attribute__((used))
#define J2K_MAGIC_NUMBER 0x51FF4FFF

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>

thread_local const emscripten::val Uint8ClampedArray = emscripten::val::global("Uint8ClampedArray");

#endif

#include "BufferStream.hpp"

#include "FrameInfo.hpp"
#include "Point.hpp"
#include "Size.hpp"

/// <summary>
/// JavaScript API for decoding HTJ2K bistreams with OpenJPH
/// </summary>
class J2KDecoder {
  public: 
  /// <summary>
  /// Constructor for decoding a HTJ2K image from JavaScript.
  /// </summary>
  J2KDecoder() :
  decodeLayer_(1)
  {
  }

#ifdef __EMSCRIPTEN__
  /// <summary>
  /// Resizes encoded buffer and returns a TypedArray of the buffer allocated
  /// in WASM memory space that will hold the HTJ2K encoded bitstream.
  /// JavaScript code needs to copy the HTJ2K encoded bistream into the
  /// returned TypedArray.  This copy operation is needed because WASM runs
  /// in a sandbox and cannot access memory managed by JavaScript.
  /// </summary>
  emscripten::val getEncodedBuffer(size_t encodedSize) {
    encoded_.resize(encodedSize);
    return emscripten::val(emscripten::typed_memory_view(encoded_.size(), encoded_.data()));
  }
  
  /// <summary>
  /// Returns a TypedArray of the buffer allocated in WASM memory space that
  /// holds the decoded pixel data
  /// </summary>
  emscripten::val getDecodedBuffer() {
    // Create a JavaScript-friendly result from the memory view
    // instead of relying on the consumer to detach it from WASM memory
    // See https://web.dev/webassembly-memory-debugging/
    emscripten::val js_result = Uint8ClampedArray.new_(emscripten::typed_memory_view(
      decoded_.size(), decoded_.data()
    ));
    
    return js_result;
  }
#else
  /// <summary>
  /// Returns the buffer to store the encoded bytes.  This method is not exported
  /// to JavaScript, it is intended to be called by C++ code
  /// </summary>
  std::vector<uint8_t>& getEncodedBytes() {
      return encoded_;
  }

  /// <summary>
  /// Returns the buffer to store the decoded bytes.  This method is not exported
  /// to JavaScript, it is intended to be called by C++ code
  /// </summary>
  const std::vector<uint8_t>& getDecodedBytes() const {
      return decoded_;
  }
#endif
 
  /// <summary>
  /// Reads the header from an encoded HTJ2K bitstream.  The caller must have
  /// copied the HTJ2K encoded bitstream into the encoded buffer before 
  /// calling this method, see getEncodedBuffer() and getEncodedBytes() above.
  /// </summary>
  void readHeader() {
    /*ojph::codestream codestream;
    ojph::mem_infile mem_file;
    mem_file.open(encoded_.data(), encoded_.size());
    readHeader_(codestream, mem_file);
    */
  }

  /// <summary>
  /// Calculates the resolution for a given decomposition level based on the
  /// current values in FrameInfo (which is populated via readHeader() and
  /// decode()).  level = 0 = full res, level = _numDecompositions = lowest resolution
  /// </summary>
  //#define ojph_div_ceil(a, b) (((a) + (b) - 1) / (b))
  Size calculateSizeAtDecompositionLevel(int decompositionLevel) {
    Size result(frameInfo_.width, frameInfo_.height);
    while(decompositionLevel--) {
      result.width = (((result.width + 2) -1 ) / 2);
      result.height = (((result.height + 2) - 1) / 2);
    }  
    return result;
  }

  static void error_callback(const char *msg, void *client_data) {
      (void)client_data;
      printf("[ERROR] %s", msg);
  }
  static void warning_callback(const char *msg, void *client_data) {
      (void)client_data;
      printf("[WARNING] %s", msg);
  }
  static void info_callback(const char *msg, void *client_data) {
      (void)client_data;
      printf("[INFO] %s", msg);
  }

  /// <summary>
  /// Decodes the encoded HTJ2K bitstream.  The caller must have copied the
  /// HTJ2K encoded bitstream into the encoded buffer before calling this
  /// method, see getEncodedBuffer() and getEncodedBytes() above.
  /// </summary>
  void decode() {
    decode_i(0);
  }

  /// <summary>
  /// Decodes the encoded HTJ2K bitstream to the requested decomposition level.
  /// The caller must have copied the HTJ2K encoded bitstream into the encoded 
  /// buffer before calling this method, see getEncodedBuffer() and
  ///  getEncodedBytes() above.
  /// </summary>
  void decodeSubResolution(size_t decompositionLevel, size_t decodeLayer) {
    decodeLayer_ = decodeLayer;
    decode_i(decompositionLevel);
  }

  /// <summary>
  /// returns the FrameInfo object for the decoded image.
  /// </summary>
  const FrameInfo& getFrameInfo() const {
      return frameInfo_;
  }

  /// <summary>
  /// returns the number of wavelet decompositions.
  /// </summary>
  const size_t getNumDecompositions() const {
      return numDecompositions_;
  }

  /// <summary>
  /// returns true if the image is lossless, false if lossy
  /// </summary>
  const bool getIsReversible() const {
      return isReversible_;
  }

  /// <summary>
  /// returns progression order.
  // -1 = unknown??
  // 0 = LRCP
  // 1 = RLCP
  // 2 = RPCL
  // 3 = PCRL
  // 4 = CPRL
  /// </summary>
  const int getProgressionOrder() const {
      return progressionOrder_;
  }

  /// <summary>
  /// returns the image offset
  /// </summary>
  Point getImageOffset() const {
    return imageOffset_;
  }

  /// <summary>
  /// returns the tile size
  /// </summary>
  Size getTileSize() const {
    return tileSize_;
  }
  
  /// <summary>
  /// returns the tile offset
  /// </summary>
  Point getTileOffset() const {
    return tileOffset_;
  }

  /// <summary>
  /// returns the block dimensions
  /// </summary>
  Size getBlockDimensions() const {
    return blockDimensions_;
  }

  /// <summary>
  /// returns the number of layers 
  /// </summary>
  int32_t getNumLayers() const {
    return numLayers_;
  }

  //  OPJ_CLRSPC_UNKNOWN = -1,    /**< not supported by the library */
  //  OPJ_CLRSPC_UNSPECIFIED = 0, /**< not specified in the codestream */
  //  OPJ_CLRSPC_SRGB = 1,        /**< sRGB */
  //  OPJ_CLRSPC_GRAY = 2,        /**< grayscale */
  //  OPJ_CLRSPC_SYCC = 3,        /**< YUV */
  //  OPJ_CLRSPC_EYCC = 4,        /**< e-YCC */
  //  OPJ_CLRSPC_CMYK = 5         /**< CMYK */
  size_t getColorSpace() const {
    return colorSpace_;
  }

  private:

    void decode_i(size_t decompositionLevel) {
      opj_dparameters_t parameters;
      opj_codec_t* l_codec = NULL;
      opj_image_t* image = NULL;
      opj_stream_t *l_stream = NULL;

      // detect stream type
      // NOTE: DICOM only supports OPJ_CODEC_J2K, but not everyone follows this
      // and some DICOM images will have JP2 encoded bitstreams
      // http://dicom.nema.org/medical/dicom/2017e/output/chtml/part05/sect_A.4.4.html
      if( ((OPJ_INT32*)encoded_.data())[0] == J2K_MAGIC_NUMBER ){
          l_codec = opj_create_decompress(OPJ_CODEC_J2K);
      }else{
          l_codec = opj_create_decompress(OPJ_CODEC_JP2);
      }

      opj_set_info_handler(l_codec, info_callback,00);
      opj_set_warning_handler(l_codec, warning_callback,00);
      opj_set_error_handler(l_codec, error_callback,00);

      opj_set_default_decoder_parameters(&parameters);
      parameters.cp_reduce = decompositionLevel;
      parameters.cp_layer = decodeLayer_;
      //opj_set_decoded_resolution_factor(l_codec, 1);
      // set stream
      opj_buffer_info_t buffer_info;
      buffer_info.buf = encoded_.data();
      buffer_info.cur = encoded_.data();
      buffer_info.len = encoded_.size();
      l_stream = opj_stream_create_buffer_stream(&buffer_info, OPJ_TRUE);

      /* Setup the decoder decoding parameters using user parameters */
      if ( !opj_setup_decoder(l_codec, &parameters) ){
          printf("[ERROR] opj_decompress: failed to setup the decoder\n");
          opj_stream_destroy(l_stream);
          opj_destroy_codec(l_codec);
          return;
      }

      /* Read the main header of the codestream and if necessary the JP2 boxes*/
      if(! opj_read_header(l_stream, l_codec, &image)){
          printf("[ERROR] opj_decompress: failed to read the header\n");
          opj_stream_destroy(l_stream);
          opj_destroy_codec(l_codec);
          opj_image_destroy(image);
          return;
      }
      
      /* decode the image */
      if (!opj_decode(l_codec, l_stream, image)) {
          printf("[ERROR] opj_decompress: failed to decode tile!\n");
          opj_destroy_codec(l_codec);
          opj_stream_destroy(l_stream);
          opj_image_destroy(image);
          return;
      }

      frameInfo_.width = image->x1; 
      frameInfo_.height = image->y1;
      frameInfo_.componentCount = image->numcomps;
      frameInfo_.isSigned = image->comps[0].sgnd;
      frameInfo_.bitsPerSample = image->comps[0].prec;

      colorSpace_ = image->color_space;
      imageOffset_.x = image->x0;
      imageOffset_.y = image->y0;
      //image->comps[0].factor always 0??

      opj_codestream_info_v2_t* cstr_info = opj_get_cstr_info(l_codec);  /* Codestream information structure */
      numLayers_ = cstr_info->m_default_tile_info.numlayers;
      progressionOrder_ = cstr_info->m_default_tile_info.prg;
      isReversible_ = cstr_info->m_default_tile_info.tccp_info->qmfbid == 1;
      blockDimensions_.width = 1 << cstr_info->m_default_tile_info.tccp_info->cblkw;
      blockDimensions_.height = 1 << cstr_info->m_default_tile_info.tccp_info->cblkh;
      tileOffset_.x = cstr_info->tx0;
      tileOffset_.y = cstr_info->ty0;
      tileSize_.width = cstr_info->tdx;
      tileSize_.height = cstr_info->tdy;
      numDecompositions_ = cstr_info->m_default_tile_info.tccp_info->numresolutions - 1;
      
      // calculate the resolution at the requested decomposition level and
      // allocate destination buffer
      Size sizeAtDecompositionLevel = calculateSizeAtDecompositionLevel(decompositionLevel);
      const size_t bytesPerPixel = (frameInfo_.bitsPerSample + 8 - 1) / 8;
      const size_t destinationSize = sizeAtDecompositionLevel.width * sizeAtDecompositionLevel.height * frameInfo_.componentCount * bytesPerPixel;
      decoded_.resize(destinationSize);

      // Convert from int32 to native size
      int comp_num;
      for (int y = 0; y < sizeAtDecompositionLevel.height; y++)
      {
        size_t lineStartPixel = y * sizeAtDecompositionLevel.width;
        size_t lineStart = lineStartPixel * frameInfo_.componentCount * bytesPerPixel;
        if(frameInfo_.componentCount == 1) {
          int* pIn = (int*)&(image->comps[0].data[y * sizeAtDecompositionLevel.width]);
          if(frameInfo_.bitsPerSample <= 8) {
              unsigned char* pOut = (unsigned char*)&decoded_[lineStart];
              for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++) {
                int val = pIn[x];;
                pOut[x] = std::max(0, std::min(val, UCHAR_MAX));
              }
          } else {
            if(frameInfo_.isSigned) {
              short* pOut = (short*)&decoded_[lineStart];
              for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++) {
                int val = pIn[x];;
                pOut[x] = std::max(SHRT_MIN, std::min(val, SHRT_MAX));
              }
            } else {
              unsigned short* pOut = (unsigned short*)&decoded_[lineStart];
              for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++) {
                int val = pIn[x];;
                pOut[x] = std::max(0, std::min(val, USHRT_MAX));
              }
            }
          }
        } else {
            if(frameInfo_.bitsPerSample <= 8) {
              uint8_t* pOut = &decoded_[lineStart];
              for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++) {
                pOut[x*3+0] = image->comps[0].data[lineStartPixel + x];
                pOut[x*3+1] = image->comps[1].data[lineStartPixel + x];
                pOut[x*3+2] = image->comps[2].data[lineStartPixel + x];
              }
            } /*else {
              // This should work but has not been tested yet
              if(frameInfo.isSigned) {
                short* pOut = (short*)&decoded_[lineStart] + c;
                for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++) {
                  int val = line->i32[x];
                  pOut[x * frameInfo.componentCount] = std::max(SHRT_MIN, std::min(val, SHRT_MAX));
                }
              } else {
                unsigned short* pOut = (unsigned short*)&decoded_[lineStart] + c;
                for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++) {
                    int val = line->i32[x];
                    pOut[x * frameInfo.componentCount] = std::max(0, std::min(val, USHRT_MAX));
                }
              }
            }*/
        }
      }

      opj_stream_destroy(l_stream);
      opj_destroy_codec(l_codec);
      opj_image_destroy(image);
    }

    std::vector<uint8_t> encoded_;
    std::vector<uint8_t> decoded_;
    FrameInfo frameInfo_;
    size_t numDecompositions_;
    bool isReversible_;
    int progressionOrder_;
    Point imageOffset_;
    Size tileSize_;
    Point tileOffset_;
    Size blockDimensions_;
    int32_t numLayers_;
    size_t colorSpace_;

    size_t decodeLayer_;
};

