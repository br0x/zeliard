#include "dungeon.h"

struct DungeonMonster {
    uint16_t curr_x;
    uint8_t curr_y;
    uint8_t x_rel;
    uint8_t flags;
    uint8_t ai_flags;
    uint8_t anim_counter;
    uint8_t state_flags;
    uint8_t hp;
    uint8_t ai_state;
    uint8_t ai_timer;
    uint16_t spawn_x;
    uint8_t spawn_y;
    uint8_t type;
    uint8_t counter;
};

static int signed_delta(uint16_t a, uint16_t b)
{
    if (a == b) return 0;
    return a < b ? 1 : -1;
}

void dungeon_ai_update_monster(DungeonMonster *m, uint16_t hero_x, uint8_t hero_y)
{
    if (!m || m->type == 0 || m->curr_x == 0xFFFF) return;

    m->counter++;
    m->anim_counter = (uint8_t)((m->anim_counter + 1) & 3);

    if ((m->counter & 7) != 0) return;

    int dx = signed_delta(m->curr_x, hero_x);
    int dy = 0;
    if (m->curr_y + 1 < hero_y) dy = 1;
    else if (m->curr_y > hero_y + 1) dy = -1;

    uint16_t next_x = (uint16_t)(m->curr_x + dx);
    uint8_t next_y = (uint8_t)(m->curr_y + dy);

    if (dx != 0 && dungeon_can_stand_at(next_x, m->curr_y)) {
        m->curr_x = next_x;
    }
    if (dy != 0 && dungeon_can_stand_at(m->curr_x, next_y)) {
        m->curr_y = next_y;
    }
}
