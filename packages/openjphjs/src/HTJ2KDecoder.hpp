// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include <exception>
#include <memory>
#include <string>
#include <limits.h>

#include <ojph_arch.h>
#include <ojph_file.h>
#include <ojph_mem.h>
#include <ojph_params.h>
#include <ojph_codestream.h>
#include <ojph_message.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

#include "FrameInfo.hpp"
#include "Point.hpp"
#include "Size.hpp"

/// <summary>
/// JavaScript API for decoding HTJ2K bistreams with OpenJPH
/// </summary>
class HTJ2KDecoder
{
public:
  /// <summary>
  /// Constructor for decoding a HTJ2K image from JavaScript.
  /// </summary>
  HTJ2KDecoder()
  : pEncoded_(&encodedInternal_),
    pDecoded_(&decodedInternal_)

  {
    // Use the following for debugging to ensure updated version info
    // Update the XX to check that reload has completed
    OJPH_INFO(0x00010002, "v06 HTJ2K Decoder");
  }

#ifdef __EMSCRIPTEN__
  /// <summary>
  /// Resizes encoded buffer and returns a TypedArray of the buffer allocated
  /// in WASM memory space that will hold the HTJ2K encoded bitstream.
  /// JavaScript code needs to copy the HTJ2K encoded bistream into the
  /// returned TypedArray.  This copy operation is needed because WASM runs
  /// in a sandbox and cannot access memory managed by JavaScript.
  /// </summary>
  emscripten::val getEncodedBuffer(size_t encodedSize)
  {
    pEncoded_->resize(encodedSize);
    return emscripten::val(emscripten::typed_memory_view(pEncoded_->size(), pEncoded_->data()));
  }

  /// <summary>
  /// Returns a TypedArray of the buffer allocated in WASM memory space that
  /// holds the decoded pixel data
  /// </summary>
  emscripten::val getDecodedBuffer()
  {
    return emscripten::val(emscripten::typed_memory_view(pDecoded_->size(), pDecoded_->data()));
  }
#else
  /// <summary>
  /// Returns the buffer to store the encoded bytes.  This method is not exported
  /// to JavaScript, it is intended to be called by C++ code
  /// </summary>
  std::vector<uint8_t> &getEncodedBytes()
  {
    return *pEncoded_;
  }

  /// <summary>
  /// Sets a pointer to a vector containing the encoded bytes.  This can be used to avoid having to copy the encoded.  Set to 0
  /// to reset to the internal buffer
  /// </summary>
  void setEncodedBytes(std::vector<uint8_t>* pEncoded)
  {
    if(pEncoded == 0) {
      pEncoded_ = &encodedInternal_;
    } else {
      pEncoded_ = pEncoded;
    }
  }

  /// <summary>
  /// Returns the buffer to store the decoded bytes.  This method is not exported
  /// to JavaScript, it is intended to be called by C++ code
  /// </summary>
  const std::vector<uint8_t> &getDecodedBytes() const
  {
    return *pDecoded_;
  }

  /// <summary>
  /// Sets a pointer to a vector containing the encoded bytes.  This can be used to avoid having to copy the encoded.  Set to 0
  /// to reset to the internal buffer
  /// </summary>
  void setDecodedBytes(std::vector<uint8_t>* pDecoded)
  {
    if(pDecoded == 0) {
      pDecoded_ = &decodedInternal_;
    } else {
      pDecoded_ = pDecoded;
    }
  }


#endif

  /// <summary>
  /// Reads the header from an encoded HTJ2K bitstream.  The caller must have
  /// copied the HTJ2K encoded bitstream into the encoded buffer before
  /// calling this method, see getEncodedBuffer() and getEncodedBytes() above.
  /// </summary>
  void readHeader()
  {
    beginOperation_();
    try
    {
      ojph::codestream codestream;
      ojph::mem_infile mem_file;
      mem_file.open(pEncoded_->data(), pEncoded_->size());
      readHeader_(codestream, mem_file);
    }
    catch (const std::exception &e)
    {
      // WARN, not INFO: jslib.cpp raises OpenJPH's message threshold to WARN to
      // silence the per-construction banner, so an INFO here would be dropped
      // exactly when something went wrong. Reported rather than rethrown so a
      // truncated stream degrades to a partial result.
      //
      // The console message is a diagnostic, NOT the failure signal: it goes to
      // stdout, which consumers route wherever they like (dicom-codec sends it
      // to a logger that is silent unless setVerbose). Callers must test
      // getIsHeaderValid() / getLastErrorMessage() -- readHeader_ leaves every
      // header-derived field at its default when it throws, so a caller that
      // ignores those reads zeros rather than the previous frame's geometry.
      recordFailure_("readHeader", 0x00010020, e);
    }
  }

  /// <summary>
  /// Calculates the resolution for a given decomposition level based on the
  /// current values in FrameInfo (which is populated via readHeader() and
  /// decode()).  level = 0 = full res, level = _numDecompositions = lowest resolution
  /// </summary>
  Size calculateSizeAtDecompositionLevel(int decompositionLevel)
  {
    Size result(frameInfo_.width, frameInfo_.height);
    while (decompositionLevel > 0)
    {
      result.width = ojph_div_ceil(result.width, 2);
      result.height = ojph_div_ceil(result.height, 2);
      decompositionLevel--;
    }
    return result;
  }

  /// <summary>
  /// Decodes the encoded HTJ2K bitstream.  The caller must have copied the
  /// HTJ2K encoded bitstream into the encoded buffer before calling this
  /// method, see getEncodedBuffer() and getEncodedBytes() above.
  /// </summary>
  void decode()
  {
    beginOperation_();
    try
    {
      ojph::codestream codestream;
      ojph::mem_infile mem_file;
      mem_file.open(pEncoded_->data(), pEncoded_->size());
      readHeader_(codestream, mem_file);
      decode_(codestream, frameInfo_, 0);
    }
    catch (const std::exception &e)
    {
      // What actually reaches here, measured against CT1.j2c truncated to
      // 50/120/200/400/1024/4096/10240 bytes: only the 50-byte case, and it
      // throws out of read_headers, not out of decode_. Truncation *past* the
      // header does not throw at all -- resilient mode treats the missing
      // codestream as zero coefficients and returns a valid, progressively
      // emptier image. So this catch is the marker-parse/corrupt-stream path,
      // NOT "the truncated-stream path" as previously commented here.
      //
      // getIsHeaderValid() is what separates the two outcomes:
      //   header valid + message  -> correctly sized image, undecoded rows zero
      //   header invalid          -> nothing usable; frameInfo_ is zeroed, and
      //                              on a reused decoder the decoded buffer
      //                              still holds the PREVIOUS frame in full,
      //                              because decode_ never ran to overwrite it
      // Reported rather than rethrown so streaming consumers keep the partial
      // image; a caller that cannot use a partial image must check the status.
      recordFailure_("decode", 0x00010021, e);
    }
  }

  /// <summary>
  /// Decodes the encoded HTJ2K bitstream to the requested decomposition level.
  /// The caller must have copied the HTJ2K encoded bitstream into the encoded
  /// buffer before calling this method, see getEncodedBuffer() and
  ///  getEncodedBytes() above.
  /// </summary>
  void decodeSubResolution(size_t decompositionLevel)
  {
    beginOperation_();
    try
    {
      ojph::codestream codestream;
      ojph::mem_infile mem_file;
      mem_file.open(pEncoded_->data(), pEncoded_->size());
      readHeader_(codestream, mem_file);
      decode_(codestream, frameInfo_, decompositionLevel);
    }
    catch (const std::exception &e)
    {
      recordFailure_("decodeSubResolution", 0x00010022, e);
    }
  }

  /// <summary>
  /// Returns true if the last readHeader()/decode()/decodeSubResolution() call
  /// parsed a complete codestream header.  When false, nothing that describes
  /// the image -- getFrameInfo(), getNumDecompositions(), getPrecinct(),
  /// calculateSizeAtDecompositionLevel() -- carries usable values, and any
  /// decoded buffer should be discarded.
  /// </summary>
  bool getIsHeaderValid() const
  {
    return isHeaderValid_;
  }

  /// <summary>
  /// Empty when the last readHeader()/decode()/decodeSubResolution() call
  /// completed.  Otherwise the message from the exception it swallowed.
  /// Combine with getIsHeaderValid() to tell a partial decode (header valid,
  /// image correctly sized, undecoded rows zero-filled) from a total failure
  /// (header invalid, no usable image).
  /// </summary>
  std::string getLastErrorMessage() const
  {
    return lastErrorMessage_;
  }

  /// <summary>
  /// returns the FrameInfo object for the decoded image.
  /// </summary>
  const FrameInfo &getFrameInfo() const
  {
    return frameInfo_;
  }

  /// <summary>
  /// returns the number of wavelet decompositions.
  /// </summary>
  const size_t getNumDecompositions() const
  {
    return numDecompositions_;
  }

  /// <summary>
  /// returns true if the image is lossless, false if lossy
  /// </summary>
  const bool getIsReversible() const
  {
    return isReversible_;
  }

  /// <summary>
  /// returns progression order.
  // 0 = LRCP
  // 1 = RLCP
  // 2 = RPCL
  // 3 = PCRL
  // 4 = CPRL
  /// </summary>
  const size_t getProgressionOrder() const
  {
    return progressionOrder_;
  }

  /// <summary>
  /// returns the down sampling used for component.
  /// </summary>
  Point getDownSample(size_t component) const
  {
    return downSamples_[component];
  }

  /// <summary>
  /// returns the image offset
  /// </summary>
  Point getImageOffset() const
  {
    return imageOffset_;
  }

  /// <summary>
  /// returns the tile size
  /// </summary>
  Size getTileSize() const
  {
    return tileSize_;
  }

  /// <summary>
  /// returns the tile offset
  /// </summary>
  Point getTileOffset() const
  {
    return tileOffset_;
  }

  /// <summary>
  /// returns the block dimensions
  /// </summary>
  Size getBlockDimensions() const
  {
    return blockDimensions_;
  }

  /// <summary>
  /// returns the precinct for the specified resolution decomposition level
  /// </summary>
  Size getPrecinct(size_t level) const
  {
    return precincts_[level];
  }

  /// <summary>
  /// returns the number of layers
  /// </summary>
  int32_t getNumLayers() const
  {
    return numLayers_;
  }

private:
  /// Clears the per-call status.  Every public entry point starts here so that
  /// getIsHeaderValid()/getLastErrorMessage() describe the CURRENT call and
  /// never a stale success from a previous one -- which matters most on a
  /// decoder that is reused across a series.
  void beginOperation_()
  {
    isHeaderValid_ = false;
    lastErrorMessage_.clear();
  }

  void recordFailure_(const char *operation, int code, const std::exception &e)
  {
    lastErrorMessage_ = e.what();
    if (lastErrorMessage_.empty())
    {
      // getLastErrorMessage() must be non-empty whenever an operation failed;
      // callers test it for emptiness. what() is not guaranteed to say anything.
      lastErrorMessage_ = "unknown error";
    }
    OJPH_WARN(code, "%s failed: %s", operation, lastErrorMessage_.c_str());
  }

  void readHeader_(ojph::codestream &codestream, ojph::mem_infile &mem_file)
  {
    // Reset everything the header populates BEFORE parsing. Without this a
    // failed parse leaves a mix of this stream's fields and the previous
    // stream's -- and on a fresh decoder it left numDecompositions_ and the
    // Point/Size members holding whatever was on the heap, which
    // calculateSizeAtDecompositionLevel() and decodeSubResolution() then did
    // arithmetic on. Defaults are honest: a caller that ignores
    // getIsHeaderValid() sees a 0x0 image rather than a plausible wrong one.
    frameInfo_ = FrameInfo();
    downSamples_.clear();
    numDecompositions_ = 0;
    isReversible_ = false;
    progressionOrder_ = 0;
    imageOffset_ = Point();
    tileSize_ = Size();
    tileOffset_ = Point();
    blockDimensions_ = Size();
    precincts_.clear();
    numLayers_ = 0;

    // NOTE - enabling resilience does not seem to have any effect at this point...
    codestream.enable_resilience();
    codestream.read_headers(&mem_file);
    ojph::param_siz siz = codestream.access_siz();
    frameInfo_.width = siz.get_image_extent().x - siz.get_image_offset().x;
    frameInfo_.height = siz.get_image_extent().y - siz.get_image_offset().y;
    frameInfo_.componentCount = siz.get_num_components();
    frameInfo_.bitsPerSample = siz.get_bit_depth(0);
    frameInfo_.isSigned = siz.is_signed(0);
    downSamples_.resize(frameInfo_.componentCount);
    for (size_t i = 0; i < frameInfo_.componentCount; i++)
    {
      downSamples_[i].x = siz.get_downsampling(i).x;
      downSamples_[i].y = siz.get_downsampling(i).y;
    }

    imageOffset_.x = siz.get_image_offset().x;
    imageOffset_.y = siz.get_image_offset().y;
    tileSize_.width = siz.get_tile_size().w;
    tileSize_.height = siz.get_tile_size().h;

    tileOffset_.x = siz.get_tile_offset().x;
    tileOffset_.y = siz.get_tile_offset().y;

    ojph::param_cod cod = codestream.access_cod();
    numDecompositions_ = cod.get_num_decompositions();
    isReversible_ = cod.is_reversible();
    progressionOrder_ = cod.get_progression_order();
    blockDimensions_.width = cod.get_block_dims().w;
    blockDimensions_.height = cod.get_block_dims().h;
    precincts_.resize(numDecompositions_);
    for (size_t i = 0; i < numDecompositions_; i++)
    {
      precincts_[i].width = cod.get_precinct_size(i).w;
      precincts_[i].height = cod.get_precinct_size(i).h;
    }
    numLayers_ = cod.get_num_layers();
    frameInfo_.isUsingColorTransform = cod.is_using_color_transform();

    // Last statement in the function on purpose: everything above must have
    // succeeded for the header-derived state to be trustworthy.
    isHeaderValid_ = true;
  }

  void decode_(ojph::codestream &codestream, const FrameInfo &frameInfo, size_t decompositionLevel)
  {

    // calculate the resolution at the requested decomposition level and
    // allocate destination buffer
    Size sizeAtDecompositionLevel = calculateSizeAtDecompositionLevel(decompositionLevel);
    int resolutionLevel = numDecompositions_ - decompositionLevel;
    const size_t bytesPerPixel = (frameInfo_.bitsPerSample + 8 - 1) / 8;
    const size_t destinationSize = sizeAtDecompositionLevel.width * sizeAtDecompositionLevel.height * frameInfo.componentCount * bytesPerPixel;

    // assign(), not resize(). resize() only value-initialises NEW elements, so
    // whenever the buffer is already at least this large -- every decode after
    // the first on a reused decoder -- anything the decoder does not write keeps
    // the PREVIOUS frame's pixels. The reachable case is an abort between here
    // and the pixel loop: restrict_input_resolution() below throws for a
    // decomposition level the codestream does not carry, which left the caller
    // holding the previous slice under this frame's dimensions (measured: 125
    // of 128 bytes). assign() zero-fills without giving up the capacity that
    // makes reuse worth having.
    pDecoded_->assign(destinationSize, 0);

    // set the level to read to and reconstruction level to the specified decompositionLevel
    codestream.restrict_input_resolution(decompositionLevel, decompositionLevel);

    // parse it
    if (frameInfo.componentCount == 1)
    {
      codestream.set_planar(true);
    }
    else
    {
      if (frameInfo_.isUsingColorTransform)
      {
        codestream.set_planar(false);
      }
      else
      {
        // for color images without a color transform,
        // calling set_planar(true) invokes an optimization
        // https://github.com/aous72/OpenJPH/issues/34
        codestream.set_planar(true);
      }
    }
    codestream.create();

    // Extract the data line by line...
    // NOTE: All values must be clamped https://github.com/aous72/OpenJPH/issues/35
    ojph::ui32 comp_num;
    for (int y = 0; y < sizeAtDecompositionLevel.height; y++)
    {
      size_t lineStart = y * sizeAtDecompositionLevel.width * frameInfo.componentCount * bytesPerPixel;
      if (frameInfo.componentCount == 1)
      {
        ojph::line_buf *line = codestream.pull(comp_num);
        if (frameInfo.bitsPerSample <= 8)
        {
          unsigned char *pOut = (unsigned char *)&(*pDecoded_)[lineStart];
          for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++)
          {
            int val = line->i32[x];
            pOut[x] = std::max(0, std::min(val, UCHAR_MAX));
          }
        }
        else
        {
          if (frameInfo.isSigned)
          {
            short *pOut = (short *)&(*pDecoded_)[lineStart];
            for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++)
            {
              int val = line->i32[x];
              pOut[x] = std::max(SHRT_MIN, std::min(val, SHRT_MAX));
            }
          }
          else
          {
            unsigned short *pOut = (unsigned short *)&(*pDecoded_)[lineStart];
            for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++)
            {
              int val = line->i32[x];
              pOut[x] = std::max(0, std::min(val, USHRT_MAX));
            }
          }
        }
      }
      else
      {
        for (int c = 0; c < frameInfo.componentCount; c++)
        {
          ojph::line_buf *line = codestream.pull(comp_num);
          if (frameInfo.bitsPerSample <= 8)
          {
            uint8_t *pOut = &(*pDecoded_)[lineStart] + c;
            for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++)
            {
              int val = line->i32[x];
              pOut[x * frameInfo.componentCount] = std::max(0, std::min(val, UCHAR_MAX));
            }
          }
          else
          {
            // This should work but has not been tested yet
            if (frameInfo.isSigned)
            {
              short *pOut = (short *)&(*pDecoded_)[lineStart] + c;
              for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++)
              {
                int val = line->i32[x];
                pOut[x * frameInfo.componentCount] = std::max(SHRT_MIN, std::min(val, SHRT_MAX));
              }
            }
            else
            {
              unsigned short *pOut = (unsigned short *)&(*pDecoded_)[lineStart] + c;
              for (size_t x = 0; x < sizeAtDecompositionLevel.width; x++)
              {
                int val = line->i32[x];
                pOut[x * frameInfo.componentCount] = std::max(0, std::min(val, USHRT_MAX));
              }
            }
          }
        }
      }
    }
  }

  std::vector<uint8_t>* pEncoded_;
  std::vector<uint8_t>* pDecoded_;
  std::vector<uint8_t> encodedInternal_; 
  std::vector<uint8_t> decodedInternal_;
  FrameInfo frameInfo_;
  std::vector<Point> downSamples_;
  size_t numDecompositions_ {0};
  bool isReversible_ {false};
  size_t progressionOrder_ {0};
  Point imageOffset_;
  Size tileSize_;
  Point tileOffset_;
  Size blockDimensions_;
  std::vector<Size> precincts_;
  int32_t numLayers_ {0};
  bool isHeaderValid_ {false};
  std::string lastErrorMessage_;
};
