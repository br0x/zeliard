export interface DungeonNotification {
    leftPad: number;
    text: string;
}

/** One drawn row of a dungeon signpost: left offset (in 3px units) + text. */
export interface DungeonSignLine {
    xDelta: number;
    text: string;
}

export interface IndoorSection {
    [key: string]: string | string[] | Record<string, string> | IndoorSection;
}

/** A localized NPC conversation: raw text plus its terminal control code. */
export interface TownConversation {
    text: string;
    endCode: 'yesNo' | 'elfCrest' | 'pattern5' | 'purchase' | 'tear' | null;
}

export interface LocaleMessages {
    meta: {
        locale: string;
        label: string;
    };
    hud: Record<string, string>;
    modal: Record<string, string>;
    inventory: Record<string, string | string[] | string[][]>;
    dungeon: {
        notifications: Record<string, DungeonNotification>;
        signs: Record<string, DungeonSignLine[]>;
        names: Record<string, string>;
        bossNames: Record<string, string>;
    };
    town: {
        names: Record<string, string>;
        conversations: Record<string, TownConversation>;
    };
    indoor: Record<string, unknown>;
    openingIntro: Record<string, string | string[]>;
    endingDemo: Record<string, unknown>;
}