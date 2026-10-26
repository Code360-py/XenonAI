cmake_minimum_required(VERSION 3.18)
project(xenonai_jni C)

set(LLAMA_LIB_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}")

add_library(xenonai_jni SHARED
    jni_bridge.c
    xenonai.c)

target_compile_definitions(xenonai_jni PRIVATE XENONAI_NO_LOG_SET)

target_include_directories(xenonai_jni PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/llama_include)

target_link_libraries(xenonai_jni
    ${LLAMA_LIB_DIR}/libllama.so
    ${LLAMA_LIB_DIR}/libggml.so
    ${LLAMA_LIB_DIR}/libggml-cpu.so
    ${LLAMA_LIB_DIR}/libggml-base.so
    log
    m)

set_target_properties(xenonai_jni PROPERTIES
    C_STANDARD 11
    C_VISIBILITY_PRESET hidden)
