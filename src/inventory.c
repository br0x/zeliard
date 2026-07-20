#include <stdint.h>
#include <string.h>
#include "zeliard.h"

/* 
 * inventory.c -- Inventory / Select-Magic-Wearables-Items screen
 *
 * Literal translation of SELECT.ASM.
 *
 * TRANSLATION NOTES (please read):
 *
 * 1. Blocking input-wait loops (wait_up_down_release, the loc_A0D8/
 *    loc_A2C7-style polling loops, the frame_timer delay in
 *    item_exit_inventory, ...) are translated as literal C busy loops,
 *    exactly mirroring the original 8086 code, per your instruction --
 *    you're integrating these with your own yield/Asyncify mechanism.
 *
 * 2. The control flow of Inventory_Screen (tab switching between
 *    MAGIC / WEAR / USE, left-right item navigation, the secret
 *    level/exp overlay, and the "use item" dispatch) is one single
 *    tangled graph in the original -- IDA only *looks* like it split
 *    it into several procs, but they all jump into each other with
 *    plain JMP (not CALL), sharing locals. I kept that as ONE C
 *    function (Inventory_Screen_Core) using goto/labels named after
 *    the original loc_XXXX labels, so it can be diffed 1:1 against
 *    the disassembly. The genuine CALL/RETN subroutines (drawing
 *    helpers, panel renderers, etc.) are ordinary C functions.
 *
 * 3. UNRESOLVED SAVEGAME ADDRESSES -- IMPORTANT:
 *    zeliard.h does not define storage for the following variables
 *    referenced by select.asm. I could not find them elsewhere, so
 *    I've placed them in previously-unused gaps of the savegame
 *    layout implied by zeliard.h. These are PLACEHOLDERS -- please
 *    verify/correct them against your real savegame layout before
 *    relying on this file:
 *      - espada_active .. guerra_active  (7 bytes, "is spell N known")
 *      - spells_espada                   (7 bytes, current use-count/spell)
 *      - espada_count                    (7 bytes, max use-count/spell)
 *      - magic_items                     (5 bytes, consumable item slots)
 *      - shield_max_HP                   (1 word)
 *    One address I *was* able to pin down with confidence:
 *    elf_crest = 0x9A - it sits exactly in the single-byte gap between
 *    ADDR_LION_KEYS_AMOUNT (0x99) and ADDR_CREST_OF_GLORY (0x9B), and
 *    the read order in the asm (elf_crest, crest_of_glory, hero_crest)
 *    matches that address ordering perfectly.
 *
 * 4. External engine primitives (Draw_Bordered_Rectangle_proc,
 *    Render_Font_Glyph_proc, Render_C_String_proc, Render_Sword_Item_
 *    Sprite_20x18_proc, ...) are declared extern here with signatures
 *    inferred from how their registers are loaded at each call site
 *    in the asm. They are presumably implemented in another already-
 *    ported translation unit (they were reached via the CS:20xxh jump
 *    table in the original, i.e. imported from another asm module).
 *
 * 5. Render_String_At_Position / Render_C_String_proc rely on a classic
 *    8086 trick: the string tables are laid out so that after the
 *    first string's NUL terminator, the *next* string begins
 *    immediately in memory, and the callee is expected to leave SI
 *    advanced past the NUL so a second, unprimed call continues
 *    straight into that follow-up text (e.g. "Silkarn" then "shoes").
 *    I reproduced this with C string literals that embed an internal
 *    NUL, e.g. "Silkarn\0      shoes", and pass the iterator by
 *    reference (const char **) so the callee can advance it exactly
 *    like SI was advanced.
 */



/* TODO: map to your Adlib driver's "int 60h" entry point (called with ax=1 on inventory exit, ax elsewhere for sound stop) */
extern void Adlib_Call(uint16_t ax);

/* ---------------------------------------------------------------------
 * Stub declarations for external engine primitives.
 * Called from the literal asm translation but not yet ported to C;
 * empty stubs let the build succeed. The real implementations live in
 * the JS port (game.js / dungeon-screen.js / inventory-screen.js).
 * ------------------------------------------------------------------- */
void Render_Font_Glyph_proc(uint16_t bx, uint8_t cl, uint8_t al, uint8_t ah) { (void)bx; (void)cl; (void)al; (void)ah; }
void Convert_32bit_To_Decimal_Digits_proc(uint16_t dx, uint16_t ax, uint8_t *buffer) { (void)dx; (void)ax; (void)buffer; }
void Render_Decimal_Digits_proc(uint8_t *di, uint16_t position, uint8_t stride) { (void)di; (void)position; (void)stride; }
extern void Confirm_Exit_Dialog_proc(void);
extern void Handle_Pause_State_proc(void);
extern void Handle_Speed_Change_proc(void);
void Joystick_Calibration_proc(void) { }
void Joystick_Deactivator_proc(void) { }
void Capture_Screen_Rect_to_seg3_proc(uint16_t seg, uint16_t off, uint16_t size) { (void)seg; (void)off; (void)size; }
void Put_Image_proc(uint16_t seg, uint16_t off, uint16_t size) { (void)seg; (void)off; (void)size; }
void Render_Magic_Potion_Item_Sprite_16x16_proc(uint8_t item_id, uint16_t bx) { (void)item_id; (void)bx; }
void Draw_Status_Frame_proc(uint16_t bx, uint8_t al) { (void)bx; (void)al; }
void Render_Wearable_Item_Sprite_16x16_proc(uint8_t item_id, uint16_t bx) { (void)item_id; (void)bx; }
void Render_Sword_Item_Sprite_20x18_proc(uint8_t sword_type, uint16_t pos) { (void)sword_type; (void)pos; }
void Render_C_String_proc(const char **s, uint16_t pos, uint8_t attr) { (void)s; (void)pos; (void)attr; }
void Render_Shield_Item_Sprite_16x16_proc(uint8_t shield_type, uint16_t pos) { (void)shield_type; (void)pos; }
void Render_Key_Item_Sprite_16x16_proc(uint8_t key_type, uint16_t pos) { (void)key_type; (void)pos; }
void Render_Crest_Item_Sprite_16x16_proc(uint8_t crest_type, uint16_t pos) { (void)crest_type; (void)pos; }
void Render_Magic_Spell_Item_Sprite_16x16_proc(uint8_t spell_id, uint16_t pos) { (void)spell_id; (void)pos; }
void Print_Magic_Left_Decimal_proc(void) { }
void Print_ShieldHP_Decimal_proc(void) { }
void Fade_To_Black_Dithered_proc(void) { }

/* ---------------------------------------------------------------------
 * Input helpers (int 61h in the original returned AH=alt/space,
 * AL=dirs; those live at fixed savegame-area addresses per zeliard.h)
 * ------------------------------------------------------------------- */
static inline uint8_t read_dirs(void)     { return MEM8(ADDR_INPUT_DIRS); }
static inline uint8_t read_altspace(void) { return MEM8(ADDR_INPUT_ALT_SPACE); }

/* ---------------------------------------------------------------------
 * String data
 * ------------------------------------------------------------------- */
static const char aNothing[] = "NOTHING";
static const char aNoUse[]   = "NO USE";
static const char aIHaveUsed[] = "I have used";

/* magic_names_table: single-line names, indexed by (spell_id - 1) */
static const char *const magic_names_table[7] = {
    "Espada", "Saeta", "Fuego", "Lanzar", "Rascar", "Agua", "Guerra"
};

/* wearable_names_table: indexed by accessory id (0 = NO USE).
 * Two-line blobs: base name, embedded NUL, then the "shoes"/"cape" line,
 * reproducing the SI-falls-through-to-next-string trick. */
static const char *const wearable_names_table[6] = {
    "NO USE",
    "Feruza\0      shoes",
    "Pirika\0      shoes",
    "Silkarn\0      shoes",
    "Ruzeria\0      shoes",
    "Asbestos\0       cape",
};

/* item_names_table: indexed directly by selected_item_index (0 = NO USE). */
static const char *const item_names_table[9] = {
    "NO USE",
    "Ken'ko\0      Potion",
    "Juu-en \0       Fruit",
    "Elixir\0    of Kashi",
    "Chikara\0      Powder",
    "Magia Stone\0",
    "Holy Water\0    of Acero",
    "Sabre Oil\0",
    "Kioku\0     feather",
};

/* item_use_text_table: full sentence, indexed by (selected_item_index - 1) */
static const char *const item_use_text_table[8] = {
    "a Ken'ko Potion.",
    "a Juu-en Fruit.",
    "an Elixir of Kashi.",
    "some Chikara Powder.",
    "a Magia Stone.",
    "some Holy Water of Acero.",
    "some Sabre Oil.",
    "a Kioku feather.",
};

/* sword_names_table / shield_names_table: indexed by (type - 1), two-line blobs */
static const char *const sword_names_table[6] = {
    "Training\0     Sword",
    "Wise man's\0      Sword",
    "Spirit\0    Sword",
    "Knight's\0    Sword",
    "Illumination\0       Sword",
    "Enchantment\0       Sword",
};

static const char *const shield_names_table[6] = {
    "Clay\0     Shield",
    "Wise Man's\0      Shield",
    "Stone\0     Shield",
    "Honor\0     Shield",
    "Light\0     Shield",
    "Titanium\0      Shield",
};

/* HP restored per shield-repair-item use, indexed by (shield_type - 1) */
static const uint16_t shield_hp_values[6] = { 0x50, 0x5A, 0x64, 0x6E, 0x73, 0x78 };

/* the four bordered rectangles drawn behind the tab labels at screen entry */
static const uint16_t menu_border_rects[4][2] = {
    { 0x0C0E, 0x3833 },
    { 0x0C3F, 0x2230 },
    { 0x0C6D, 0x2230 },
    { 0x2D3F, 0x175E },
};

typedef struct { uint16_t bx; uint8_t cl; const char *str; } MenuLabelEntry;
static const MenuLabelEntry menu_labels[4] = {
    { 0x0034, 0x12, "SELECT-MAGIC:" },
    { 0x0034, 0x43, "WEAR:" },
    { 0x0034, 0x71, "USE:" },
    { 0x00B8, 0x43, "INVENTORY" },
};

/* ---------------------------------------------------------------------
 * select-segment local state (file-scope statics in the original)
 * ------------------------------------------------------------------- */
static uint8_t inventory_mode;          /* 0 = normal, 0xFF = "full" entry point */
static uint8_t current_tab;             /* 0=magic 1=wear 2=use */
static uint8_t active_magic_count;
static uint8_t selected_magic_index;
static uint8_t active_wearable_count;
static uint8_t selected_wearable_index;
static uint8_t active_item_count;
static uint8_t selected_item_index;
static uint8_t current_item_for_use;
static uint8_t exit_pending_flag_inv;
static uint8_t screen_backed_up_flag;

static uint8_t spells_active[7];
static uint8_t wearables[6];
static uint8_t active_items_buffer[6];

/* ---------------------------------------------------------------------
 * Render_String_At_Position -- genuine local subroutine (proc/endp with
 * real CALL/RETN in the original), so translated as a normal function.
 * ------------------------------------------------------------------- */
void Render_String_At_Position(const char **s, uint16_t bx, uint8_t cl, uint8_t ah)
{
    for (;;) {
        uint8_t al = (uint8_t)**s;
        (*s)++;
        if (al == 0) return;
        if (ah != 1) {
            Render_Font_Glyph_proc((uint16_t)(bx + 1), (uint8_t)(cl + 1), al, 5);
        }
        Render_Font_Glyph_proc(bx, cl, al, ah);
        bx = (uint16_t)(bx + 8);
    }
}

/* ---------------------------------------------------------------------
 * Render_Decimal_Number
 * ------------------------------------------------------------------- */
static uint8_t decimal_digits_buffer[7];

static void Render_Decimal_Number(uint16_t ax_value, uint8_t digit_count, uint8_t stride, uint16_t position)
{
    uint16_t dx_hi_zeroed = (uint16_t)(position & 0x00FF); /* xor dl,dl -- only low byte cleared, faithfully preserved */
    Convert_32bit_To_Decimal_Digits_proc(dx_hi_zeroed, ax_value, decimal_digits_buffer);
    uint8_t *di = decimal_digits_buffer + (7 - digit_count);
    Render_Decimal_Digits_proc(di, position, stride);
}

/* ---------------------------------------------------------------------
 * Render_Menu_Labels
 * ------------------------------------------------------------------- */
static void Render_Menu_Labels(void)
{
    for (uint8_t i = 0; i < 4; i++) {
        uint8_t ah_mode = (current_tab == i) ? 2 : 3;
        const char *s = menu_labels[i].str;
        Render_String_At_Position(&s, menu_labels[i].bx, menu_labels[i].cl, ah_mode);
    }
}

/* ---------------------------------------------------------------------
 * Check_Enter_Pressed / Check_Menu_Exit
 * ------------------------------------------------------------------- */
static uint8_t Check_Enter_Pressed(void)
{
    return (MEM16(ADDR_F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter) & 1) ? 1 : 0;
}

static uint8_t Check_Menu_Exit(void)
{
    Confirm_Exit_Dialog_proc();
    Handle_Pause_State_proc();
    Handle_Speed_Change_proc();
    Joystick_Calibration_proc();
    Joystick_Deactivator_proc();

    if (exit_pending_flag_inv == 0) {
        return Check_Enter_Pressed();
    }
    if (Check_Enter_Pressed()) {
        return 1;
    }
    exit_pending_flag_inv = 0;
    return 0;
}

/* ---------------------------------------------------------------------
 * Screen backup / restore (used for the transient "item usage" popup
 * and the secret level/exp overlay)
 * ------------------------------------------------------------------- */
static void Capture_Screen_Backup(void)
{
    if (screen_backed_up_flag != 0) return;
    screen_backed_up_flag = 0xFF;
    Capture_Screen_Rect_to_seg3_proc(0x0643, 0x0000, 0x1C24);
}

static void Restore_Screen_From_Backup(void)
{
    if (screen_backed_up_flag == 0) return;
    screen_backed_up_flag = 0;
    Put_Image_proc(0x0643, 0x0000, 0x1C24);
}

/* ---------------------------------------------------------------------
 * Collect_Active_Items -- compacts the (up to 5) consumable-item
 * savegame slots into active_items_buffer, with slot 0 reserved for
 * "NO USE".
 * ------------------------------------------------------------------- */
static void Collect_Active_Items(void)
{
    active_items_buffer[0] = 0;
    uint8_t cl = 0;
    for (uint8_t i = 0; i < 5; i++) {
        uint8_t v = MEM8(ADDR_MAGIC_ITEMS + i);
        if (v != 0) {
            active_items_buffer[1 + cl] = v;
            cl++;
        }
    }
    active_item_count = (cl == 0) ? 0 : (uint8_t)(cl + 1);
}

/* ---------------------------------------------------------------------
 * Panel renderers
 * ------------------------------------------------------------------- */
static void Render_Items_Panel(void)
{
    if (active_item_count == 0) {
        const char *s = aNothing;
        Render_String_At_Position(&s, 0x54, 0x71, 1);
        return;
    }

    uint16_t bx = 0x0E83;
    for (uint8_t i = 0; i < active_item_count; i++) {
        Render_Magic_Potion_Item_Sprite_16x16_proc(active_items_buffer[i], bx);
        bx = (uint16_t)(bx + 0x0500);
    }

    selected_item_index = 0;
    current_item_for_use = 0;
    if (inventory_mode != 0) return;

    Draw_Status_Frame_proc(0x0E81, 5);
    Draw_Bordered_Rectangle_proc(0x1570, 0x1811, 0);
    const char *s = aNoUse;
    Render_String_At_Position(&s, 0x54, 0x71, 1);
}

static void Render_Wearables_Panel(void)
{
    if (active_wearable_count != 0) {
        uint16_t bx = 0x0E55;
        for (uint8_t i = 0; i < active_wearable_count; i++) {
            Render_Wearable_Item_Sprite_16x16_proc(wearables[i], bx);
            bx = (uint16_t)(bx + 0x0500);
        }
        return;
    }
    const char *s = aNothing;
    Render_String_At_Position(&s, 0x5C, 0x43, 1);
}

/* Genuinely called from outside select.asm (e.g. field equip UI). */
void Render_Selected_Accessory(void)
{
    uint8_t acc = MEM8(ADDR_CURRENT_ACCESSORY);
    uint8_t pos = 0;
    for (uint8_t i = 0; i < 6; i++) {
        if (wearables[i] == acc) { pos = i; break; }
    }
    selected_wearable_index = pos;

    uint16_t bx = (uint16_t)(pos * 0x0500 + 0x0E53);
    Draw_Status_Frame_proc(bx, 5);

    const char *s = wearable_names_table[acc];
    Render_String_At_Position(&s, 0x5C, 0x43, 1);
    Render_String_At_Position(&s, 0x5C, 0x4B, 1);
}

static void Render_Shield_HP_Detail(void)
{
    Draw_Bordered_Rectangle_proc(0x0F61, 0x0808, 0);
    Render_Decimal_Number(MEM16(ADDR_SHIELD_HP), 3, 1, 0x3469 /* TODO verify literal position vs asm */);
}

static void Render_Enchantment_Count(void)
{
    Draw_Bordered_Rectangle_proc(0x0F4E, 0x0808, 0);
    Render_Decimal_Number(MEM8(ADDR_BYTE_E4), 1, 1, 0x3456 /* TODO verify literal position vs asm */);
}

static void Render_Equipment_Panel(void)
{
    if (MEM8(ADDR_SWORD_TYPE) != 0) {
        uint8_t sword = MEM8(ADDR_SWORD_TYPE);
        Render_Sword_Item_Sprite_20x18_proc(sword, 0x174D);
        const char *s = sword_names_table[sword - 1];
        Render_C_String_proc(&s, 0x344E, 0);
        Render_C_String_proc(&s, 0x3456, 0);
        Render_Enchantment_Count();
    }

    if (MEM8(ADDR_SHIELD_TYPE) != 0) {
        uint8_t shield = MEM8(ADDR_SHIELD_TYPE);
        Render_Shield_Item_Sprite_16x16_proc(shield, 0x2E61);
        const char *s = shield_names_table[shield - 1];
        Render_C_String_proc(&s, 0x3461, 0);
        Render_C_String_proc(&s, 0x3469, 0);
        Render_Shield_HP_Detail();
    }

    if (MEM8(ADDR_KEYS_AMOUNT) != 0) {
        Render_Key_Item_Sprite_16x16_proc(0, 0x2E75);
        Render_Font_Glyph_proc(0x00C8, 0x7E, 0x5E, 1);
        Render_Decimal_Number(MEM8(ADDR_KEYS_AMOUNT), 1, 6, 0x347E);
    }

    if (MEM8(ADDR_LION_KEYS_AMOUNT) != 0) {
        Render_Key_Item_Sprite_16x16_proc(1, 0x3A75);
        Render_Font_Glyph_proc(0x00F8, 0x7E, 0x5E, 1);
        Render_Decimal_Number(MEM8(ADDR_LION_KEYS_AMOUNT), 1, 6, 0x407E);
    }

    uint16_t bx = 0x3089;
    for (uint8_t i = 0; i < 3; i++) {
        uint8_t flag = MEM8(ADDR_ELF_CREST + i); /* elf_crest, crest_of_glory, hero_crest */
        if (flag != 0) {
            Render_Crest_Item_Sprite_16x16_proc(i, bx);
        }
        bx = (uint16_t)(bx + 0x0600);
    }
}

static void Render_Magic_Counts_Panel(void)
{
    uint16_t dx = 0x0E2E;
    for (uint8_t n = 0; n < active_magic_count; n++) {
        uint16_t dx0 = dx;
        uint8_t spell_id = spells_active[n];
        uint8_t idx = (uint8_t)(spell_id - 1);
        uint8_t cur = MEM8(ADDR_SPELLS_ESPADA + idx);
        uint8_t max = MEM8(ADDR_ESPADA_COUNT + idx);

        Draw_Bordered_Rectangle_proc(dx0, 0x0508, 0);
        Render_Decimal_Number(cur, 3, 1, dx0);

        uint16_t dx1 = (uint16_t)(dx0 + 9);
        {
            uint16_t p = (uint16_t)(dx1 - 0x0200);
            uint8_t cl = (uint8_t)(p & 0xFF);
            uint16_t bx = (uint16_t)(((uint16_t)(uint8_t)(p >> 8) << 2) + 2);
            Render_Font_Glyph_proc(bx, cl, '(', 4);
        }

        Render_Decimal_Number(max, 3, 4, dx1);

        {
            uint16_t p = (uint16_t)(dx1 + 0x0400);
            uint8_t cl = (uint8_t)(p & 0xFF);
            uint16_t bx = (uint16_t)(((uint16_t)(uint8_t)(p >> 8) << 2) - 1);
            Render_Font_Glyph_proc(bx, cl, ')', 4);
        }

        dx = (uint16_t)(dx0 + 0x0800);
    }
}

static void Render_Magics_Panel(void)
{
    if (active_magic_count == 0) {
        const char *s = aNothing;
        Render_String_At_Position(&s, 0x9E, 0x12, 1);
        return;
    }

    uint16_t bx = 0x0E1C;
    for (uint8_t i = 0; i < active_magic_count; i++) {
        Render_Magic_Spell_Item_Sprite_16x16_proc(spells_active[i], bx);
        bx = (uint16_t)(bx + 0x0800);
    }

    Render_Magic_Counts_Panel();

    uint8_t cur_spell = MEM8(ADDR_CURRENT_MAGIC_SPELL);
    uint8_t pos = 0;
    for (uint8_t i = 0; i < 7; i++) {
        if (spells_active[i] == cur_spell) { pos = i; break; }
    }
    selected_magic_index = pos;

    uint16_t frame_bx = (uint16_t)(((uint16_t)pos << 11) + 0x0E1A);
    Draw_Status_Frame_proc(frame_bx, 5);

    const char *s = magic_names_table[cur_spell - 1];
    Render_String_At_Position(&s, 0x9E, 0x12, 1);
}

/* ---------------------------------------------------------------------
 * Status-frame highlight helpers
 * ------------------------------------------------------------------- */
static void Draw_Magic_Status_Frame(uint8_t al)
{
    uint16_t bx = (uint16_t)(((uint16_t)selected_magic_index << 11) + 0x0E1A);
    Draw_Status_Frame_proc(bx, al);
}

static void Draw_Accessory_Status_Frame(uint8_t al)
{
    uint16_t bx = (uint16_t)(selected_wearable_index * 0x0500 + 0x0E53);
    Draw_Status_Frame_proc(bx, al);
}

static void Draw_Item_Status_Frame(uint8_t al)
{
    uint16_t bx = (uint16_t)(current_item_for_use * 0x0500 + 0x0E81);
    Draw_Status_Frame_proc(bx, al);
}

/* ---------------------------------------------------------------------
 * "Selected X detail" panels -- draw name + sprite, then wait for
 * left/right key release before returning control to the caller.
 * ------------------------------------------------------------------- */
static void Render_Selected_Magic_Detail(void)
{
    uint8_t spell_id = spells_active[selected_magic_index];
    MEM8(ADDR_CURRENT_MAGIC_SPELL) = spell_id;

    Draw_Bordered_Rectangle_proc(0x2711, 0x1009, 0);
    const char *s = magic_names_table[spell_id - 1];
    Render_String_At_Position(&s, 0x9E, 0x12, 1);

    Render_Magic_Spell_Item_Sprite_16x16_proc(spell_id, 0x37A4);
    Print_Magic_Left_Decimal_proc();

    do { } while (read_dirs() & 0x0C); /* wait_left_right_release */
}

static void Render_Selected_Accessory_Detail(void)
{
    uint8_t acc = wearables[selected_wearable_index];
    MEM8(ADDR_CURRENT_ACCESSORY) = acc;

    Draw_Bordered_Rectangle_proc(0x1742, 0x1611, 0);
    const char *s = wearable_names_table[acc];
    Render_String_At_Position(&s, 0x5C, 0x43, 1);
    Render_String_At_Position(&s, 0x5C, 0x4B, 1);

    do { } while (read_dirs() & 0x0C);
}

static void Render_Selected_Item_Detail(void)
{
    uint8_t item_id = active_items_buffer[current_item_for_use];
    selected_item_index = item_id;

    Draw_Bordered_Rectangle_proc(0x1570, 0x1811, 0);
    const char *s = item_names_table[selected_item_index];
    Render_String_At_Position(&s, 0x54, 0x70, 1);
    Render_String_At_Position(&s, 0x54, 0x78, 1);

    do { } while (read_dirs() & 0x0C);
}

/* ---------------------------------------------------------------------
 * Clear_Item_Panel / Render_Item_Usage_Text
 * ------------------------------------------------------------------- */
static void Clear_Item_Panel(void)
{
    Draw_Item_Status_Frame(0);
    Draw_Bordered_Rectangle_proc(0x0E83, 0x1E10, 0);
    if (active_item_count == 0) active_item_count = 1;
    Render_Items_Panel();
    Draw_Item_Status_Frame(2);
}

static void Render_Item_Usage_Text(void)
{
    Capture_Screen_Backup();
    Draw_Bordered_Rectangle_proc(0x0F43, 0x3224, 0xFF);

    const char *s = aIHaveUsed;
    Render_String_At_Position(&s, 0x44, 0x4C, 1);

    uint8_t idx = (uint8_t)(selected_item_index - 1);
    s = item_use_text_table[idx];
    Render_String_At_Position(&s, 0x48, 0x56, 1);
}

/* ---------------------------------------------------------------------
 * Item effects. Return value: 1 = proceed to the shared
 * Render_Item_Usage_Text()/Clear_Item_Panel() epilogue, 0 = the item
 * had no effect and the epilogue for the usage TEXT is skipped (but
 * per the original's shared retn-into-Clear_Item_Panel trick,
 * Clear_Item_Panel() still always runs for these two -- see the
 * dispatcher below).
 * ------------------------------------------------------------------- */
static void item_heal_hp(void)
{
    MEM8(ADDR_SOUND_FX_REQUEST) = 14;
    MEM16(ADDR_HERO_HP) = (uint16_t)(MEM16(ADDR_HERO_HP) + 0x80);
    if (MEM16(ADDR_HERO_HP) >= MEM16(ADDR_HERO_MAX_HP)) {
        MEM16(ADDR_HERO_HP) = MEM16(ADDR_HERO_MAX_HP);
    }
    Draw_Hero_Health();
}

static void item_full_heal(void)
{
    MEM8(ADDR_SOUND_FX_REQUEST) = 14;
    MEM16(ADDR_HERO_HP) = MEM16(ADDR_HERO_MAX_HP);
    Draw_Hero_Health();
}

static uint8_t item_set_espada(void)
{
    MEM8(ADDR_SOUND_FX_REQUEST) = 14;
    if (MEM8(ADDR_CURRENT_MAGIC_SPELL) == 0) return 0;
    uint8_t idx = (uint8_t)(MEM8(ADDR_CURRENT_MAGIC_SPELL) - 1);
    MEM8(ADDR_SPELLS_ESPADA + idx) = MEM8(ADDR_ESPADA_COUNT + idx);
    Print_Magic_Left_Decimal_proc();
    Render_Magic_Counts_Panel();
    return 1;
}

static void item_refresh_all_spells(void)
{
    MEM8(ADDR_SOUND_FX_REQUEST) = 14;
    for (uint8_t i = 0; i < 7; i++) {
        MEM8(ADDR_SPELLS_ESPADA + i) = MEM8(ADDR_ESPADA_COUNT + i);
    }
    Print_Magic_Left_Decimal_proc();
    Render_Magic_Counts_Panel();
}

static void item_spirit_shield(void)
{
    MEM8(ADDR_SOUND_FX_REQUEST) = 14;

    /* Each block: {value, flag, sprite-id 'P', 0,0,0,0}. Semantics of
     * "value"/"flag" are not fully understood from the disassembly
     * alone; translated as a literal byte-for-byte write. */
    uint8_t block[7];

    block[0] = 0x00; block[1] = 0x01; block[2] = 0x50; block[3] = 0; block[4] = 0; block[5] = 0; block[6] = 0;
    for (int i = 0; i < 7; i++) MEM8(ADDR_SPIRIT_SPRITE0 + i) = block[i];

    block[0] = 0x04; block[1] = 0xFF;
    for (int i = 0; i < 7; i++) MEM8(ADDR_SPIRIT_SPRITE1 + i) = block[i];

    block[0] = 0x08; /* flag stays 0xFF */
    for (int i = 0; i < 7; i++) MEM8(ADDR_SPIRIT_SPRITE2 + i) = block[i];

    block[0] = 0x0C; block[1] = 0x01;
    for (int i = 0; i < 7; i++) MEM8(ADDR_SPIRIT_SPRITE3 + i) = block[i];
}

static uint8_t item_repair_shield(void)
{
    MEM8(ADDR_SOUND_FX_REQUEST) = 14;
    if (MEM8(ADDR_SHIELD_TYPE) == 0) return 0;
    uint8_t idx = (uint8_t)(MEM8(ADDR_SHIELD_TYPE) - 1);
    uint16_t hp = (uint16_t)(MEM16(ADDR_SHIELD_HP) + shield_hp_values[idx]);
    if (hp >= MEM16(ADDR_SHIELD_MAX_HP)) hp = MEM16(ADDR_SHIELD_MAX_HP);
    MEM16(ADDR_SHIELD_HP) = hp;
    Print_ShieldHP_Decimal_proc();
    return 1;
}

static void item_enchant_sword(void)
{
    MEM8(ADDR_SOUND_FX_REQUEST) = 14;
    MEM8(ADDR_BYTE_E4) = (uint8_t)(MEM8(ADDR_BYTE_E4) + 1);
    Render_Enchantment_Count();
}

/* forward declaration; defined after Inventory_Screen_Core so it can
 * return out of it directly */
static void item_exit_inventory(void);

/* ---------------------------------------------------------------------
 * Inventory_Screen_Core -- the big tangled control-flow graph.
 * goto labels are named after the original loc_XXXX addresses so this
 * can be diffed against the disassembly.
 * ------------------------------------------------------------------- */
static void Inventory_Screen_Core(void)
{
    uint8_t cl, dirs, saved_dirs, next, i;

    screen_backed_up_flag = 0;

    for (i = 0; i < 4; i++) {
        Draw_Bordered_Rectangle_proc(menu_border_rects[i][0], menu_border_rects[i][1], 0xFF);
    }
    Render_Menu_Labels();

    /* build spells_active[] from the 7 per-spell "known" flags */
    active_magic_count = 0;
    for (uint8_t s = 1; s <= 7; s++) {
        if (MEM8(ADDR_ESPADA_ACTIVE + (s - 1)) != 0) {
            spells_active[active_magic_count++] = s;
        }
    }

    /* build wearables[] from the 5 accessory-owned flags; slot 0 = NO USE */
    wearables[0] = 0;
    cl = 0;
    for (uint8_t s = 1; s <= 5; s++) {
        uint8_t v = MEM8(ADDR_FERUZA_SHOES + (s - 1));
        if (v != 0) {
            wearables[1 + cl] = v;
            cl++;
        }
    }
    active_wearable_count = (cl == 0) ? 0 : (uint8_t)(cl + 1);

    Collect_Active_Items();

    Render_Magics_Panel();
    Render_Wearables_Panel();
    Render_Items_Panel();
    Render_Equipment_Panel();

    exit_pending_flag_inv = Check_Menu_Exit() ? 0xFF : 0;

    /* ---- pick the initial tab (loc_A010 tail, lines ~101-116) ---- */
    cl = 0;
    if (active_magic_count != 0) goto have_tab;
    cl = 1;
    if (active_wearable_count != 0) goto have_tab;
    if (inventory_mode != 0) goto wait_exit_only;
    cl = 2;
    if (active_item_count != 0) goto have_tab;

wait_exit_only:
    while (!Check_Menu_Exit()) { }
    return;

have_tab:
    current_tab = cl;

loc_A0B8:
    switch (current_tab) {
        case 0: goto loc_magic_tab;
        case 1: goto loc_wear_tab;
        default: goto loc_use_tab;
    }

    /* ================= MAGIC TAB ================= */
loc_magic_tab:
    Render_Menu_Labels();
    Draw_Magic_Status_Frame(2);

wait_up_down_release_magic:
    do { dirs = read_dirs(); } while (dirs & 0x03); /* UP|DOWN */

loc_A0D8:
    if (Check_Menu_Exit()) return;
    /* fallthrough to loc_A0DE */

loc_A0DE:
    dirs = read_dirs();
    if ((dirs & 0x0E) == 0) goto loc_A0D8;      /* DOWN|LEFT|RIGHT all clear */
    if ((dirs & 0x0C) != 0) goto loc_A0EB;      /* LEFT or RIGHT */
    goto loc_A190;                               /* must be DOWN */

loc_A0EB:
    if (dirs & 0x04) goto loc_A116;              /* LEFT */
    /* RIGHT */
    next = (uint8_t)(selected_magic_index + 1);
    if ((uint8_t)(active_magic_count - 1) < next) goto loc_A0D8;
    Draw_Magic_Status_Frame(0);
    selected_magic_index++;
    Draw_Magic_Status_Frame(2);
    MEM8(ADDR_SOUND_FX_REQUEST) = 12;
    Render_Selected_Magic_Detail();
    goto loc_A0D8;

loc_A116:
    if (selected_magic_index == 0) goto loc_A0D8;
    Draw_Magic_Status_Frame(0);
    selected_magic_index--;
    Draw_Magic_Status_Frame(2);
    MEM8(ADDR_SOUND_FX_REQUEST) = 12;
    Render_Selected_Magic_Detail();
    goto loc_A0D8;

loc_A190:
    cl = 1;
    if (active_wearable_count != 0) goto loc_A1AA;
    /* original also does "test inventory_mode,0FFh" here but never
     * branches on the result -- dead code, omitted */
    cl = 2;
    if (active_item_count != 0) goto loc_A1AA;
    goto loc_A0D8;

loc_A1AA:
    MEM8(ADDR_SOUND_FX_REQUEST) = 13;
    current_tab = cl;
    Draw_Magic_Status_Frame(5);
    goto loc_A0B8;

    /* ================= WEAR TAB ================= */
loc_wear_tab:
    Render_Menu_Labels();
    Draw_Accessory_Status_Frame(2);

loc_A1C3:
    do { dirs = read_dirs(); } while (dirs & 0x03);

loc_A1C9:
    if (Check_Menu_Exit()) return;
    /* fallthrough */

loc_A1CF:
    dirs = read_dirs();
    if ((dirs & 0x0F) == 0) goto loc_A1C9;
    saved_dirs = dirs;
    if ((dirs & 0x0C) != 0) goto loc_A1DE;
    goto loc_A27D;

loc_A1DE:
    if (dirs & 0x04) goto loc_A209;              /* LEFT */
    next = (uint8_t)(selected_wearable_index + 1);
    if ((uint8_t)(active_wearable_count - 1) < next) goto loc_A1C9;
    Draw_Accessory_Status_Frame(0);
    selected_wearable_index++;
    Draw_Accessory_Status_Frame(2);
    MEM8(ADDR_SOUND_FX_REQUEST) = 12;
    Render_Selected_Accessory_Detail();
    goto loc_A1C9;

loc_A209:
    if (selected_wearable_index == 0) goto loc_A1C9;
    Draw_Accessory_Status_Frame(0);
    selected_wearable_index--;
    Draw_Accessory_Status_Frame(2);
    MEM8(ADDR_SOUND_FX_REQUEST) = 12;
    Render_Selected_Accessory_Detail();
    goto loc_A1C9;

loc_A27D:
    if (saved_dirs & 0x01) { /* UP */
        if (active_magic_count == 0) goto loc_A1C9;
        current_tab = 0;
        goto loc_A2AC;
    }
    /* DOWN */
    if (inventory_mode != 0) goto loc_A1C9;
    if (active_item_count == 0) goto loc_A1C9;
    current_tab = 2;

loc_A2AC:
    MEM8(ADDR_SOUND_FX_REQUEST) = 13;
    Draw_Accessory_Status_Frame(5);
    goto loc_A0B8;

    /* ================= USE TAB ================= */
loc_use_tab:
    Render_Menu_Labels();
    Draw_Item_Status_Frame(2);

loc_A2C1:
    do { dirs = read_dirs(); } while (dirs & 0x03);

loc_A2C7:
    if (Check_Menu_Exit()) return;
    /* fallthrough */

loc_A2CD:
    if (MEM16(ADDR_F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter) == 0x0286) goto loc_A3B7;
    goto loc_A2D8;

loc_A2D8: {
        uint8_t d = read_dirs();
        uint8_t altsp = read_altspace();
        dirs = d;
        if ((altsp & 1) == 0) goto space_pressed;
        goto loc_A40D;
    }

space_pressed:
    if ((dirs & 0x0D) == 0) goto loc_A2C7;      /* UP|LEFT|RIGHT all clear */
    Restore_Screen_From_Backup();
    if ((dirs & 0x0C) != 0) goto loc_A2F2;
    goto loc_A391;

loc_A2F2:
    if (dirs & 0x04) goto loc_A31D;              /* LEFT */
    next = (uint8_t)(current_item_for_use + 1);
    if ((uint8_t)(active_item_count - 1) < next) goto loc_A2C7;
    Draw_Item_Status_Frame(0);
    current_item_for_use++;
    Draw_Item_Status_Frame(2);
    MEM8(ADDR_SOUND_FX_REQUEST) = 12;
    Render_Selected_Item_Detail();
    goto loc_A2C7;

loc_A31D:
    if (current_item_for_use == 0) goto loc_A2C7;
    Draw_Item_Status_Frame(0);
    current_item_for_use--;
    Draw_Item_Status_Frame(2);
    MEM8(ADDR_SOUND_FX_REQUEST) = 12;
    Render_Selected_Item_Detail();
    goto loc_A2C7;

loc_A391:
    cl = 1;
    if (active_wearable_count != 0) goto loc_A3A6;
    cl = 0;
    if (active_magic_count != 0) goto loc_A3A6;
    goto loc_A2C7;

loc_A3A6:
    current_tab = cl;
    MEM8(ADDR_SOUND_FX_REQUEST) = 13;
    Draw_Item_Status_Frame(5);
    goto loc_A0B8;

    /* ---- secret LEVEL/EXP overlay (key-combo triggered) ---- */
loc_A3B7:
    if (screen_backed_up_flag != 0) goto loc_A2C7;
    /* falls into loc_A3C1 */

    Capture_Screen_Backup();
    Draw_Bordered_Rectangle_proc(0x0F43, 0x3224, 0xFF);
    {
        static const char aLevel[] = "LEVEL";
        static const char aExp[]   = "EXP";
        const char *s = aLevel;
        Render_String_At_Position(&s, 0x44, 0x4C, 1);
        Render_Decimal_Number((uint16_t)(MEM8(ADDR_HERO_LEVEL) + 1), 2, 6, 0x2C4C);
        s = aExp;
        Render_String_At_Position(&s, 0x44, 0x56, 1);
        Render_Decimal_Number(MEM16(ADDR_HERO_XP), 5, 6, 0x347E /* TODO verify exact literal, inferred from context */);
    }
    goto loc_A2C7;

    /* ---- "use item" (space pressed) ---- */
loc_A40D:
    if (selected_item_index == 0) goto loc_A2C7;
    /* falls into loc_A417 */

loc_A417: {
        Restore_Screen_From_Backup();

        /* find & consume the (current_item_for_use)-th non-zero slot in magic_items */
        uint8_t ch = 0;
        uint8_t bxi = 0;
        for (;;) {
            if (MEM8(ADDR_MAGIC_ITEMS + bxi) != 0) ch++;
            bxi++;
            if (ch == current_item_for_use + 1) break;
        }
        MEM8(ADDR_MAGIC_ITEMS + (bxi - 1)) = 0;

        Collect_Active_Items();
        MEM8(ADDR_BYTE_FF4B) = selected_item_index;

        switch (selected_item_index) {
            case 1: item_heal_hp(); break;
            case 2: item_full_heal(); break;
            case 3: if (item_set_espada()) Render_Item_Usage_Text(); break;
            case 4: item_refresh_all_spells(); Render_Item_Usage_Text(); break;
            case 5: item_spirit_shield(); Render_Item_Usage_Text(); break;
            case 6: if (item_repair_shield()) Render_Item_Usage_Text(); break;
            case 7: item_enchant_sword(); Render_Item_Usage_Text(); break;
            default: item_exit_inventory(); return;
        }
        Clear_Item_Panel();
        goto loc_A2C7;
    }
}

/* ---------------------------------------------------------------------
 * item_exit_inventory ("Kioku feather" -- leaves the inventory screen
 * entirely). Defined after Inventory_Screen_Core purely for reading
 * order; forward-declared above.
 * ------------------------------------------------------------------- */
static void item_exit_inventory(void)
{
    MEM8(ADDR_SOUND_FX_REQUEST) = 15;
    Render_Item_Usage_Text();
    Clear_Item_Panel();

    MEM8(ADDR_BYTE_FF24) = 8;
    MEM8(ADDR_FRAME_TIMER) = 0;
    while (MEM8(ADDR_FRAME_TIMER) < 120) { } /* literal blocking delay, per your instruction */

    Fade_To_Black_Dithered_proc();
    Adlib_Call(1); /* TODO: map to your Adlib driver's "int 60h, ax=1" entry point */
}

/* ---------------------------------------------------------------------
 * Public entry points
 * ------------------------------------------------------------------- */
void Inventory_Screen(void)
{
    inventory_mode = 0;
    Inventory_Screen_Core();
}

void Inventory_Screen_Full(void)
{
    inventory_mode = 0xFF;
    Inventory_Screen_Core();
}
