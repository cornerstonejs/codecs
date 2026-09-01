cmake_minimum_required(VERSION 3.16)

project (libjpeg-turbojs
  LANGUAGES CXX)

# set the build type if not specified
set(default_build_type "Release")
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  message(STATUS "Setting build type to '${default_build_type}' as none was specified.")
  set(CMAKE_BUILD_TYPE "${default_build_type}")
endif()

# automatically handle git submodules
find_package(Git QUIET)
if(GIT_FOUND AND EXISTS "${PROJECT_SOURCE_DIR}/.git")
# Update submodules as needed
    option(GIT_SUBMODULE "Check submodules during build" ON)
    if(GIT_SUBMODULE)
        message(STATUS "Submodule update")
        #execute_process(COMMAND ${GIT_EXECUTABLE} submodule update --init --recursive
        execute_process(COMMAND ${GIT_EXECUTABLE} submodule update --init --recursive --remote
                        WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
                        RESULT_VARIABLE GIT_SUBMOD_RESULT)
        if(NOT GIT_SUBMOD_RESULT EQUAL "0")
            message(FATAL_ERROR "git submodule update --init failed with ${GIT_SUBMOD_RESULT}, please checkout submodules")
        endif()
    endif()
endif()

if(NOT EXISTS "${PROJECT_SOURCE_DIR}/extern/libjpeg-turbo/CMakeLists.txt")
    message(FATAL_ERROR "The submodules were not downloaded! GIT_SUBMODULE was turned off or failed. Please update submodules and try again.")
endif()

# NOTE: libjpeg-turbo 3.x refuses add_subdirectory() integration (it asserts it
# is the top-level project and errors out). It is now built as a separate
# project by build.sh, which passes its build dir in LIBJPEG_TURBO_BUILD_DIR;
# src/CMakeLists.txt links the produced libturbojpeg.a as an IMPORTED target.
if(EMSCRIPTEN AND NOT DEFINED LIBJPEG_TURBO_BUILD_DIR)
  message(FATAL_ERROR "LIBJPEG_TURBO_BUILD_DIR not set — run build.sh, which builds libjpeg-turbo first and passes its build dir.")
endif()

# add the js wrapper
if(EMSCRIPTEN)
  # Generate Embind adapters at build time so consumers do not need CSP unsafe-eval.
  add_link_options(
    "-sDYNAMIC_EXECUTION=0"
    "-sEMBIND_AOT=1"
  )
  add_subdirectory(src)
endif()

# c++ native test case
if(NOT EMSCRIPTEN)
  add_subdirectory(test/cpp)
endif()