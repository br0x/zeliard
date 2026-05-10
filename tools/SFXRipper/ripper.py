#!/usr/bin/env python3
"""
Zeliard Sound Effect Ripper
---------------------------
Extracts all 65 sound effects from sndadlib.asm and renders them to WAV.
Requires pyopl (pip install pyopl).
Fixed: OPL init, amplitude debugging, volume boost.
"""

import struct
import wave
import os
import re
import array

# ----------------------------------------------------------------------
# 1. Parse the assembly file and extract needed data blocks
# ----------------------------------------------------------------------
def extract_bytes_from_label(asm_lines, label, stop_label=None, max_count=None):
    inside = False
    data = []
    label_pat = re.compile(rf'^{re.escape(label)}\s*(:)?(?:\s+(db|dw)\b)?', re.I)

    for line in asm_lines:
        stripped = line.strip()
        if not inside:
            m = label_pat.match(stripped)
            if m:
                inside = True
        if not inside:
            continue

        if stop_label:
            stop_pat = re.compile(rf'^{re.escape(stop_label)}\s*(:)?\s*', re.I)
            if stop_pat.match(stripped):
                break

        if re.match(r'^\w+\s*(:)?\s*$', stripped):
            break

        m_data = re.match(r'(?:\w+\s+)?(db|dw)\s+(.+)', stripped, re.I)
        if not m_data:
            break

        directive = m_data.group(1).lower()
        rest = m_data.group(2).split(';')[0]

        dup_match = re.match(r'(\S+)\s+dup\s*\(\s*(\S+)\s*\)', rest.strip(), re.I)
        if dup_match and directive == 'db':
            count_str = dup_match.group(1)
            val_str = dup_match.group(2)
            def parse_const(s):
                if s.endswith('h') or s.endswith('H'):
                    return int(s[:-1], 16)
                if (s.startswith("'") and s.endswith("'")) or (s.startswith('"') and s.endswith('"')):
                    return ord(s[1])
                return int(s)
            count = parse_const(count_str)
            val = parse_const(val_str)
            data.extend([val & 0xFF] * count)
            if max_count and len(data) >= max_count:
                return data[:max_count]
            continue

        tokens = re.findall(r'[^,\s]+', rest)
        is_word = (directive == 'dw')
        for tok in tokens:
            if (tok.startswith("'") and tok.endswith("'")) or (tok.startswith('"') and tok.endswith('"')):
                byte_val = ord(tok[1])
            elif re.match(r'^[0-9a-fA-F]+h$', tok):
                byte_val = int(tok[:-1], 16)
            elif re.match(r'^\d+$', tok):
                byte_val = int(tok)
            else:
                continue

            if is_word:
                data.append(byte_val & 0xFF)
                data.append((byte_val >> 8) & 0xFF)
            else:
                data.append(byte_val & 0xFF)

            if max_count and len(data) >= max_count:
                return data[:max_count]

    return data

def parse_asm_for_data(filename):
    with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    sfx_block = extract_bytes_from_label(lines, 'byte_1743', stop_label='byte_2020')
    instr_block = extract_bytes_from_label(lines, 'byte_2020', max_count=81)
    freq_base_words = extract_bytes_from_label(lines, 'word_1576', max_count=12*2)
    note_scale_bytes = extract_bytes_from_label(lines, 'byte_158E', max_count=12)
    chan_base_bytes = extract_bytes_from_label(lines, 'byte_159A', max_count=9)

    return sfx_block, instr_block, freq_base_words, note_scale_bytes, chan_base_bytes

# ----------------------------------------------------------------------
# 2. Constants and tables
# ----------------------------------------------------------------------
NUM_SFX = 65
FREQ_BASE = []
NOTE_SCALE = []
CHAN_BASE = []

# ----------------------------------------------------------------------
# 3. Adaptive OPL interface (detects pyopl's actual method names)
# ----------------------------------------------------------------------
def init_opl(opl, write):
    """Initialize the OPL2 chip for proper playback."""
    # Clear all channels
    for ch in range(0, 9):
        base = CHAN_BASE[ch] if ch < len(CHAN_BASE) else ch
        write(0xA0 + base, 0)
        write(0xB0 + base, 0)
    # Enable OPL2 mode: set bit 5 of register 0x01 (waveform select enable)
    write(0x01, 0x20)
    # Turn off CSW mode (bit 6 of 0xBD)
    write(0xBD, 0x00)
    # Set percussion mode off (bit 5 of 0xBD)
    # already 0

def create_opl(sample_rate):
    """Create an OPL chip and return (opl, write, sample_method)."""
    try:
        import pyopl
        opl = pyopl.opl(sample_rate, 2, 1)
    except ImportError:
        print("ERROR: pyopl not installed. Use: pip install pyopl")
        return None

    # Find the register writing method
    write_method = None
    for name in ['writeReg', 'writereg', 'write', 'write_register']:
        if hasattr(opl, name):
            write_method = getattr(opl, name)
            break
    if write_method is None:
        available = [m for m in dir(opl) if not m.startswith('_')]
        print("Available methods:", available)
        return None

    # Determine argument order: (reg, val) or (val, reg)
    # We'll test by writing to a dummy register and catching errors (safe)
    # Actually we can inspect the function's arg names if it's a Python function.
    try:
        import inspect
        sig = inspect.signature(write_method)
        params = list(sig.parameters.keys())
        if len(params) >= 2:
            # Assume first is register, second is value if 'reg' is in name
            if 'reg' in params[0].lower() or 'addr' in params[0].lower():
                write_order = 'reg_val'
            else:
                write_order = 'val_reg'
        else:
            write_order = 'val_reg'   # guess
    except:
        # Fallback: try reg,val first, if that fails, swap
        write_order = 'reg_val'

    # Find sample method
    sample_method = None
    for name in ['getsamples', 'generate', 'getSamples']:
        if hasattr(opl, name):
            sample_method = getattr(opl, name)
            break
    if sample_method is None:
        return None

    # Initialize the chip
    def write_fn(reg, val):
        if write_order == 'reg_val':
            write_method(reg, val)
        else:
            write_method(val, reg)

    init_opl(opl, write_fn)

    return opl, write_fn, sample_method

# ----------------------------------------------------------------------
# 4. Instrument loader
# ----------------------------------------------------------------------
def load_instrument(write, chan, instr_data):
    if not instr_data or len(instr_data) < 9:
        return
    base = CHAN_BASE[chan]
    regs = [
        0x20 + base, 0x23 + base,
        0x40 + base, 0x43 + base,
        0x60 + base, 0x63 + base,
        0x80 + base, 0x83 + base,
        0xC0 + base
    ]
    for i, val in enumerate(instr_data[:9]):
        write(regs[i], val)

# ----------------------------------------------------------------------
# 5. Channel note player (simplified interpreter)
# ----------------------------------------------------------------------
class ChannelPlayer:
    def __init__(self, data, start_offset, chan, global_dur_base, instruments,
                 freq_base, note_scale, write):
        self.data = data
        self.pos = start_offset
        self.chan = chan
        self.global_dur_base = global_dur_base
        self.instruments = instruments
        self.freq_base = freq_base
        self.note_scale = note_scale
        self.write = write

        self.flags5 = 0
        self.duration = 0
        self.volume = 0x7F
        self.octave = 3
        self.transpose = 0
        self.note_active = False
        self.finished = False
        self.env_step = 0

    def read_byte(self):
        if self.pos >= len(self.data):
            return 0
        b = self.data[self.pos]
        self.pos += 1
        return b

    def get_duration(self, index):
        addr = self.global_dur_base + index
        if 0 <= addr < len(self.data):
            return self.data[addr]
        return 1

    def tick(self):
        if self.finished:
            return

        if self.flags5 & 0x40 and self.env_step > 0:
            self.env_step -= 1

        if self.duration > 0:
            self.duration -= 1
            if self.duration == 0 and self.note_active:
                self.note_off()
            return

        while self.duration == 0 and not self.finished:
            cmd = self.read_byte()
            if cmd & 0x80:
                self.handle_command(cmd)
            else:
                dur_nib = (cmd >> 4) & 0xF
                note_nib = cmd & 0xF
                if note_nib == 0xF or note_nib == 0:
                    self.duration = self.get_duration(dur_nib)
                    if self.note_active:
                        self.note_off()
                else:
                    self.play_note(note_nib, dur_nib)

    def note_off(self):
        reg = 0xB0 + CHAN_BASE[self.chan]
        self.write(reg, 0)
        self.note_active = False

    def play_note(self, note, dur_nib):
        idx = note - 1
        if idx < 0 or idx >= 12:
            return
        fnum = self.freq_base[idx] + self.transpose
        fnum_low = fnum & 0xFF
        fnum_high = ((fnum >> 8) & 0x3) | ((self.octave & 7) << 2) | 0x20
        reg_a0 = 0xA0 + CHAN_BASE[self.chan]
        reg_b0 = 0xB0 + CHAN_BASE[self.chan]
        self.write(reg_a0, fnum_low)
        self.write(reg_b0, fnum_high)
        self.note_active = True
        self.duration = self.get_duration(dur_nib)

    def handle_command(self, cmd):
        if 0xE0 <= cmd <= 0xFF:
            sub = cmd & 0x1F
            if sub == 0:
                self.read_byte()
            elif sub == 1:
                self.transpose = self.read_byte()
            elif sub == 2:
                self.flags5 &= ~0x40
                if self.read_byte():
                    self.flags5 |= 0x40
                    self.read_byte()
                    self.read_byte()
                    self.read_byte()
                    self.read_byte()
            elif sub == 3:
                self.octave = max(0, self.octave - 1)
            elif sub == 4:
                self.octave = min(7, self.octave + 1)
            elif sub == 5:
                self.volume = self.read_byte()
            elif sub == 0x10:
                idx = self.read_byte()
                self.global_dur_base += idx * 8
            elif sub == 0x1F:
                self.finished = True
        elif 0x80 <= cmd <= 0xBF:
            inst_num = cmd & 0x3F
            if inst_num < len(self.instruments):
                load_instrument(self.write, self.chan, self.instruments[inst_num])

# ----------------------------------------------------------------------
# 6. Render all sound effects
# ----------------------------------------------------------------------
def render_all(sfx_block, instr_block, freq_base, note_scale, chan_base,
               sample_rate=44100, tick_rate=140):
    result = create_opl(sample_rate)
    if result is None:
        return []
    _, _, _ = result

    samples_per_tick = sample_rate // tick_rate
    headers = [sfx_block[i:i+7] for i in range(0, NUM_SFX*7, 7)]
    note_stream = sfx_block[NUM_SFX*7:]
    instruments = [instr_block[i:i+9] for i in range(0, min(81, len(instr_block)), 9)]
    if not instruments:
        return []

    wav_outputs = []
    base_data_addr = 0x1743

    for idx, hdr in enumerate(headers):
        ch1_ptr = hdr[1] | (hdr[2] << 8)
        ch2_ptr = hdr[3] | (hdr[4] << 8)
        global_word = hdr[5] | (hdr[6] << 8)
        if ch1_ptr == 0 or ch2_ptr == 0:
            continue

        off1 = ch1_ptr - base_data_addr - NUM_SFX*7
        off2 = ch2_ptr - base_data_addr - NUM_SFX*7
        global_dur_off = global_word - base_data_addr - NUM_SFX*7

        if (off1 < 0 or off2 < 0 or
            off1 >= len(note_stream) or off2 >= len(note_stream) or
            global_dur_off < 0):
            continue

        result = create_opl(sample_rate)
        if result is None:
            break
        opl, write, sample_method = result

        ch1 = ChannelPlayer(note_stream, off1, 4, global_dur_off,
                            instruments, freq_base, note_scale, write)
        ch2 = ChannelPlayer(note_stream, off2, 5, global_dur_off,
                            instruments, freq_base, note_scale, write)

        buf = bytearray()
        tickbuf = bytearray(samples_per_tick * 2)   # 16-bit mono
        for _ in range(3000):
            ch1.tick()
            ch2.tick()
            try:
                ret = sample_method(tickbuf)
                if isinstance(ret, int):
                    buf.extend(tickbuf[:ret])
                else:
                    buf.extend(tickbuf)
            except Exception as e:
                print(f"Error getting samples: {e}")
                break
            if ch1.finished and ch2.finished:
                break

        if buf:
            # Amplify if needed: check maximum sample value
            samples = array.array('h', buf)  # signed 16-bit
            max_val = max(max(samples), -min(samples))
            if idx == 0:
                print(f"Effect 0 raw max amplitude: {max_val}")
            if max_val > 0 and max_val < 1000:   # if very quiet
                factor = min(32767 // max_val, 256)
                amplified = array.array('h', (int(s * factor) for s in samples))
                wav_outputs.append((idx, amplified.tobytes()))
            else:
                wav_outputs.append((idx, bytes(buf)))
        else:
            wav_outputs.append((idx, b''))

    return wav_outputs

def write_wav(filename, data, sample_rate=44100, channels=1, sampwidth=2):
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sampwidth)
        wf.setframerate(sample_rate)
        wf.writeframes(data)

def main():
    asm_file = 'sndadlib.asm'
    if not os.path.exists(asm_file):
        print(f"File {asm_file} not found.")
        return

    sfx_block, instr_block, freq_words, note_scale, chan_base = parse_asm_for_data(asm_file)

    if not sfx_block or len(sfx_block) < NUM_SFX*7:
        print(f"Could not extract enough SFX data. Got {len(sfx_block)} bytes, need at least {NUM_SFX*7}.")
        return

    global FREQ_BASE, NOTE_SCALE, CHAN_BASE
    if len(freq_words) < 24:
        print(f"Frequency table too short: {len(freq_words)} bytes (need 24).")
        return
    FREQ_BASE = [freq_words[i] | (freq_words[i+1] << 8) for i in range(0, 24, 2)]
    NOTE_SCALE = note_scale[:12]
    CHAN_BASE = chan_base[:9]

    print(f"Extracted {len(sfx_block)} bytes SFX block, {len(instr_block)} bytes instruments.")
    wavs = render_all(sfx_block, instr_block, FREQ_BASE, NOTE_SCALE, CHAN_BASE)

    if not wavs:
        print("No sound effects could be rendered.")
        return

    os.makedirs('sfx_wav', exist_ok=True)
    for idx, wav_data in wavs:
        fname = f'sfx_wav/effect_{idx:02d}.wav'
        write_wav(fname, wav_data)
        print(f"Saved {fname}")
    print(f"Rendered {len(wavs)} effects.")

if __name__ == '__main__':
    main()
    