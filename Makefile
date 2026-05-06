CC = emcc

SRCDIR = src
BUILDDIR = build
TARGET = $(BUILDDIR)/zeliard.js

SOURCES = $(wildcard $(SRCDIR)/*.c)

CFLAGS = -O2 -Wall -Wextra

EMFLAGS = \
  -s WASM=1 \
  -s EXPORTED_FUNCTIONS='["_wasm_init"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]'

all: $(TARGET)

$(TARGET): $(SOURCES)
	mkdir -p $(BUILDDIR)
	$(CC) $(CFLAGS) $(EMFLAGS) -o $@ $(SOURCES)

clean:
	rm -rf $(BUILDDIR)