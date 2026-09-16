import { describe, it, expect } from 'vitest';
import { collectKeys, getEnglishMessages, getMessages, LOCALE_MESSAGES } from '../src/locale/index.js';
import { SUPPORTED_LOCALES } from '../src/core/locale-utils.js';

const REQUIRED_RELEASE_KEYS = [
    'meta.locale',
    'meta.label',
    'hud.place',
    'hud.gold',
    'hud.enemy',
    'hud.life',
    'hud.almas',
    'modal.speedChange',
    'modal.speedSelect',
    'modal.speedPressAnyKey',
    'modal.saveTitle',
    'modal.restoreTitle',
    'modal.newName',
    'modal.restart',
    'modal.upDownHint',
    'modal.importExportExport',
    'modal.importExportImport',
    'modal.importExportDelete',
    'modal.deleteConfirm',
    'modal.deleteYesNo',
    'modal.deleteHint',
    'modal.noSavedGames',
    'modal.exportImportHint',
    'modal.importHint',
    'modal.loadFromFile',
    'modal.pressEnterFile',
    'inventory.selectMagic',
    'inventory.wear',
    'inventory.use',
    'inventory.inventory',
    'inventory.level',
    'inventory.exp',
    'inventory.noUse',
    'inventory.iHaveUsed',
    'openingIntro.copyrightLines',
    'openingIntro.storyLines',
    'openingIntro.demonSpeechLines',
    'openingIntro.creditsLines',
    'openingIntro.balconyPart1',
    'openingIntro.balconyPart2',
    'openingIntro.princessDemon',
    'openingIntro.princessVsDemon',
    'openingIntro.demonFinal',
    'openingIntro.stoned',
    'openingIntro.kingPrincess',
    'openingIntro.spirit',
    'openingIntro.kingSurprised',
    'openingIntro.dukeArrived',
    'openingIntro.dukeEscorted',
    'openingIntro.kingDuke1',
    'openingIntro.kingDuke2',
    'openingIntro.kingDuke3',
    'openingIntro.finalScroll',
    'openingIntro.jashiinWindow',
    'endingDemo.dialogue.dukePrincess',
    'endingDemo.dialogue.kingPrincess',
    'endingDemo.dialogue.spirit',
    'endingDemo.dialogue.dukeSpirit',
    'endingDemo.dialogue.princess1',
    'endingDemo.dialogue.farewellPart1',
    'endingDemo.dialogue.farewellPart2',
    'endingDemo.staffCredits',
    'endingDemo.thanksCredits',
    'endingDemo.copyrightCredits',
    'endingDemo.portCredits',
    'dungeon.names.mp10',
    'dungeon.names.mp90',
];

describe('locale files', () => {
    it('defines a bundle for every supported locale', () => {
        for (const locale of SUPPORTED_LOCALES) {
            expect(LOCALE_MESSAGES[locale]).toBeDefined();
        }
    });

    it('English is the complete source of truth', () => {
        const englishKeys = collectKeys(getEnglishMessages());
        expect(englishKeys.length).toBeGreaterThan(0);
        expect(englishKeys).toContain('hud.place');
        expect(englishKeys).toContain('dungeon.notifications.1.text');
    });

    it('release-required keys are present in every locale', () => {
        for (const locale of SUPPORTED_LOCALES) {
            const keys = new Set(collectKeys(getMessages(locale)));
            for (const required of REQUIRED_RELEASE_KEYS) {
                expect(keys.has(required), `${locale} missing ${required}`).toBe(true);
            }
        }
    });

    it('locale metadata matches the locale id', () => {
        for (const locale of SUPPORTED_LOCALES) {
            expect(getMessages(locale).meta.locale).toBe(locale);
        }
    });

    it('dungeon notifications 1-22 exist in every locale', () => {
        for (const locale of SUPPORTED_LOCALES) {
            const notifications = getMessages(locale).dungeon.notifications;
            for (let id = 1; id <= 22; id++) {
                const entry = notifications[String(id)];
                expect(entry, `${locale} missing notification ${id}`).toBeDefined();
                expect(typeof entry!.leftPad).toBe('number');
                expect(entry!.text.length).toBeGreaterThan(0);
            }
        }
    });

    it('town names are localized for every town id', () => {
        const towns = [
            'town.cmap', 'town.mrmp', 'town.stmp', 'town.bsmp', 'town.hlmp',
            'town.tmmp', 'town.drmp', 'town.llmp', 'town.prmp', 'town.esmp',
        ];
        for (const locale of SUPPORTED_LOCALES) {
            const names = getMessages(locale).town.names;
            for (const town of towns) {
                expect(names[town], `${locale} missing ${town}`).toBeTruthy();
            }
        }
    });
});