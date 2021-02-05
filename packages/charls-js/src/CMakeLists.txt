
add_executable(charlsjs jslib.cpp)

target_link_libraries(charlsjs PRIVATE charls)

target_compile_features(charlsjs PUBLIC cxx_std_17)

if (CMAKE_BUILD_TYPE STREQUAL Debug)
	SET(linkFlags "-g4")
else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
	SET(linkFlags "-O3")
endif()

set(CMAKE_CXX_FLAGS_RELEASE "-O3")

set_target_properties(
    charlsjs 
    PROPERTIES 
    LINK_FLAGS "\
      --bind \
      -s NO_EXIT_RUNTIME=1 \
      -s DISABLE_EXCEPTION_CATCHING=1 \
      -s MALLOC=emmalloc \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s TOTAL_MEMORY=1073741824 \
      -s ASSERTIONS=0 \
      -s FILESYSTEM=0 \
      -s EXPORTED_FUNCTIONS=[] \
      -s EXTRA_EXPORTED_RUNTIME_METHODS=[ccall] \
   ")
