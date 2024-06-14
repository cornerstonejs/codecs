// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#include "../../src/JpegXLDecoder.hpp"
#include "../../src/JpegXLEncoder.hpp"


#include <fstream>
#include <iostream>
#include <vector>
#include <iterator>
#include <time.h> 
#include <algorithm>


void readFile(std::string fileName, std::vector<uint8_t>& vec) {
    // open the file:
    std::ifstream file(fileName, std::ios::in | std::ios::binary);
    // Stop eating new lines in binary mode!!!
    file.unsetf(std::ios::skipws);

    // get its size:
    std::streampos fileSize;
    file.seekg(0, std::ios::end);
    fileSize = file.tellg();
    file.seekg(0, std::ios::beg);

    // reserve capacity
    vec.reserve(fileSize);

    // read the data:
    vec.insert(vec.begin(),
                std::istream_iterator<uint8_t>(file),
                std::istream_iterator<uint8_t>());

    //std::istreambuf_iterator iter(file);
    //std::copy(iter.begin(), iter.end(), std::back_inserter(vec));
}

void writeFile(std::string fileName, const std::vector<uint8_t>& vec) {
    std::ofstream file(fileName, std::ios::out | std::ofstream::binary);
    std::copy(vec.begin(), vec.end(), std::ostreambuf_iterator<char>(file));
}

enum { NS_PER_SECOND = 1000000000 };

void sub_timespec(struct timespec t1, struct timespec t2, struct timespec *td)
{
    td->tv_nsec = t2.tv_nsec - t1.tv_nsec;
    td->tv_sec  = t2.tv_sec - t1.tv_sec;
    if (td->tv_sec > 0 && td->tv_nsec < 0)
    {
        td->tv_nsec += NS_PER_SECOND;
        td->tv_sec--;
    }
    else if (td->tv_sec < 0 && td->tv_nsec > 0)
    {
        td->tv_nsec -= NS_PER_SECOND;
        td->tv_sec++;
    }
}
void decodeFile(const char* inPath, size_t iterations = 1) {
    //std::string inPath = "test/fixtures/jxl-progressive/";
    //inPath += imageName;
    
    JpegXLDecoder decoder;
    std::vector<uint8_t>& encodedBytes = decoder.getEncodedBytes();
    readFile(inPath, encodedBytes);

    timespec start, finish, delta;
    clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &start);
    for(int i=0; i < iterations; i++) {
        const size_t result = decoder.decode();
        if(result !=0) {
            printf("ERROR - decode() returned = %ld (length=%ld)\n", result, encodedBytes.size());
        }
    }

    clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &finish);
    sub_timespec(start, finish, &delta);
    auto frameInfo = decoder.getFrameInfo();

    auto ns = delta.tv_sec * 1000000000.0 + delta.tv_nsec;
    auto totalTimeMS = ns / 1000000.0;
    auto timePerFrameMS = ns / 1000000.0 / (double)iterations;
    auto pixels = (frameInfo.width * frameInfo.height);
    auto megaPixels = (double)pixels / (1024.0 * 1024.0);
    auto fps = 1000 / timePerFrameMS;
    auto mps = (double)(megaPixels) * fps;

    printf("Native-decode %s Pixels=%d megaPixels=%f TotalTime= %.2f ms TPF=%.2f ms (%.2f MP/s, %.2f FPS)\n", inPath, pixels, megaPixels, totalTimeMS, timePerFrameMS, mps, fps);
}


void encodeFile(const char* imageName, const FrameInfo frameInfo, size_t iterations = 1) {
    std::string inPath = "test/fixtures/raw/";
    inPath += imageName;
    inPath += ".RAW";

    JpegXLEncoder encoder;
    std::vector<uint8_t>& rawBytes = encoder.getDecodedBytes(frameInfo);
    readFile(inPath, rawBytes);

    timespec start, finish, delta;
    clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &start);

    for(int i=0; i < iterations; i++) {
        const size_t result = encoder.encode();
        if(result !=0) {
            printf("ERROR - encode() returned = %ld (length=%ld)\n", result, rawBytes.size());
        }
    }

    clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &finish);
    sub_timespec(start, finish, &delta);

    auto ns = delta.tv_sec * 1000000000.0 + delta.tv_nsec;
    auto totalTimeMS = ns / 1000000.0;
    auto timePerFrameMS = ns / 1000000.0 / (double)iterations;
    auto pixels = (frameInfo.width * frameInfo.height);
    auto megaPixels = (double)pixels / (1024.0 * 1024.0);
    auto fps = 1000 / timePerFrameMS;
    auto mps = (double)(megaPixels) * fps;

    printf("Native-encode %s Pixels=%d megaPixels=%f TotalTime= %.2f ms TPF=%.2f ms (%.2f MP/s, %.2f FPS)\n", imageName, pixels, megaPixels, totalTimeMS, timePerFrameMS, mps, fps);
}

int main(int argc, char** argv) {
  const size_t iterations = (argc > 1) ? atoi(argv[1]) : 10;
  JpegXLEncoder encoder;

  encodeFile("CT1", {.width = 512, .height = 512, .bitsPerSample = 16, .componentCount = 1}, iterations);
  /*encodeFile("CT2", {.width = 512, .height = 512, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("MG1", {.width = 3064, .height = 4664, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("MR1", {.width = 512, .height = 512, .bitsPerSample =  16, .componentCount = 1}, iterations);
  encodeFile("MR2", {.width = 1024, .height = 1024, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("MR3", {.width = 512, .height = 512, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("MR4", {.width = 512, .height = 512, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("NM1", {.width = 256, .height = 1024, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("RG1", {.width = 1841, .height = 1955, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("RG2", {.width = 1760, .height = 2140, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("RG3", {.width = 1760, .height = 1760, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("SC1", {.width = 2048, .height = 2487, .bitsPerSample = 16, .componentCount = 1}, iterations);
  encodeFile("US1", {.width = 640, .height = 480, .bitsPerSample = 8, .componentCount = 3}, iterations);
  encodeFile("VL1", {.width = 756, .height = 486, .bitsPerSample = 8, .componentCount = 3}, iterations);
  encodeFile("VL2", {.width = 756, .height = 486, .bitsPerSample = 8, .componentCount = 3}, iterations);
  encodeFile("VL3", {.width = 756, .height = 486, .bitsPerSample = 8, .componentCount = 3}, iterations);
  encodeFile("VL4", {.width = 2226, .height = 1868, .bitsPerSample = 8, .componentCount = 3}, iterations);
  encodeFile("VL5", {.width = 2670, .height = 3340, .bitsPerSample = 8, .componentCount = 3}, iterations);
  encodeFile("VL6", {.width = 756, .height = 486, .bitsPerSample = 8, .componentCount = 3}, iterations);
  encodeFile("XA1", {.width = 1024, .height = 1024, .bitsPerSample = 16, .componentCount = 1}, iterations);
*/
  decodeFile("test/fixtures/jxl-progressive/CT1.j2k.png.jxl", iterations);
  //decodeFile("CT2", iterations);
  decodeFile("test/fixtures/jxl-progressive/MG1.j2k.png.jxl", iterations);


  decodeFile("test/fixtures/jxl/CT1.jxl", iterations);
  decodeFile("test/fixtures/jxl/MG1.jxl", iterations);

  /*decodeFile("MR1", iterations);
  decodeFile("MR2", iterations);
  decodeFile("MR3", iterations);
  decodeFile("MR4", iterations);
  decodeFile("NM1", iterations);
  decodeFile("RG1", iterations);
  decodeFile("RG2", iterations);
  decodeFile("RG3", iterations);
  decodeFile("SC1", iterations);
  decodeFile("US1", iterations);
  decodeFile("VL1", iterations);
  decodeFile("VL2", iterations);
  decodeFile("VL3", iterations);
  decodeFile("VL4", iterations);
  decodeFile("VL5", iterations);
  decodeFile("VL6", iterations);
  decodeFile("XA1", iterations);*/

  return 0;
}