#include <stdint.h>
#include <string.h>

#include "zeliard.h"
#include "dungeon.h"


#define ADDR_BYTE_9EED                0x9EED
#define ADDR_BYTE_9EEF                0x9EEF
#define ADDR_BYTE_9EF0                0x9EF0
#define ADDR_BYTE_9EF5                0x9EF5
#define ADDR_MMAN_GRP_INDEX           0x9EF6  // 4 bytes at 0x9EF6..0x9EF9
#define ADDR_BYTE_9EFA                0x9EFA
#define ADDR_BYTE_9EFB                0x9EFB
#define ADDR_EAI_BIN_INDEX            0x9EFE  // byte
#define ADDR_ENP_GRP_INDEX            0x9EFF  // byte
#define ADDR_BYTE_9F00                0x9F00
#define ADDR_BYTE_9F01                0x9F01
#define ADDR_BYTE_9F02                0x9F02
#define ADDR_BYTE_9F07                0x9F07  // byte
#define ADDR_JUMP_HEIGHT_COUNTER      0x9F08
#define ADDR_BYTE_9F09                0x9F09  // vertical scroll offset
#define ADDR_FRAME_TICKS              0x9F0A
#define ADDR_BYTE_9F0B                0x9F0B
#define ADDR_HEIGHT_ABOVE_GROUND      0x9F0C
#define ADDR_JUMP_HEIGHT_INCLUDING_SHOES  0x9F0D  // normally 2, Feruza shoes set to 4
#define ADDR_KNOCKBACK_VECTOR_9F0E    0x9F0E  // word
#define ADDR_KNOCKBACK_VECTOR_9F10       0x9F10  // word
#define ADDR_BYTE_9F14                0x9F14
#define ADDR_AIR_UP_TILE_FOUND        0x9F15
#define ADDR_TICKS                    0x9F16
#define ADDR_BYTE_9F18                0x9F18
#define ADDR_BYTE_9F19                0x9F19
#define ADDR_HERO_X_IN_PROXIMITY_MAP  0x9F1A // word
#define ADDR_DOOR_TARGET_Y            0x9F1C // byte
#define ADDR_DOOR_FEATURES            0x9F1D // byte
#define ADDR_BYTE_9F1E                0x9F1E
#define ADDR_SLIDE_TICKS_REMAINING    0x9F20
#define ADDR_HORIZ_MOVEMENT_ACCUM     0x9F21
#define ADDR_SLIDE_DIRECTION          0x9F22  // 1=right, 2=left
#define ADDR_SLIDE_DIRECTION_LOCK     0x9F23  // 1=right movement
#define ADDR_BYTE_9F24                0x9F24
#define ADDR_TEMPERATURE_TIMER        0x9F25  // temperature_timer
#define ADDR_BYTE_9F26                0x9F26
#define ADDR_BYTE_9F27                0x9F27
#define ADDR_BYTE_9F28                0x9F28
#define ADDR_BYTE_9F29                0x9F29
#define ADDR_BYTE_9F2B                0x9F2B
#define ADDR_BYTE_9F2E                0x9F2E


// Dungeon rendering buffers
// Proximity map bounds
#define PROXIMITY_SIZE            0x900u   // 36*64
#define PROXIMITY_END             (ADDR_PROXIMITY_MAP + PROXIMITY_SIZE)

#define ADDR_DUNGEON_EXIT_FLAG    0xFFE2
#define ADDR_HERO_DEATH_FLAG      0xFFE3

#define ADDR_PENDING_DUNGEON_MAP  0xFFFC
#define ADDR_PENDING_DUNGEON_FLAG 0xFFFD

#define ADDR_NOTIFICATION_MSG_ID  0xFF96
#define ADDR_NOTIFICATION_FLAG    0xFF97


#define PROX_COLS                36
#define DUNGEON_HEIGHT           64
#define VIEW_COLS                28
#define VIEW_ROWS                18


static uint16_t dungeon_map_width;
static uint16_t dungeon_entity_count;

static uint8_t main_update_render_pre(void);
static uint8_t dungeon_render_timing_step(uint8_t invincible);
static void dungeon_update_normal(void);
static void dungeon_update_rope(void);
static void dungeon_finish_normal_frame(void);
static void dungeon_finish_rope_frame(void);
static uint8_t abs_x_to_proximity_rel(uint16_t x, uint16_t *ax_out, uint16_t *bx_out);
static void put_dl_to_proximity_layered(uint8_t tile, uint16_t dst);

static uint8_t jump_height_including_shoes = 2;
uint8_t sword_damages[] = { 1, 2, 4, 8, 32, 127 };
uint8_t byte_98BE[]     = { 2, 4, 8, 16, 32, 64, 255 };

// stub

static void incrementX(uint16_t m) {
    uint16_t ax = MEM16(m+0) + 1; // .currX
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    if (ax >= mapWidth)
        ax -= mapWidth;
    MEM16(m+0) = ax;
    MEM8(m+3) = MEM8(m+3) + 1; // .m_x_rel
}

static void decrementX(uint16_t m) {
    uint16_t ax = MEM16(m+0); // .currX
    MEM16(m+0) = (ax == 0) ? MEM16(ADDR_MAP_WIDTH) - 1 : ax - 1;
    MEM8(m+3) = MEM8(m+3) - 1; // .m_x_rel
}

static void incrementY(uint16_t m) {
    MEM8(m+2) = (MEM8(m+2) + 1) & 0x3F; // .currY
}

static void decrementY(uint16_t m) {
    MEM8(m+2) = (MEM8(m+2) - 1) & 0x3F; // .currY
}

/* ---------- 8 directional move functions ---------- */
// Returns 0xFF on success and 0 on failure
uint8_t move_monster_E(uint16_t m)
{
    if (MEM8(m+3) < 34 && !check_collision_E2(m)) { // .m_x_rel
        incrementX(m);
        return 0xFF;
    }
    return 0;
}

uint8_t move_monster_NE(uint16_t m) {
    if (MEM8(m+3) < 34 && !check_collision_NE2(m)) {
        incrementX(m);
        decrementY(m);
        return 0xFF;
    }
    return 0;
}

uint8_t move_monster_N(uint16_t m) {
    uint8_t x_rel = MEM8(m+3);
    if (x_rel != 0 && x_rel != 35 && !check_collision_N2(m)) {
        decrementY(m);
        return 0xFF;
    }
    return 0;
}

uint8_t move_monster_NW(uint16_t m) {
    if (MEM8(m+3) >= 2 && !check_collision_NW2(m)) {
        decrementX(m);
        decrementY(m);
        return 0xFF;
    }
    return 0;
}

uint8_t move_monster_W(uint16_t m) {
    if (MEM8(m+3) >= 2 && !check_collision_W2(m)) {
        decrementX(m);
        return 0xFF;
    }
    return 0;
}

uint8_t move_monster_SW(uint16_t m) {
    if (MEM8(m+3) >= 2 && !check_collision_SW2(m)) {
        decrementX(m);
        incrementY(m);
        return 0xFF;
    }
    return 0;
}

uint8_t move_monster_S(uint16_t m) {
    uint8_t x_rel = MEM8(m+3);
    if (x_rel != 0 && x_rel != 35 && !check_collision_S2(m)) {
        incrementY(m);
        return 0xFF;
    }
    return 0;
}

uint8_t move_monster_SE(uint16_t m) {
    if (MEM8(m+3) < 34 && !check_collision_SE2(m)) {
        incrementX(m);
        incrementY(m);
        return 0xFF;
    }
    return 0;
}

// Public dispatch tables exported to AI binaries (eai*.bin).
// al = direction index 0-7 (0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE)
// counter-clockwise from East.
// monster_move_in_direction: calls the corresponding move_monster_X.
uint8_t monster_move_in_direction(uint16_t m, uint8_t dir)
{
    switch(dir & 7) {
        case 0: 
            return move_monster_E(m); 
        case 1: 
            return move_monster_NE(m); 
        case 2: 
            return move_monster_N(m); 
        case 3: 
            return move_monster_NW(m); 
        case 4: 
            return move_monster_W(m); 
        case 5: 
            return move_monster_SW(m); 
        case 6: 
            return move_monster_S(m); 
        case 7: 
            return move_monster_SE(m); 
    }
    return 0;
}

// check_collision_E2 / W2 / N2 / S2 / NE2 / SE2 / NW2 / SW2
// Collision detection for a 2×2-tile monster footprint.
//
// Each function checks a set of proximity map tiles in the direction of
// movement. Monster occupies tiles (0,0) and (1,0) (or (0,0),(0,1) for N/S).
// Returns CF=1 if any tile in the 'leading edge' is blocked.
//
// Tile categorization for level 5 (wind-tunnel) caverns:
//   - Airflow category 1 (left-flowing): blocks Westward movement (is_left_airflow).
//   - Airflow category 2 (right-flowing): blocks Eastward movement.
//
// CF detection trick: OR multiple proximity bytes together,
// then 'add al, al' → shifts bit 7 into CF. If any byte had bit 7 set
// (= monster/item marker), CF fires — used as second-layer monster detection.

/* Danger-5 checks for East/West movement in wind-tunnel caverns */
static uint8_t check_collision_E_including_danger5(uint16_t prox_addr)
{
    uint8_t tile = MEM8(prox_addr);
    if (is_blocking(tile)) return 0xFF;        // solid tile -> blocked
    if (MEM8(ADDR_CAVERN_LEVEL) != 5) return 0;       // no possible airflows -> clear
    // left airflow blocks Eastward movement
    return get_airflow_direction(tile) == AIRFLOW_LEFT;
}

static uint8_t check_collision_W_including_danger5(uint16_t prox_addr) {
    uint8_t tile = MEM8(prox_addr);
    if (is_blocking(tile)) return 0xFF;        // solid tile -> blocked
    if (MEM8(ADDR_CAVERN_LEVEL) != 5) return 0;       // no possible airflows -> clear
    // Right airflow blocks Westward movement
    return get_airflow_direction(tile) == AIRFLOW_RIGHT;
}

/* 
 *   Collision routines for a 2x2 monster footprint
 *   Return true (CF=1) if movement is blocked.
 */
// ..~
// x.⭉
// ..⭉
uint8_t check_collision_E2(uint16_t m)
{
    uint8_t y = MEM8(m+2);
    uint8_t x_rel = MEM8(m+3);
    uint16_t di = coords_to_prox_addr(x_rel, y) + 2; // x += 2

    // Leading edge passability
    if (check_collision_E_including_danger5(di))   // (+2, 0)
        return 0xFF;

    di += PROX_COLS;
    wrap_map_from_above(&di);
    if (check_collision_E_including_danger5(di))   // (+2, +1)
        return 0xFF;

    // Monster/item check: bit 7 set on (+2, -1), (+2, 0) or (+2, +1)
    uint8_t markers = MEM8(di);                    // (+2, +1)
    di -= PROX_COLS;
    wrap_map_from_below(&di);
    markers |= MEM8(di);                           // (+2, 0)
    di -= PROX_COLS;
    wrap_map_from_below(&di);
    markers |= MEM8(di);                           // (+2, -1)
    if (markers & 0x80) return 0xFF;

    return 0;
}

// ~.. 
// ~⥲x
// ~⥲.
uint8_t check_collision_W2(uint16_t m)
{
    uint8_t y = MEM8(m+2);
    uint8_t x_rel = MEM8(m+3);
    uint16_t di = coords_to_prox_addr(x_rel, y) - 1; // x--

    if (check_collision_W_including_danger5(di))     // (-1, 0)
        return 0xFF;

    di += PROX_COLS;
    wrap_map_from_above(&di);
    if (check_collision_W_including_danger5(di)) // (-1, +1)
        return 0xFF;

    // Monster/item check: bit 7 set on (-2, -1), (-2, 0), (-2, +1)
    di--; // x--
    uint8_t markers = MEM8(di);                  // (-2, +1)
    di -= PROX_COLS;
    wrap_map_from_below(&di);
    markers |= MEM8(di);                         // (-2, 0)
    di -= PROX_COLS;
    wrap_map_from_below(&di);
    markers |= MEM8(di);                         // (-2, -1)
    if (markers & 0x80) return 0xFF;

    return 0;
}

// ~~~
// .⸛⸛
// .x.
uint8_t check_collision_N2(uint16_t m) {
    uint8_t y = MEM8(m+2);
    uint8_t x_rel = MEM8(m+3);
    uint16_t di = coords_to_prox_addr(x_rel, y);
    di -= PROX_COLS;
    wrap_map_from_below(&di);
    if (is_blocking(MEM8(di)))     // (0, -1)
        return 0xFF;
    if (is_blocking(MEM8(di+1)))   // (+1, -1)
        return 0xFF;

    di -= PROX_COLS;
    wrap_map_from_below(&di);
    // Marker check on (+1, -2), (0, -2), (-1, -2)
    uint8_t markers = MEM8(di-1)
                    | MEM8(di)
                    | MEM8(di+1);
    if (markers & 0x80) return 0xFF;

    return 0;
}

// .x.
// ...
// ~⸛⸛
uint8_t check_collision_S2(uint16_t m) {
    uint8_t y = MEM8(m+2);
    uint8_t x_rel = MEM8(m+3);
    uint16_t di = coords_to_prox_addr(x_rel, y);
    di += PROX_COLS*2; // y+=2
    wrap_map_from_above(&di);
    if (is_blocking(MEM8(di)))     // (0, 2)
        return 0xFF;
    if (is_blocking(MEM8(di+1)))   // (+1, 2)
        return 0xFF;

    // Marker check on (+1, 2), (0, 2), (-1, 2)
    uint8_t markers = MEM8(di-1)
                    | MEM8(di)
                    | MEM8(di+1);
    if (markers & 0x80) return 0xFF;

    return 0;
}

// ~~~
// .○⸛
// x.⸛
uint8_t check_collision_NE2(uint16_t m) {
    uint8_t y = MEM8(m+2);
    uint8_t x_rel = MEM8(m+3);
    uint16_t di = coords_to_prox_addr(x_rel, y) + 2;

    if (is_blocking(MEM8(di)))     // (2, 0)
        return 0xFF;
    uint8_t markers = MEM8(di);
    di -= PROX_COLS;
    wrap_map_from_below(&di);

    if (is_blocking(MEM8(di)))     // (2, -1)
        return 0xFF;
    markers |= MEM8(di);

    if (is_blocking(MEM8(di-1)))   // (1, -1)
        return 0xFF;

    di -= PROX_COLS;
    wrap_map_from_below(&di);

    // Marker check: (+2, 0) | (+2, -1) | (+2, -2) | (+1, -2) | (0, -2)
    markers |= MEM8(di)
            | MEM8(di-1)
            | MEM8(di-2);
    if (markers & 0x80) return 0xFF;

    return 0;
}

// x.~
// ..⸛
// ~⸛⸛
uint8_t check_collision_SE2(uint16_t m) {
    uint8_t y = MEM8(m+2);
    uint8_t x_rel = MEM8(m+3);
    uint16_t di = coords_to_prox_addr(x_rel, y) + 2;
    uint8_t markers = MEM8(di); // (+2, 0)
    di += PROX_COLS;
    wrap_map_from_above(&di);

    if (is_blocking(MEM8(di)))     // (2, 1)
        return 0xFF;
    markers |= MEM8(di);

    di += PROX_COLS;
    wrap_map_from_above(&di);

    if (is_blocking(MEM8(di)))     // (2, 2)
        return 0xFF;
    markers |= MEM8(di);

    if (is_blocking(MEM8(di-1)))   // (1, 2)
        return 0xFF;

    // Marker check: (+2, 0) | (+2, +1) | (+2, +2) | (+1, +2) | (0, +2)
    markers |= MEM8(di-1)
            | MEM8(di-2);
    if (markers & 0x80) return 0xFF;

    return 0;
}

// ~~~
// ~○○
// ~○x
uint8_t check_collision_NW2(uint16_t m) {
    uint8_t y = MEM8(m+2);
    uint8_t x_rel = MEM8(m+3);
    uint16_t di = coords_to_prox_addr(x_rel, y) - 1;

    if (is_blocking(MEM8(di)))     // (-1, 0)
        return 0xFF;
    uint8_t markers = MEM8(di-1);         // (-2, 0)

    di -= PROX_COLS;
    wrap_map_from_below(&di);
    if (is_blocking(MEM8(di)))     // (-1, -1)
        return 0xFF;
    if (is_blocking(MEM8(di+1)))   // (0, -1)
        return 0xFF;
    markers |= MEM8(di-1);                // (-2, -1)

    di -= PROX_COLS;
    wrap_map_from_below(&di);

    // Marker check: (-2, 0) | (-2, -1) | (0, -2) | (-1, -2) | (-2, -2)
    markers |= MEM8(di-1)
            | MEM8(di)
            | MEM8(di+1);
    if (markers & 0x80) return 0xFF;

    return 0;
}

// ~.x
// ~○.
// ~⸛⸛
uint8_t check_collision_SW2(uint16_t m) {
    uint8_t y = MEM8(m+2);
    uint8_t x_rel = MEM8(m+3);
    uint16_t di = coords_to_prox_addr(x_rel, y) - 2;

    uint8_t markers = MEM8(di);               // (-2, 0)

    di += PROX_COLS;
    wrap_map_from_above(&di);
    markers |= MEM8(di);                     // (-2, 1)
    if (is_blocking(MEM8(di+1)))      // (-1, 1)
        return 0xFF;

    di += PROX_COLS;
    wrap_map_from_above(&di);
    if (is_blocking(MEM8(di+1)))      // (-1, 2)
        return 0xFF;
    if (is_blocking(MEM8(di+2)))      // (0, 2)
        return 0xFF;

    // Marker check: (-2, 0) | (-2, +1) | (-1, +2) | (0, +2) | (-2, +2)
    markers |= MEM8(di)
            | MEM8(di+1)
            | MEM8(di+2);
    if (markers & 0x80) return 0xFF;

    return 0;
}

// Return true (CF=1) if movement is blocked.
uint8_t Check_collision_in_direction(uint16_t m, uint8_t dir)
{
    switch (dir & 7)
    {
    case 0:
        return check_collision_E2(m);
    case 1:
        return check_collision_NE2(m);
    case 2:
        return check_collision_N2(m);
    case 3:
        return check_collision_NW2(m);
    case 4:
        return check_collision_W2(m);
    case 5:
        return check_collision_SW2(m);
    case 6:
        return check_collision_S2(m);
    case 7:
        return check_collision_SE2(m);
    }
    return 0;
}

/*
 * Returns 0 (NC, carry clear => false) when the item can be picked up,
 * returns 1 (CF, carry set => true) when misaligned or inactive/tick fails.
 */
int check_monster_aligned_to_hero_and_tick(uint16_t m)
{
    if (MEM8(ADDR_INVINCIBILITY_FLAG) != 0)
        return 1;          /* stc; retn */

    /* ---- Y alignment: check if hero_y_absolute is within 4 specific rows ---- */
    uint8_t ah = MEM8(m+2) + 2; // .currY
    for (int cx = 4; cx != 0; cx--) {
        ah--;
        ah &= 0x3F;
        if (ah == MEM8(ADDR_HERO_Y))
            goto x_check;
    }
    /* No Y match -> clear monster's active flag and return CF */
    MEM8(m+7) &= 0x7F;        /* and [si+monster.state_flags], 7Fh */ // .state_flags
    return 1;                      /* stc; retn */

x_check:
    /* ---- X alignment: check if hero_x_in_viewport+4 equals one of 4 offsets ---- */
    uint8_t al = MEM8(ADDR_HERO_X_VIEW) + 4;
    ah = MEM8(m+3) - 3; // .m_x_rel
    for (int cx = 4; cx != 0; cx--) {
        ah++;
        if (ah == al)
            goto flags_check;      /* jz loc_91D1 */
    }
    /* No X match -> clear active flag and return CF */
    MEM8(m+7) &= 0x7F; // .state_flags
    return 1;

flags_check:
    /*
     * At this point the assembly executes:
     *   test [si+monster.state_flags], 80h
     *   clc
     *   jnz loc_91D9
     *   retn
     */
    if (MEM8(m+7) & 0x80) { // .state_flags
        /* Monster is active (bit7 set) -> tick counter and throttle */
        MEM8(m+15)++; // .counter
        if (MEM8(m+15) & 0x07)     /* test [si+monster.counter], 111b */
            return 1;              /* stc (jump to loc_91E3) */
        else
            return 0;              /* NC, retn */
    } else {
        /* Monster inactive (bit7 clear) -> returns NC immediately */
        return 0;
    }
}

// stub
// TODO: signal to js for sword icon drawing
void Render_Sword_Item_Sprite_20x18(uint8_t sword_type)
{
}

// stub
// TODO: signal to js for sword gfx reload
void res_dispatcher_fn4(uint8_t sword_type)
{

}

// stub
void render_cavern_signs(uint16_t info)
{

}

// Checked
void clear_hero_in_viewport()
{
    uint16_t di = ADDR_VIEWPORT_ENTITIES + MEM8(ADDR_HERO_HEAD_Y_VIEW) * 28 + MEM8(ADDR_HERO_X_VIEW);
    for (int i = 0; i < 3; i++) { // hero occupies 3x3 bytes in viewport buffer
        memset(&g_mem[di], 0xFF, 3);
        di += (VIEW_COLS - 3);
    }
}

// Signal game.js to redraw health bar
void Draw_Hero_Health()
{
    MEM8(ADDR_HEALTH_BAR_REQUEST) = 0xFF;
}

// stub, will implement later, when all before projectiles is done
void update_and_render_projectile_row_pair()
{

}

// stub, will implement later
void render_and_collision_pass_row()
{

}

// stub, will implement later, when all before projectiles is done
void update_active_projectiles_render()
{

}

/* 
 * called every frame while sword_swing_flag
 * is set. Reads the current reachability list and marks any live monsters
 * within the hit area by setting ai_flags bits 6 and 0.
 */
// Checked
void apply_sword_hit_to_map_tiles()
{
    if (!MEM8(ADDR_SWORD_SWING_FLAG))
        return;
    if (MEM8(ADDR_IS_BOSS_CAVERN) && MEM8(ADDR_BOSS_BEING_HIT))
        return;

    /* Get hero’s top‑left proximity tile and adjust for squat */
    uint16_t si = hero_coords_to_addr_in_proximity();

    // Subtract 3 or 4 rows
    uint16_t rows = MEM8(ADDR_SQUAT_FLAG) ? 3 : 4;
    si -= (rows * PROX_COLS);
    wrap_map_from_below(&si);

    /* Compute index into the reachability pointer table */
    uint8_t dir = MEM8(ADDR_FACING) & LEFT;
    uint8_t dir16  = dir << 4;                     // dir * 16
    uint8_t sword_hit_type  = MEM8(ADDR_SWORD_HIT_TYPE);    // 0=forward, 1=overhead, 2=down thrust
    uint8_t sword_movement_phase = MEM8(ADDR_SWORD_MOVEMENT_PHASE);
    uint8_t result = dir16;
    switch (sword_hit_type) {
        case 0:  // Forward hit: 6 phases
            result += sword_movement_phase;       //  0..5 (right)  or 16..21 (left)
            break;
        case 1:  // Overhead swing: 4 phases
            result += (sword_movement_phase + 6); //  6..9 (right)  or 22..25 (left)
            break;
        default: // Ground downward thrust: single phase
            result += 10;                         //  10 (right)    or 26 (left)
            break;
    }
    uint16_t idx = result & 0xFE; // zero‑extend to 16‑bit

    // Get the selected reachability list pointer
    uint16_t reach_table = ADDR_REACH_TABLE_SEG1;
    uint16_t list_off = MEM16_1(reach_table + idx); // 0xBxxx

    /* Walk the byte list */
    uint8_t *list_ptr = &g_mem[0x10000 + list_off];

    for (;;) {
        uint8_t offset_byte = *list_ptr++;      // LODSB
        if (offset_byte == 0xFF)                // terminator
            return;

        uint16_t delta = offset_byte;           // zero‑extend to word (AX)
        si += delta;
        wrap_map_from_above(&si);

        uint8_t flags;
        uint16_t monster_struct;
        if (!get_dst_monster_flags(si, &flags, &monster_struct)) continue;
        if (flags & 0x20) continue;
        uint8_t ai_flags = MEM8(monster_struct + 5);
        if (ai_flags & 0x20) continue;

        // Mark hit: keep bits 7‑5, set bit6, set bit0
        MEM8(monster_struct + 5) = (ai_flags & 0xE0) | 0x41;
    }
}

// stub. In web version we don't need Exit feature, - closing the browser tab is enough
void Confirm_Exit_Dialog_proc()
{

}

// stub. Should be handled in game.js (Esc key handler)
void Handle_Pause_State_proc()
{

}

// stub. Should be handled in game.js (F9 key handler)
void Handle_Speed_Change_proc()
{

}

// stub. Already handled by game.js
uint8_t Handle_Restore_Game_proc()
{
    return 0;
}

// stub. Already handled by game.js
void restore_game()
{

}

// Hero death sequence — now a non-blocking state machine.
//  Initialization only; animation is driven by dungeon_update_death_*
//  handlers called from wasm_dungeon_update().
// Checked
void process_hero_death()
{
    Flush_Ui_Element_If_Dirty_proc();
    MEM8(ADDR_SWORD_SWING_FLAG) = 0;
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
    MEM8(ADDR_SQUAT_FLAG) = 0;
    MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
    MEM8(ADDR_INVINCIBILITY_FLAG) = 0xFF;
    MEM8(ADDR_BYTE_9F28) = 0;
    MEM8(ADDR_BYTE_9F29) = 0;
    MEM8(ADDR_HERO_ANIM_PHASE) = 0;
    MEM8(ADDR_ON_ROPE_FLAGS) = 0;
    MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0;
    Draw_Hero_Health();

    // The death animation state machine takes over from here.
    MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_DEATH_FALL;
}

// Runs one sub-step of the dungeon render pipeline during death animation.
// Returns 1 when a full frame is complete, 0 otherwise.
static uint8_t dungeon_death_frame_step(void)
{
    if (MEM8(ADDR_DUNGEON_FRAME_PHASE) == 0) {
        uint8_t invincible = main_update_render_pre();
        if (invincible) {
            MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
        }
        dungeon_render_timing_step(invincible);
        return 0;
    }
    uint8_t invincible = MEM8(ADDR_INVINCIBILITY_FLAG) != 0;
    return dungeon_render_timing_step(invincible);
}

static void dungeon_update_death_fall(void)
{
    if (!dungeon_death_frame_step()) return;

    MEM8(ADDR_HERO_ANIM_PHASE) = 0;
    MEM8(ADDR_ON_ROPE_FLAGS) = 0;
    MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0;

    if (airborne_movement()) {
        MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0;
        MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_DEATH_FLASH;
        MEM8(ADDR_DEATH_PHASE) = 0;
        MEM8(ADDR_DEATH_COUNTER) = 0;
    }
}

static void dungeon_update_death_flash(void)
{
    if (!dungeon_death_frame_step()) return;

    MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0;

    if (MEM8(ADDR_HERO_ANIM_PHASE) == 2) {
        MEM8(ADDR_BYTE_9F29)++;
        if ((MEM8(ADDR_BYTE_9F29) & 0x0F) == 0) {
            MEM8(ADDR_BYTE_FF24) = 8;
            MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_DEATH_FADE;
            MEM8(ADDR_DEATH_PHASE) = 0;
            MEM8(ADDR_DEATH_COUNTER) = 0;
            return;
        }
        if ((MEM8(ADDR_BYTE_9F29) & 1) == 0) return;
        MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0xFF;
        return;
    }

    MEM8(ADDR_BYTE_9F28)++;
    if ((MEM8(ADDR_BYTE_9F28) & 7) != 0) return;

    uint8_t al = (MEM8(ADDR_HERO_ANIM_PHASE) + 1) & 3;
    if (al == 3) return;
    MEM8(ADDR_HERO_ANIM_PHASE) = al;
}

static void dungeon_update_death_fade()
{
    if (!dungeon_death_frame_step()) return;

    uint8_t i = MEM8(ADDR_DEATH_COUNTER);
    MEM8(ADDR_HERO_SPRITE_HIDDEN) = (i & 1) ? 0 : 0xFF;
    MEM8(ADDR_DEATH_COUNTER) = i + 1;

    if (i >= 29) {
        // stop_music();  // int 60h, ax=1
        // Fade_To_Black_Dithered_proc();

        if (MEM8(ADDR_DEATH_ALREADY_PROCESSED) != 0) {
            MEM8(ADDR_LAST_SAGE_VISITED) = 0x80;
        } else {
            uint16_t xp_gain = 127 - MEM8(ADDR_HERO_LEVEL) * 2;
            update_hero_XP(xp_gain);
            MEM8(ADDR_HERO_GOLD_HI) = 0;
            MEM16(ADDR_HERO_GOLD_LO) = 0;
            MEM16(ADDR_HERO_ALMAS) >>= 1;
        }

        MEM16(ADDR_HERO_HP) = MEM16(ADDR_HERO_MAX_HP);
        transit_to_sage();
    }
}

// Resurrection: go to last sage's hut
void transit_to_sage()
{
    MEM8(ADDR_HEARTBEAT_VOLUME) = 0;
    MEM8(ADDR_PLACE_MAP_ID) = MEM8(ADDR_LAST_SAGE_VISITED);

    // Set hero absolute X from tear spawn point
    MEM16(ADDR_HERO_X_IN_PROXIMITY_MAP) = MEM16(ADDR_TEAR_X);

    // Signal game.js to load proper town MDT and init town mode near sage house
    MEM8(ADDR_HERO_DEATH_FLAG) = 0xFF;
    MEM8(ADDR_DUNGEON_EXIT_FLAG) = 0xFF;
    MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_EXIT;
}

// load_place_and_reinit - Called after boss defeat to restore normal cavern state.
//  Called when boss_is_dead fires and the game needs to transition the cavern
//  from boss mode back to post-boss state.
// 
//  1. Load saved monsters AI binary (eai from mdt_descriptor.boss_ai) → 0xA000.
//  2. Load boss enp sprite group (from mdt_descriptor.enp_grp_idx).
//  3. Decompress boss monster tiles.
//  4. Clear is_boss_cavern flag.
//  5. Process optional initializers from MDT (list of word writes).
//  6. Update hero X position, recalculate door tile, call process_doors.
//  7. Reinit cavern display, jump back to Cavern_Game_Init.
// Checked
void load_place_and_reinit(void) {
    if (MEM8(ADDR_INVINCIBILITY_FLAG) != 0) {
        return;
    }

    // Restore original enemy AI binary (eai.bin) from MDT descriptor
    uint16_t si = ADDR_MDT;                     // mdt_buffer
    uint8_t saved_eai_idx = MEM8(si + 6);       // mdt_descriptor.boss_ai
    MEM8(ADDR_EAI_BIN_INDEX) = saved_eai_idx;

    // Load eai<idx>.bin to 0xA000 (where Monster_AI lives)
    // Filename table entry size is 11 bytes (pascal string? but we use C string)
    // char eai_name[12];
    // snprintf(eai_name, sizeof(eai_name), "eai%d.bin", saved_eai_idx);
    // res_dispatcher_proc(3, eai_name, 0xA000);   // fn3_read_virtual_file

    // 2. Restore enemy sprite group (enp.grp) from MDT descriptor
    uint8_t saved_enp_idx = MEM8(si + 7);        // mdt_descriptor.saved_enp_grp_idx
    MEM8(ADDR_ENP_GRP_INDEX) = saved_enp_idx;

    // char enp_name[12];
    // snprintf(enp_name, sizeof(enp_name), "enp%d.grp", saved_enp_idx);
    // load_resource(enp_name, 0x4000);            // fn2_segmented_load -> seg1:4000h (monster_gfx)

    // Decompress monster tile data (256 tiles) to transparency masks buffer (0xA000 in seg1)
    // Original: DS:SI = monster_gfx (0x4000 in seg1), ES:BP = monsters_transparency_masks (0xA000 in seg1), CX = 0x100
    // Decompress_Tile_Data_proc(0x4000, 0xA000, 0x100);

    // 3. Clear boss cavern flag
    MEM8(ADDR_IS_BOSS_CAVERN) = 0;

    // 4. Process optional initializers (address/value pairs) from MDT descriptor+8
    si = ADDR_MDT + 8;
    while (1) {
        uint16_t addr = MEM16(si);
        if (addr == 0xFFFF) break;
        MEM16(addr) = MEM16(si + 2); // 16 bit value
        si += 4;
    }

    // Position and spawn new door
    uint16_t hero_tl = hero_coords_to_addr_in_proximity();  // top‑left hero address
    uint16_t abs_x = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + MEM8(ADDR_HERO_X_VIEW);
    if (MEM8(hero_tl - 5) != 0) {
        abs_x += 9;
    }
    uint16_t map_w = MEM16(ADDR_MAP_WIDTH);
    if (abs_x >= map_w) {
        abs_x -= map_w;
    }
    si = MEM16(ADDR_DOORS_LIST);
    MEM16(si + 0) = abs_x; // door[0].x0
    process_doors();                     // re‑evaluate door collisions
    screen_flash_overlay();
    clear_hero_in_viewport();
    // Render_Viewport_Tiles_proc();
    // Clear_HUD_Bar_proc(2, 28, 0, 0x42);

    // 7. Stop music (int 60h, ax=1)

    // 8. Clear reload flag and restart cavern
    MEM8(ADDR_BYTE_9F1E) = 0;
    Cavern_Game_Init();                  // re‑enter main cavern loop
}

// Checked
void update_hero_XP(uint16_t amount)
{
    uint16_t xp = MEM16(ADDR_HERO_XP);
    if (amount > (uint16_t)(0xFFFF - xp)) {
        xp = 0xFFFF;
    } else {
        xp += amount;
    }
    MEM16(ADDR_HERO_XP) = xp;
}

// Checked
static void hero_got_almas(uint16_t amount)
{
    uint16_t almas = MEM16(ADDR_HERO_ALMAS);
    if (amount > (uint16_t)(0xFFFF - almas)) {
        almas = 0xFFFF;
    } else {
        almas += amount;
    }
    MEM16(ADDR_HERO_ALMAS) = almas;
    Print_Almas_Decimal();
}

//  Opens the inventory/equipment screen when ENTER is pressed.
//  Preconditions: no active spell, no screen effect, not in intro animation.
// 
//  1. Play SFX 11.
//  2. swap_eai_and_inventory_code_regions: XOR-swap 0x800 words between
//     the enemy AI region (0xA000) and inventory region (seg1:0xC000).
//     This temporarily replaces the live AI code with select.bin code.
//  3. Call Inventory_Screen_proc.
//  4. Swap back.
//  5. If byte_FF4B == 8 (save/load from inventory): jmp to resurrection code.
//  6. Reload magic spell sprites, clear viewport, reinit.
// Checked
void bring_inventory_window()
{
    if (MEM8(ADDR_BYTE_9EF5) |
        MEM8(ADDR_SPELL_ACTIVE_FLAG) |
        MEM8(ADDR_BYTE_FF3E) |
        MEM8(ADDR_BYTE_9F26)
    ) return;
    MEM8(ADDR_SOUND_FX_REQUEST) = 11;
    Clear_Viewport_proc();
    // swap_eai_and_inventory_code_regions();
    // Inventory_Screen_proc();
    // swap_eai_and_inventory_code_regions();
    if (MEM8(ADDR_BYTE_FF4B) == 8) // use of Kioku Feather teleports to Muralla sage
        transit_to_sage();

    Clear_Viewport_proc();
    Load_Magic_Spell_Sprite_Group_proc();
    Reassemble_3_Planes_To_Packed_Bitmap_proc(0, 24);
    MEM8(ADDR_BYTE_9EF5) = 0xff;
    clear_viewport_buffer();
    MEM8(ADDR_SPACEBAR_LATCH) = 0;
    MEM8(ADDR_ALTKEY_LATCH) = 0;
    MEM8(ADDR_BYTE_9EEF) = 0;
    MEM8(ADDR_BYTE_9EF0) = 0;
    main_update_render();
}

// ============================================================================
// Vertical Platform helpers
// ============================================================================

// NZ: not a platform; ZF: platform; *dh={1, 0, -1} for {left, mid, right} tile
static uint8_t identify_platform_tile(uint16_t si, uint8_t dl, int8_t *dh)
{
    *dh = 1;
    if (dl == MEM8(si)) return 0;
    (*dh)--;
    dl++;
    if (dl == MEM8(si)) return 0;
    (*dh)--;
    dl++;
    return dl != MEM8(si);
}

// Find platform entry matching hero's position.
// *di: vertical platforms table pointer (updated to found entry)
// dh: hero offset on platform {-1, 0, 1}
// Returns: proximity map address of platform left tile
static uint16_t find_platform_under_hero(uint16_t *di, int8_t dh)
{
    uint16_t abs_x = (uint16_t)(MEM8(ADDR_HERO_X_VIEW) + 4 + dh);
    abs_x += MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    if (abs_x >= mapWidth) abs_x -= mapWidth;

    uint8_t feet_y = (MEM8(ADDR_VIEWPORT_TOP_ROW) + MEM8(ADDR_HERO_HEAD_Y_VIEW) + 3) & 0x3F;

    uint16_t p = *di;
    for (;;) {
        if (MEM16(p + 0) == abs_x && MEM8(p + 2) == feet_y) break;
        p += 3;
    }

    uint16_t rel_ax, rel_bx;
    abs_x_to_proximity_rel(abs_x, &rel_ax, &rel_bx);
    uint16_t prox_addr = coords_to_prox_addr((uint8_t)rel_bx, MEM8(p + 2));

    *di = p;
    return prox_addr;
}

// NC: platform is blocked (returns 0)
// CF: platform successfully moved down (returns 0xFF)
static uint8_t try_move_platform_down(uint16_t di, uint16_t platform_prox, uint8_t dl)
{
    uint16_t bx_save = platform_prox;
    uint16_t si = platform_prox + 36 - 1;
    wrap_map_from_above(&si);
    if (MEM8(si) & 0x80) return 0;

    for (int i = 0; i < 3; i++) {
        si++;
        if (MEM8(si) != 0) return 0;
    }

    si = bx_save + 36;
    wrap_map_from_above(&si);

    for (int i = 0; i < 3; i++) {
        put_dl_to_proximity_layered(dl + i, si + i);
        put_dl_to_proximity_layered(0, bx_save + i);
    }

    MEM8(di + 2) = (MEM8(di + 2) + 1) & 0x3F;
    return 0xFF;
}

// Returns 0xFF on success (platform moved up), 0 otherwise
uint8_t try_move_platform_up()
{
    if (MEM8(ADDR_ON_ROPE_FLAGS)) return 0;

    uint16_t si = hero_coords_to_addr_in_proximity();
    si -= 35;
    wrap_map_from_below(&si);
    if (is_blocking_tile(MEM8(si))) return 0;

    si += 36 * 4;
    wrap_map_from_above(&si);

    int8_t dh;
    uint8_t dl = 0x40;
    if (identify_platform_tile(si, dl, &dh)) return 0;

    uint16_t di = MEM16(ADDR_VERTICAL_PLATFORMS_LIST);
    uint16_t platform_prox = find_platform_under_hero(&di, dh);
    uint16_t saved_prox = platform_prox;

    uint16_t bx = platform_prox - 36;
    wrap_map_from_below(&bx);
    uint16_t si_check = bx - 36;
    wrap_map_from_below(&si_check);

    for (int i = 0; i < 3; i++) {
        if (MEM8(si_check) & 0x80) return 0;
        if (MEM8(bx) != 0) return 0;
        si_check++;
        bx++;
    }

    platform_prox = saved_prox;
    si = platform_prox - 36;
    wrap_map_from_below(&si);

    dl = 0x40;
    for (int i = 0; i < 3; i++) {
        put_dl_to_proximity_layered(dl + i, si + i);
        put_dl_to_proximity_layered(0, platform_prox + i);
    }

    MEM8(di + 2) = (MEM8(di + 2) - 1) & 0x3F;

    MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
    move_hero_up();

    return 0xFF;
}

// stub, will implement later
void Browse_Projectiles()
{

}

// Checked
void clear_viewport_buffer()
{
    memset(&g_mem[ADDR_VIEWPORT_ENTITIES], 0xFD, 28*19);
}

// Checked
void reset_dungeon_state_vars()
{
    MEM8(ADDR_SWORD_SWING_FLAG) = 0;
    MEM8(ADDR_UI_ELEMENT_DIRTY) = 0;
    MEM8(ADDR_SPELL_ACTIVE_FLAG) = 0;
    MEM8(ADDR_SQUAT_FLAG) = 0;
    MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
    MEM8(ADDR_BYTE_9EEF) = 0;
    MEM8(ADDR_BYTE_FF3E) = 0;
    MEM8(ADDR_BYTE_FF4B) = 0;
    MEM8(ADDR_HEARTBEAT_VOLUME) = 0;
    MEM8(ADDR_HERO_ANIM_PHASE) = 0;
    MEM8(ADDR_PROJECTILES_LIST) = 0xFF;
    MEM8(ADDR_BOSS_EXPLOSIONS_LIST) = 0;
    MEM16(ADDR_MAGIC_PROJECTILES) = 0xFFFF;
    MEM8(ADDR_HERO_HIDDEN_FLAG) = 0;
    MEM8(ADDR_BYTE_9EF5) = 0;
    clear_viewport_buffer();
}

// stub. Should be loaded by game.js
void load_mdt()
{

}

// Checked
void remove_accomplished_items()
{
    uint16_t si = MEM16(ADDR_ACHIEVEMENTS_TABLE);
    while (1) {
        uint16_t di = MEM16(si);
        if (di == 0xFFFF) break;
        si += 3;
        if (MEM8(si - 1) & MEM8(di)) { // move_loop
            while (1) {
                di = MEM16(si);
                if (di == 0xFFFF) break;
                MEM16(di) = MEM16(si + 2);
                si += 4;
            }
        } else { // skip_loop
            while (MEM16(si) != 0xFFFF) {
                si += 4;
            }
        }
        si += 2;
    }
}

// Checked
void hero_left_16_down_1()
{
    uint16_t x = MEM16(ADDR_HERO_X_IN_PROXIMITY_MAP);
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = (x < 16 ? x + MEM16(ADDR_MAP_WIDTH) : x) - 16;
    MEM8(ADDR_VIEWPORT_TOP_ROW) = (MEM8(ADDR_DOOR_TARGET_Y) + 1 - 
        MEM8(ADDR_HERO_Y_VIEW_INIT)) & 0x3F;
}

void Render_Roca_Tilemap(uint8_t color_idx)
{
    MEM8(ADDR_ROKA_COLOR) = color_idx;
}

// Checked
void process_mdt_descriptor(uint8_t descr0, uint16_t descr_ptr1)
{
    memmove(&g_mem[ADDR_MMAN_GRP_INDEX], &g_mem[descr_ptr1], 4);
    uint8_t idx = (descr0 >> 1) & 0x0F;
    if (idx != MEM8(ADDR_MSD_INDEX)) {
        MEM8(ADDR_BYTE_FF24) = 10;
        MEM8(ADDR_MSD_INDEX) = idx;
    } else {
        idx = 0xff;
    }
    MEM8(ADDR_BYTE_9EFA) = idx;
    MEM8(ADDR_BYTE_9EFB) = 0xff;
}

// stub. The demo when the hero after defeating the boss gets the next Tear of Esmesanti
void roca_entrypoint()
{

}

// stub. Assets loading should be handled by js
void load_resource(char * filename, int address)
{

}

// stub. Assets loading should be handled by js:
// load dchr.grp
// load mpp{mpp_grp_index}.grp
// load eai{eai_bin_index}.bin
// load enp{enp_grp_index}.grp
// load mgt{mgt_msd_index}.msd
void load_cavern_sprites_ai_music()
{

}

// stub. Clearing the canvas should be handled by js
void Clear_Viewport_proc()
{

}

// stub. Image processing should be handled by js
void Reassemble_3_Planes_To_Packed_Bitmap_proc(uint32_t ptr, uint8_t num_tiles)
{

}

// stub. Assets loading should be handled by js
void Load_Magic_Spell_Sprite_Group_proc()
{

}

// Checked
void edge_locking_scrolling_window()
{
    uint16_t ax = MEM16(ADDR_HERO_X_IN_PROXIMITY_MAP);
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    if (ax > mapWidth - 13) {
        /* right-edge lock */
        MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = mapWidth - 36;
        MEM8(ADDR_HERO_X_VIEW) = (uint8_t)(ax - (mapWidth - 36) - 4);
    } else if (ax < 17) {
        /* left-edge lock */
        MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = 0;
        MEM8(ADDR_HERO_X_VIEW) = (uint8_t)ax - 4;
    } else {
        /* free scroll */
        MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = ax - 17;
        MEM8(ADDR_HERO_X_VIEW) = 13;
    }
}

// stub. Should be handled by js (exit to town)
void swap_to_town_graphics_and_jump()
{

}

// stub. Assets should be loaded by js
void res_dispatcher_proc(char *fname, int address)
{

}

// Checked
void NoOperation_proc()
{
}

// Checked
void wrap_map_from_above(uint16_t *si) {
    if (*si >= PROXIMITY_END) {
        *si -= PROXIMITY_SIZE;
    }
}

// Checked
void wrap_map_from_below(uint16_t *si) {
    if (*si < ADDR_PROXIMITY_MAP) {
        *si += PROXIMITY_SIZE;
    }
}

// Convert (x, y) in proximity coordinates (x 0..35, y 0..63) to address
// Port of original coords_in_ax_to_proximity_map_addr_in_di
// Checked
uint16_t coords_to_prox_addr(uint8_t x, uint8_t y)
{
    y &= 0x3F;
    return ADDR_PROXIMITY_MAP + (uint16_t)(y & 0x3F) * PROX_COLS + x;
}

// Hero's top-left tile address in proximity map (from f_map.inc)
// Use macro MEM to access actual data at this address
// Checked
uint16_t hero_coords_to_addr_in_proximity(void) {
    uint8_t head_y = MEM8(ADDR_HERO_HEAD_Y_VIEW); // =0xa
    uint8_t view_x = MEM8(ADDR_HERO_X_VIEW);
    uint16_t addr = MEM16(ADDR_VIEWPORT_LEFT_TOP) + head_y * 36 + view_x + 4;
    wrap_map_from_above(&addr); // =0xea0c
    return addr; // within 0xe000-0xe8ff =e10c
}

// Move viewport up one row (when hero jumps or climbs)
// Checked
void move_hero_up(void) {
    MEM8(ADDR_VIEWPORT_TOP_ROW)--;
    uint16_t addr = MEM16(ADDR_VIEWPORT_LEFT_TOP);
    addr -= 36;
    wrap_map_from_below(&addr);
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = addr;
}

// Move viewport down one row (when falling)
// Checked
void hero_scroll_down(void) {
    MEM8(ADDR_VIEWPORT_TOP_ROW)++;
    uint16_t addr = MEM16(ADDR_VIEWPORT_LEFT_TOP);
    addr += 36;
    wrap_map_from_above(&addr);
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = addr;
}

// Attempts to grab a rope above the hero and climb up.
// Called from up_pressed.
// Checks the 3 possible hero-relative X positions for a rope tile (tile 0 or 1).
// If found directly above: begins climbing animation — moves hero up row by row
// (calling move_hero_up + main_update_render) until rope is no longer above.
// Sets on_rope_flags = 0xFF.
//  Checked
void try_climb_rope()
{
    uint16_t si;

    // Get hero top-left address in proximity map, then point to hero's head tile
    si = hero_coords_to_addr_in_proximity();
    si++;   // si: hero head tile

    if (!is_over_rope(si)) {
        // Check tile to the left of head
        si--;
        if (is_over_rope(si)) {
            if (MEM8(ADDR_FACING) & LEFT) {
                on_left_pressed();      // move left to center on rope
            }
            return; // facing opposite side
        }

        // Check tile to the right of head
        si += 2;                        // restore head + 1 more = right of head
        if (is_over_rope(si)) {
            if (!(MEM8(ADDR_FACING) & LEFT)) {
                on_right_pressed();     // move right to center on rope
            }
            return; // facing opposite side
        }
        return; // no rope found
    }

    MEM8(ADDR_ON_ROPE_FLAGS) = 0xFF;
    MEM8(ADDR_SQUAT_FLAG) = 0;

    do {
        si = hero_coords_to_addr_in_proximity() - 35; // tile above hero head
        wrap_map_from_below(&si);

        MEM8(ADDR_HERO_ANIM_PHASE)--;

        if (!is_over_rope(si)) {
            MEM8(ADDR_HERO_ANIM_PHASE) |= 1;
            return;
        }

        move_hero_up();
        MEM8(ADDR_RENDER_DONE) = 0;
        MEM8(ADDR_RENDER_REQUEST) = 0xFF;

    } while ((MEM8(ADDR_HERO_ANIM_PHASE) & 1) == 0);
}

// is_blocking_tile family. 
// Original assembly code returns ZF or NZ, we return 0 or nonzero values instead.
// Checked
uint8_t is_blocking_tile(uint8_t tile)
{
    return (tile < 0x40) ? lookup_shared(tile) : 0;
}

// Checked
static uint8_t is_blocking_tile_extended(uint8_t tile) 
{
    return (tile < 0x49) ? lookup_shared(tile) : 0;
}

// Original returns ZF if non-blocking, we will check for 0 on caller side
// Checked
static uint8_t is_blocking_tile_simple(uint8_t tile) 
{
    if (tile < 0x49) {
        for (int i = 0; i < 24; i++) {
            if (tile == MEM8_1(ADDR_PASSABLE_TILES + i)) {
                return 0;
            }
        }
        return (tile & 0x80) != 0x80;
    } else {
        return 0;
    }
}

// we use zero value where original dos version used ZF 
uint8_t is_blocking(uint8_t tile)
{
    if (tile < 0x49) {
        for (int i = 0; i < 24; i++) {
            if (tile == MEM8_1(ADDR_PASSABLE_TILES + i)) {
                return 0; // can pass
            }
        }
        return 0xFF; // cannot pass
    } else {
        return (tile & 0x80); // if monster, cannot pass
    }
}

// Checked
uint8_t lookup_shared(uint8_t tile)
{
    for (int i = 0; i < 24; i++) {
        if (tile == MEM8_1(ADDR_PASSABLE_TILES + i)) {
            return 0;
        }
    }
    uint8_t masked = tile & 0x9F;
    if (masked == 0x90 || masked == 0x91) return 0xff;
    return !(masked & 0x80);
}

// Checked
static uint8_t is_right_airflow(uint8_t tile) {
    if (MEM8(ADDR_CAVERN_LEVEL) == 7) 
        return 0; // level 7, no airflows
    return get_airflow_direction(tile) == AIRFLOW_RIGHT;
}

// original assembly code returns CF as True, NC as False
// Checked
static uint8_t is_left_airflow(uint8_t tile) {
    if (MEM8(ADDR_CAVERN_LEVEL) == 7) 
        return 0; // level 7, no airflows
    return get_airflow_direction(tile) == AIRFLOW_LEFT;
}

// Is input tile an airflow?
// Output: 0xff (no airflow)
//         0 (Up), 1 (Left), 2 (Right)
// Checked
uint8_t get_airflow_direction(uint8_t tile)
{
    if (tile != 0) {
        for (int i = 0; i < 4; i++) {
            uint8_t af = MEM8_1(ADDR_AIRFLOW_TILES + i);
            if (af == 0) 
                break;
            if (tile == af) {
                return AIRFLOW_UP;
            }
        }
        for (int i = 0; i < 4; i++) {
            uint8_t af = MEM8_1(ADDR_AIRFLOW_TILES + 4 + i);
            if (af == 0) 
                break;
            if (tile == af) {
                return AIRFLOW_LEFT;
            }
        }
        for (int i = 0; i < 4; i++) {
            uint8_t af = MEM8_1(ADDR_AIRFLOW_TILES + 8 + i);
            if (af == 0) 
                break;
            if (tile == af) {
                return AIRFLOW_RIGHT;
            }
        }
    }
    return 0xFF;
}

// Reads one byte from the proximity map at [SI].
// If bit 7 is clear: CF=1 (no monster/item).
// If bit 7 is set: the low 7 bits are a monster_index (0-127).
//   Looks up monsters_table_addr + index*16 to get the monster struct.
//   Returns AL = monster.flags, BX = pointer to monster struct.
//   CF (no monster/item) => return 0
//   NC if monster/item; AL = monster.flags => return 0xff
// ===========================================================================
// Checked
uint8_t get_dst_monster_flags(uint16_t si, uint8_t* flags, uint16_t *monster_struct)
{
    uint8_t tile = MEM8(si);
    if ((tile & 0x80) == 0) {
        *flags = tile;
        return 0;
    }

    tile &= 0x7F; // monster id
    uint16_t addr = MEM16(ADDR_MONSTERS_LIST) + tile * 16;
    *monster_struct = addr;
    Monster *m = (Monster *)&g_mem[addr];
    *flags = m->flags;
    return 0xFF;
}

// Return 0 if cannot move right (original assembly returned CF)
// Checked
uint8_t move_hero_right_if_no_obstacles()
{
    uint16_t si = hero_coords_to_addr_in_proximity() + 2;
    uint16_t di = si;
    si -= 36;
    wrap_map_from_below(&si);
    for (int i = 0; i < 4; i++) {
        uint8_t flags;
        uint16_t monster_struct;
        get_dst_monster_flags(si, &flags, &monster_struct);
        if (flags & 0x80) return 0; // destroyable wall to the right of hero, can't move
        si += 36;
        wrap_map_from_above(&si);
    }
    si = di;
    if (MEM8(ADDR_SQUAT_FLAG) == 0) {
        // head level: needs 2 checks
        uint8_t tile = MEM8(si);
        if (is_blocking_tile(tile)) return 0; // blocking tile to the right of hero, can't move
        if (is_left_airflow(tile)) return 0; // left-flow wind blocks right movement
    }
    // head-level checks finished, now body and feet
    for (int i = 0; i < 2; i++) {
        si += 36;
        wrap_map_from_above(&si);
        uint8_t tile = MEM8(si);
        if (is_blocking_tile_simple(tile)) return 0;
        if (is_left_airflow(tile)) return 0;
    }
    hero_moves_right();
    return 0xff;
}

// Return 0 if cannot move left
// Checked
uint8_t move_hero_left_if_no_obstacles()
{
    uint16_t si = hero_coords_to_addr_in_proximity();
    uint16_t di = si;
    si -= 36;
    wrap_map_from_below(&si);
    si--; // tile NW of hero top left
    for (int i = 0; i < 4; i++) {
        uint8_t flags;
        uint16_t monster_struct;
        uint8_t ret = get_dst_monster_flags(si, &flags, &monster_struct);
        if (flags & 0x80) return 0; // destroyable wall to the left of hero, can't move
        si += 36;
        wrap_map_from_above(&si);
    }
    si = di;
    if (MEM8(ADDR_SQUAT_FLAG) == 0) { // not squatting
        // head level: needs 2 checks
        uint8_t tile = MEM8(si);
        if (is_blocking_tile(tile)) return 0;
        if (is_right_airflow(tile)) return 0;
    }
    // head-level checks finished, now body and feet
    for (int i = 0; i < 2; i++) {
        si += 36;
        wrap_map_from_above(&si);
        uint8_t tile = MEM8(si);
        if (is_blocking_tile_simple(tile)) return 0;
        if (is_right_airflow(tile)) return 0;
    }
    hero_moves_left();
    return 0xff;
}

// Checked
void hero_moves_right()
{
    uint16_t left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + 1;
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = left_col;
    left_col += (PROX_COLS - 1);
    if (left_col == mapWidth) {
        packed_map_ptr_for_prox_right = ADDR_PACKED_MAP_END_PTR + 1; // [9F05]<-C01A (ds:[9F05]=D554)
    }
    uint8_t* dest = &g_mem[ADDR_PROXIMITY_MAP];
    memmove(dest, dest + 1, PROX_COLS * DUNGEON_HEIGHT - 1);
    uint16_t si = packed_map_ptr_for_prox_right + 1; // check!!
    uint8_t *di = &g_mem[ADDR_PROXIMITY_MAP + PROX_COLS - 1];
    unpack_column(&si, di);
    packed_map_ptr_for_prox_right = si - 1;
    left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    if (left_col == mapWidth) {
        MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = 0;
        si = ADDR_PACKED_MAP_START;
    } else { // skip column
        si = packed_map_ptr_for_prox_left;
        uint8_t dh = 0;
        do {
            uint8_t tile, count;
            unpack_step_forward(&si, &tile, &count);
            dh += count;
        } while (dh < 64);
    }
    packed_map_ptr_for_prox_left = si;
    every_projectile_moves_left_in_viewport();
    MEM8(ADDR_MONSTER_INDEX) = 0;
    left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + PROX_COLS - 1;
    if (left_col >= mapWidth) {
        left_col -= mapWidth;
    }
    si = MEM16(ADDR_MONSTERS_LIST);
    for(;;) {
        uint16_t currX = MEM16(si + 0);
        if (currX == 0xFFFF) break;
        uint8_t idx = MEM8(ADDR_MONSTER_INDEX);
        if ((currX >> 8) != 0xFF && currX == left_col) {
            uint8_t currY = MEM8(si + 2);
            uint16_t prox = coords_to_prox_addr(35, currY);
            MEM8(prox) = (idx | 0x80);
        }
        MEM8(ADDR_MONSTER_INDEX) = idx + 1;
        si += 16;
    }
}

// Checked
void hero_moves_left()
{
    uint16_t left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) - 1;
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    if (left_col == 0xffff) {
        left_col = mapWidth - 1;
        packed_map_ptr_for_prox_left = MEM16(ADDR_PACKED_MAP_END_PTR);
    }
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = left_col;
    // proximity_map_scrolls_right
    uint8_t* dest = &g_mem[ADDR_PROXIMITY_MAP];
    memmove(dest + 1, dest, PROX_COLS * DUNGEON_HEIGHT - 1);
    uint16_t si = packed_map_ptr_for_prox_left - 1; // check!!
    uint8_t *di = &g_mem[ADDR_PROXIMITY_MAP + PROX_COLS * (DUNGEON_HEIGHT - 1)];
    // fill_column_backward
    unpack_column_backward(&si, di);
    packed_map_ptr_for_prox_left = si + 1;
    si = MEM16(ADDR_PACKED_MAP_END_PTR) - 1;
    left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    if (left_col + PROX_COLS != mapWidth) {
        // skip column
        si = packed_map_ptr_for_prox_right;
        uint8_t dh = 0;
        do {
            uint8_t tile, count;
            unpack_step_backward(&si, &tile, &count);
            dh += count;
        } while (dh < 64);
    }
    packed_map_ptr_for_prox_right = si;
    every_projectile_moves_right_in_viewport();
    MEM8(ADDR_MONSTER_INDEX) = 0;
    // left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    si = MEM16(ADDR_MONSTERS_LIST);
    for(;;) {
        uint16_t currX = MEM16(si + 0);
        if (currX == 0xFFFF) break;
        uint8_t idx = MEM8(ADDR_MONSTER_INDEX);
        if ((currX >> 8) != 0xFF && currX == left_col) {
            uint8_t currY = MEM8(si + 2);
            uint16_t prox = coords_to_prox_addr(0, currY);
            MEM8(prox) = (idx | 0x80);
        }
        MEM8(ADDR_MONSTER_INDEX) = idx + 1;
        si += 16;
    }
}

// stub. Implement later
void every_projectile_moves_left_in_viewport()
{

}

// stub. Implement later
void every_projectile_moves_right_in_viewport()
{

}

// 1.2
// ..3
// ...
// Checked
void hero_interaction_check(void)
{
    if (MEM8(ADDR_SQUAT_FLAG)) return;
    if (MEM8(ADDR_JUMP_PHASE_FLAGS)) return;
    uint16_t si = hero_coords_to_addr_in_proximity();
    uint8_t tile = MEM8(si);
    if (is_blocking_tile(tile) == 0) return;
    si += 2;
    tile = MEM8(si);
    if (is_blocking_tile(tile) == 0) return;
    si += 36;
    wrap_map_from_above(&si);
    tile = MEM8(si);
    if (is_blocking_tile(tile) == 0) {
        hero_moves_right();
    } else {
        hero_moves_left();
    }
}


// ----------------------------------------------------------------------
// Exported WASM functions
// ----------------------------------------------------------------------
// Initialization: unpack full map and setup proximity/viewport
void wasm_dungeon_init(uint8_t map_id) {
    (void)map_id;
    prepare_dungeon();

    MEM8(ADDR_DUNGEON_EXIT_FLAG) = 0;
    if (MEM8(ADDR_DUNGEON_STATE) != DUNGEON_STATE_ROKA_RUN) {
        MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_NORMAL;
    }
    MEM8(ADDR_DUNGEON_FRAME_PHASE) = 0;
    MEM8(ADDR_RENDER_REQUEST) = 0xFF;
    MEM8(ADDR_RENDER_DONE) = 0;
    MEM8(ADDR_DEATH_PHASE) = 0;
    MEM8(ADDR_DEATH_COUNTER) = 0;
    MEM8(ADDR_BOSS_ENCOUNTER_PHASE) = 0;
    MEM8(ADDR_DUNGEON_SUBSTATE) = 0;
    MEM8(ADDR_DUNGEON_SUBSTATE_PHASE) = 0;
}

void prepare_dungeon()
{
    int count = ADDR_BYTE_9F2E - ADDR_BYTE_9EED - 1;
    memset(&g_mem[ADDR_BYTE_9EED], 0, count);
    MEM8(ADDR_BYTE_9EF5) = 0xFF;
    MEM8(ADDR_EAI_BIN_INDEX) = 0xFF;
    MEM8(ADDR_ENP_GRP_INDEX) = 0xFF;
    reset_dungeon_state_vars();
    MEM8(ADDR_SPIRIT_SPRITE0) = 0xFF;
    MEM8(ADDR_SPIRIT_SPRITE1) = 0xFF;
    MEM8(ADDR_SPIRIT_SPRITE2) = 0xFF;
    MEM8(ADDR_SPIRIT_SPRITE3) = 0xFF;
    MEM8(ADDR_HERO_HIDDEN_FLAG) = 0;
    // load 'fman.grp' into fman_gfx -> done in game.js
    // Decompress_Tile_Data_proc(fman_gfx + 0x333, hero_transparency_masks, 230);
    uint16_t mdt_descr = MEM16(ADDR_MDT);
    uint8_t al = MEM8(mdt_descr + 0);
    process_mdt_descriptor(al, mdt_descr+1);
    Clear_Viewport_proc();
    // res_dispatcher_proc("roka.grp", 0x18000);
    Reassemble_3_Planes_To_Packed_Bitmap_proc(0x18000, 0x80);
    Render_Roca_Tilemap(0); // when entering the dungeon from town, always show roka_cyan background
    uint8_t map_id = MEM8(ADDR_PLACE_MAP_ID);
    if ((map_id & 0x80) == 0) {
        remove_accomplished_items();
    }
    roka_run();
    // after_run_animation() is called by the DUNGEON_STATE_ROKA_RUN state handler
}

void roka_run()
{
    MEM8(ADDR_ROKA_PHASE) = 0;
    MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_ROKA_RUN;
    if (MEM8(ADDR_LEFT_RUN)) {
        MEM8(ADDR_FACING) |= LEFT;
    } else {
        MEM8(ADDR_FACING) &= ~LEFT;
    }
}

static void dungeon_update_roka_run(void)
{
    // Pace the animation: only advance one phase every 16 full ticks (~33ms per step,
    // total animation ~1.76s). ADDR_FRAME_TIMER is incremented by dungeonFullTick
    // once per full tick before this function runs.
    if ((MEM8(ADDR_FRAME_TIMER) & 15) != 0) {
        return;
    }
    uint8_t phase = MEM8(ADDR_ROKA_PHASE);
    if (phase >= 25) {
        after_run_animation();
        MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_NORMAL;
        MEM8(ADDR_DUNGEON_FRAME_PHASE) = 0;
        MEM8(ADDR_RENDER_REQUEST) = 0xFF;
        MEM8(ADDR_RENDER_DONE) = 0;
        return;
    }
    MEM8(ADDR_ROKA_PHASE) = phase + 1;
    MEM8(ADDR_HERO_ANIM_PHASE)++;
    MEM8(ADDR_RENDER_DONE) = 0;
    MEM8(ADDR_RENDER_REQUEST) = 0xFF;
}

void wasm_dungeon_update(void)
{
    switch (MEM8(ADDR_DUNGEON_STATE)) {
    case DUNGEON_STATE_ROKA_RUN:
        dungeon_update_roka_run();
        break;
    case DUNGEON_STATE_ROPE:
        dungeon_update_rope();
        break;
    case DUNGEON_STATE_DEATH_FALL:
        dungeon_update_death_fall();
        break;
    case DUNGEON_STATE_DEATH_FLASH:
        dungeon_update_death_flash();
        break;
    case DUNGEON_STATE_DEATH_FADE:
        dungeon_update_death_fade();
        break;
    case DUNGEON_STATE_EXIT:
        return;
    case DUNGEON_STATE_NORMAL:
    default:
        dungeon_update_normal();
        break;
    }
}

void wasm_dungeon_full_tick(void)
{
    MEM8(ADDR_FRAME_TIMER)++;
}

uint8_t wasm_dungeon_get_viewport_top(void) { return MEM8(ADDR_VIEWPORT_TOP_ROW); }
uint16_t wasm_dungeon_get_entity_table(void) { return MEM16(ADDR_MDT + 0x10); }
uint16_t wasm_dungeon_get_entity_count(void) { return dungeon_entity_count; }
uint8_t wasm_dungeon_get_state(void) { return MEM8(ADDR_DUNGEON_STATE); }
uint8_t wasm_dungeon_get_render_request(void) { return MEM8(ADDR_RENDER_REQUEST); }
void wasm_dungeon_clear_render_request(void) {
    MEM8(ADDR_RENDER_REQUEST) = 0;
    MEM8(ADDR_RENDER_DONE) = 0xFF;
}

// Checked
int8_t set_zero_flag_if_slippery(void) {
    if (MEM8(ADDR_CAVERN_LEVEL) == 4 && MEM8(ADDR_CURRENT_ACCESSORY) != ACCESSORY_RUZERIA_SHOES) {
        return 0;
    }
    return 0xff;
}

// Assembly internal route functions / variables


// Handles the jump initiation when UP+button is pressed.
// Increments slide_ticks_remaining (up to 10) while button is held.
//
// On ground:
//   - Checks tile above hero head; if clear, sets jump_phase_flags = 0xFF
//     (ascending), computes initial height_above_ground.
//   - Feruza shoes: height_above_ground starts at 2 (vs 1 normally),
//     allowing 4 vs 2 jump height steps.
//   - If hero head y < 7 (near viewport top), calls move_hero_up instead of
//     decrementing y directly.
// On slope or rope: transitions to descending (jump_phase_flags = 0x7F).
void jump_press_handler()
{
    MEM8(ADDR_SLIDE_TICKS_REMAINING)++;
    if (MEM8(ADDR_SLIDE_TICKS_REMAINING) >= 10) {
        MEM8(ADDR_SLIDE_TICKS_REMAINING) = 10;
    }

    if (MEM8(ADDR_ON_ROPE_FLAGS) != 0) {
        return;
    }

    MEM8(ADDR_SQUAT_FLAG) = 0;

    // If already reached or exceeded max jump height, go to descending
    if (MEM8(ADDR_BYTE_9F09) >= jump_height_including_shoes) {
        MEM8(ADDR_SLOPE_DIRECTION) = 0;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
        return;
    }

    // Check tile above hero's head
    uint16_t tile_ptr = hero_coords_to_addr_in_proximity();
    tile_ptr -= 35;                     // point above hero's head (3x3 matrix, top-left offset)
    wrap_map_from_below(&tile_ptr);
    uint8_t tile_above = MEM8(tile_ptr);

    if (!is_blocking_tile(tile_above)) {
        // Tile is clear - start jump (ascending)
        MEM8(ADDR_HERO_ANIM_PHASE) = 0;
        MEM8(ADDR_FACING) &= ~UP;      // clear Up bit (bit 1)
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0xFF;        // ascending
        MEM8(ADDR_HEIGHT_ABOVE_GROUND) = jump_height_including_shoes >> 1;  // 1 normally, 2 with feruza shoes
        MEM8(ADDR_BYTE_9F09)++;                    // advance jump step counter

        if (MEM8(ADDR_HERO_HEAD_Y_VIEW) >= 7) {
            MEM8(ADDR_HERO_HEAD_Y_VIEW)--;  // simple jump: move up one step
        } else {
            move_hero_up();             // near viewport top, use full move routine
        }
    } else {
        // Tile is blocking
        if (MEM8(ADDR_BYTE_9F09) != 0) {
            // Already mid-jump? Transition to descending
            MEM8(ADDR_SLOPE_DIRECTION) = 0;
            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
            return;
        } else { // idle
            MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
            return;
        }
    }
    return;
}

// stub
void hero_collapse_platform(void) {}

// CF: false (blocked from below), NC: true (can move down)
uint8_t check_floor_for_landing() {
    uint16_t si = hero_coords_to_addr_in_proximity(); // =e10c
    si += 3*36+1;
    wrap_map_from_above(&si);
    uint16_t di = si; // =e179
    uint8_t flags;
    uint16_t monster_struct;
    get_dst_monster_flags(si, &flags, &monster_struct); // check directly below hero feet
    if (flags & 0x80) return 0;
    si--;             // =e178
    get_dst_monster_flags(si, &flags, &monster_struct); // check below hero left side
    if (flags & 0x80) return 0;
    si = di;
    uint8_t tile = MEM8(si);
    if (is_blocking_tile_simple(tile)) {
        return 0;
    }
    if (MEM8(ADDR_HERO_ANIM_PHASE) == 0x80) return 0xff;
    si--;
    tile = MEM8(si);
    if (!is_blocking_tile_simple(tile)) return 0xff;
    si += 2;
    tile = MEM8(si);
    if (is_blocking_tile_simple(tile)) return 0;
    return 0xFF;
}

// Return true to call state_machine_dispatcher, false to skip it
uint8_t land_after_jump()
{
    if ((MEM8(ADDR_JUMP_PHASE_FLAGS) ^ 0x7F) != 0) {
        return 1; // return to main_loop (after call airborne_movement, to state_machine_dispatcher); repeats while idle
    }

    uint8_t old_height = MEM8(ADDR_JUMP_HEIGHT_COUNTER);

    // --- pop ax (discard return address) ---
    // We cannot literally pop the return address in C.
    // Instead, we signal the caller to do the return-skip.
    // Should return to main_loop label (skip state_machine_dispatcher)
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;            // on ground
    MEM8(ADDR_FRAME_TICKS) = 0;
    MEM8(ADDR_JUMP_HEIGHT_COUNTER) = 0;
    MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;

    // test slope_direction, 0FFh ; jz loc_6B6A
    if (MEM8(ADDR_SLOPE_DIRECTION) != 0) {
        return 0;   // to main_loop label
    }

    if (old_height >= 2) {
        MEM8(ADDR_SQUAT_FLAG) = 0xFF; // squat_after_landing_from_big_height:
    }
    return 0;  // to main_loop label
}

// stub
void update_boss_heartbeat_volume(void) {}


/* Converts an absolute map x-coordinate into a column relative to the    */
/* proximity map's left edge (wrapping around the map). Returns:          */
/*   *ax_out = 33 - D                                                     */
/*   *bx_out = D                                                          */
/*   result  = (D > 33)   -- true means "outside the proximity window"    */
static uint8_t abs_x_to_proximity_rel(uint16_t x, uint16_t *ax_out, uint16_t *bx_out)
{
    uint16_t d;
    uint16_t prox_left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);

    if (x >= prox_left) {
        /* case0: proximityLeft <= x < mapWidth */
        d = (uint16_t)(x - prox_left);
    } else if (x > 33) {
        /* case1: 33 < x < proximityLeft */
        d = x;
    } else {
        /* case2: x <= 33 < proximityLeft (wraps around the right edge of the map) */
        d = (uint16_t)(MEM16(ADDR_MAP_WIDTH) - prox_left + x);
    }

    *bx_out = d;
    *ax_out = (uint16_t)(33 - d);
    return d > 33;
}

/* Same shape as abs_x_to_proximity_rel, but first shifts x by +2 (with   */
/* map-width wraparound) and uses a threshold of 37 instead of 33. Used   */
/* to locate/clear the platform's *previous* footprint (which is drawn    */
/* two tiles wider than the platform itself).                             */
static uint8_t horiz_platform_proximity_x_offset(uint16_t x, uint16_t *ax_out, uint16_t *bx_out)
{
    uint16_t xw = (uint16_t)(x + 2);
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    if (xw >= mapWidth) {
        xw = (uint16_t)(xw - mapWidth);
    }

    uint16_t d;
    uint16_t prox_left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);

    if (xw >= prox_left) {
        d = (uint16_t)(xw - prox_left);
    } else if (xw > 37) {
        d = xw;
    } else {
        d = (uint16_t)(mapWidth - prox_left + xw);
    }

    *bx_out = d;
    *ax_out = (uint16_t)(37 - d);
    return d > 37;
}

/* Writes `tile` to the proximity map at `dst`, unless that cell is       */
/* already occupied by a monster (top bit set), in which case the value   */
/* goes into the per-monster "second layer" buffer instead, since the     */
/* proximity map only holds one item per cell.                            */
static void put_dl_to_proximity_layered(uint8_t tile, uint16_t dst)
{
    if ((MEM8(dst) & 0x80) != 0) {
        uint8_t monster_id = (uint8_t)(MEM8(dst) & 0x7F);
        MEM8(ADDR_PROXIMITY_LAYER2 + monster_id) = tile;
    } else {
        MEM8(dst) = tile;
    }
}

/* Returns true if the hero is NOT standing on this platform (matches the */
/* original CF=1 "not applicable" convention), false if the hero IS       */
/* standing on it.                                                        */
// si points to current horizontal platform
static uint8_t hero_on_horiz_platform(uint16_t si)
{
    if ((MEM8(ADDR_JUMP_PHASE_FLAGS) | MEM8(ADDR_ON_ROPE_FLAGS)) != 0) {
        return 1; /* hero airborne / on a rope: platform doesn't apply */
    }

    uint8_t hero_row = (MEM8(ADDR_HERO_HEAD_Y_VIEW) + MEM8(ADDR_VIEWPORT_TOP_ROW) + 3) & 0x3F;
    uint8_t platform_row = MEM8(si+2) & 0x3F; // .y_and_flags
    if (hero_row != platform_row) {
        return 1;
    }

    uint16_t rel_ax, rel_bx;
    if (abs_x_to_proximity_rel(MEM16(si+0) & 0x3FFF, &rel_ax, &rel_bx)) { // .x_and_flags
        return 1;
    }

    uint8_t platform_col = (uint8_t)rel_ax;
    uint8_t hero_col = (uint8_t)(MEM8(ADDR_HERO_X_VIEW) + 4);

    for (int i = 0; i < 3; i++) {
        if (hero_col == platform_col) {
            return 0; /* hero is standing on one of the 3 platform tiles */
        }
        hero_col++;
    }
    return 1;
}

/* `x` is the platform's current (masked) x coordinate, handed to this    */
/* function by its caller (it is never re-loaded from si at entry in the  */
/* original code).                                                        */
static void update_horiz_platform_coords(uint16_t si, uint16_t x)
{
    uint8_t old_y_flags = MEM8(si+2);
    MEM8(si+2) &= 0xBF; /* clear the "paused" bit (bit 6 of .y_and_flags) */

    if (old_y_flags & 0x40) {
        /* Platform was paused; this tick only un-pauses it. */
        return;
    }

    uint16_t new_x;
    uint16_t boundary;
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);

    if (!(MEM8(si+2) & 0x80)) { /* .y_and_flags */
        /* Moving right. */
        new_x = (uint16_t)(x + 1);
        if (new_x == mapWidth) {
            new_x = 0;
        }

        if (!hero_on_horiz_platform(si)) {
            move_hero_right_if_no_obstacles();
        }
        boundary = MEM8(si+5); /* .max_x */
    } else {
        /* Moving left. */
        if (x == 0) {
            new_x = (uint16_t)(mapWidth - 1);
        } else {
            new_x = (uint16_t)(x - 1);
        }

        if (!hero_on_horiz_platform(si)) {
            move_hero_left_if_no_obstacles();
        }
        boundary = MEM8(si+3); /* .min_x */
    }

    /* Store new_x into x_and_flags while preserving the top-2 flag bits. */
    uint8_t old_hi = (uint8_t)(MEM16(si+0) >> 8); /* .x_and_flags */
    uint8_t new_hi = (uint8_t)((old_hi & 0xC0) | (uint8_t)(new_x >> 8));
    MEM16(si+0) = (uint16_t)(((uint16_t)new_hi << 8) | (new_x & 0xFF));

    if (boundary == new_x) {
        MEM8(si+2) ^= 0x80; /* reverse direction, .y_and_flags */
        MEM8(si+2) |= 0x40; /* pause for a few ticks */
    }
}

static void update_slow_horiz_platform_coords(uint16_t si, uint16_t x)
{
    if (MEM8(ADDR_BYTE_9F07) & 1) {
        update_horiz_platform_coords(si, x);
    }
}

typedef void (*horiz_platform_update_fn)(uint16_t, uint16_t);

/* Index 0 (speed_flags==1): slow update (every other tick).
 * Index 1,2 (speed_flags==2,3): normal update (every tick). */
static const horiz_platform_update_fn funcs_8220[3] = {
    update_slow_horiz_platform_coords,
    update_horiz_platform_coords,
    update_horiz_platform_coords,
};

void update_and_render_horiz_platforms()
{
    MEM8(ADDR_BYTE_9F07)++;

    for (uint16_t si = MEM16(ADDR_HORIZ_PLATFORMS_LIST); ; si += 7) {
        uint16_t x_and_flags = MEM16(si+0); /* .x_and_flags */
        if (x_and_flags == 0xFFFF) {
            return; /* end-of-list sentinel */
        }

        uint16_t x = x_and_flags & 0x3FFF;

        /* --- Clear the platform's previous footprint from the proximity map --- */
        uint16_t off_ax, off_bx;
        uint8_t off_cf = horiz_platform_proximity_x_offset(x, &off_ax, &off_bx);

        if (!off_cf) {
            uint16_t d = off_bx;
            uint8_t  count;
            uint8_t  col;
            uint8_t  row = MEM8(si+2); /* .y_and_flags */
            uint16_t di;

            if (d >= 2) {
                uint16_t d2 = (uint16_t)(d - 2);
                if (d2 < 34) {
                    /* Fully inside the visible strip. */
                    count = 3;
                    col = (uint8_t)d2;
                    di = coords_to_prox_addr(col, row);
                } else {
                    /* Straddles the right edge of the strip. */
                    uint16_t rem = (uint16_t)(d2 - 34);
                    di = coords_to_prox_addr(34, row);
                    di += rem;
                    count = (uint8_t)(2 - (uint8_t)rem);
                }
            } else {
                /* Straddles the left edge of the strip. */
                count = (uint8_t)(d + 1);
                di = coords_to_prox_addr(0, row);
            }

            for (uint8_t i = count; i != 0; i--) {
                put_dl_to_proximity_layered(0, di);
                di++;
            }
        }

        /* --- Advance the platform's position/state (if it's time to move) --- */
        uint16_t cur_x = MEM16(si+0) & 0x3FFF; /* .x_and_flags */
        uint8_t speed_flags = (uint8_t)((MEM16(si+0) >> 14) & 3); /* .x_and_flags */
        if (speed_flags != 0) {
            funcs_8220[speed_flags - 1](si, cur_x);
        }

        /* --- Draw the platform at its (possibly new) position --- */
        uint16_t rel_ax, rel_bx;
        if (!abs_x_to_proximity_rel(MEM16(si+0) & 0x3FFF, &rel_ax, &rel_bx)) {  /* .x_and_flags */
            uint16_t di = coords_to_prox_addr((uint8_t)rel_bx, MEM8(si+2)); /* .y_and_flags */
            uint8_t tile = 0x46; /* horizontal platform tiles: 0x46, 0x47, 0x48 */
            for (int i = 0; i < 3; i++) {
                put_dl_to_proximity_layered(tile, di);
                di++;
                tile++;
            }
        }
    }
}

// stub
void render_vertical_platforms_to_proximity() 
{
    uint16_t si = MEM16(ADDR_VERTICAL_PLATFORMS_LIST);
    for (;;) {
        uint16_t x = MEM16(si + 0); // .x
        if (x == 0xFFFF)
            return;
        uint8_t y = MEM8(si + 2); // .y
        uint16_t ax_rel, bx_rel;
        ;
        if (!abs_x_to_proximity_rel(x, &ax_rel, &bx_rel)) {
            uint16_t di = coords_to_prox_addr((uint8_t)bx_rel, y);
            uint8_t tile = 0x40;
            for (int i = 0; i < 3; i++) {
                put_dl_to_proximity_layered(tile, di);
                di++;
                tile++;
            }
        }
        si += 3;
    }
}

// stub
void process_visible_collapsing_platforms(void) {}

/* 
 *
 *  - `calc_object_viewport_x_offset` originally returns its *useful*
 *    result in BX (the on-screen column, later read back as BL), with
 *    AX/CF only used to flag "off the visible 36(+3)-wide window".
 *    I algebraically collapsed the push/pop/xchg shuffling down to the
 *    three cases the comments in the original code already spell out;
 *    the result matches each documented "ax=..." comment exactly.
 */

/* 4 rows x 5 columns of tile indices, selected by door "color" (bits 0-2
 * of d_flags). Byte [2] of each row-0 is patched at runtime with the
 * door's actual color tile before use. */
static uint8_t closed_door_tiles[20] = {
    0x49, 0x4A, 0x61, 0x4B, 0x4C,
    0x4D, 0x4F, 0x50, 0x51, 0x4E,
    0x5F, 0x52, 0x53, 0x54, 0x60,
    0x5F, 0x55, 0x56, 0x57, 0x60
};

static uint8_t opened_door_tiles[20] = {
    0x49, 0x4A, 0x61, 0x4B, 0x4C,
    0x4D, 0x58, 0x00, 0x59, 0x4E,
    0x5F, 0x5A, 0x00, 0x5B, 0x60,
    0x5F, 0x5C, 0x5D, 0x5E, 0x60
};

/* 
 * Computes the door's on-screen column (0..39 visible range) within the
 * 36(+3)-wide viewport, handling a single horizontal map wrap.
 * Return `is offscreen` (mirrors the original carry flag).
 */

static uint8_t calc_object_viewport_x_offset(uint16_t x, uint16_t *col)
{
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    uint16_t x3  = x + 3;
    uint16_t x3w = (x3 >= mapWidth) ? (x3 - mapWidth) : x3;
    uint16_t prox_left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);

    if (x3w >= prox_left) {
        /* normal case: object is at/right of the viewport's left edge */
        *col = (uint16_t)(x3w - prox_left);
        return (*col > 39);
    }

    /* x3w < proximity_map_left_col_x: possibly off the left edge, or the
     * map wraps around so x3w itself is already a valid column */
    if (x3w <= 39) {
        *col = (uint16_t)(mapWidth - prox_left + x3w);
        return (*col > 39);
    }
    *col = x3w;
    return 1;   /* off-screen */
}


/* 
 * Only overwrite the destination tile if it isn't already "occupied"
 * (high bit set == something else already drawn there).
 */
static void move_if_dst_high_bit_zero(uint16_t dst, const uint8_t *src)
{
    if ((MEM8(dst) & 0x80) == 0)
        MEM8(dst) = *src;
}

void process_doors(void)
{
    uint16_t door = MEM16(ADDR_DOORS_LIST);

    for (;;) {
        uint16_t x0 = MEM16(door+0);
        if (x0 == 0xFFFF)      /* end-of-list marker */
            return;

        uint16_t vp_col;
        uint8_t vp_offscreen = calc_object_viewport_x_offset(x0, &vp_col);

        if (!vp_offscreen) {
            uint8_t d_flags = MEM8(door+3);
            uint8_t door_color = (uint8_t)((d_flags & 7) + 0x61);
            closed_door_tiles[2] = door_color;
            opened_door_tiles[2] = door_color;

            uint16_t di = coords_to_prox_addr(0, MEM8(door+2));
            uint8_t  door_col = (uint8_t)vp_col;
            uint8_t  is_open  = (d_flags & 0x80) != 0;
            uint8_t *si;
            uint8_t  col_count;

            if (door_col >= 4) {
                /* door's left edge is fully on screen; clip its right
                 * edge against the right side of the viewport instead */
                col_count = (uint8_t)(40 - door_col);
                if (col_count > 5)
                    col_count = 5;
                di += (door_col - 4);
                si = is_open ? opened_door_tiles : closed_door_tiles;
            } else {
                /* door's left edge is clipped off the left side of the
                 * viewport; start partway into the tile row instead */
                si = is_open ? opened_door_tiles : closed_door_tiles;
                si += (4 - door_col);
                col_count = (uint8_t)(door_col + 1);
            }

            for (int row = 0; row < 4; row++) {
                uint16_t orig_di = di;       // save row‑start destination
                uint8_t *orig_si = si;       // save row‑start source

                for (int col = 0; col < col_count; col++) {
                    move_if_dst_high_bit_zero(di, si);
                    di++;
                    si++;
                }
                di = orig_di + 36;           // next row, same column
                wrap_map_from_above(&di);
                si = orig_si + 5;            // advance source by one tile row
            }
        }

        door += 12;
    }
}

// stub
void dispatch_spell_projectile_movement(void) {}

// stub
void check_hero_contact_damage(void) {}

// stub
void Flush_Ui_Element_If_Dirty_proc()
{

}

// stub
void projectiles_collision_processing(void) {}

// stub
void monsters_updates(void) {}


/* Damage table indexed by (cavern_level - 1) */
const uint8_t aggressive_tiles_damage_table[9] = {1, 1, 4, 8, 20, 20, 20, 20, 20};

/*
 * damage_hero – subtract damage from hero_HP, clamp to 0, redraw health.
 */
void damage_hero(uint16_t damage) {
    uint16_t hero_HP = MEM16(ADDR_HERO_HP);
    if (hero_HP >= damage) {
        hero_HP -= damage;
    } else {
        hero_HP = 0;
    }
    MEM16(ADDR_HERO_HP) = hero_HP;
    Draw_Hero_Health(); // signal js to redraw health
}

/*
 * step_on_aggressive_ground
 * Checks harmful tiles under the hero, applies damage unless Pirika shoes are worn.
 */
void step_on_aggressive_ground(void) {
    /* Pirika shoes grant immunity */
    if (MEM8(ADDR_CURRENT_ACCESSORY) == SHOES_PIRIKA) {
        return;
    }

    uint8_t danger_found = 0;

    /* Get pointer to top‑left tile of the hero’s 3×3 bounding box */
    uint16_t ptr = hero_coords_to_addr_in_proximity();

    int row_count = 3;          /* normally check all 3 rows of the hero */
    if (MEM8(ADDR_SQUAT_FLAG) != 0) {
        ptr += 36;              /* skip the top row (move down one row of 36 tiles) */
        wrap_map_from_above(&ptr);
        row_count = 2;          /* now only the bottom 2 rows are checked */
    }

    /* Scan the bottom rows (3 tiles per row) */
    for (int row = 0; row < row_count; row++) {
        for (int col = 0; col < 3; col++) {
            uint8_t tile = MEM8(ptr);
            ptr++;
            if (!is_tile_safe_to_stay(tile)) {
                danger_found = 0xFF;
            }
        }
        ptr += (36-3);              /* 36 - 3 (already advanced) */
        wrap_map_from_above(&ptr);
    }

    /* If not on a rope, check the tile directly under the hero’s centre */
    if (MEM8(ADDR_ON_ROPE_FLAGS) == 0) {
        ptr++;                  /* move to centre column (column 1 of the row below) */
        uint8_t tile = MEM8(ptr);
        if (!is_tile_safe_to_stay(tile)) {
            danger_found = 0xFF;
        }
    }

    if (!danger_found) {
        return;
    }

    /* Mark damage, play sound, apply damage. */
    MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0xFF;
    MEM8(ADDR_SOUND_FX_REQUEST) = 9;

    uint16_t dmg = aggressive_tiles_damage_table[MEM8(ADDR_CAVERN_LEVEL) - 1];
    damage_hero(dmg);
}

//stub
// TODO: signal js to render gold amount
void Print_Gold_Decimal()
{
}

//stub
// TODO: signal js to render almas amount
static void Print_Almas_Decimal()
{
}

void render_notification_string(uint8_t str_idx)
{
    debug_printf("[render_notification_string] idx=%d", str_idx);
    MEM8(ADDR_NOTIFICATION_MSG_ID) = str_idx;
    MEM8(ADDR_NOTIFICATION_FLAG) = 0xFF;
}

// stub
void screen_flash_overlay()
{

}

// stub

/* ------------------------- helper inline --------------------------- */

static void hero_got_gold(uint16_t ax) {
    MEM16(ADDR_HERO_GOLD_LO) = MEM16(ADDR_HERO_GOLD_LO) + ax;
    if (MEM16(ADDR_HERO_GOLD_LO) < ax)            // carry out of low word
        MEM8(ADDR_HERO_GOLD_HI) = MEM8(ADDR_HERO_GOLD_HI) + 1;

    Print_Gold_Decimal();
}

/* ------------------------- main AI tick ---------------------------- */
// Main monster AI tick (called once per frame from main_update_render).
// Boss/Jashiin caverns: delegate entirely to Monster_AI (eai binary).
// Regular caverns:
//   Iterates the monsters_table (each 16-byte monster struct).
//   For each monster:
//     - Skip if high byte of currX == 0xFF (stationary item, not a creature).
//     - Call is_in_proximity_window: if monster is outside ±35 columns, skip.
//     - Set m_x_rel = BL (relative X position in proximity window).
//     - Write monster index | 0x80 to proximity map (primary + second layer).
//     - If monster.state_flags bit 4: also stamp 2 rows below (big monster lower half).
//     - If state_flags bit 5 is clear: call monster_activation (spawn check).
//     - Else: increment monster.counter, call Monster_AI on activation.
void monsters_spawning(void) {
    uint16_t m = MEM16(ADDR_MONSTERS_LIST);
    if (MEM8(ADDR_IS_BOSS_CAVERN) != 0 || MEM8(ADDR_IS_JASHIIN_CAVERN) != 0) {
        // entire AI handled by boss procedure
        Monster_AI(m);
        return;
    }
    
    MEM8(ADDR_MONSTER_INDEX) = 0;

    while (1) {
        uint16_t currX = MEM16(m+0);
        if (currX == 0xFFFF) // .currX; list terminator
            return;

        MEM8(m+3) = 0xFF; // .m_x_rel; not in proximity yet, but in progress

        if ((currX >> 8) != 0xFF) { // else skip
            uint8_t rel_x;
            if (is_in_proximity_window(currX, &rel_x)) { // else skip
                MEM8(m+3) = rel_x;
                if (MEM8(ADDR_MONSTER_INDEX) == 3) {
                    debug_printf("[monsters_spawning()] Entity %d spawning at (%d, %d) addr=0x%04X\n", 
                        MEM8(ADDR_MONSTER_INDEX), rel_x, MEM8(m+2), m);
                }
                place_monster_in_proximity_and_run_ai(m);
                currX = MEM16(m+0);
                if ((currX >> 8) != 0xFF) {
                    uint8_t y = MEM8(m+2);
                    uint8_t relx = MEM8(m+3);
                    uint16_t di = coords_to_prox_addr(relx, y);
                    uint8_t bl = MEM8(ADDR_MONSTER_INDEX);
                    uint8_t al = bl | 0x80; // new
                    uint8_t old = MEM8(di);
                    MEM8(di) = al; // new
                    MEM8(ADDR_PROXIMITY_LAYER2 + bl) = old;

                    // big monster lower half
                    if ((MEM8(m+4) & 0x11) == 0 &&      // .flags bits 0 and 4 clear?
                        (MEM8(m+7) & 0x10))             // .state_flags bit4 set?
                    {
                        // stamp two rows below (monster_index+1)
                        di += (2 * 36);
                        wrap_map_from_above(&di);
                        bl = MEM8(ADDR_MONSTER_INDEX) + 1;
                        al = bl | 0x80; // new
                        old = MEM8(di);
                        MEM8(di) = al; // new
                        MEM8(ADDR_PROXIMITY_LAYER2 + bl) = old;
                    }

                }
            }
        }

        if (!(MEM8(m+7) & 0x20)) {    // .state_flags bit5 clear → not yet active
            uint8_t c = MEM8(m+15) + 1; // .counter
            if (c != 0) {
                MEM8(m+15) = c; // .counter
            } else {
                // counter overflowed from 255 to 0 → trigger activation
                monster_activation(m);
            }
        }

        // advance to next monster
        MEM8(ADDR_MONSTER_INDEX)++;
        m += 16;
    }
}


/* ---------------------- item type handlers ------------------------- */
// marks an item as collected (loc_914C)
static void mark_collected(uint16_t m) {
    MEM16(m+0) = 0xFF00;
    if (MEM8(m+7) & 0x20) {          // .state_flags
        uint16_t addr = MEM16(m+11); // .spwnX
        if (addr != 0xFFFF) {
            MEM8(addr) = MEM8(addr) | MEM8(m+13); // .spwnY
            MEM16(m+11) = 0xFFFF; // .spwnX
        }
    }
}

// common pickup: move south, check alignment, play sound, show message
static uint8_t pickup_common(uint16_t m, uint8_t msg_id) {
    move_monster_S(m);
    if (!check_monster_aligned_to_hero_and_tick(m))
        return 0;

    MEM8(ADDR_SOUND_FX_REQUEST) = 17;
    render_notification_string(msg_id);
    return 0xFF;
}

// add a shoe type to Feruza_Shoes accessory slots
// TODO: rename it to accessories or something
static void put_shoes_to_inventory(uint16_t monster, uint8_t shoe_type) {
    // Feruza_Shoes is an array of accessories (end marked by 0)
    uint16_t slot = ADDR_FERUZA_SHOES;
    while (MEM8(slot) != 0) slot++;
    MEM8(slot) = shoe_type;
    mark_collected(monster);  // needs access to current Monster* – pass as argument
}

// drop‑item trigger?
static void flag_10(uint16_t m)
{
    if (!(MEM8(m+10) & 1)) {            // .ai_timer
        if (!(MEM8(m+5) & 0x20)) {      // .ai_flags
            return;
        }

        MEM8(ADDR_SOUND_FX_REQUEST) = 18;
        MEM8(m+5) = MEM8(m+5) & 0x90; // .ai_flags
        MEM8(m+4) = MEM8(m+4) & 0x7F; // .flags
        MEM8(m+4) = MEM8(m+4) | 0x60; // .flags
        MEM8(m+10) = MEM8(m+10) | 1;  // .ai_timer
    }

    // Animate
    MEM8(m+6) = MEM8(m+6) + 0x80; // .anim_counter
    if ((MEM8(m+6) & 0x80) == 0) {
        MEM8(m+6) = MEM8(m+6) + 1;
        if (MEM8(m+6) >= 4) {
            MEM8(m+6) = 0;
            uint8_t ai_state = MEM8(m+9);
            if (ai_state) {
                if (ai_state & 0x10) {
                    ai_state |= 0x60;
                    MEM8(m+7) = MEM8(m+7) | 0x80; // .state_flags
                    MEM8(m+15) = 0; // .counter
                }
                MEM8(m+4) = ai_state; // .flags
                MEM8(m+5) = MEM8(m+5) & 0x80; // .ai_flags
                MEM8(m+9) = 0; // .ai_state
            } else {
                mark_collected(m);      // loc_914C
            }
        }
    }
}

// projectile spawner?
static void flag_11(uint16_t m) {
    if (!(MEM8(m+10) & 1)) {           // .ai_timer
        uint8_t ah = (MEM8(m+2) - 3) & 0x3F; // .currY
        if (ah != MEM8(ADDR_HERO_Y))
            return;
        // item under hero feet
        uint8_t al = (uint8_t)((int8_t)MEM8(ADDR_HERO_X_VIEW) + 3);
        al += (MEM8(ADDR_FACING) & LEFT) * 2;

        for (int i = 0; i < 2; i++) {
            if (al == MEM8(m+3)) {     // .m_x_rel
                MEM8(ADDR_SOUND_FX_REQUEST) = 18;
                MEM8(m+10) = MEM8(m+10) | 1;  // .ai_timer
                return;
            }
            al++;
        }
        return;
    }

    // armed: move south, animate
    MEM8(m+4) = MEM8(m+4) & 0x7F;  // .flags
    move_monster_S(m);
    MEM8(m+6) = MEM8(m+6) + 0x80; // .anim_counter
    if ((MEM8(m+6) & 0x80) == 0) {
        MEM8(m+6) = MEM8(m+6) + 1;
        if (MEM8(m+6) >= 4) {
            MEM8(m+6) = 0;
            mark_collected(m);
        }
    }
}

// delay animation?
static void flag_12(uint16_t m) {
    MEM8(m+6) = MEM8(m+6) + 1; // .anim_counter
    if (MEM8(m+6) == 3)
        mark_collected(m);
}

// item pickup (contact collision)
static void flag_13(uint16_t m) {
    if (!check_monster_aligned_to_hero_and_tick(m))
        return;

    MEM8(ADDR_SOUND_FX_REQUEST) = 20;
    if (!(MEM8(m+6) & 0x0F)) { // .anim_counter
        uint8_t ai_state = MEM8(m+9); // .ai_state
        if (ai_state & 0x10) {
            ai_state |= 0x60;
            MEM8(m+7) = MEM8(m+7) | 0x80; // .state_flags
            MEM8(m+15) = 0; // .counter
        }
        MEM8(m+4) = ai_state; // .flags
        MEM8(m+9) = 0; // .ai_state
        return;
    }
    // chest
    mark_collected(m);
    uint8_t chest_type = MEM8(m+6) & 0x0F; // .anim_counter
    switch (chest_type) {
        case 1: 
            render_notification_string(YOU_GET_50_GOLD_STR); 
            hero_got_gold(50);  
            break;
        case 2: 
            render_notification_string(YOU_GET_100_GOLD_STR); 
            hero_got_gold(100); 
            break;
        case 3: 
            render_notification_string(NOTHING_IN_THE_BOX_STR); 
            break;
        case 4: 
            render_notification_string(YOU_GET_500_GOLD_STR); 
            hero_got_gold(500); 
            break;
        case 5: 
            render_notification_string(YOU_GET_1000_GOLD_STR); 
            hero_got_gold(1000); 
            break;
        case 6: 
            render_notification_string(YOU_GET_GLORY_CREST_STR); 
            MEM8(ADDR_CREST_OF_GLORY) = 0xFF;
            break;
        case 7: {
            render_notification_string(GET_ENCHANTMENT_SWORD_STR);
            Flush_Ui_Element_If_Dirty_proc();
            MEM8(ADDR_SWORD_TYPE) = 6;
            Render_Sword_Item_Sprite_20x18(6);
            res_dispatcher_fn4(SWORD_ENCHANTMENT); // signal js to reload sword gfx
            break;
        }
        default: 
            break;
    }
}

// almas orb
static void flag_14_15_1b(uint16_t m) {
    move_monster_S(m);
    MEM8(m+6) = MEM8(m+6) + 1; // .anim_counter
    MEM8(m+6) = MEM8(m+6) & 3;

    if (!check_monster_aligned_to_hero_and_tick(m))
        return;

    MEM8(ADDR_SOUND_FX_REQUEST) = 16;
    uint8_t price = MEM8(m+4) & 0x0F; // .flags
    if (price == 4)
        hero_got_almas(1);
    else if (price == 5)
        hero_got_almas(10);
    else
        hero_got_almas(100);

    mark_collected(m);
}

// ordinary key
static void flag_16(uint16_t m) {
    if (!pickup_common(m, YOU_GET_KEY_STR))
        return;
    MEM8(ADDR_KEYS_AMOUNT) = MEM8(ADDR_KEYS_AMOUNT) + 1;
    mark_collected(m);
}

// lion's head key
static void flag_17(uint16_t m) {
    if (!pickup_common(m, GET_LIONS_HEAD_KEY_STR))
        return;
    MEM8(ADDR_LION_KEYS_AMOUNT) = MEM8(ADDR_LION_KEYS_AMOUNT) + 1;
    mark_collected(m);
}

// small potion (red)
static void flag_18(uint16_t m) {
    if (!check_monster_aligned_to_hero_and_tick(m))
        return;
    render_notification_string(YOU_HAVE_RECOVERED_STR);
    MEM8(ADDR_HEALING_TIMER) += 10; // byte access in original!
    mark_collected(m);
}

// large potion (blue)
static void flag_19(uint16_t m) {
    move_monster_S(m);
    if (!check_monster_aligned_to_hero_and_tick(m))
        return;
    render_notification_string(YOU_HAVE_RECOVERED_FULL_STR);
    uint16_t amount = (MEM16(ADDR_HERO_MAX_HP) >> 3) + 1;
    MEM16(ADDR_HEALING_TIMER) += amount;
    mark_collected(m);
}

// dungeon sign
static void flag_1c(uint16_t m) {
    MEM8(m+15) = 0; // .counter
    if (!(MEM8(m+9) & 1)) { // ai_state
        if (!check_monster_aligned_to_hero_and_tick(m))
            return;

        MEM8(ADDR_SOUND_FX_REQUEST) = 17;
        MEM8(m+7) = MEM8(m+7) | 0x80; // .state_flags
        MEM8(m+9) = MEM8(m+9) | 1;    // .ai_state
        MEM8(m+10) = 0xEB;            // .ai_timer
        uint8_t idx = MEM8(m+6);      // .anim_counter
        uint16_t info = MEM16(ADDR_CAVERN_SIGNS_INFO) + idx * 2;
        render_cavern_signs(info);
    } else {
        if (MEM8(m+10) == 0) // .ai_timer
            MEM8(m+9) = MEM8(m+9) & ~1; // .ai_state
        else
            MEM8(m+10) = MEM8(m+10) + 1; // .ai_timer
    }
}

// hero's crest
static void flag_1d(uint16_t m) {
    if (!pickup_common(m, GET_HEROS_CREST_STR))
        return;
    MEM8(ADDR_HERO_CREST) = 0xFF;
    mark_collected(m);
}

// Feruza shoes
static void flag_1e(uint16_t m) {
    if (!pickup_common(m, GET_FERUZA_SHOES_STR))
        return;
    put_shoes_to_inventory(m, 1);
}

// shoes (Ruzeria/Pirika/Silkarn)
static void flag_1a(uint16_t m) {
    uint8_t level = MEM8(ADDR_CAVERN_LEVEL) - 4;
    uint8_t shoes_str;
    uint8_t shoe_type;

    switch (level) {
        case 0: 
            shoe_type = 4; 
            shoes_str = GET_RUZERIA_SHOES_STR; 
            break;
        case 1: 
            shoe_type = 2; 
            shoes_str = GET_PIRIKA_SHOES_STR; 
            break;
        default: 
            shoe_type = 3; 
            shoes_str = GET_SILKARN_SHOES_STR; 
            break;
    }

    if (!pickup_common(m, shoes_str))
        return;
    put_shoes_to_inventory(m, shoe_type);
}

// default handler for types 0x00–0x0F (chest animation dispatch)
static void default_0toF_handler(uint16_t m) {
    // loc_90E6 logic:
    MEM8(m+6) = MEM8(m+6) + 0x80; // .anim_counter
    if ((MEM8(m+6) & 0x80) == 0) {
        MEM8(m+6) = MEM8(m+6) + 1;
        if (MEM8(m+6) == 3) {
            MEM8(m+15) = 0; // .counter
            if (MEM8(m+7) & 0x40) { // .state_flags
                MEM8(m+7) = MEM8(m+7) & (~0x40);
                // reset another monster (offset based on ai_timer)
                uint8_t idx = MEM8(m+10); // .ai_timer
                uint16_t other = MEM16(ADDR_MONSTERS_LIST) + idx * 16;
                MEM8(other+2) = 0; // .currY
            }
            if (!(MEM8(m+7) & 0x10) || (MEM8(m+4) & 1)) { // .state_flags, .flags
                MEM8(m+6) = 0; // .anim_counter
                MEM8(m+4) = 0x72; // .flags
                uint8_t state_nibble = MEM8(m+7) & 0x0F;
                if (state_nibble == 0) return;
                if (state_nibble == 1) {
                    mark_collected(m);
                    return;
                }
                state_nibble |= 0x70;
                MEM8(m+7) = MEM8(m+7) | 0x80; // .state_flags
                MEM8(m+15) = 4; // .counter
                MEM8(m+4) = state_nibble;
                MEM8(m+5) = MEM8(m+5) & 0x80; // .ai_flags
                MEM8(m+7) = MEM8(m+7) & 0xF0; // .state_flags
            } else {
                mark_collected(m);
            }
        }
    }
}


// Places a monster in the proximity map and optionally runs its AI.
//
// 1. Converts currX/currY to proximity map address (coords_in_ax_to_proximity).
// 2. Processes the 'spell target' flag (ai_flags bit 6 → flags bit 5).
// 3. Reads proximity_second_layer[monster_index] and writes it to [di]
//    (preserves any existing tile if second layer was occupied).
// 4. For big monsters (state_flags bit 4): also stamps [di + 2*36].
//
// Item/monster type switch (flags bits 4:0):
//   0x00-0x0F: regular monster → call Monster_AI
//   0x10 (flag_10): drop-item trigger (falling item / platform drop)
//   0x11 (flag_11): projectile spawner (aims at hero Y, triggers shot at range)
//   0x12 (flag_12): delay animation
//   0x13 (flag_13): item pickup — contact collision check
//   0x14/0x15/0x1B (flag_14): almas orb — falling, picked up on contact
//     almas count: flags&0x0F: 4→1 almas, 5→10 almas, else→100 almas
//   0x16 (flag_16): ordinary key pickup
//   0x17 (flag_17): lion's head key pickup
//   0x18 (flag_18): small potion (red) → healing_potion_timer += 0x0A
//   0x19 (flag_19): large potion (blue) → healing_potion_timer += heroMaxHP/8
//   0x1A (flag_1a): shoes pickup (Ruzeria/Pirika/Silkarn based on cavern_level-4)
//   0x1B: see 0x14
//   0x1C (flag_1c): dungeon sign → render_cavern_signs
//   0x1D (flag_1d): hero's crest pickup
//   0x1E (flag_1e): Feruza shoes pickup
//   0x00-0x0F (default, flag_10 handled above): chest animation dispatch:
//     chest sub-types: 50g / 100g / empty / 500g / 1000g / glory crest / enchantment sword
//
// On item pickup (loc_914C): set currX high byte to 0xFF00 (mark as collected),
// optionally write the item's save achievement bitmask to savegame.
//
// SPRITE NOTE: Items use enp?.grp 2×2 tiles. The frame to display is encoded
// in monster.flags low nibble (see ENP1_FRAMES lookup in grp_viewer.py).
static void place_monster_in_proximity_and_run_ai(uint16_t m)
{
    uint16_t di = coords_to_prox_addr(MEM8(m+3), MEM8(m+2));
    uint8_t al = MEM8(m+5) & (~0x20); // .ai_flags, clear bit5
    if (al & 0x40) {                    // bit6 set?
        if (!(MEM8(m+4) & 0x20))      // .flags bit5 clear?
            al |= 0x20;                 // set ai_flags bit5
        al &= ~0x40;                    // clear ai_flags bit6
    }
    MEM8(m+5) = al;
    uint8_t bl = MEM8(ADDR_MONSTER_INDEX);

    // restore previously saved second‑layer entry for this monster
    MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + bl);

    // big monster lower half restoration
    if ((MEM8(m+4) & 0x11) == 0 && (MEM8(m+7) & 0x10)) { // .flags, .state_flags
        di += (2 * 36);
        wrap_map_from_above(&di);
        bl = MEM8(ADDR_MONSTER_INDEX) + 1;
        MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + bl);
    }

    // --- run AI or handle items ---
    if ((MEM8(m+4) & 0x18) == 0) {     // .flags bits 3 and 4 both clear → regular monster
        Monster_AI(m);            // call per‑monster AI
        return;
    }

    // item / chest / special type dispatch
    uint8_t flags = MEM8(m+4) & 0x1F; // .flags
    if (flags >= 0x10) {
        switch (flags) {
            case 0x10: 
                flag_10(m); 
                break;
            case 0x11: 
                flag_11(m); 
                break;
            case 0x12: 
                flag_12(m); 
                break;
            case 0x13: 
                flag_13(m); 
                break;
            case 0x14:
            case 0x15:
            case 0x1B: 
                flag_14_15_1b(m); 
                break;
            case 0x16: 
                flag_16(m); 
                break;
            case 0x17: 
                flag_17(m); 
                break;
            case 0x18: 
                flag_18(m); 
                break;
            case 0x19: 
                flag_19(m); 
                break;
            case 0x1A: 
                flag_1a(m); 
                break;
            case 0x1C: 
                flag_1c(m); 
                break;
            case 0x1D: 
                flag_1d(m); 
                break;
            case 0x1E: 
                flag_1e(m); 
                break;
            default:   
                break;  // 0x1F
        }
    } else {
        default_0toF_handler(m);         // chest subtypes (0x00–0x0F)
    }
}

/*
 * Spawns a monster from its spawn point once the hero comes close enough.
 * `m` is the SI register of the original code: a pointer
 * into the monster table.
 * 
 * Inside the occupancy-scan loops, [si+monster.currX], [si+1], [si+monster.currY] are 
 * not struct field accesses — si has been repointed at the proximity map there, 
 * and the assembler is just reusing the 0/1/2 numeric constants from the struct offsets 
 * as raw byte indices for the 3 columns being OR'd together. 
 * That's why I translate them as PROX(scan_addr), PROX(scan_addr+1), PROX(scan_addr+2) rather than struct members.
 * The vertical/edge check compiles down to one combined boolean (al < 24 && bl >= 3 && bl < 32) 
 * even though the asm expresses it as three separate short-circuiting jumps to the same target.
 * The big-monster path's second proximity-map marker is (monster_index | 0x80) + 1, 
 * computed by literally incrementing the AL value used for the first marker — reproduced exactly 
 * rather than recomputed from monster_index to match potential edge-case wraparound behavior.
 */
static void monster_activation(uint16_t m)
{
    uint8_t  al;
    uint8_t  bl;
    uint16_t di, scan_addr;

    /* Monster must currently be deactivated (in "item" state) */
    if ((MEM16(m+0) >> 8) != 0xFF) // .currX high byte
        return;

    /* Big monsters occupy two consecutive table entries; the second
       entry must also be deactivated */
    if ((MEM8(m+7) & 0x10) && (MEM16(m+16) >> 8) != 0xFF) // .state_flags, other half' .currX high byte
        return;

    /* Must have a defined respawn point */
    uint16_t spwnX = MEM16(m+11);
    if (spwnX == 0xFFFF)
        return;

    /* Hero must be within proximity range (36 units without edges) */
    if (!is_in_proximity_window(spwnX, &bl))
        return;                 /* out of range */

    if (bl == 0 || bl == 35)
        return;

    /* Skip spawning if the spawn row is currently on-screen (within 24
       rows of the viewport) *and* the horizontal distance is not right
       at the edge of the detection window (3 <= bl < 32) — i.e. avoid
       visibly popping a monster in right in front of the hero. */
    al = (MEM8(ADDR_VIEWPORT_TOP_ROW) - 2) & 0x3F;
    al = (MEM8(m+2) - al) & 0x3F; // .spwnY
    if (al < 24 && bl >= 3 && bl < 32)
        return;

    if (!(MEM8(m+7) & 0x10)) { // .state_flags
        /* ---------------- regular (small) monster ---------------- */
        MEM8(m+3) = bl; // .m_x_rel

        uint16_t di_orig = coords_to_prox_addr(bl, MEM8(m+2));
        di = di_orig;
        di -= (36 + 1);
        wrap_map_from_below(&di);
        al = 0;
        for (int row = 0; row < 3; row++) {
            al |= MEM8(di) | MEM8(di + 1) | MEM8(di + 2);
            di += 36;
            wrap_map_from_above(&di);
        }

        if (al & 0x80)
            return;             /* 3x3 area already has a monster */

        MEM8(di_orig) = MEM8(ADDR_MONSTER_INDEX) | 0x80;
        MEM8(m+0) = MEM8(m+11); // .currX, .spwnX
        MEM8(m+2) = MEM8(m+13); // .currY, .spwnY
        MEM8(m+4) = MEM8(m+14); // .flags, .type_
        MEM8(m+6) = 0x10;       // .anim_counter
        MEM8(m+5) = 0;          // .ai_flags
        MEM8(m+9) = 0;          // .ai_state
        MEM8(m+8) = 0;          // .hp

        MEM8(ADDR_PROXIMITY_LAYER2 + MEM8(ADDR_MONSTER_INDEX)) = 0;
    } else {
        /* ---------------- big monster (2 table entries) ---------------- */

        if (MEM8(m+14) & 1) // .type_
            return;

        MEM8(m+3) = bl; // .m_x_rel
        MEM8(m+16+3) = bl; // .m_x_rel

        uint16_t di_orig = coords_to_prox_addr(bl, MEM8(m+2));
        di = di_orig;
        di -= (36 + 1);
        wrap_map_from_below(&di);
        al = 0;
        for (int row = 0; row < 5; row++) {
            al |= MEM8(di) | MEM8(di + 1) | MEM8(di + 2);
            di += 36;
            wrap_map_from_above(&di);
        }

        if (al & 0x80)
            return;

        al = MEM8(ADDR_MONSTER_INDEX) | 0x80;
        di = di_orig;
        MEM8(di) = al;
        di += 36*2;
        wrap_map_from_above(&di);
        MEM8(di) = al + 1;
        uint16_t ax = MEM16(m+11); // .spwnX
        MEM16(m+0) = ax; // .currX
        MEM16(m+16) = ax; // .currX
        al = MEM8(m+13); // .spwnY
        MEM8(m+2) = al; // .currY
        MEM8(m+16+2) = (al + 2) & 0x3F; // .currY
        al = MEM8(m+14); // .type_
        MEM8(m+4) = al; // .flags
        MEM8(m+16+4) = al+1; // .flags
        MEM8(m+6) = 0x10; // .anim_counter
        MEM8(m+16+6) = 0x10; // .anim_counter
        MEM8(m+5) = 0; // .ai_flags
        MEM8(m+16+5) = 0; // .ai_flags
        MEM8(m+9) = 0; // .ai_state
        MEM8(m+16+9) = 0; // .ai_state
        MEM8(m+10) = 0; // .ai_timer
        MEM8(m+16+10) = 0; // .ai_timer
        MEM8(m+8) = 0; // .hp
        MEM8(m+16+8) = 0; // .hp
        MEM8(m+16+7) = MEM8(m+16+7) & 0xF0; // .state_flags
        MEM8(ADDR_PROXIMITY_LAYER2 + MEM8(ADDR_MONSTER_INDEX)) = 0;
    }
}

uint8_t check_monster_on_aggressive_ground(uint16_t m)
{
    uint8_t y = MEM8(m+2);
    uint8_t x_rel = MEM8(m+3);
    uint16_t di = coords_to_prox_addr(x_rel, y) + 2 * PROX_COLS;
    wrap_map_from_above(&di);
    uint8_t tile = MEM8(di);
    return is_tile_safe_to_stay(tile);
}

// Called when a monster's HP drops to 0.
// Adds XP to hero (from death XP table at word_A008 indexed by flags&7).
// Sets monster flags |= 0x68 (death animation bits), clears AI flags.
// For big monsters: handles both top and bottom halves.
// Check_Vertical_Distance_Between_Hero_And_Monster:
void monster_split_or_die(uint16_t m)
{
    uint8_t al = MEM8(m+4); // .flags
    if ((al & 0x10) == 0) {
        al = MEM8(ADDR_XP_FOR_MONSTER + (al & 0x0F));
        update_hero_XP(al);
    }
    Check_Vertical_Distance_Between_Hero_And_Monster(m);
}

uint8_t Check_Vertical_Distance_Between_Hero_And_Monster(uint16_t m)
{
    MEM8(m+6) = 0; // .anim_counter
    MEM8(m+4) = MEM8(m+4) | 0x68; // .flags
    MEM8(m+5) = MEM8(m+5) & 0x80; // .ai_flags
    if ((MEM8(m+7) & 0x10) && (MEM8(m+4) & 1)) { // .state_flags, .flags
        MEM8(m+6) = 0x80; // .anim_counter
        MEM8(m+16+6) = 0; // .anim_counter
        MEM8(m+16+4) = MEM8(m+16+4) | 0x68; // .flags
        MEM8(m+16+5) = MEM8(m+16+5) & 0x80; // .ai_flags
    }
    uint8_t al = (MEM8(m+2) - MEM8(ADDR_VIEWPORT_TOP_ROW) + 1) & 0x3F;
    if (al < 19) {
        MEM8(ADDR_SOUND_FX_REQUEST) = 7;
    }
}

void Hero_Hits_monster(uint16_t m)
{
    uint8_t al = MEM8(m+5) & 0x1F; // .ai_flags
    uint8_t ah = Get_Stats(al);
    al = MEM8(m+8); // .hp
    if (al > ah) {
        MEM8(m+8) = al - ah;
        MEM8(ADDR_SOUND_FX_REQUEST) = 6;
        return;
    }
    if ((MEM8(m+4) & 1) == 0 && (MEM8(m+7) & 0x10)) { // .flags, .state_flags
        // loc_9815 - big monster
        if (MEM8(m+16+7) & 0x0F) { // .state_flags
            monster_split_or_die(m);
            return;
        }
        uint16_t di = MEM16(ADDR_DEATH_DESCRIPTORS_PTR);
        uint8_t bl = MEM8(m+4) & 7; // .flags
        di = MEM16(di + bl*2);
        bl = (MEM8(ADDR_SWORD_HIT_TYPE) == 2) ? 0 : (get_random() & 3);
        al = MEM8(di + bl);
        MEM8(m+16+7) = (MEM8(m+16+7) & 0xF0) | al; // .state_flags
        monster_split_or_die(m);
        return;
    }
    if (MEM8(m+7) & 0x0F) {
        monster_split_or_die(m);
        return;
    }
    uint16_t di = MEM16(ADDR_DEATH_DESCRIPTORS_PTR);
    uint8_t bl = MEM8(m+4) & 7; // .flags
    di = MEM16(di + bl*2);
    bl = (MEM8(ADDR_SWORD_HIT_TYPE) == 2) ? 0 : (get_random() & 3);
    al = MEM8(di + bl);
    MEM8(m+7) = (MEM8(m+7) & 0x0F) | al; // .state_flags
    monster_split_or_die(m);
    return;
}


// al=0 → ah = hero_level/2 + 1 (basic defense stat)
// al=1 → ah = total sword damage:
//          base = sword_damages[sword_type-1] (table: 1,2,4,8,32,127)
//          + hero_level/2
//          × (byte_E4+1)  [difficulty multiplier]
//          × 2 if downward thrust (sword_hit_type==2)
// al=2..8 → ah = byte_98BE[al-2] (static stat table: 2,4,8,16,32,64,255)
// al=9 → ah = (hero_level+1)*4
uint8_t Get_Stats(uint8_t al)
{
    uint8_t ah;

    if (al == 0) {
        return (MEM8(ADDR_HERO_LEVEL) >> 1) + 1;
    }

    if (al == 1) {
        /* Sword damage calculation */
        uint8_t base = sword_damages[MEM8(ADDR_SWORD_TYPE) - 1];
        uint8_t half_level = MEM8(ADDR_HERO_LEVEL) >> 1;
        uint16_t sum = (uint16_t)base + half_level;
        uint8_t result;

        if (sum > 0xFF) {
            result = 0xFF;
        } else {
            uint16_t product = sum * (MEM8(ADDR_BYTE_E4) + 1);
            result = (product > 0xFF) ? 0xFF : product;
        }

        ah = result;

        /* Downward hit: double with saturation */
        if (MEM8(ADDR_SWORD_HIT_TYPE) == 2) {
            uint16_t doubled = (uint16_t)ah * 2;
            ah = (doubled > 0xFF) ? 0xFF : (uint8_t)doubled;
        }

        return ah;
    }

    if (al == 9) {
        uint16_t temp = (uint16_t)(MEM8(ADDR_HERO_LEVEL) + 1) * 4;
        return (temp > 0xFF) ? 0xFF : temp;
    }

    /* al = 2..8 */
    return byte_98BE[al - 2];
}

// Searches for tile value AL in the 4-byte 'aggressive ground' list at seg1:8020h.
// These are the tile IDs that hurt the hero when stood upon
// (e.g., lava, spikes), set per-dungeon in the mpp?.grp descriptor.
// Input: tile value to search for.
// Returns: ZF=1 (match found) => false
//       or NZ (AH=0xFF, no match) => true
static uint8_t is_tile_safe_to_stay(uint8_t tile)
{
    for (int i = 0; i < 4; i++) {
        uint8_t aggr = MEM8_1(ADDR_AGGRESSIVE_TILES + i);
        if (aggr == 0) 
            return 0xFF; // end of list, no match
        if (tile == aggr)
            return 0;
    }
    return 0xFF;
}

// Direct translation of original code. Need to decide
// whether to leave it here or move to game.js
void input_handling()
{
    if (!MEM8(ADDR_SWORD_TYPE))
        return;

    uint8_t alt_space = MEM8(ADDR_INPUT_ALT_SPACE);
    uint8_t dirs = MEM8(ADDR_INPUT_DIRS);

    if (!(alt_space & KEY_SPACE) ||                    // no Space pressed
            MEM8(ADDR_JUMP_PHASE_FLAGS) == 0 || // 0: on ground
            MEM8(ADDR_SLOPE_DIRECTION) != 0 ||  // on any slope
            !(dirs & KEY_DOWN)) {                 // no Down pressed
        // sword_default
        
        MEM8(ADDR_DOWN_THRUST_HELD) = 0;

        if (MEM8(ADDR_SPACEBAR_LATCH) == 0 || 
            MEM8(ADDR_SWORD_SWING_FLAG) != 0 ||
            MEM8(ADDR_SPELL_ACTIVE_FLAG) != 0)
            return;

        uint8_t overhead;

        if (MEM8(ADDR_IS_BOSS_CAVERN) != 0) {
            overhead = dirs & KEY_UP;
        } else {
            /* Scan 4 rows x 8 columns for a flying monster */
            uint16_t si = hero_coords_to_addr_in_proximity();
            si -= (4 * 36 + 3);
            wrap_map_from_below(&si);
            // 12345678.
            // 12345678.
            // 12345678.
            // 12345678.
            // ...┌o┐..
            // .../O\..
            // ...└║┘..
            uint8_t dl = 0;
            for (int rows = 0; rows < 4; rows++) {
                for (int cols = 0; cols < 8; cols++) {
                    uint8_t flags;
                    uint16_t monster_struct;
                    if (get_dst_monster_flags(si, &flags, &monster_struct)) {
                        if ((flags & 0x60) == 0 && (MEM8(monster_struct+7) & 0x10) == 0) { // state_flags
                            dl = 0xFF; // flying monster found
                        }
                    }
                    si++;
                } // 8-columns loop

                si += (36 - 8);
                wrap_map_from_above(&si);
            } // loop four_rows

            if (dl != 0)
                overhead = 0xFF;
            else
                overhead = dirs & KEY_UP;
        }
        MEM8(ADDR_SWORD_HIT_TYPE) = overhead ? 1 : 0;
        MEM8(ADDR_SWORD_MOVEMENT_PHASE) = 0;
        MEM8(ADDR_SOUND_FX_REQUEST) = 3;
    } else { /* Downward thrust (space + up + down) */
        MEM8(ADDR_SWORD_HIT_TYPE) = 2;
        MEM8(ADDR_SWORD_MOVEMENT_PHASE) = 2;
        if (MEM8(ADDR_DOWN_THRUST_HELD) == 0) { /* First time thrust -> SFX 4 */
            MEM8(ADDR_DOWN_THRUST_HELD) = 0xFF;
            MEM8(ADDR_SOUND_FX_REQUEST) = 4;
        }
    }
    MEM8(ADDR_SPACEBAR_LATCH) = 0;
    MEM8(ADDR_ALTKEY_LATCH) = 0;
    MEM8(ADDR_SWORD_SWING_FLAG) = 0xFF;
}


// stub
void magic_spell_fire_handler(void) {}


// Reads the current direction input and branches to the correct hero movement
// handler.
//
// Input combinations dispatched (dirs = right/left/down/up bitfield):
//   101b  (left+up)   -> left_up_pressed
//   1001b (right+up)  -> right_up_pressed
//   001b  (up only)   -> up_pressed
//   100b  (left)      -> on_left_pressed (left_up_pressed tail)
//   1000b (right)     -> on_right_pressed (right_up_pressed tail)
//   010b  (down)      -> down_pressed
//   else              -> init_horizontal_sliding + idle animation
//
// Also manages the byte_9F24 direction-change latch for sliding init.
void state_machine_dispatcher()
{
    MEM8(ADDR_SLIDE_DIRECTION) = 0;
 
    uint8_t dirs = MEM8(ADDR_INPUT_DIRS); // al: ____right_left_down_up
 
    if (dirs == (KEY_LEFT | KEY_UP)) {        // 101b
        left_up_pressed();
        return;
    }
    if (dirs == (KEY_RIGHT | KEY_UP)) {       // 1001b
        right_up_pressed();
        return;
    }
    if (dirs == KEY_UP) {                     // 001b
        up_pressed();
        return;
    }
 
    // Squat/turn handling while airborne: only applies when not on a rope
    // and currently mid-jump.
    if (MEM8(ADDR_ON_ROPE_FLAGS) == 0 && MEM8(ADDR_JUMP_PHASE_FLAGS) != 0) {
        if (MEM8(ADDR_BYTE_9F0B) == 0) {
            state_machine_dispatcher_idle_default();
            return;
        }
        MEM8(ADDR_BYTE_9F0B) = 0;
        if (!(MEM8(ADDR_FACING) & UP)) {
            state_machine_dispatcher_idle_default();
            return;
        }
        // no_squat_mode
        if (MEM8(ADDR_FACING) & LEFT) {
            on_left_pressed();
        } else {
            on_right_pressed();
        }
        state_machine_dispatcher_idle_default();
        return;
    }
    // loc_6399
    // On ground or on rope: (re)trigger sliding init only when the hero's
    // facing direction has changed since the last call.
    uint8_t face_left = MEM8(ADDR_FACING) & LEFT;
    if (face_left != MEM8(ADDR_BYTE_9F24)) {
        init_horizontal_sliding();
    }
    MEM8(ADDR_BYTE_9F24) = face_left; // sliding direction = facing direction
 
    if (dirs == KEY_DOWN) {
        down_pressed();
    }
 
    uint8_t lr = dirs & (KEY_LEFT | KEY_RIGHT);
    if (lr == KEY_LEFT) {
        on_left_pressed();
        return;
    }
    if (lr == KEY_RIGHT) {
        on_right_pressed();
        return;
    }
    // loc_63C7
    init_horizontal_sliding();
    if (MEM8(ADDR_ON_ROPE_FLAGS) | MEM8(ADDR_SQUAT_FLAG)) {
        return;
    }
    MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
}
 
void state_machine_dispatcher_idle_default()
{
    MEM8(ADDR_SLOPE_DIRECTION) = 0;
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
}

// When the hero starts moving on an ice surface, converts the accumulated
// horiz_movement_sub_tile_accum into slide_ticks_remaining (capped at 10).
// Called each time a directional key is read in the state machine.
void init_horizontal_sliding()
{
    if (set_zero_flag_if_slippery() != 0) {
        return; // NZ: not slippery
    }

    if (MEM8(ADDR_SLIDE_TICKS_REMAINING) != 0) {
        return; // already sliding
    }

    if (MEM8(ADDR_ON_ROPE_FLAGS) != 0) {
        return; // on rope
    }

    uint8_t accum = MEM8(ADDR_HORIZ_MOVEMENT_ACCUM) >> 1;
    if (accum == 0) {
        return;
    }

    if (accum >= 10) {
        accum = 10;
    }

    MEM8(ADDR_SLIDE_TICKS_REMAINING) = accum;
    MEM8(ADDR_HORIZ_MOVEMENT_ACCUM) = 0;
}

// Handles DOWN key press.
// - If on slope: do nothing (slope_direction != 0).
// - Try move_platform_down_damage_monster (lower active platform).
// - If rope above feet: dismount rope (on_rope_flags = 0x80, jump = 0x80).
// - If on ground: set squat_flag = 0xFF (crouching).
void down_pressed()
{
    MEM8(ADDR_BYTE_9F18) = 0;

    if (MEM8(ADDR_SLOPE_DIRECTION) != 0) {
        return;
    }

    if (move_platform_down_damage_monster()) return;

    uint16_t si = hero_coords_to_addr_in_proximity() + 3 * PROX_COLS + 1;
    wrap_map_from_above(&si);

    if (is_over_rope(si)) {
        // Still over rope: keep descending row by row until the rope ends.
        for (;;) {
            si = hero_coords_to_addr_in_proximity() + 3 * PROX_COLS + 1;
            wrap_map_from_above(&si);

            MEM8(ADDR_HERO_ANIM_PHASE)++;

            uint8_t tile = MEM8(si);
            if (is_blocking_tile(tile) != 0) {
                // Blocked tile reached: stop falling.
                MEM8(ADDR_HERO_ANIM_PHASE) |= 1;
                return;
            }

            hero_scroll_down();
            MEM8(ADDR_RENDER_DONE) = 0;
            MEM8(ADDR_RENDER_REQUEST) = 0xFF;

            if (MEM8(ADDR_HERO_ANIM_PHASE) & 1) {
                return;
            }
        }
    }

    // No longer over rope.
    if (MEM8(ADDR_ON_ROPE_FLAGS) == 0) {
        // Was already on the ground: crouch.
        MEM8(ADDR_FRAME_TICKS) = 0;
        MEM8(ADDR_SQUAT_FLAG) = 0xFF;
        return;
    }

    // Was on rope: dismount onto the ground.
    MEM8(ADDR_ON_ROPE_FLAGS) = 0x80;
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x80;
}

uint8_t move_platform_down_damage_monster()
{
    if (MEM8(ADDR_ON_ROPE_FLAGS)) return 0;

    uint16_t si = hero_coords_to_addr_in_proximity();
    si += 3 * 36 + 1;
    wrap_map_from_above(&si);

    int8_t dh;
    uint8_t dl = 0x40;
    if (identify_platform_tile(si, dl, &dh)) return 0;

    uint16_t di = MEM16(ADDR_VERTICAL_PLATFORMS_LIST);
    uint16_t platform_prox = find_platform_under_hero(&di, dh);

    dl = 0x40;
    if (try_move_platform_down(di, platform_prox, dl)) {
        MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
        hero_scroll_down();
        return 0xFF;
    }

    for (int i = -1; i < 3; i++) {
        uint16_t pos = platform_prox + 36 + i;
        wrap_map_from_above(&pos);
        uint8_t flags;
        uint16_t ms;
        if (get_dst_monster_flags(pos, &flags, &ms)) {
            if (!(flags & 0x60) && !(MEM8(ms + 5) & 0x20)) {
                MEM8(ms + 5) = (MEM8(ms + 5) & 0xE0) | 0x40;
            }
            break;
        }
    }
    return 0;
}

// Per-frame game loop
// this looped function was decoupled to several parts: ... and dungeon_finish_normal_frame()
// Checked
/*
void main_loop(void) {
    uint8_t restart;
    do {
        restart = 0xff;
        if (MEM8(ADDR_ON_ROPE_FLAGS) == 0) { // normal path
            input_handling();
            sliding_physics_step();
            main_update_render();
            // 8< =============
            magic_spell_fire_handler();
            hero_interaction_check();
            hero_knockback_handler();

            MEM8(ADDR_FRAME_TICKS)++;
            if (MEM8(ADDR_FRAME_TICKS) == 2) {
                MEM8(ADDR_SQUAT_FLAG) = 0;
            }
            // check input keys buffer
            if (MEM8(ADDR_INPUT_DIRS) & KEY_DOWN) {
                MEM8(ADDR_FACING) &= ~UP;
            }
            airborne_movement(&restart); // can break the loop by setting restart = 0
            state_machine_dispatcher();
        } else { // over_rope path
            for (;;) {
                MEM8(ADDR_SQUAT_FLAG) = 0;
                MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
                MEM8(ADDR_SLOPE_DIRECTION) = 0;
                MEM8(ADDR_SPELL_ACTIVE_FLAG) = 0;
                Flush_Ui_Element_If_Dirty_proc();
                MEM8(ADDR_SWORD_SWING_FLAG) = 0;
                main_update_render();
                hero_knockback_handler();
                state_machine_dispatcher();
                if (MEM8(ADDR_ON_ROPE_FLAGS) != 0xFF) break;
                uint16_t si = hero_coords_to_addr_in_proximity() + 1; // hero head
                if (is_over_rope(si)) continue;
                si += 36; // body level
                wrap_map_from_above(&si);
                if (!is_over_rope(si)) break;
            }
            MEM8(ADDR_FACING) &= ~UP;
            MEM8(ADDR_ON_ROPE_FLAGS) = 0;
            MEM8(ADDR_SPACEBAR_LATCH) = 0;
            MEM8(ADDR_ALTKEY_LATCH) = 0;
            MEM8(ADDR_SLIDE_TICKS_REMAINING) = 0;
            MEM8(ADDR_HORIZ_MOVEMENT_ACCUM) = 0;
            MEM8(ADDR_HERO_ANIM_PHASE) = 0x7F;
        }
    } while (restart); // TODO: manage it on caller side.
} */

// Original assembly returns CF if true
// Checked
uint8_t is_over_rope(uint16_t si)
{
    uint8_t tile = MEM8(si);
    if (tile == 1 || tile == 2) return 0xFF;
    return 0;
}

// ============================================================================
// Exported Core Assembly Functions
// ============================================================================
// Checked
void hero_knockback_handler()
{
    if (MEM8(ADDR_BYTE_9F14) == 0) {
        return;
    }

    uint8_t moveLeft;

    if (MEM8(ADDR_BYTE_9F01) != 0) {
        moveLeft = 0xff; // true
    } else {
        uint8_t word9F0E_nonzero = MEM16(ADDR_KNOCKBACK_VECTOR_9F0E) != 0;

        moveLeft = word9F0E_nonzero && (MEM16(ADDR_KNOCKBACK_VECTOR_9F10) != 0) 
            ? (MEM8(ADDR_FACING) & LEFT) == 0 
            : !word9F0E_nonzero;
    }

    if (moveLeft) {
        if (MEM8(ADDR_ON_ROPE_FLAGS)) {
            MEM8(ADDR_FACING) = (MEM8(ADDR_FACING) & 0xFC) | LEFT;

            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
            MEM8(ADDR_SPACEBAR_LATCH) = 0;
        }

        move_hero_left_if_no_obstacles();
        move_hero_left_if_no_obstacles();
    } else {
        if (MEM8(ADDR_ON_ROPE_FLAGS))
        {
            MEM8(ADDR_FACING) &= 0xFC;

            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
            MEM8(ADDR_SPACEBAR_LATCH) = 0;
        }

        move_hero_right_if_no_obstacles();
        move_hero_right_if_no_obstacles();
    }

    if (MEM8(ADDR_ON_ROPE_FLAGS)) {
        MEM8(ADDR_ON_ROPE_FLAGS) = 0x80;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
    }

    if (MEM8(ADDR_AIR_UP_TILE_FOUND) != 0)
        return;

    if (MEM8(ADDR_JUMP_PHASE_FLAGS) & 0x80) {
        return;
    }

    if (!check_floor_for_landing()) return;

    if (MEM8(ADDR_BYTE_9F09) != 0) {
        MEM8(ADDR_BYTE_9F09)--;
        MEM8(ADDR_HERO_HEAD_Y_VIEW)++;
        return;
    } else {
        hero_scroll_down();
    }
}

// Checked
void sliding_physics_step(void)
{
    if (set_zero_flag_if_slippery() != 0) {
        return; // NZ: not slippery
    }

    if (MEM8(ADDR_JUMP_PHASE_FLAGS) != 0) {
        return; // airborne
    }

    if (MEM8(ADDR_SLIDE_TICKS_REMAINING) == 0) {
        return;
    }

    MEM8(ADDR_SLIDE_TICKS_REMAINING)--;
    uint16_t si = hero_coords_to_addr_in_proximity() + 3 * PROX_COLS + 1;
    // target tile directly below feet matrix center
    wrap_map_from_above(&si);

    uint8_t tile = MEM8(si);
    if (tile >= 0x40 && tile < 0x49) {
        MEM8(ADDR_SLIDE_TICKS_REMAINING) = 0; // stepped on non-slippery tile, stop sliding
        return;
    }

    // on the ice
    uint8_t slide_dir = MEM8(ADDR_SLIDE_DIRECTION);
    if ((MEM8(ADDR_SLIDE_DIRECTION_LOCK) & 1) == 0) {
        if (slide_dir == 2) return;
        move_hero_left_if_no_obstacles();
    } else {
        if (slide_dir == 1) return;
        move_hero_right_if_no_obstacles();
    }
}

// Checked
void right_up_pressed()
{
    MEM8(ADDR_BYTE_9F0B) = 0xFF;
    jump_press_handler();
    on_right_pressed();
}

// Checked
void on_right_pressed()
{
    MEM8(ADDR_BYTE_9F18) = 0;
    if (MEM8(ADDR_FACING) & LEFT) {
        MEM8(ADDR_FACING) ^= LEFT;
        return;
    }
    if (MEM8(ADDR_SQUAT_FLAG) != 0) {
        return;
    }

    if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_LEFT || 
            move_hero_right_if_no_obstacles() == 0) { // CF emulation check
        init_on_ground();
        return;
    }

    MEM8(ADDR_SLIDE_DIRECTION) = SLIDE_RIGHT;
    if (MEM8(ADDR_ON_ROPE_FLAGS) != 0) {
        return;
    }

    if (set_zero_flag_if_slippery() == 0 && MEM8(ADDR_SLIDE_TICKS_REMAINING) == 0) {
        MEM8(ADDR_SLIDE_DIRECTION_LOCK) = 1; // right movement locked
        MEM8(ADDR_HORIZ_MOVEMENT_ACCUM)++;
    }

    MEM8(ADDR_FACING) |= UP;
    if (MEM8(ADDR_JUMP_PHASE_FLAGS) != 0) {
        return;
    }

    MEM8(ADDR_HERO_ANIM_PHASE) = (MEM8(ADDR_HERO_ANIM_PHASE) + 1) & 0x7F;
    MEM8(ADDR_BYTE_9F19) = 0;
}

// Checked
void init_on_ground() 
{
    // stub
    MEM8(ADDR_FACING) &= ~UP;
    if (MEM8(ADDR_ON_ROPE_FLAGS) == 0 && MEM8(ADDR_JUMP_PHASE_FLAGS) == 0) {
        MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
    }
}

// Checked
void left_up_pressed()
{
    MEM8(ADDR_BYTE_9F0B) = 0xFF;
    jump_press_handler();
    on_left_pressed();
}

// Checked
void on_left_pressed()
{
    MEM8(ADDR_BYTE_9F18) = 0;
    if (!(MEM8(ADDR_FACING) & LEFT)) {
        MEM8(ADDR_FACING) ^= LEFT;
        return;
    }

    if (MEM8(ADDR_SQUAT_FLAG) != 0) {
        return;
    }

    if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_RIGHT || 
            move_hero_left_if_no_obstacles() == 0) { // CF emulation check
        init_on_ground();
        return;
    }

    MEM8(ADDR_SLIDE_DIRECTION) = SLIDE_LEFT;
    if (MEM8(ADDR_ON_ROPE_FLAGS) != 0) {
        return;
    }

    if (set_zero_flag_if_slippery() == 0 && MEM8(ADDR_SLIDE_TICKS_REMAINING) == 0) {
        MEM8(ADDR_SLIDE_DIRECTION_LOCK) = 0; // left movement unlocked
        MEM8(ADDR_HORIZ_MOVEMENT_ACCUM)++;
    }

    MEM8(ADDR_FACING) |= UP;
    if (MEM8(ADDR_JUMP_PHASE_FLAGS) != 0) {
        return;
    }

    MEM8(ADDR_HERO_ANIM_PHASE) = (MEM8(ADDR_HERO_ANIM_PHASE) + 1) & 0x7F;
    MEM8(ADDR_BYTE_9F19) = 0;
}

// Caller should set restart = 0xff before calling, and then check if it 
// was set to 0 by this function to decide whether to restart the loop
// Return true to call state_machine_dispatcher, false to skip it
// Checked
uint8_t airborne_movement() {
    if (MEM8(ADDR_AIR_UP_TILE_FOUND) != 0) {
        return 1;
    }
    if (MEM8(ADDR_JUMP_PHASE_FLAGS) & 0x80) {
        return 1;
    }

    hero_collapse_platform();
    slope_assist_on_landing();
    if (!check_floor_for_landing()) {
        // should either returm normally, or jump to main_loop label
        return land_after_jump();
    }

    MEM8(ADDR_JUMP_HEIGHT_COUNTER)++;
    if (MEM8(ADDR_BYTE_9F09) != 0) {
        MEM8(ADDR_BYTE_9F09)--;
        MEM8(ADDR_HERO_HEAD_Y_VIEW)++;
    } else {
        hero_scroll_down();
    }
    // simulate pop trick by returning 0

    if (!(MEM8(ADDR_FACING) & UP)) {
        uint16_t si = hero_coords_to_addr_in_proximity() + 2 * PROX_COLS + 1;
        wrap_map_from_above(&si);
        if (is_over_rope(si)) {
            MEM8(ADDR_ON_ROPE_FLAGS) = 0xFF; // Grab onto rope mid-air
            return 0;
        }
    }

    MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
    uint8_t old_phase = MEM8(ADDR_JUMP_PHASE_FLAGS);
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
    if (MEM8(ADDR_SLOPE_DIRECTION) != 0) return 0;
    if (MEM8(ADDR_INVINCIBILITY_FLAG) != 0) return 0;

    if (old_phase == 0) {
        // should clear facing_direction UP on exit
        if (MEM8(ADDR_FACING) & LEFT) {
            on_left_pressed();
        } else {
            on_right_pressed();
        }
        MEM8(ADDR_FACING) &= ~UP;
        return 0;
    }

    uint8_t horiz_input = MEM8(ADDR_INPUT_DIRS) & (KEY_LEFT | KEY_RIGHT);

    if (horiz_input == KEY_LEFT) {
        // left_pressed
        if (!(MEM8(ADDR_FACING) & LEFT)) {
            MEM8(ADDR_FACING) &= ~UP;
            MEM8(ADDR_FACING) ^= LEFT;
            left_default();
        } // else default
    } else if (horiz_input == KEY_RIGHT) {
        // right_pressed
        if (MEM8(ADDR_FACING) & LEFT) {
            MEM8(ADDR_FACING) &= ~UP;
            MEM8(ADDR_FACING) ^= LEFT;
            right_default();
        } // else default
    }
    // default
    if ((MEM8(ADDR_FACING) & UP) == 0) { // UP mask flag checking matching layout
        if (horiz_input == KEY_LEFT) {
            left_default();
        } else if (horiz_input == KEY_RIGHT) {
            right_default();
        }
    } else {
        if (MEM8(ADDR_FACING) & LEFT) {
            on_left_pressed();
        } else {
            on_right_pressed();
        }
    }
    return 0;
}

// Checked
void left_default()
{
    uint16_t si = hero_coords_to_addr_in_proximity() + 3 * PROX_COLS + 1;
    wrap_map_from_above(&si);
    if (is_blocking_tile(MEM8(si)) == 0) {
        si++;
        if (is_blocking_tile(MEM8(si))) {
            move_hero_right_if_no_obstacles();
        }
    }
}

// Checked
void right_default()
{
    uint16_t si = hero_coords_to_addr_in_proximity() + 3 * PROX_COLS + 1;
    wrap_map_from_above(&si);
    if (is_blocking_tile(MEM8(si)) == 0) {
        si--;
        if (is_blocking_tile(MEM8(si))) {
            move_hero_left_if_no_obstacles();
        }
    }
}

// Checked
void slope_assist_on_landing(void)
{
    MEM8(ADDR_SLOPE_DIRECTION) = 0;

    uint16_t si = hero_coords_to_addr_in_proximity() + 2 * PROX_COLS + 1;
    wrap_map_from_above(&si);

    // get_slope_direction_by_tile_under_feet returns NZ if slope, ZF if none.
    // In C we return 0 -> no slope, 1 -> right slope, 2 -> left slope.
    uint8_t dl = get_slope_direction_by_tile_under_feet(si);
    if (dl == 0) return;

    MEM8(ADDR_FACING) &= ~UP;
    MEM8(ADDR_SLOPE_DIRECTION) = dl;

    if (MEM8(ADDR_HEIGHT_ABOVE_GROUND) != 0) { // check_silkarn_shoes_and_slopes
        if (MEM8(ADDR_CURRENT_ACCESSORY) == ACCESSORY_SILKARN_SHOES) return;
        MEM8(ADDR_HEIGHT_ABOVE_GROUND)--;
        if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_RIGHT) {
            move_hero_right_if_no_obstacles();
        } else {
            move_hero_left_if_no_obstacles();
        }
        return;
    }

    // height_above_ground == 0
    uint8_t old_ticks = MEM8(ADDR_TICKS);  // test OLD value before increment (matches asm)
    MEM8(ADDR_TICKS)++;
    if ((old_ticks & 3) != 0) return;
    // every 4th tick
    uint8_t keys = MEM8(ADDR_INPUT_DIRS);
    // Right slope \: pressing LEFT prevents sliding right
    // Left slope  /: pressing RIGHT prevents sliding left
    if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_RIGHT) {
        if (!(keys & KEY_LEFT)) move_hero_right_if_no_obstacles();
    } else {
        if (!(keys & KEY_RIGHT)) move_hero_left_if_no_obstacles();
    }
}

/*
 * Checks whether the given tile is a slope tile.
 * Returns:  2  → left slope  (/),  ZF=1, DL=2 in original asm
 *           1  → right slope (\),  ZF=1, DL=1
 *           0  → not a slope tile   (NZ in original asm)
 */
uint8_t get_slope_direction_by_tile_under_feet(uint16_t si)
{
    uint8_t tile = MEM8(si);

    for (int i = 0; i < 4; i++) {
        uint8_t sl = MEM8_1(ADDR_SLOPE_TILES_LEFT + i);
        if (sl == 0) 
            break;
        if (tile == sl) {
            return SLOPE_LEFT;
        }
    }

    for (int i = 0; i < 4; i++) {
        uint8_t sl = MEM8_1(ADDR_SLOPE_TILES_RIGHT + i);
        if (sl == 0) 
            break;
        if (tile == sl) {
            return SLOPE_RIGHT;
        }
    }

    return SLOPE_NONE;
}

// Checked
void check_airflows_on_hero()
{
    MEM8(ADDR_AIR_UP_TILE_FOUND) = 0;
    uint16_t si = hero_coords_to_addr_in_proximity() + 2 * PROX_COLS + 1;
    wrap_map_from_above(&si);
    for (int i = 0; i < 3; i++) {
        dispatch_airflows(si);
        si -= PROX_COLS;
        wrap_map_from_below(&si);
    }
}

static uint8_t main_update_render_pre(void) {
    uint8_t jump_height = 2;
    if (MEM8(ADDR_CURRENT_ACCESSORY) == ACCESSORY_FERUZA_SHOES) {
        jump_height = 4;
    }
    MEM8(ADDR_JUMP_HEIGHT_INCLUDING_SHOES) = jump_height;
    check_airflows_on_hero();

    if (MEM8(ADDR_JUMP_PHASE_FLAGS) == 0) {
        MEM8(ADDR_BYTE_9F09) = 0;
        if (MEM8(ADDR_BYTE_9F00) != MEM8(ADDR_HERO_HEAD_Y_VIEW)) {
            if (MEM8(ADDR_BYTE_9F00) < MEM8(ADDR_HERO_HEAD_Y_VIEW)) {
                hero_scroll_down();
                MEM8(ADDR_HERO_HEAD_Y_VIEW)--;
            } else {
                move_hero_up();
                MEM8(ADDR_HERO_HEAD_Y_VIEW)++;
            }
        }
    }

    if (MEM8(ADDR_IS_JASHIIN_CAVERN) != 0 || MEM8(ADDR_IS_BOSS_CAVERN) != 0) {
        uint16_t si = MEM16(ADDR_BOSS_STATE_PTR) + 7; // arena_center_x; e.g. 12 for Crab
        if (MEM8(ADDR_HERO_X_VIEW) != MEM8(si)) {
            move_hero_right_if_no_obstacles();
            MEM8(ADDR_HERO_X_VIEW)--;
        }
    } else {
        if (MEM8(ADDR_HERO_X_VIEW) != 12) {
            move_hero_left_if_no_obstacles();
            MEM8(ADDR_HERO_X_VIEW)++;
        }
    }

    MEM8(ADDR_HERO_Y) = (MEM8(ADDR_HERO_HEAD_Y_VIEW) + MEM8(ADDR_VIEWPORT_TOP_ROW)) & 0x3F;
    update_boss_heartbeat_volume();
    update_and_render_horiz_platforms();
    render_vertical_platforms_to_proximity();
    process_visible_collapsing_platforms();
    process_doors();
    dispatch_spell_projectile_movement();

    if (MEM8(ADDR_BOSS_IS_DEAD) == 0) {
        monsters_spawning();
    }

    MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
    MEM8(ADDR_BYTE_9F14) = 0;
    check_hero_contact_damage();
    Flush_Ui_Element_If_Dirty_proc(); // request canvas redraw, todo
    projectiles_collision_processing();
    monsters_updates();
    Render_Sword_Overlay();
    step_on_aggressive_ground();

    if (MEM8(ADDR_CAVERN_LEVEL) == 7 && MEM8(ADDR_CURRENT_ACCESSORY) != ACCESSORY_ASBESTOS_CAPE) { // heat damage
        MEM8(ADDR_TEMPERATURE_TIMER)++;
        if ((MEM8(ADDR_TEMPERATURE_TIMER) & 0x3F) == 0) {
            MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0xFF;
            MEM8(ADDR_SOUND_FX_REQUEST) = 9;
            damage_hero(0x0F);
            render_notification_string(ITS_TOO_HOT_STR);
        }
    }

    screen_flash_overlay();
    return MEM8(ADDR_INVINCIBILITY_FLAG) != 0;
}

// TODO: move rendering to js
// Checked
void main_update_render(void) {
    uint8_t invincible = main_update_render_pre();
    if (invincible) {
        MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
    }
    game_loop_render_and_timing(invincible);
}

// ============================================================================
// Rendering + timing portion of the per-frame cycle.
// TODO: move handling to js
// ============================================================================
// Checked
static uint8_t dungeon_render_timing_step(uint8_t invincible)
{
    uint8_t phase = MEM8(ADDR_DUNGEON_FRAME_PHASE);
    uint8_t speed = MEM8(ADDR_SPEED_CONST);
    if (speed == 0) speed = 1;

    if (phase == 0) {
        if (!invincible) {
            MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0;
        }

        MEM8(ADDR_SHIELD_ANIM_ACTIVE) = 0;

        if (MEM8(ADDR_SWORD_SWING_FLAG) != 0) {
            MEM8(ADDR_SHIELD_ANIM_ACTIVE) = 0xFF;
            MEM8(ADDR_SHIELD_VARIANT_INDEX) = MEM8(ADDR_SWORD_HIT_TYPE);
            MEM8(ADDR_SHIELD_ANIM_PHASE) = MEM8(ADDR_SWORD_MOVEMENT_PHASE);
        } else if (MEM8(ADDR_SPELL_ACTIVE_FLAG) != 0) {
            MEM8(ADDR_SHIELD_ANIM_ACTIVE) = 0xFF;
            MEM8(ADDR_SHIELD_ANIM_PHASE) = MEM8(ADDR_BYTE_9F2B);
            MEM8(ADDR_SHIELD_VARIANT_INDEX) = 1;
        }

        if (MEM8(ADDR_HERO_SPRITE_HIDDEN) == 0) {
            clear_hero_in_viewport();
        }

        Sample_Neighborhood_Attributes();
        if (MEM8(ADDR_INVINCIBILITY_FLAG) == 0) {
            uint16_t timer = MEM16(ADDR_HEALING_TIMER);
            if (timer != 0) {
                timer--;
                MEM16(ADDR_HEALING_TIMER) = timer;
                MEM16(ADDR_HERO_HP) += 8;
                if (MEM16(ADDR_HERO_HP) >= MEM16(ADDR_HERO_MAX_HP)) {
                    MEM16(ADDR_HERO_HP) = MEM16(ADDR_HERO_MAX_HP);
                    MEM16(ADDR_HEALING_TIMER) = 0;
                }
                MEM8(ADDR_SOUND_FX_REQUEST) = 19;
                Draw_Hero_Health();
            }
        }

        // Refresh_Dirty_Tiles moved to game.js
        // JS handles tile rendering, entity overlay, and tile animation

        if (MEM8(ADDR_SPRITE_FLASH_FLAG) != 0) {
            Boss_Explosions_Renderer();
            MEM8(ADDR_BYTE_FF24) = 10;
        }

        MEM8(ADDR_RENDER_DONE) = 0;
        MEM8(ADDR_RENDER_REQUEST) = 0xFF;
        MEM8(ADDR_DUNGEON_FRAME_PHASE) = 1;
        return 0;
    }

    if (phase == 1) {
        if (MEM8(ADDR_FRAME_TIMER) < (uint8_t)(2 * speed)) {
            return 0;
        }

        monsters_updates();
        Flush_Ui_Element_If_Dirty_proc();
        update_and_render_projectile_row_pair();
        render_and_collision_pass_row();
        update_active_projectiles_render();
        apply_sword_hit_to_map_tiles();
        Render_Sword_Overlay();

        MEM8(ADDR_RENDER_DONE) = 0;
        MEM8(ADDR_RENDER_REQUEST) = 0xFF;
        MEM8(ADDR_DUNGEON_FRAME_PHASE) = 2;
        return 0;
    }

    if (MEM8(ADDR_FRAME_TIMER) < (uint8_t)(4 * speed)) {
        Confirm_Exit_Dialog_proc();
        Handle_Pause_State_proc();
        Handle_Speed_Change_proc();
        return 0;
    }

    Confirm_Exit_Dialog_proc();
    Handle_Pause_State_proc();
    Handle_Speed_Change_proc();
    if (Handle_Restore_Game_proc()) {
        restore_game();
    }

    MEM8(ADDR_FRAME_TIMER) = 0;
    MEM8(ADDR_DUNGEON_FRAME_PHASE) = 0;

    if (MEM8(ADDR_INVINCIBILITY_FLAG) != 0) {
        return 1;
    }

    if (MEM8(ADDR_HERO_INVINCIBILITY) == 0 && MEM16(ADDR_HERO_HP) == 0) {
        MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_DEATH_FALL;
        MEM8(ADDR_DEATH_PHASE) = 0;
        MEM8(ADDR_DEATH_COUNTER) = 0;
        process_hero_death();
        return 1;
    }

    MEM8(ADDR_BYTE_9F18)++; // natural health regeneration timer?
    if (MEM8(ADDR_BYTE_9F18) >= 16) {
        MEM8(ADDR_BYTE_9F18) = 0;
        if (MEM16(ADDR_HERO_HP) < MEM16(ADDR_HERO_MAX_HP)) {
            MEM16(ADDR_HERO_HP) += 2; // original version also has this bug (if damage was odd, health becomes eventually max+1)
            Draw_Hero_Health();
        }
    }

    if (MEM8(ADDR_BYTE_9F1E) != 0) {
        load_place_and_reinit();
        return 1;
    }

    if (MEM8(ADDR_IS_BOSS_CAVERN) != 0 && MEM8(ADDR_BOSS_IS_DEAD) != 0) {
        if (MEM8(ADDR_BOSS_EXPLOSIONS_LIST) == 0xFF) {
            uint16_t si = MEM16(ADDR_BOSS_STATE_PTR);
            uint16_t xp_reward = MEM16(si + 5);
            update_hero_XP(xp_reward);
            uint16_t almas_reward = MEM16(si + 11);
            hero_got_almas(almas_reward);
            MEM8(ADDR_BYTE_9F1E) = 0xFF;
        }
    }

    if (MEM8(ADDR_BOSS_BEING_HIT) != 0) {
        return 1;
    }

    if (MEM16(ADDR_F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter) & KEY_ENTER) {
        bring_inventory_window();
    } else {
        MEM8(ADDR_BYTE_9EF5) = 0;
    }

    return 1;
}

void game_loop_render_and_timing(uint8_t invincible)
{
    (void)dungeon_render_timing_step(invincible);
}

static void dungeon_finish_normal_frame(void)
{
    magic_spell_fire_handler();
    hero_interaction_check();
    hero_knockback_handler();

    MEM8(ADDR_FRAME_TICKS)++;
    if (MEM8(ADDR_FRAME_TICKS) == 2) {
        MEM8(ADDR_SQUAT_FLAG) = 0;
    }

    if (MEM8(ADDR_INPUT_DIRS) & UP) {
        MEM8(ADDR_FACING) &= ~UP;
    }

    if (airborne_movement()) {
        state_machine_dispatcher();
    }

    if (MEM8(ADDR_ON_ROPE_FLAGS) != 0) {
        MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_ROPE;
    }

    MEM8(ADDR_RENDER_DONE) = 0;
    MEM8(ADDR_RENDER_REQUEST) = 0xFF;
}

static void dungeon_update_normal(void)
{
    if (MEM8(ADDR_DUNGEON_FRAME_PHASE) == 0) {
        if (MEM8(ADDR_ON_ROPE_FLAGS) != 0) {
            MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_ROPE;
            dungeon_update_rope();
            return;
        }

        input_handling();
        sliding_physics_step();
        uint8_t invincible = main_update_render_pre();
        if (invincible) {
            MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
        }
        dungeon_render_timing_step(invincible);
        return;
    }

    uint8_t invincible = MEM8(ADDR_INVINCIBILITY_FLAG) != 0;
    if (dungeon_render_timing_step(invincible)) {
        if (MEM8(ADDR_DUNGEON_STATE) == DUNGEON_STATE_NORMAL) {
            dungeon_finish_normal_frame();
        } else if (MEM8(ADDR_DUNGEON_STATE) == DUNGEON_STATE_ROPE) {
            dungeon_finish_rope_frame();
        }
    }
}

static void dungeon_finish_rope_frame(void)
{
    hero_knockback_handler();
    state_machine_dispatcher();

    if (MEM8(ADDR_ON_ROPE_FLAGS) == 0xFF) {
        uint16_t si = hero_coords_to_addr_in_proximity() + 1;
        if (is_over_rope(si)) {
            MEM8(ADDR_RENDER_DONE) = 0;
            MEM8(ADDR_RENDER_REQUEST) = 0xFF;
            return;
        }
        si += PROX_COLS;
        wrap_map_from_above(&si);
        if (is_over_rope(si)) {
            MEM8(ADDR_RENDER_DONE) = 0;
            MEM8(ADDR_RENDER_REQUEST) = 0xFF;
            return;
        }
    }

    MEM8(ADDR_FACING) &= ~UP;
    MEM8(ADDR_ON_ROPE_FLAGS) = 0;
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
    MEM8(ADDR_SPACEBAR_LATCH) = 0;
    MEM8(ADDR_ALTKEY_LATCH) = 0;
    MEM8(ADDR_SLIDE_TICKS_REMAINING) = 0;
    MEM8(ADDR_HORIZ_MOVEMENT_ACCUM) = 0;
    MEM8(ADDR_HERO_ANIM_PHASE) = 0x7F;
    MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_NORMAL;
    MEM8(ADDR_RENDER_DONE) = 0;
    MEM8(ADDR_RENDER_REQUEST) = 0xFF;
}

static void dungeon_update_rope(void)
{
    if (MEM8(ADDR_DUNGEON_FRAME_PHASE) == 0) {
        MEM8(ADDR_SQUAT_FLAG) = 0;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
        MEM8(ADDR_SLOPE_DIRECTION) = 0;
        MEM8(ADDR_SPELL_ACTIVE_FLAG) = 0;
        Flush_Ui_Element_If_Dirty_proc();
        MEM8(ADDR_SWORD_SWING_FLAG) = 0;

        uint8_t invincible = main_update_render_pre();
        if (invincible) {
            MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
        }
        dungeon_render_timing_step(invincible);
        return;
    }

    uint8_t invincible = MEM8(ADDR_INVINCIBILITY_FLAG) != 0;
    if (dungeon_render_timing_step(invincible)) {
        if (MEM8(ADDR_DUNGEON_STATE) == DUNGEON_STATE_ROPE) {
            dungeon_finish_rope_frame();
        }
    }
}

// Checked
void dispatch_airflows(uint16_t si)
{
    uint8_t tile = MEM8(si);
    uint8_t dir = get_airflow_direction(tile);
    if (dir == 0xFF) return;

    switch (dir) {
        case 0: // up
            move_hero_up();
            move_hero_up();
            MEM8(ADDR_AIR_UP_TILE_FOUND) = 0xFF;
            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0; // no jumps while flying
            MEM8(ADDR_HERO_ANIM_PHASE) = 0x80; // idle
            break;
        case 1: // left
            move_hero_left_if_no_obstacles();
            move_hero_left_if_no_obstacles();
            break;
        case 2: // right
            move_hero_right_if_no_obstacles();
            move_hero_right_if_no_obstacles();
            break;
    }
}

// Checked
void up_pressed()
{
    MEM8(ADDR_BYTE_9F18) = 0;
    uint8_t should_break = 0;
    try_door_interaction(&should_break);
    if (should_break) { // simulate popping return address inside try_door_interaction
        return;
    }
    if (try_move_platform_up()) return;
    try_climb_rope();
    jump_press_handler();
}

// ============================================================================
// handle hero interaction near the door tiles
// 49 4A 61 4B 4C
// 4D 58 00 59 4E
// 5F 5A 00 5B 60
// 5F 5C 5D 5E 60
// This matrix 5x4 tiles describes the door frame
// ============================================================================
// Checked
void try_door_interaction(uint8_t *should_break)
{
    uint16_t si = hero_coords_to_addr_in_proximity() - PROX_COLS - 1;
    wrap_map_from_below(&si);

    // Check three adjacent tiles for a door (0x4A)
    if (MEM8(si) == 0x4A) {
        // on_the_right_door_tile
        if ((MEM8(ADDR_FACING) & LEFT) != 0) 
        {
            *should_break = 0xff; // simulate discard return address
            move_hero_left_if_no_obstacles();
        }
        return;
    }

    si++;
    if (MEM8(si) == 0x4A) {
        // centered on the door
        enter_the_door(should_break);
        return;
    }

    si++;
    if (MEM8(si) == 0x4A) {
        // on_the_left_door_tile
        if ((MEM8(ADDR_FACING) & LEFT) == 0) {
            *should_break = 0xff; // simulate discard return address
            move_hero_right_if_no_obstacles();
        }
        return;
    }
    // no door
}

// this is the main door handling block, when hero is centered
// Checked
void enter_the_door(uint8_t *should_break)
{
    // Compute hero absolute X
    uint16_t x = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + MEM8(ADDR_HERO_X_VIEW) + 4;
    uint16_t w = MEM16(ADDR_MAP_WIDTH);
    if (x >= w) {
        x -= w;
    }
    // and absolute y
    uint8_t y = (MEM8(ADDR_HERO_HEAD_Y_VIEW) - 1 + MEM8(ADDR_VIEWPORT_TOP_ROW)) & 0x3F;
    for (uint16_t si = MEM16(ADDR_DOORS_LIST); MEM16(si) != 0xFFFF; si += 12) {
        if (x == MEM16(si + 0) // x0
            && y == MEM8(si + 2) // y0
        ) {
            // matching door found
            *should_break = 0xff; // simulate popping return address inside try_door_interaction
            if (MEM8(si + 3) & 0x80) { // door.d_flags bit 7 = open
                enter_opened_door(si);
            } else {
                // try to open door
                if (open_door(si)) { // NC => nonzero = success
                    return;
                }
                // failed to open (CF)
                MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
                MEM8(ADDR_HORIZ_MOVEMENT_ACCUM) = 0;
                if (MEM8(ADDR_BYTE_9F19) != 0) return;
                MEM8(ADDR_BYTE_9F19) = 0xFF;
                MEM8(ADDR_SOUND_FX_REQUEST) = 22;
                render_notification_string(CANT_OPEN_THIS_DOOR_STR);
                return;
            }
        }
    }
    return;
}

// si = door pointer
// Return 0xff on success, 0 on failure
// Checked
uint8_t open_door(uint16_t si)
{
    if (MEM8(si + 8) & 1) {
        // lion_head_key_needed
        if (MEM8(ADDR_LION_KEYS_AMOUNT) == 0) return 0;
        MEM8(ADDR_LION_KEYS_AMOUNT)--;
    } else {
        // ordinary key needed
        if (MEM8(ADDR_KEYS_AMOUNT) == 0) return 0;
        MEM8(ADDR_KEYS_AMOUNT)--;
    }
    MEM8(ADDR_SOUND_FX_REQUEST) = 21;
    MEM8(si + 3) |= 0x80; // d_flags
    uint16_t achievementAddr = MEM16(si + 9);
    uint8_t achievementFlag = MEM8(si + 11);
    MEM8(achievementAddr) |= achievementFlag;
    return 0xff;
}

// si = door struct pointer
// Checked
void enter_opened_door(uint16_t si)
{
    uint16_t bx = MEM16(si + 9);   // d_save_achievement_addr
    if (bx != 0xFFFF) {
        MEM8(bx) |= MEM8(si + 11); // d_achievement_flag
    }

    Browse_Projectiles();          // clears projectile array
    clear_viewport_buffer();
    Flush_Ui_Element_If_Dirty_proc();
    reset_dungeon_state_vars();
    game_loop_render_and_timing(0); // redraw everything

    // Clear monster table (write 0xFFFF at monsters_table_addr)
    uint16_t monsters_ptr = MEM16(ADDR_MONSTERS_LIST);
    MEM16(monsters_ptr) = 0xFFFF; // empty monster list

    uint8_t door_flags = MEM8(si + 3); // d_flags
    uint8_t roka_color = door_flags & 7;
    uint16_t x1 = MEM16(si + 5);
    MEM16(ADDR_HERO_X_IN_PROXIMITY_MAP) = x1;
    uint8_t y1 = MEM8(si + 7);
    MEM8(ADDR_DOOR_TARGET_Y) = y1;
    uint8_t is_left_run = (door_flags >> 6) & 1;
    MEM8(ADDR_LEFT_RUN) = is_left_run;
    uint8_t door_features = MEM8(si + 8);
    MEM8(ADDR_DOOR_FEATURES) = door_features;
    uint8_t place_map_id = MEM8(si + 4);
    if (y1 == 0xFF) { // town transition
        place_map_id |= 0x80;   // door leads to town
    }
    MEM8(ADDR_PLACE_MAP_ID) = place_map_id;

    // Load new MDT (map descriptor table)
    // fn1_load_mdt_idx_ah
    load_mdt(place_map_id);

    if ((place_map_id & 0x80) == 0) {
        remove_accomplished_items(); // for caverns
    }

    // Position hero
    hero_left_16_down_1();          // sets hero_x_in_viewport = 0x0C, hero_head_y_in_viewport = 1

    // Check MDT descriptor bit 0 (town vs dungeon)
    uint16_t mdt_descr = MEM16(ADDR_MDT);
    uint8_t mdt_desc0 = MEM8(mdt_descr + 0);   // b7b6_msd_idx_b0
    if ((mdt_desc0 & 1) == 0) {
        Render_Roca_Tilemap(roka_color);
        MEM8(ADDR_MMAN_GRP_INDEX) = 0xFF;
        MEM8(ADDR_BYTE_FF24) = 10;
    } else {
        Render_Roca_Tilemap(roka_color);
        process_mdt_descriptor(mdt_desc0, mdt_descr + 1);
    }

    // Clear hero hidden flag
    MEM8(ADDR_HERO_HIDDEN_FLAG) = 0;
    MEM8(ADDR_BYTE_9EF5) = 0xFF;
    MEM8(ADDR_PROJECTILES_LIST) = 0xFF;

    if (door_features & 0x80) {
        // load cavern
        load_resource("rokademo.bin", 0x1A000); // load to seg1:A000
        roca_entrypoint();
        MEM8(ADDR_ENP_GRP_INDEX) = 0xFF;
        MEM8(ADDR_EAI_BIN_INDEX) = 0xFF;
        MEM8(ADDR_BYTE_9EFA) = MEM8(ADDR_MSD_INDEX);
        MEM8(ADDR_BYTE_9F02) = 0xFF;
        load_cavern_sprites_ai_music(); // load dchr.grp, mpp{mpp_grp_index}.grp, eai{eai_bin_index}.bin, 
                                        // enp{enp_grp_index}.grp, load mgt{mgt_msd_index}.msd
        // load_resource('fman.grp', fman_gfx);
        // Decompress_Tile_Data_proc(fman_gfx + 0x333, hero_transparency_masks, 230);
        after_run_animation();
    } else {
        roka_run();
        // after_run_animation() is called by the DUNGEON_STATE_ROKA_RUN state handler
    }
}

// Final dungeon or town setup
// Checked
void after_run_animation()
{
    // Can't use ADDR_MDT here — load_mdt is a stub, so MDT data is still
    // the old dungeon's. Use ADDR_PLACE_MAP_ID instead, which was set
    // correctly from the door struct in enter_opened_door.
    if (MEM8(ADDR_PLACE_MAP_ID) & 0x80) {
        // town — signal game.js to init town entry
        MEM8(ADDR_DUNGEON_EXIT_FLAG) = 0xFF;
        MEM8(ADDR_DUNGEON_STATE) = DUNGEON_STATE_EXIT;
    } else {
        // dungeon
        uint16_t mdt_descr = MEM16(ADDR_MDT);
        uint8_t mdt_desc0 = MEM8(mdt_descr + 0);   // b7b6_msd_idx_b0
        load_cavern_sprites_ai_music(); // load dchr.grp, mpp{mpp_grp_index}.grp, eai{eai_bin_index}.bin, 
                                        // enp{enp_grp_index}.grp, load mgt{mgt_msd_index}.msd
        MEM8(ADDR_IS_BOSS_CAVERN) = (mdt_desc0 & 0x80) ? 0xFF : 0;
        MEM8(ADDR_IS_JASHIIN_CAVERN) = (mdt_desc0 & 0x40) ? 0xFF : 0;
        MEM8(ADDR_BOSS_BEING_HIT) = 0;
        MEM8(ADDR_SPRITE_FLASH_FLAG) = 0;
        Clear_Viewport_proc();
        MEM8(ADDR_HERO_X_VIEW) = 12;
        MEM8(ADDR_HERO_HEAD_Y_VIEW) = MEM8(ADDR_HERO_Y_VIEW_INIT);
        MEM8(ADDR_BYTE_9F00) = MEM8(ADDR_HERO_HEAD_Y_VIEW);
        MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
        Reassemble_3_Planes_To_Packed_Bitmap_proc(0x18030, 0x66);
        NoOperation_proc();
        Load_Magic_Spell_Sprite_Group_proc(); // Reads corresponding sprite group fron seg2:0 buffer to seg1:9350h
                                              // Output: Loads sprite sheet for current_magic_spell
                                              // DS:SI -> seg1:9350h buffer
        Reassemble_3_Planes_To_Packed_Bitmap_proc(0/* magic sprite data */, 24);
        Cavern_Game_Init();
    }
}


void Cavern_Game_Init(void) {
    MEM8(ADDR_SLIDE_TICKS_REMAINING) = 0;
    MEM8(ADDR_HORIZ_MOVEMENT_ACCUM) = 0;
    MEM8(ADDR_SLIDE_DIRECTION) = 0;
    MEM8(ADDR_PROJECTILES_LIST) = 0xFF;
    MEM8(ADDR_BOSS_EXPLOSIONS_LIST) = 0xFF;
    MEM16(ADDR_MAGIC_PROJECTILES) = 0xFFFF;
    MEM8(ADDR_BOSS_BEING_HIT) = 0;
    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0;
    MEM8(ADDR_BOSS_IS_DEAD) = 0;
    MEM8(ADDR_BYTE_9F01) = 0;

    if (MEM8(ADDR_IS_BOSS_CAVERN) != 0) {
        render_hud_bars_with_enemy();

        // stop music (fn1)
        // int60h_music(FN1_STOP_MUSIC);

        MEM8(ADDR_BYTE_9F02) = 0xFF;

        // compute offset into vfs_mgt1_msd table based on msd_index
        uint8_t msd_idx = MEM8(ADDR_MSD_INDEX);
        // We should signal js to load music
        // load_music_by_msd_index();

        // load encnt.grp to seg1:4000h
        // res_dispatcher_proc("encnt.grp", 0x14000);

        Render_Animated_Tile_Strip_proc();
        MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0;
        Update_Local_Attribute_Cache_proc();
        Copy_Tile_Buffer_To_VRAM_proc();
        clear_hero_in_viewport();
        MEM8(ADDR_BYTE_9F02) = 0;

        // start music (fn0)
        // int60h_music(FN0_INIT_PLAY_MUSIC);

        // Flash "ENCOUNTER" 6 times
        for (int cx = 0; cx < 6; cx++) {
            MEM8(ADDR_FRAME_TIMER) = 0;
            while (MEM8(ADDR_FRAME_TIMER) < 65) {
                // busy wait
            }
            // Draw_Bordered_Rectangle_proc(bx=0x0C28, cx=0x3828, al=0)
            MEM8(ADDR_FRAME_TIMER) = 0;
            while (MEM8(ADDR_FRAME_TIMER) < 65) {
                // busy wait
            }
            Render_Animated_Tile_Strip_proc();
        }

        // Override enp_grp_idx with boss_grp from mdt_descriptor
        uint16_t si = ADDR_MDT;  // mdt_buffer
        uint8_t boss_grp = MEM8(si + 5);  // mdt_descriptor.boss_grp
        MEM8(si + 4) = boss_grp;          // mdt_descriptor.enp_grp_idx = boss_grp

        // load_boss_sprites(boss_grp);

        // Decompress tile data
        // Decompress_Tile_Data_proc(0x14000, 0x1A000, 0x100);

        render_boss_hud();
    } else {
        // ------------------------------------------------------------------------
        // Regular cavern path
        // ------------------------------------------------------------------------
        // Clear_Place_Enemy_Bar_proc();
        // render_place_and_gold_labels();
        uint16_t cavern_name_ptr = MEM16(ADDR_CAVERN_NAME_INFO);
        // Render_Pascal_String_1_proc(cavern_name_ptr);
        Print_Gold_Decimal();
    }
// loc_618F
    // Draw_Hero_Max_Health_proc();
    // Draw_Hero_Health_proc();
    // Print_Almas_Decimal_proc();

    if (MEM8(ADDR_IS_JASHIIN_CAVERN) != 0) {
        MEM8(ADDR_BYTE_9F26) = 0xFF;
        MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = 41;
        MEM8(ADDR_HERO_X_VIEW) = 5;
        unpack_map();
        clear_viewport_buffer();

        do {
            main_update_render();
        } while (MEM8(ADDR_IS_JASHIIN_CAVERN) != 0);

        // Start music (fn0)
        // int60h_music(FN0_INIT_PLAY_MUSIC);

        MEM8(ADDR_BYTE_9F02) = 0;

        // Load Jashiin room MDT
        // res_dispatcher_proc("MPA0.MDT", 0xC000);

        MEM8(ADDR_IS_BOSS_CAVERN) = 0xFF;
        MEM8(ADDR_BYTE_9F27) = 0xFF;

        uint16_t mdt_descr = MEM16(ADDR_MDT);
        uint8_t desc_byte0 = MEM8(mdt_descr);
        process_mdt_descriptor(desc_byte0, mdt_descr+1);

        load_cavern_sprites_ai_music(); // load dchr.grp, load mpp{mpp_grp_index}.grp, load eai{eai_bin_index}.bin
                                        // load enp{enp_grp_index}.grp, load mgt{mgt_msd_index}.msd

        Reassemble_3_Planes_To_Packed_Bitmap_proc(0x18030, 102);
        NoOperation_proc();
        Load_Magic_Spell_Sprite_Group_proc();
        Reassemble_3_Planes_To_Packed_Bitmap_proc(/* magic sprite data */ 0x9350, 24); // address from Load_Magic_Spell_Sprite_Group_proc

        MEM16(ADDR_HERO_X_IN_PROXIMITY_MAP) = 24;
        MEM8(ADDR_DOOR_TARGET_Y) = 13;
        MEM8(ADDR_HERO_X_VIEW) = 12;
        MEM8(ADDR_BYTE_9F00) = 12;
        hero_left_16_down_1();
        render_hud_bars_with_enemy();
        render_boss_hud();

        // Draw_Hero_Max_Health_proc();
        // Draw_Hero_Health_proc();
        // Print_Almas_Decimal_proc();
    } else {
        // ------------------------------------------------------------------------
        // Normal cavern startup (non‑Jashiin); init_cavern
        // ------------------------------------------------------------------------
        unpack_map();
        if (MEM8(ADDR_BYTE_9F27) != 0) {
            clear_viewport_buffer();
            main_update_render();
            MEM8(ADDR_BYTE_9F26) = 0;
        } else {
            if (MEM8(ADDR_IS_BOSS_CAVERN) != 0) {
                // Render_Viewport_Tiles_proc();
            }
            clear_viewport_buffer();
            update_all_monsters_in_map();
        }
        // loc_6266
        if (MEM8(ADDR_DEATH_ALREADY_PROCESSED) != 0) {
            process_hero_death();
            return;
        }
        // not_dead
        if (MEM8(ADDR_BYTE_9F02) != 0) {
            MEM8(ADDR_BYTE_9F02) = 0;
            // int60h_music(FN0_INIT_PLAY_MUSIC);
        }
    }

    MEM8(ADDR_SPACEBAR_LATCH) = 0;
    MEM8(ADDR_ALTKEY_LATCH) = 0;
    MEM8(ADDR_FRAME_TIMER) = 0;
    MEM8(ADDR_BYTE_9F27) = 0;

    // main_loop(); // Commenting out for now, until it is decoupled
}

void render_boss_hud()
{
    uint16_t boss_state_ptr = MEM16(ADDR_BOSS_STATE_PTR);
    MEM8(ADDR_BYTE_9F01) = MEM8(boss_state_ptr + 8);
    uint16_t name_ptr = MEM16(boss_state_ptr + 9);
    // Render_Pascal_String_1_proc(name_ptr);
    uint16_t bs_hp = MEM16(boss_state_ptr + 3);
    // Draw_Boss_Max_Health_proc(bs_hp);
    // Draw_Boss_Health_proc(bs_hp);
}

void render_hud_bars_with_enemy()
{
    // Clear_HUD_Bar_proc(2, 16, 0, 0x21);
    // Clear_HUD_Bar_proc(35, 16, 0x80, 0x67);
    uint16_t bx = 0xAA9;
    uint16_t dx = 0xAB5;
    uint16_t cx = 0xE03;
    // Copy_Screen_Rect_VRAM_proc(bx, cx, dx);
    // Clear_HUD_Bar_proc(2, 28, 0, 0x42);
    // Render_Pascal_String_0_proc(13, 175, "ENEMY");
}

void Render_Animated_Tile_Strip_proc()
{

}

void Update_Local_Attribute_Cache_proc()
{

}

void Copy_Tile_Buffer_To_VRAM_proc()
{
}

void Draw_Bordered_Rectangle_proc()
{

}

static void update_all_monsters_in_map()
{
    memset(&g_mem[ADDR_PROXIMITY_LAYER2], 0, 128);
    MEM8(ADDR_MONSTER_INDEX) = 0;
    uint16_t si = MEM16(ADDR_MONSTERS_LIST);
    uint16_t left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    for(;;) {
        uint16_t x = MEM16(si + 0);
        if (x == 0xFFFF)
            break;
        if ((x >> 8) != 0xFF) {
            MEM8(si + 3) = 0xff; // m_x_rel
            uint8_t x_rel;
            if (is_in_proximity_window(x, &x_rel)) {
                MEM8(si + 3) = x_rel;
                uint16_t addr = coords_to_prox_addr(x_rel, MEM8(si + 2));
                MEM8(addr) = MEM8(ADDR_MONSTER_INDEX) | 0x80; // spawn the monster
            }
        }
        MEM8(ADDR_MONSTER_INDEX)++;
        si += 16;
    }
}

// Checks if given map X lies within the proximity window (width 36).
// Returns false if outside the window, accounting for world wrap. (Originally CF)
//         true if inside the window, then *x_rel = relative X in the window. (Originally NC and BL)
// ===========================================================================
// Cases:
//  1. |left=0|p=36|right=mapWidth-36|
//    a. x=0..35; return: NC
//    b. x=36..mapWidth-1; return: CF
//  2. |left=L|p=36|right=mapWidth-36-L|  where 0 < L < mapWidth-36
//    c. x=0..L-1; return: CF
//    d. x=L..L+35; return: NC
//    e. x=L+36..mapWidth-1; return: CF
//  3. |left=L|p=36|right=0|  where L = mapWidth-36
//    f. x=0..L-1; return: CF
//    g. x=L..L+35; return: NC
//  4. |        left=L        |p0=mapWidth-L|  where mapWidth-36 < L < mapWidth
//     |p1=36-mapWidth+L|...................|  (proximity window intersects map edge)
//    h. x=0..35-mapWidth+L; return: NC
//    i. x=36-mapWidth+L..L-1; return: CF
//    j. x=L..mapWidth-1; return: NC
// Checked
uint8_t is_in_proximity_window(uint16_t x, uint8_t *x_rel)
{
    uint16_t left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    if (x >= left) {
        // Cases 1a, 1b, 2d, 2e, 3g, 4j
        uint16_t offset = x - left;
        *x_rel = (uint8_t)offset;
        return offset < PROX_COLS;
    } else { // x < left
        // Cases 2c, 3f, 4h, 4i
        if (x >= PROX_COLS) {
            /* Directly outside (35 - x would set Carry) */
            return 0;
        }
        /* Wrap‑around calculation: (mapWidth - left) + x  (modulo mapWidth implicit) */
        uint16_t offset = mapWidth - left + x;
        *x_rel = (uint8_t)offset;
        return offset < PROX_COLS;
    }
}
