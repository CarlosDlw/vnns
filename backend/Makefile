# VNNS Backend - Build System
# Supports: native (gcc/clang) and wasm (emscripten)

CC = gcc
CC_WASM = emcc
AR = ar

CFLAGS = -Wall -Wextra -std=c99 -O2 -Iinclude
CFLAGS_WASM = -Wall -Wextra -std=c99 -O2 -Iinclude \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","getValue","setValue"]' \
    -s EXPORTED_FUNCTIONS='["_vnns_wasm_create_network","_vnns_wasm_free_network","_vnns_wasm_predict","_vnns_wasm_predict_inplace","_vnns_wasm_train_epoch","_vnns_wasm_train_batch","_vnns_wasm_evaluate","_vnns_wasm_set_learning_rate","_vnns_wasm_set_batch_size","_vnns_wasm_set_clip_gradient","_vnns_wasm_get_weights_json","_vnns_wasm_set_weights","_vnns_wasm_get_network_info","_vnns_wasm_free_ptr","_vnns_wasm_get_last_accuracy","_vnns_wasm_get_last_loss","_malloc","_free"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="VNNSModule" \
    -s ENVIRONMENT='web,worker' \
    -fno-exceptions \
    -fno-rtti

SRC_DIR = src
BUILD_DIR = build
INCLUDE_DIR = include

C_SOURCES = $(SRC_DIR)/vnns_math.c $(SRC_DIR)/vnns_layer.c $(SRC_DIR)/vnns_network.c $(SRC_DIR)/vnns_dataset.c
C_OBJECTS = $(patsubst $(SRC_DIR)/%.c,$(BUILD_DIR)/%.o,$(C_SOURCES))
C_OBJECTS_WASM = $(patsubst $(SRC_DIR)/%.c,$(BUILD_DIR)/%.wasm.o,$(C_SOURCES))

# ---- Native Library ----
.PHONY: all native wasm clean test

all: native wasm

native: $(BUILD_DIR)/libvnns.a

$(BUILD_DIR)/libvnns.a: $(C_OBJECTS)
	$(AR) rcs $@ $^

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# ---- WASM Module ----
wasm: $(BUILD_DIR)/vnns.wasm $(BUILD_DIR)/vnns.js

$(BUILD_DIR)/vnns.wasm $(BUILD_DIR)/vnns.js: $(C_OBJECTS_WASM) $(SRC_DIR)/vnns_wasm.c
	@mkdir -p $(BUILD_DIR)
	$(CC_WASM) $(CFLAGS_WASM) $(C_OBJECTS_WASM) $(SRC_DIR)/vnns_wasm.c -lm -o $(BUILD_DIR)/vnns.js

$(BUILD_DIR)/%.wasm.o: $(SRC_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC_WASM) $(CFLAGS_WASM) -c $< -o $@

# ---- Clean ----
clean:
	rm -rf $(BUILD_DIR)/*

# ---- Test (native) ----
test: native
	$(CC) $(CFLAGS) -L$(BUILD_DIR) -o $(BUILD_DIR)/test_native tests/test.c -lvnns -lm
	$(BUILD_DIR)/test_native
