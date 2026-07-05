/* ============================================================================
 * eai1_data.c - resource/animation-frame tables from eai1.asm
 *
 * Monster_AI (see eai1.c) never reads any of this data directly -- in the
 * original game this whole module was loaded as a binary overlay at segment
 * 0xA000, and the *rendering* code fetched sprite-frame indices from it via
 * the fixed addresses already defined in zeliard.h
 * (ADDR_MONSTER_AI_MOVE_LEFT_FRAMES = 0xA030, ADDR_MONSTER_AI_DEATH_LEFT_FRAMES
 * = 0xA040, etc.) and the "death_descriptors" table via the pointer at
 * 0xA006.
 *
 * I don't know how your renderer expects to reach this data (literal bytes
 * in g_mem at those addresses vs. plain C symbols/pointers), so for now this
 * is just plain C data, laid out in the same order as the original file. If
 * you need it physically present in g_mem at 0xA000.., say so and I'll add
 * an installer that copies it in (note that 0xA000.. is outside the
 * 0x00-0xFF / 0xFF00-0xFFFF ranges that map to g_mem via MEM8/MEM16, so
 * that would need its own mechanism, same as ADDR_MDT/ADDR_PROXIMITY_MAP/etc).
 * ============================================================================
 */

#include <stdint.h>

/* first byte of each frame is a palette variant (see pal_decode_tbl and
 * tile_blit_mode in gfmcga.asm); the remaining 4 are tile indices for the
 * 2x2 tile block making up the sprite frame. */
typedef struct {
    uint8_t palette;
    uint8_t t0, t1, t2, t3;
} MonsterFrame;

/* ---- movement frames (ADDR_MONSTER_AI_MOVE_LEFT_FRAMES / _RIGHT_FRAMES) -- */
// Each frame is 5 bytes (palette variant + 4 tile IDs: tl, tr, bl, br)
static const MonsterFrame bat_fly_left_frames[7] = {
    { 0, 0x19, 0x1A, 0x1B, 0x1C }, /* bat idle        */
    { 0, 0x1D, 0x1E, 0x1F, 0x20 }, /* bat fly SW frame 0 */
    { 0, 0x21, 0x22, 0x23, 0x24 }, /* bat fly SW frame 1 */
    { 0, 0x25, 0x26, 0x27, 0x28 }, /* bat fly SW frame 2 */
    { 0, 0x29, 0x2A, 0x2B, 0x2C }, /* bat fly SW frame 3 */
    { 0, 0x2D, 0x2E, 0x2F, 0x30 }, /* bat fly SW frame 4 */
    { 0, 0x31, 0x32, 0x33, 0x34 }, /* bat fly SW frame 5 */
};

static const MonsterFrame bat_fly_right_frames[7] = {
    { 0, 0x19, 0x1A, 0x1B, 0x1C }, /* bat idle        */
    { 0, 0x35, 0x36, 0x37, 0x38 }, /* bat fly SE frame 0 */
    { 0, 0x39, 0x3A, 0x3B, 0x3C }, /* bat fly SE frame 1 */
    { 0, 0x3D, 0x3E, 0x3F, 0x40 }, /* bat fly SE frame 2 */
    { 0, 0x41, 0x42, 0x43, 0x44 }, /* bat fly SE frame 3 */
    { 0, 0x45, 0x46, 0x47, 0x48 }, /* bat fly SE frame 4 */
    { 0, 0x49, 0x4A, 0x4B, 0x4C }, /* bat fly SE frame 5 */
};

static const MonsterFrame slug_walk_left_frames[4] = {
    { 0, 0x4D, 0x00, 0x4F, 0x50 }, /* slug left frame 0 */
    { 0, 0x51, 0x00, 0x52, 0x53 }, /* slug left frame 1 */
    { 0, 0x54, 0x55, 0x4F, 0x50 }, /* slug left frame 2 */
    { 0, 0x56, 0x57, 0x58, 0x59 }, /* slug left frame 3 */
};

static const MonsterFrame slug_walk_right_frames[4] = {
    { 0, 0x00, 0x5B, 0x5C, 0x5D }, /* slug right frame 0 */
    { 0, 0x00, 0x5E, 0x5F, 0x60 }, /* slug right frame 1 */
    { 0, 0x61, 0x62, 0x5C, 0x5D }, /* slug right frame 2 */
    { 0, 0x63, 0x64, 0x65, 0x66 }, /* slug right frame 3 */
};

static const MonsterFrame frog_jump_left_frames[7] = {
    { 0, 0x75, 0x76, 0x77, 0x78 },
    { 0, 0x75, 0x76, 0x79, 0x78 },
    { 0, 0x7A, 0x7B, 0x7C, 0x7D },
    { 0, 0x7E, 0x7B, 0x7F, 0x80 },
    { 0, 0x81, 0x82, 0x83, 0x84 },
    { 0, 0x85, 0x86, 0x87, 0x88 },
    { 0, 0x89, 0x8A, 0x8B, 0x8C },
};

static const MonsterFrame frog_jump_right_frames[7] = {
    { 0, 0x8D, 0x8E, 0x8F, 0x90 },
    { 0, 0x8D, 0x8E, 0x8F, 0x91 },
    { 0, 0x92, 0x93, 0x94, 0x95 },
    { 0, 0x92, 0x96, 0x97, 0x98 },
    { 0, 0x99, 0x9A, 0x9B, 0x9C },
    { 0, 0x9D, 0x9E, 0x9F, 0xA0 },
    { 0, 0xA1, 0xA2, 0xA3, 0xA4 },
};

static const MonsterFrame rat_run_left_frames[6] = {
    { 0, 0x67, 0x68, 0x69, 0x6A },
    { 0, 0x6B, 0x6C, 0x6D, 0x6E },
    { 0, 0x6F, 0x70, 0x71, 0x72 },
    { 0, 0x73, 0x74, 0xE0, 0xE1 },
    { 0, 0xF2, 0xF3, 0xF4, 0xF5 },
    { 0, 0xF6, 0xF7, 0xF4, 0xF5 },
};

static const MonsterFrame rat_run_right_frames[6] = {
    { 0, 0xE2, 0xE3, 0xE4, 0xE5 },
    { 0, 0xE6, 0xE7, 0xE8, 0xE9 },
    { 0, 0xEA, 0xEB, 0xEC, 0xED },
    { 0, 0xEE, 0xEF, 0xF0, 0xF1 },
    { 0, 0xF2, 0xF3, 0xF4, 0xF5 },
    { 0, 0xF6, 0xF7, 0xF4, 0xF5 },
};

/* ---- death frames (ADDR_MONSTER_AI_DEATH_LEFT_FRAMES / _RIGHT_FRAMES) ---- */
/* Same tables are used for both the left and right slots in the original
 * resource table (A040 and A080 both point at these same 4 labels). */

static const MonsterFrame bat_death_frames[3] = {
    { 0, 0xA5, 0xA6, 0xA7, 0xA8 },
    { 0, 0xA9, 0xAA, 0xAB, 0xAC },
    { 0, 0xAD, 0xAE, 0xAF, 0xB0 },
};

static const MonsterFrame slug_death_frames[3] = {
    { 0, 0xB1, 0xB2, 0xB3, 0xB4 },
    { 0, 0xB5, 0xB6, 0xB7, 0xB8 },
    { 0, 0xB9, 0xBA, 0xBB, 0xBC },
};

static const MonsterFrame frog_death_frames[3] = {
    { 0, 0xBD, 0xBE, 0xBF, 0xC0 },
    { 0, 0xC1, 0xC2, 0xC3, 0xC4 },
    { 0, 0x00, 0x00, 0xC7, 0xC8 },
};

static const MonsterFrame rat_death_frames[3] = {
    { 0, 0xF8, 0xF9, 0xFA, 0xFB },
    { 0, 0xFC, 0xFD, 0x5A, 0x4E },
    { 0, 0x00, 0x00, 0xC5, 0xC6 },
};

/* ---- misc item/effect frames (ADDR_MONSTER_AI_ITEM_ANIMATION_*_FRAMES,
 * ADDR_MONSTER_AI_POTIONS_*_FRAMES) -- shared (left/right identical in the
 * original resource table) ---------------------------------------------- */

static const MonsterFrame hit_frames[3] = {
    { 1, 0x01, 0x02, 0x03, 0x04 },
    { 1, 0x05, 0x06, 0x07, 0x08 },
    { 1, 0x09, 0x0A, 0x0B, 0x0C },
};

static const MonsterFrame almas_glow_frames[4] = {
    { 0, 0x0D, 0x0E, 0x0F, 0x10 },
    { 0, 0x11, 0x12, 0x13, 0x14 },
    { 0, 0x15, 0x16, 0x17, 0x18 },
    { 0, 0x11, 0x12, 0x13, 0x14 },
};

static const MonsterFrame almas_glow_frames_alt[4] = {
    { 2, 0x0D, 0x0E, 0x0F, 0x10 },
    { 2, 0x11, 0x12, 0x13, 0x14 },
    { 2, 0x15, 0x16, 0x17, 0x18 },
    { 2, 0x11, 0x12, 0x13, 0x14 },
};

static const MonsterFrame chest_frames[2] = {
    { 0, 0xC9, 0xCA, 0xCB, 0xCC },
    { 0, 0xC9, 0xCA, 0xCB, 0xCC },
};

static const MonsterFrame ordinary_key_frames[1] = {
    { 1, 0xCD, 0xCE, 0xCF, 0xD0 },
};

static const MonsterFrame red_potion_frames[1] = {
    { 0, 0xD1, 0xD2, 0xD3, 0xD4 },
};

static const MonsterFrame blue_potion_frames[1] = {
    { 2, 0xD1, 0xD2, 0xD3, 0xD4 },
};

static const MonsterFrame wall_destruction_frames[4] = {
    { 1, 0xD5, 0xD5, 0xD5, 0xD5 },
    { 1, 0xD6, 0xD7, 0xD8, 0xD9 },
    { 1, 0xDA, 0xDB, 0xDC, 0xDD },
    { 1, 0x00, 0x00, 0xDE, 0xDF },
};

/* ---- per-monster-type misc tables from the eai1 header block (offsets
 * 0xA008 and 0xA010), indexed the same way as Monster_AI's switch:
 * 0=Bat, 1=Slug, 2=Frog, 3=Rat. Exact meaning is not used by Monster_AI
 * itself and is inferred from context only -- treat names as placeholders. */
static const uint8_t eai1_table_A008[4] = { 3, 2, 5, 3 };
static const uint8_t eai1_table_A010[4] = { 5, 5, 0x0F, 8 };

/* ---- death descriptors (ADDR pointed to by the word at eai1+0x06) ------- */

typedef struct {
    uint8_t a, b, c, d;
} DeathDescriptor;

static const DeathDescriptor bat_death_desc      = { 5, 0, 0, 0 };
static const DeathDescriptor slug_death_desc     = { 5, 4, 4, 0 };
static const DeathDescriptor frog_rat_death_desc = { 4, 0, 4, 0 };

/* Indexed in the *original* (non-Monster_AI-switch) order: */
static const DeathDescriptor *const death_descriptors[4] = {
    &slug_death_desc,
    &frog_rat_death_desc,
    &frog_rat_death_desc,
    &bat_death_desc,
};
