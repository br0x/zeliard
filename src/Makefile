CC = emcc
CFLAGS = -O2 -Wall -Wextra
LDFLAGS = -s WASM=1 -s EXPORTED_FUNCTIONS='[\
    "_wasm_init",\
]' -s EXPORTED_RUNTIME_METHODS='["cwrap", "ccall"]'

SRCDIR = src
BUILDDIR = build

SOURCES = $(SRCDIR)/data.c

TARGET = $(BUILDDIR)/zeliard.wasm

all: $(TARGET)

$(TARGET): $(SOURCES)
    @mkdir -p $(BUILDDIR)
    $(CC) $(CFLAGS) $(LDFLAGS) -o $@ $(SOURCES)

clean:
    rm -rf $(BUILDDIR)

.PHONY: all clean
