#!/data/data/com.termux/files/usr/bin/bash
set -e

PROJECT_ROOT="$HOME/XenonAI"
APP_DIR="$PROJECT_ROOT/android/app/src/main"
BUILD_DIR="$PROJECT_ROOT/build_apk"
ANDROID_JAR="$HOME/android-sdk/android.jar"

echo "=== 1. Cleaning build directory ==="
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/gen" "$BUILD_DIR/compiled_res" "$BUILD_DIR/classes" "$BUILD_DIR/apk"

echo "=== 2. Compiling resources with aapt2 ==="
aapt2 compile --dir "$APP_DIR/res" -o "$BUILD_DIR/compiled_res.zip"

echo "=== 3. Linking resources and generating R.java ==="
aapt2 link "$BUILD_DIR/compiled_res.zip" \
    -I "$ANDROID_JAR" \
    --min-sdk-version 24 \
    --target-sdk-version 34 \
    --manifest "$APP_DIR/AndroidManifest.xml" \
    --java "$BUILD_DIR/gen" \
    -o "$BUILD_DIR/unaligned.apk" \
    -A "$APP_DIR/assets"

echo "=== 4. Compiling Java sources ==="
find "$APP_DIR/java" "$BUILD_DIR/gen" -name "*.java" > "$BUILD_DIR/sources.txt"

javac -d "$BUILD_DIR/classes" \
    --release 8 \
    -cp "$ANDROID_JAR" \
    @"${BUILD_DIR}/sources.txt"

echo "=== 5. Dexing bytecode with dx ==="
dx --dex --min-sdk-version=26 --output="$BUILD_DIR/classes.dex" "$BUILD_DIR/classes"

echo "=== 6. Adding classes.dex to APK ==="
cd "$BUILD_DIR"
zip -uj unaligned.apk classes.dex

echo "=== 7. Packaging native ARM64 libraries ==="
mkdir -p "$BUILD_DIR/lib/arm64-v8a"

# Essential C++ runtime required by llama.cpp
cp "$PREFIX/lib/libc++_shared.so" "$BUILD_DIR/lib/arm64-v8a/" 2>/dev/null || true

# llama and ggml shared libraries
cp "$PREFIX/lib/libllama.so" "$BUILD_DIR/lib/arm64-v8a/" 2>/dev/null || true
cp "$PREFIX/lib/libggml"*.so "$BUILD_DIR/lib/arm64-v8a/" 2>/dev/null || true

# XenonAI native engine and JNI bridge
cp "$PROJECT_ROOT/build/libxenonai.so" "$BUILD_DIR/lib/arm64-v8a/" 2>/dev/null || true
cp "$PROJECT_ROOT/build/libxenonai_jni.so" "$BUILD_DIR/lib/arm64-v8a/" 2>/dev/null || true

zip -ur unaligned.apk lib/

echo "=== 8. Signing the APK with debug key ==="
if [ ! -f "$HOME/debug.keystore" ]; then
    keytool -genkey -v -keystore "$HOME/debug.keystore" \
        -storepass android -alias androiddebugkey -keypass android \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Android Debug,O=Android,C=US"
fi

apksigner sign --ks "$HOME/debug.keystore" \
    --ks-pass pass:android \
    --out "$PROJECT_ROOT/XenonAI-debug.apk" \
    unaligned.apk

echo "=========================================="
echo " SUCCESS! APK generated at:"
echo " $PROJECT_ROOT/XenonAI-debug.apk"
echo "=========================================="
