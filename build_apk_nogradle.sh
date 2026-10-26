#!/data/data/com.termux/files/usr/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
APP_DIR="$PROJECT_ROOT/android/app"
SRC_MAIN="$APP_DIR/src/main"
JNILIBS_DIR="$SRC_MAIN/jniLibs/arm64-v8a"
JNI_SRC_DIR="$SRC_MAIN/jni"
ANDROID_JAR="$HOME/android-sdk/android.jar"

export PATH="$PREFIX/bin:$PATH"

echo "=== 1. Cleaning build directory ==="
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/gen" "$BUILD_DIR/obj" "$BUILD_DIR/apk_root/lib/arm64-v8a" "$JNILIBS_DIR"

echo "=== 2. Compiling native JNI bridge (libxenonai_jni.so) ==="
clang -shared -fPIC \
    -O3 \
    -I "$JNI_SRC_DIR/llama_include" \
    -I "$PROJECT_ROOT/include" \
    -I "$PROJECT_ROOT/src" \
    -L "$JNILIBS_DIR" \
    -lllama -lggml -lggml-base -llog \
    "$JNI_SRC_DIR/jni_bridge.c" \
    "$JNI_SRC_DIR/xenonai.c" \
    -o "$JNILIBS_DIR/libxenonai_jni.so"

echo "=== 3. Compiling resources with aapt2 ==="
mkdir -p "$BUILD_DIR/res_compiled"
aapt2 compile --dir "$SRC_MAIN/res" -o "$BUILD_DIR/res_compiled/res.zip"

echo "=== 4. Linking resources and generating R.java ==="
aapt2 link -I "$ANDROID_JAR" \
    --manifest "$SRC_MAIN/AndroidManifest.xml" \
    --java "$BUILD_DIR/gen" \
    -A "$SRC_MAIN/assets" \
    -o "$BUILD_DIR/XenonAI-unaligned.apk" \
    "$BUILD_DIR/res_compiled/res.zip"

echo "=== 5. Compiling Java sources ==="
JAVA_FILES=$(find "$SRC_MAIN/java" "$BUILD_DIR/gen" -name "*.java")
javac -source 1.8 -target 1.8 \
    -bootclasspath "$ANDROID_JAR" \
    -cp "$ANDROID_JAR" \
    -d "$BUILD_DIR/obj" \
    $JAVA_FILES

echo "=== 6. Dexing bytecode ==="
if command -v d8 >/dev/null 2>&1; then
    d8 --lib "$ANDROID_JAR" --output "$BUILD_DIR" $(find "$BUILD_DIR/obj" -name "*.class")
else
    dx --dex --output="$BUILD_DIR/classes.dex" "$BUILD_DIR/obj"
fi

echo "=== 7. Adding classes.dex and assets to APK ==="
cd "$BUILD_DIR"
aapt add -v "XenonAI-unaligned.apk" classes.dex
cd "$PROJECT_ROOT"

echo "=== 8. Packaging all native ARM64 libraries ==="
cd "$BUILD_DIR/apk_root"
cp -f "$JNILIBS_DIR"/*.so lib/arm64-v8a/
zip -u -r -0 "$BUILD_DIR/XenonAI-unaligned.apk" lib/
cd "$PROJECT_ROOT"

echo "=== 9. Signing the APK with debug key ==="
if [ ! -f "$PROJECT_ROOT/debug.keystore" ]; then
    keytool -genkeypair -v -keystore "$PROJECT_ROOT/debug.keystore" \
        -alias androiddebugkey -keypass android -storepass android \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi

apksigner sign --ks "$PROJECT_ROOT/debug.keystore" \
    --ks-key-alias androiddebugkey \
    --ks-pass pass:android \
    --key-pass pass:android \
    --out "$PROJECT_ROOT/XenonAI-debug.apk" \
    "$BUILD_DIR/XenonAI-unaligned.apk"

echo "=========================================="
echo " SUCCESS! APK generated at:"
echo " $PROJECT_ROOT/XenonAI-debug.apk"
echo "=========================================="
