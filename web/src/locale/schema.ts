export interface DungeonNotification {
    leftPad: number;
    text: string;
}

export interface IndoorSection {
    [key: string]: string | string[] | Record<string, string> | IndoorSection;
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
        signs: Record<string, string[]>;
        names: Record<string, string>;
    };
    town: {
        names: Record<string, string>;
        conversations: Record<string, string>;
    };
    indoor: Record<string, unknown>;
    openingIntro: Record<string, string | string[]>;
    endingDemo: Record<string, unknown>;
}