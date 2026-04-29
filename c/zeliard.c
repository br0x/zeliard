/*
 * zeliard.c  –  Zeliard DOS game loader / startup
 * Translated from zeliard.asm  (Game Arts / Sierra On-Line, 1987-1990)
 *
 * Original code ran as a small-model DOS COM-style EXE.  Its sole job is:
 *   1. Parse RESOURCE.CFG for video / music / sfx / joystick settings.
 *   2. Allocate a 256KB memory in 4 contigous segments 64K each (game_cseg, seg1, seg2, seg3) and load the game binaries.
 *   3. Reprogram the PIT timer to ~236.7 Hz and install interrupt vectors.
 *   4. Set the video mode and jump into game.bin.
 *
 * Because the original relied heavily on real-mode DOS services (INT 21h,
 * INT 10h) and direct hardware I/O, this C translation captures the *logic*
 * of each routine faithfully.  Platform-specific parts (PIT programming,
 * BIOS video-mode calls, raw ISR installation) are kept as stubs with
 * detailed comments so they can be wired to a DOS extender, DOSBox hook,
 * or a modern portability layer.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdint.h>

#include "common.h"

/* =========================================================================
 * Global state  (originally seg000 static storage)
 * ========================================================================= */

/*
 * The 256-KB game segment loaded at run-time.
 * In the original code this was a real-mode paragraph-aligned allocation;
 * here we just malloc it and index it as a flat byte array.
 */
static uint8_t *game_mem = NULL;   /* 0x40000 bytes (4000h paragraphs × 16) */

/* Saved interrupt vectors (original: far pointers stored as uint32_t) */
static uint32_t int8_old  = 0;
static uint32_t int9_old  = 0;
static uint32_t int60_old = 0;
static uint32_t int61_old = 0;

/* Config / startup flags */
static uint8_t  video_mode              = 0;   /* VIDEO_EGA..VIDEO_TGA */
static uint8_t  music_is_mt32_flag      = 0;   /* 0xFF = MT-32 */
static uint8_t  use_joystick_flag       = 0;   /* 0xFF = yes */
static uint8_t  restore_on_startup_flag = 0;   /* 0xFF = restore from savegame */

/* File-parsing workspace */
static uint8_t  token_length   = 0;
static char     file_buf[0x100];               /* token read buffer */

/* Driver filename strings (up to 15 chars + NUL) */
static char g_szMuzicDrv  [16] = {0};
static char g_szSoundFxDrv[16] = {0};

/* Savegame name length limit */

/*
 * Virtual-file-system descriptors: each entry is (load_offset, filename).
 * In the original code these were adjacent word+string pairs in the data
 * segment addressed via a DI pointer.
 */
typedef struct { uint16_t load_offset; const char *filename; } vfs_entry_t;

static vfs_entry_t vfs_stick_bin   = { 0x0100,  "stick.bin"   };
static vfs_entry_t vfs_game_bin    = { 0xA000,  "game.bin"    };
static vfs_entry_t vfs_stdply_bin  = { 0x0000,  "stdply.bin"  };
static vfs_entry_t vfs_savename    = { 0x0000,  NULL          }; /* filename set at runtime */
static vfs_entry_t vfs_gmega_bin   = { 0x2000,  "gmega.bin"   };
static vfs_entry_t vfs_gmcga_bin   = { 0x2000,  "gmcga.bin"   };
static vfs_entry_t vfs_gmhgc_bin   = { 0x2000,  "gmhgc.bin"   };
static vfs_entry_t vfs_gmmcga_bin  = { 0x2000,  "gmmcga.bin"  };
static vfs_entry_t vfs_gmtga_bin   = { 0x2000,  "gmtga.bin"   };
static vfs_entry_t vfs_music_drv   = { 0x0100,  NULL          }; /* filename set at runtime */
static vfs_entry_t vfs_snd_fx_drv  = { 0x1100,  NULL          }; /* filename set at runtime */

/* Mapping from video_mode index to video-driver VFS entry */
static vfs_entry_t *video_drivers_vfs[6] = {
    &vfs_gmega_bin,   /* 0 – EGA  */
    &vfs_gmcga_bin,   /* 1 – CGA  */
    &vfs_gmcga_bin,   /* 2 – CGA2 */
    &vfs_gmhgc_bin,   /* 3 – HGC  */
    &vfs_gmmcga_bin,  /* 4 – MCGA */
    &vfs_gmtga_bin,   /* 5 – TGA  */
};

/* The parsed save-game filename used on command-line restore */
static char user_savegame_to_restore[32] = {0};

/* game.bin entry offset (always 0xA000 in original) */
static uint16_t game_bin_off = 0xA000;

/* =========================================================================
 * String literals  (originally inline db data in seg000)
 * ========================================================================= */

static const char g_szTitleString[]     =
    "The Fantasy Action Game ZELIARD Version 1.208\r\n"
    "Copyright (C) 1987 ~ 1990 Game Arts Co.,Ltd.\r\n"
    "Copyright (C) 1990 Sierra On-Line, Inc.\r\n";
static const char g_szNotEnoughMemory[] = "Not enough memory to run 'ZELIARD'.\r\n";
static const char g_szMemoryError[]     = "Memory error !!!\r\n";  /* used by quit_game stub */
/* suppress unused-variable warning – string exists in original data segment */
static void use_mem_error_string(void) __attribute__((unused));
static void use_mem_error_string(void) { (void)g_szMemoryError; }
static const char g_szThankYou[]        = "Thank you for playing.\r\n";
static const char g_szFileErrorFrom[]   = "File Error from ";
static const char g_szErrorType[]       = "     Error Type : ";
static const char g_szFileNotFound[]    = "File not found.";
static const char g_szDiskReadError[]   = "DISK read Error!!";
static const char g_szUserFileNothing[] = "USER file nothing.";
static const char g_szErrorInResource[] = "Error in RESOURCE.CFG\r\n";
static const char g_szResourceCfg[]     = "RESOURCE.CFG";
static const char g_szMtinitCom[]       = "MTINIT.COM";

/*
 * Error-code table: two hex digits per error code 0..F.
 * Original stored as interleaved Hi/Lo byte arrays.
 */
static const char g_bErrorCodes[][3] = {
    "00","01","02","03","04","05","06","07",
    "08","09","0A","0B","0C","0D","0E","0F"
};

/* HGC CRTC register initialisation values */
static const uint8_t hgc_settings[12] = {
    0x35, 0x2D, 0x2E, 0x07, 0x5B, 0x02,
    0x57, 0x57, 0x02, 0x03, 0x00, 0x00
};

/* =========================================================================
 * Forward declarations
 * ========================================================================= */

static void  flush_keyb_buf(void);
static int   Parse_Config_Token(FILE *fp);
static void  Parse_Video_drv(void);
static void  Parse_Music_Driver(void);
static void  Parse_Sound_FX_Driver(void);
static void  Parse_joystick_yesno(void);
static void  Find_Colon_In_Token(char **out_value, int *out_len);
static void  Load_Resource_File(vfs_entry_t *vfs, const char *name_override);
static void  Print_File_Error(int error_code, const char *filename);
static void  Set_Video_Mode(void);
static void  Parse_Command_Line(int argc, char *argv[]);
static void  Handle_Game_Exit(int exit_code);
static void  quit_game(void);
static void  init_game_mem_flags(void);

/* =========================================================================
 * Utility: flush keyboard buffer
 *
 * Original: read stdin (INT 21/06 DL=FFh) in a tight loop until no char.
 * ========================================================================= */
static void flush_keyb_buf(void)
{
    /* In a real DOS port: poll INT 21/06/FF until ZF is set (no char). */
    /* For portability we just ignore any pending input. */
    (void)0;  /* stub */
}

/* =========================================================================
 * Parse_Config_Token
 *
 * Reads bytes from fp one at a time, skipping control characters (< 0x20)
 * then accumulating printable characters (lowercased) into file_buf until
 * whitespace or EOF is reached.
 *
 * Returns: 0 on success (token stored in file_buf / token_length),
 *          1 on EOF / error.
 * ========================================================================= */
static int Parse_Config_Token(FILE *fp)
{
    int ch;
    token_length = 0;

    /* skip leading control / whitespace chars (code < 0x20 i.e. < space) */
    do {
        ch = fgetc(fp);
        if (ch == EOF) return 1;   /* carry flag set -> EOF */
    } while ((unsigned char)ch < ' ');

    /* accumulate token characters, lowercasing letters */
    char *dst = file_buf;
    do {
        *dst++ = (char)(ch | 0x20);  /* original: OR 20h – turns letters to lower, leaves ':' alone */
        token_length++;
        ch = fgetc(fp);
        if (ch == EOF) break;
        if ((unsigned char)ch == ' ') {
            /* skip further spaces and stop */
            while ((ch = fgetc(fp)) == ' ')
                ;
            if (ch == EOF || (unsigned char)ch < ' ')
                break;
            /* next non-space, non-ctrl char → continue accumulating */
            continue;
        }
        if ((unsigned char)ch < ' ') break;  /* control char terminates token */
    } while (1);

    *dst = '\0';
    return 0;  /* carry clear */
}

/* =========================================================================
 * Find_Colon_In_Token
 *
 * Scans file_buf for ':' and returns a pointer to the character after the
 * colon (the "value" portion) and the remaining length.
 * Calls print_cfg_err_and_exit if no colon is found.
 * ========================================================================= */
static void Find_Colon_In_Token(char **out_value, int *out_len)
{
    int i;
    for (i = 0; i < token_length; i++) {
        if (file_buf[i] == ':') {
            *out_value = &file_buf[i + 1];
            *out_len   = token_length - i;  /* length of value portion incl. the char after ':' */
            return;
        }
    }
    /* no colon found → config error */
    fprintf(stderr, "%s", g_szErrorInResource);
    exit(1);
}

/* =========================================================================
 * Parse_Video_drv
 *
 * Parses a token like "video:mcga" and sets video_mode accordingly.
 * ========================================================================= */
static void Parse_Video_drv(void)
{
    static const struct { const char *name; uint8_t mode; } modes[] = {
        { "cga2", VIDEO_CGA2  },
        { "mcga", VIDEO_MCGA  },
        { "cga",  VIDEO_CGA   },
        { "ega",  VIDEO_EGA   },
        { "hgc",  VIDEO_HGC   },
        { "tga",  VIDEO_TGA   },
    };

    char *val;
    int   len;
    Find_Colon_In_Token(&val, &len);
    len--;   /* exclude the ':' itself; val points to the mode string */

    for (int i = 0; i < (int)(sizeof(modes)/sizeof(modes[0])); i++) {
        if ((int)strlen(modes[i].name) == len &&
            strncmp(val, modes[i].name, (size_t)len) == 0) {
            video_mode = modes[i].mode;
            return;
        }
    }
    fprintf(stderr, "%s", g_szErrorInResource);
    exit(1);
}

/* =========================================================================
 * Parse_Music_Driver
 *
 * Copies the driver filename from the token into g_szMuzicDrv.
 * Sets music_is_mt32_flag if the driver is "mscmt.drv".
 * ========================================================================= */
static void Parse_Music_Driver(void)
{
    char *val;
    int   len;
    music_is_mt32_flag = 0;

    Find_Colon_In_Token(&val, &len);
    len--;  /* value length without ':' */
    if (len > 15) len = 15;

    memcpy(g_szMuzicDrv, val, (size_t)len);
    g_szMuzicDrv[len] = '\0';

    if (strcmp(g_szMuzicDrv, "mscmt.drv") == 0)
        music_is_mt32_flag = 0xFF;
}

/* =========================================================================
 * Parse_Sound_FX_Driver
 *
 * Copies the SFX driver filename from the token into g_szSoundFxDrv.
 * ========================================================================= */
static void Parse_Sound_FX_Driver(void)
{
    char *val;
    int   len;
    Find_Colon_In_Token(&val, &len);
    len--;
    if (len > 15) len = 15;
    memcpy(g_szSoundFxDrv, val, (size_t)len);
    g_szSoundFxDrv[len] = '\0';
}

/* =========================================================================
 * Parse_joystick_yesno
 *
 * Expects token value "yes" or "no" after the colon.
 * ========================================================================= */
static void Parse_joystick_yesno(void)
{
    char *val;
    int   len;
    Find_Colon_In_Token(&val, &len);
    len--;

    if (len == 3 && strncmp(val, "yes", 3) == 0) {
        use_joystick_flag = 0xFF;
        return;
    }
    if (len == 2 && strncmp(val, "no", 2) == 0) {
        use_joystick_flag = 0;
        return;
    }
    fprintf(stderr, "%s", g_szErrorInResource);
    exit(1);
}

/* =========================================================================
 * Print_File_Error
 *
 * Prints "File Error from <filename>  Error Type: <description>" to stderr.
 * error_code mirrors the DOS INT 21h error return values.
 * ========================================================================= */
static void Print_File_Error(int error_code, const char *filename)
{
    fprintf(stderr, "%s%s\n", g_szFileErrorFrom, filename ? filename : "");
    fprintf(stderr, "%s", g_szErrorType);

    if (error_code == 2) {
        fprintf(stderr, "%s\n", g_szFileNotFound);
    } else if (error_code == 5) {
        fprintf(stderr, "%s\n", g_szDiskReadError);
    } else {
        /* Print as two-digit hex code */
        int idx = error_code & 0x0F;
        fprintf(stderr, "%sH\n", g_bErrorCodes[idx]);
    }
}

/* =========================================================================
 * Load_Resource_File
 *
 * Reads the named binary file into game_mem at vfs->load_offset.
 * At most 0xFFFF bytes are read (one 64-KB segment).
 * ========================================================================= */
static void Load_Resource_File(vfs_entry_t *vfs, const char *name_override)
{
    const char *filename = name_override ? name_override : vfs->filename;
    if (!filename) {
        Print_File_Error(2, "(null)");
        quit_game();
    }

    FILE *fp = fopen(filename, "rb");
    if (!fp) {
        Print_File_Error(2, filename);
        quit_game();
    }

    size_t bytes_read = fread(game_mem + vfs->load_offset, 1, 0xFFFF, fp);
    if (ferror(fp)) {
        fclose(fp);
        Print_File_Error(5, filename);  /* 5 = access denied / read error */
        quit_game();
    }
    fclose(fp);
    (void)bytes_read;  /* exact count not checked in original */
}

/* =========================================================================
 * Set_Video_Mode
 *
 * Calls INT 10h with the appropriate BIOS video mode for the selected driver.
 * In a portable build these would call the platform-specific display init.
 *
 *   EGA  → INT 10h AX=000Eh  (640×350 16-colour)
 *   CGA  → INT 10h AX=0005h  (320×200 4-colour)
 *   CGA2 → INT 10h AX=0006h  (640×200 2-colour)
 *   HGC  → Direct CRTC programming (720×348 monochrome Hercules)
 *   MCGA → INT 10h AX=0013h  (320×200 256-colour)
 *   TGA  → INT 10h AX=0009h  (320×200 16-colour CGA 4-page)
 * ========================================================================= */
static void Set_Video_Mode(void)
{
    switch (video_mode) {
        case VIDEO_EGA:
            /* BIOS INT 10h, AH=0, AL=0x0E: 640×350 EGA */
            printf("[stub] Set video mode: EGA (INT 10h AX=000Eh)\n");
            break;
        case VIDEO_CGA:
            /* BIOS INT 10h, AH=0, AL=0x05: 320×200 CGA */
            printf("[stub] Set video mode: CGA (INT 10h AX=0005h)\n");
            break;
        case VIDEO_CGA2:
            /* BIOS INT 10h, AH=0, AL=0x06: 640×200 CGA hi-res */
            printf("[stub] Set video mode: CGA2 (INT 10h AX=0006h)\n");
            break;
        case VIDEO_MCGA:
            /* BIOS INT 10h, AH=0, AL=0x13: 320×200 256-colour MCGA */
            printf("[stub] Set video mode: MCGA (INT 10h AX=0013h)\n");
            break;
        case VIDEO_TGA:
            /* BIOS INT 10h, AH=0, AL=0x09 */
            printf("[stub] Set video mode: TGA (INT 10h AX=0009h)\n");
            break;
        case VIDEO_HGC:
            /*
             * Hercules Graphics Card initialisation via direct CRTC I/O:
             *
             *   OUT 0x3B8, 0x02        ; display-mode register: graphics on
             *   OUT 0x3BF, 0x01        ; config switch: enable graphics page
             *   for reg 0..11:
             *     OUT 0x3B4, reg       ; CRTC address register
             *     OUT 0x3B5, hgc_settings[reg]
             *   OUT 0x3B8, 0x2A        ; graphics + page 0 visible
             *   clear 0xB000:0000 .. 0xB000:7FFF (32 KB, stosw AX=0)
             *
             * hgc_settings[] = { 0x35,0x2D,0x2E,0x07,0x5B,0x02,
             *                    0x57,0x57,0x02,0x03,0x00,0x00 }
             */
            printf("[stub] Set video mode: HGC (direct CRTC I/O)\n");
            (void)hgc_settings;   /* suppress unused-variable warning */
            break;
        default:
            fprintf(stderr, "Unknown video mode %d\n", video_mode);
            break;
    }
}

/* =========================================================================
 * init_game_mem_flags
 *
 * Zero/initialise all the shared-state flags in game_mem[].
 * Mirrors the long sequence of  mov byte ptr es:[offset], value  in start().
 * ========================================================================= */
static void init_game_mem_flags(void)
{
    /* input / latch bytes */
    GM_BYTE(____Alt_Space)  = 0;
    GM_BYTE(____right_left_down_up) = 0;
    GM_WORD(F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter) = 0;
    GM_BYTE(spacebar_latch) = 0;
    GM_BYTE(altkey_latch)   = 0;

    /* callback / misc */
    GM_WORD(fn_per_tick_user_ptr) = 0;
    GM_BYTE(music_status_flag)            = 0xFF;
    GM_BYTE(exit_pending_flag)    = 0xFF;
    GM_BYTE(sound_fx_toggle_by_f2) = 0;
    GM_BYTE(music_channel_param)  = 0;
    GM_BYTE(byte_FF0B)            = 0;
    GM_BYTE(heartbeat_volume)     = 0;
    GM_BYTE(soundFX_request)      = 0;

    /* game-state defaults */
    GM_BYTE(speed_const)          = 5;
    GM_BYTE(is_boss_cavern)       = 0;
    GM_BYTE(squat_flag)           = 0;
    GM_BYTE(on_rope_flags)        = 0;
    GM_BYTE(hero_hidden_flag)     = 0;
    GM_BYTE(sword_swing_flag)     = 0;
    GM_BYTE(spell_active_flag)    = 0;
    GM_BYTE(joystick_calibrated_flag) = 0;
    GM_BYTE(keyboard_alt_mode_flag)   = 0;
    GM_BYTE(shield_anim_active)   = 0;
    GM_BYTE(slope_direction)      = 0;
    GM_BYTE(disk_swap_suppressed) = 0;

    /* copy joystick / MT-32 flags from loader state */
    GM_BYTE(joystick_enabled_flag) = use_joystick_flag;
    GM_BYTE(mt32_enabled)          = music_is_mt32_flag;

    /* video driver id */
    GM_BYTE(video_drv_id) = video_mode;
}

/* =========================================================================
 * Parse_Command_Line
 *
 * Original read PSP:0x80 (command-line length) and PSP:0x81 (command tail).
 * Here we accept argc/argv from main().
 *
 * If a non-empty argument is present it is treated as a savegame base name;
 * restore_on_startup_flag is set and ".USR" is appended.
 * ========================================================================= */
static void Parse_Command_Line(int argc, char *argv[])
{
    if (argc < 2) return;

    const char *arg = argv[1];
    int  i = 0;
    char ch;

    /* skip leading spaces */
    while (arg[i] == ' ') i++;
    if (!arg[i]) return;

    /* copy up to 8 chars, uppercasing letters, stopping at '.' */
    int di = 0;
    while ((ch = arg[i++]) != '\0' && ch != '.' && di < 8) {
        if (ch >= 'a' && ch < '{') ch &= 0x5F;   /* uppercase: AND 5Fh */
        user_savegame_to_restore[di++] = ch;
    }
    if (di == 0) return;

    /* append ".USR\0" */
    user_savegame_to_restore[di++] = '.';
    user_savegame_to_restore[di++] = 'U';
    user_savegame_to_restore[di++] = 'S';
    user_savegame_to_restore[di++] = 'R';
    user_savegame_to_restore[di]   = '\0';

    restore_on_startup_flag = 0xFF;
}

/* =========================================================================
 * Handle_Game_Exit
 *
 * Called via the fn_exit_far_ptr vector when the game wants to exit.
 * exit_code == 0           → "Thank you for playing."
 * exit_code == 0xFFFF      → "USER file nothing."
 * exit_code == 2           → "File not found."
 * anything else            → "DISK read Error!!"
 *
 * After printing the message the function restores interrupt vectors,
 * reprograms the PIT back to 18.2 Hz, frees the game segment and exits.
 * ========================================================================= */
static void Handle_Game_Exit(int exit_code)
{
    /* Restore text video mode (INT 10h AX=0002h) – stub */
    printf("[stub] Restore video mode: INT 10h AX=0002h\n");

    flush_keyb_buf();

    /* Deactivate sound / music (INT 60h AX=0001h) – stub */
    printf("[stub] Sound shutdown: INT 60h AX=0001h\n");

    if (exit_code == 0) {
        printf("%s", g_szThankYou);
    } else if (exit_code == 0xFFFF) {
        printf("%s\n", g_szUserFileNothing);
    } else {
        /* Print the filename that was in DS:DX at time of error.
         * In the original the filename pointer was passed via push DS / push DX
         * before calling Handle_Game_Exit.  In C we reconstruct the message
         * using the error code only. */
        if (exit_code == 2)
            fprintf(stderr, "%s\n", g_szFileNotFound);
        else
            fprintf(stderr, "%s\n", g_szDiskReadError);
    }

    quit_game();
}

/* =========================================================================
 * quit_game
 *
 * Restores interrupt vectors, reprograms PIT, frees game memory and exits.
 * ========================================================================= */
static void quit_game(void)
{
    /*
     * Restore INT 8 (timer), INT 9 (keyboard), INT 60 (music driver)
     * to their saved vectors – stubs for a DOS port.
     *
     *   INT 21h AH=25h AL=08h DS:DX = int8_old
     *   INT 21h AH=25h AL=09h DS:DX = int9_old
     *   INT 21h AH=25h AL=60h DS:DX = int60_old
     */
    (void)int8_old; (void)int9_old; (void)int60_old; (void)int61_old;
    printf("[stub] Restore interrupt vectors 08h, 09h, 60h\n");

    /*
     * Reprogram PIT Timer 0 back to standard 18.2 Hz:
     *   OUT 43h, 36h   ; mode 3, binary, LSB+MSB, counter 0
     *   OUT 40h, 00h   ; LSB = 0
     *   OUT 40h, 00h   ; MSB = 0  → reload value 0x10000 → 18.2 Hz
     */
    printf("[stub] Restore PIT timer to 18.2 Hz\n");

    if (game_mem) {
        free(game_mem);
        game_mem = NULL;
    }

    /*
     * Original: INT 21h AH=49h (Free Memory block) then INT 21h AH=4Ch AL=00h.
     */
    exit(0);
}

/* =========================================================================
 * program_pit_timer
 *
 * Programs the 8253/8254 PIT Timer 0 to generate IRQ0 at ~236.7 Hz.
 *
 *   OUT 43h, 36h    ; counter 0, mode 3 (square wave), binary, LSB+MSB
 *   OUT 40h, 0xB1   ; LSB of reload value 0x13B1 = 5041
 *   OUT 40h, 0x13   ; MSB
 *
 * 1,193,182 Hz / 5041 ≈ 236.7 Hz → IRQ0 fires ~236.7×/s
 * ========================================================================= */
static void program_pit_timer(void)
{
    printf("[stub] Program PIT: counter=0x13B1 (~236.7 Hz IRQ0)\n");
    /*
     * In a real DOS port:
     *   outp(0x43, 0x36);
     *   outp(0x40, 0xB1);
     *   outp(0x40, 0x13);
     */
}

/* =========================================================================
 * install_interrupt_vectors
 *
 * Saves old INT 8 / 9 / 60 / 61 vectors, then installs new ones pointing
 * into game_mem at the fixed offsets defined in common.h.
 *
 * Also sets up the far-pointer callback table in the shared-data area so
 * that game.bin can call back into the loader's Handle_Game_Exit.
 * ========================================================================= */
static void install_interrupt_vectors(void)
{
    /*
     * Original sequence (abbreviated):
     *
     *   GET INT 8  → int8_old
     *   GET INT 9  → int9_old
     *   GET INT 60 → int60_old
     *   GET INT 61 → int61_old
     *
     *   es:fn_exit_far_ptr    ← &Handle_Game_Exit  (seg:off far ptr)
     *   es:fn_timer_chain_ptr ← int8_old
     *   es:fn_kbd_chain_ptr   ← int9_old
     *
     *   SET INT 23 (Ctrl-C)   → int23_new  (IRET stub)
     *   SET INT 8  (timer)    → game_mem[int8_new_proc]
     *   SET INT 9  (keyboard) → game_mem[int9_new_proc]
     *   SET INT 24 (crit.err) → game_mem[int24_new_proc]
     *   SET INT 61            → game_mem[int61_new_proc]
     *   SET INT 60 (music)    → game_mem + seg1 offset 0x103
     *
     *   fn_per_tick_callback  ← seg1:0x0100
     *   fn_per_tick_callback2 ← seg1:0x1100
     */
    printf("[stub] Save & install interrupt vectors (8,9,23,24,60,61)\n");
}

/* =========================================================================
 * exec_mtinit
 *
 * If music_is_mt32_flag is set, runs MTINIT.COM to initialise the MT-32.
 * In the original this used INT 21h AH=4Bh AL=00h (EXEC).
 *
 * Returns 0 on success, -1 on failure.
 * ========================================================================= */
static int exec_mtinit(void)
{
    if (!music_is_mt32_flag) return 0;

    /* In a real DOS port: INT 21/4B EXEC MTINIT.COM, restore SS:SP after. */
    printf("[stub] EXEC MTINIT.COM for MT-32 initialisation\n");

    /* Simulate success */
    return 0;
}

/* =========================================================================
 * main  (entry point, replaces "start" proc)
 * ========================================================================= */
int main(int argc, char *argv[])
{
    /* ------------------------------------------------------------------
     * Original checked DOS version >= 2 (INT 21h AH=30h); we skip that.
     * ------------------------------------------------------------------ */

    Parse_Command_Line(argc, argv);

    /* ------------------------------------------------------------------
     * Parse RESOURCE.CFG
     * ------------------------------------------------------------------ */
    FILE *cfg = fopen(g_szResourceCfg, "r");
    if (!cfg) {
        Print_File_Error(2, g_szResourceCfg);
        return 1;
    }

    /* Token 1: video driver */
    if (Parse_Config_Token(cfg)) goto cfg_error;
    Parse_Video_drv();

    /* Token 2: music driver */
    if (Parse_Config_Token(cfg)) goto cfg_error;
    Parse_Music_Driver();

    /* Token 3: sound FX driver */
    if (Parse_Config_Token(cfg)) goto cfg_error;
    Parse_Sound_FX_Driver();

    /* Token 4: joystick yes/no */
    if (Parse_Config_Token(cfg)) goto cfg_error;
    Parse_joystick_yesno();

    fclose(cfg);
    cfg = NULL;
    goto cfg_ok;

cfg_error:
    if (cfg) fclose(cfg);
    fprintf(stderr, "%s", g_szErrorInResource);
    return 1;

cfg_ok:
    /* ------------------------------------------------------------------
     * Allocate the 256-KB game segment (INT 21h AH=48h BX=4000h paragraphs).
     * ------------------------------------------------------------------ */
    game_mem = (uint8_t *)calloc(0x40000, 1);
    if (!game_mem) {
        fprintf(stderr, "%s", g_szNotEnoughMemory);
        return 1;
    }

    flush_keyb_buf();
    printf("%s", g_szTitleString);

    /* ------------------------------------------------------------------
     * Optional: run MTINIT.COM for MT-32 music
     * ------------------------------------------------------------------ */
    if (exec_mtinit() != 0) {
        Print_File_Error(2, g_szMtinitCom);
        free(game_mem);
        return 1;
    }

    /* ------------------------------------------------------------------
     * Initialise shared-data flags inside game_mem
     * ------------------------------------------------------------------ */
    init_game_mem_flags();

    /* Copy save-name into game_mem (zero first, then copy up to 8 chars) */
    memset(game_mem + save_name, 0, 8);
    {
        const char *src = user_savegame_to_restore;
        uint8_t    *dst = game_mem + save_name;
        int i;
        for (i = 0; i < 8 && src[i] && src[i] != '.'; i++) {
            char c = src[i];
            if (c >= 'a' && c < '{') c &= 0x5F;  /* uppercase */
            dst[i] = (uint8_t)c;
        }
    }

    /* seg1 = game_cseg + 0x1000 – store as 16-bit offset-segment value (stub) */
    printf("[stub] seg1 pointer initialised\n");

    /* ------------------------------------------------------------------
     * Load binary modules into game_mem
     * ------------------------------------------------------------------ */

    /* stdply.bin (initial screen / intro) or the user's savegame */
    if (restore_on_startup_flag) {
        vfs_savename.load_offset = 0;  /* load save at offset 0 */
        Load_Resource_File(&vfs_savename, user_savegame_to_restore);
    } else {
        Load_Resource_File(&vfs_stdply_bin, NULL);
    }

    Load_Resource_File(&vfs_stick_bin, NULL);               /* stick.bin   @ 0x0100 */
    Load_Resource_File(&vfs_game_bin, NULL);                /* game.bin    @ 0xA000 */
    Load_Resource_File(video_drivers_vfs[video_mode], NULL);/* video drv   @ 0x2000 */

    /* Music and SFX drivers go at seg1-relative offsets */
    vfs_music_drv.filename  = g_szMuzicDrv;
    vfs_snd_fx_drv.filename = g_szSoundFxDrv;
    Load_Resource_File(&vfs_music_drv,   NULL);             /* music drv   @ 0x0100 within seg1 area */
    Load_Resource_File(&vfs_snd_fx_drv,  NULL);             /* sfx drv     @ 0x1100 within seg1 area */

    /* ------------------------------------------------------------------
     * Install interrupt vectors (INT 8, 9, 23, 24, 60, 61) and
     * set up callback pointers in the shared-data area.
     * ------------------------------------------------------------------ */
    install_interrupt_vectors();

    /* ------------------------------------------------------------------
     * Program PIT Timer 0 to ~236.7 Hz
     * ------------------------------------------------------------------ */
    program_pit_timer();

    /* ------------------------------------------------------------------
     * Set the hardware video mode
     * ------------------------------------------------------------------ */
    Set_Video_Mode();

    /* ------------------------------------------------------------------
     * Jump into game.bin at offset game_bin_off (0xA000).
     *
     * In the original:  jmp dword ptr cs:game_bin_off
     * which is a far call to game_mem[0xA000].
     * In a DOS port this would be a far call/jump to that address.
     * Here we call a hypothetical trampoline.
     * ------------------------------------------------------------------ */
    printf("[stub] Far jump to game.bin entry at game_mem[0x%04X] "
           "(restore_flag=%d)\n", game_bin_off, restore_on_startup_flag);

    /*
     * typedef void (__far *game_entry_t)(uint8_t restore_flag);
     * game_entry_t entry = (game_entry_t)(game_mem + game_bin_off);
     * entry(restore_on_startup_flag);
     */

    /* On return from the game, call the exit handler with code 0 */
    Handle_Game_Exit(0);
    return 0;  /* unreachable */
}

/* =========================================================================
 * int23_new  –  Ctrl-C / Ctrl-Break handler (IRET stub)
 *
 * Original: a 1-byte IRET.  We handle it in the OS layer by ignoring
 * SIGINT, or by registering a do-nothing signal handler.
 * ========================================================================= */
/* void int23_new(void) { } */
