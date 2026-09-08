#ifndef CORNERSTONE_CODEC_LIBJXL_RAW_BUFFER_H_
#define CORNERSTONE_CODEC_LIBJXL_RAW_BUFFER_H_

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <new>

namespace cornerstone_jxl {

class RawBuffer {
 public:
  RawBuffer() = default;
  ~RawBuffer() { release(); }

  RawBuffer(const RawBuffer&) = delete;
  RawBuffer& operator=(const RawBuffer&) = delete;

  // Makes the buffer `size` bytes long. The contents are undefined - every
  // caller here fills the whole range before reading it back.
  void resize(size_t size) {
    if (size > capacity_) {
      // Not realloc: the old bytes are never worth copying.
      uint8_t* fresh = static_cast<uint8_t*>(std::malloc(size));
      if (!fresh) {
        throw std::bad_alloc();
      }
      std::free(data_);
      data_ = fresh;
      capacity_ = size;
    }
    size_ = size;
  }

  // Grows to at least `size` bytes, preserving the first `size_` bytes. Used by
  // the encoder, which discovers the output size as it writes.
  void grow(size_t size) {
    if (size > capacity_) {
      uint8_t* fresh = static_cast<uint8_t*>(std::realloc(data_, size));
      if (!fresh) {
        throw std::bad_alloc();
      }
      data_ = fresh;
      capacity_ = size;
    }
    size_ = size;
  }

  void release() {
    std::free(data_);
    data_ = nullptr;
    size_ = 0;
    capacity_ = 0;
  }

  uint8_t* data() { return data_; }
  const uint8_t* data() const { return data_; }
  size_t size() const { return size_; }

 private:
  uint8_t* data_ = nullptr;
  size_t size_ = 0;
  size_t capacity_ = 0;
};

}  // namespace cornerstone_jxl

#endif  // CORNERSTONE_CODEC_LIBJXL_RAW_BUFFER_H_
