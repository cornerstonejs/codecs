#include "../../extern/charls/include/charls/charls.h"
#include <fstream>
#include <iostream>
#include <vector>
#include <iterator>
#include <time.h> 

void readFile(std::string fileName, std::vector<unsigned char>& vec) {
    // open the file:
    std::ifstream file(fileName, std::ios::binary);

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
                std::istream_iterator<unsigned char>(file),
                std::istream_iterator<unsigned char>());
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

using namespace charls;

void decode(const char* path, size_t iterations = 1) {
    std::vector<unsigned char> source;
    readFile(path, source);
    std::vector<unsigned char> destination;
    timespec start, finish, delta;
    clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &start);
    for(int i=0; i < iterations; i++) {
        jpegls_decoder::decode(source, destination);
    }
    clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &finish);
    sub_timespec(start, finish, &delta);
    const double ms = (double)(delta.tv_nsec / iterations) / 1000000.0;
    printf("Decode of %s took %f ms\n", path, ms);
}

int main(int argc, char** argv) {
    decode("test/fixtures/CT1.JLS");
    decode("test/fixtures/CT2.JLS");
    //decode("test/fixtures/MG1.JLS");
    decode("extern/charls/test/lena8b.jls");

    return 0;
}
