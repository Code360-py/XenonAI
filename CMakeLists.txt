cmake_minimum_required(VERSION 3.16)

project(XenonAI
    VERSION 1.0.0
    DESCRIPTION "High-performance C inference engine over llama.cpp"
    LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
set(CMAKE_BUILD_WITH_INSTALL_RPATH TRUE)
set(CMAKE_INSTALL_RPATH "$ORIGIN")

find_library(LLAMA_LIB NAMES llama PATHS $ENV{PREFIX}/lib REQUIRED)
find_path(LLAMA_INCLUDE_DIR NAMES llama.h PATHS $ENV{PREFIX}/include REQUIRED)
find_path(GGML_INCLUDE_DIR NAMES ggml.h PATHS $ENV{PREFIX}/include REQUIRED)

# ---- shared library ----
add_library(xenonai SHARED src/xenonai.c)
target_include_directories(xenonai
    PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
    PRIVATE ${LLAMA_INCLUDE_DIR} ${GGML_INCLUDE_DIR})
target_link_libraries(xenonai PRIVATE ${LLAMA_LIB} m log)
set_target_properties(xenonai PROPERTIES
    VERSION   ${PROJECT_VERSION}
    SOVERSION ${PROJECT_VERSION_MAJOR}
    C_VISIBILITY_PRESET hidden)

# ---- CLI ----
add_executable(xenonai-cli src/xenonai_cli.c)
target_link_libraries(xenonai-cli PRIVATE xenonai)
set_target_properties(xenonai-cli PROPERTIES
    BUILD_RPATH "$ORIGIN" INSTALL_RPATH "$ORIGIN")

# ---- demo ----
add_executable(demo examples/demo.c)
target_link_libraries(demo PRIVATE xenonai)
set_target_properties(demo PROPERTIES
    BUILD_RPATH "$ORIGIN" INSTALL_RPATH "$ORIGIN")

# ---- tests ----
enable_testing()
add_executable(smoke tests/smoke.c)
target_link_libraries(smoke PRIVATE xenonai)
set_target_properties(smoke PROPERTIES
    BUILD_RPATH "$ORIGIN" INSTALL_RPATH "$ORIGIN")
add_test(NAME smoke COMMAND smoke)

# ---- install ----
include(GNUInstallDirs)
install(TARGETS xenonai LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR})
install(FILES include/xenonai.h DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
