# SpellSwing Art Asset Inventory

## Purpose
This file is the full-game art checklist for `SpellSwing`. It covers MVP and post-MVP production so art can be tracked separately from code scope.

Status labels:
- `Exists` means the file is already present in `Assets`
- `Partial` means some art exists but the full set is not complete
- `Needed` means no production asset is confirmed yet

## Assets Found In Project Today

| Category | Asset | Status | Notes |
| :---- | :---- | :---- | :---- |
| Player | `FlameWitch` | Partial | Idle, attack, hurt, and walk sheets exist |
| Enemy Mob | `SwordWitch` | Partial | Idle, attack, and hurt sheets exist |
| Boss | `GemBug` | Partial | Idle, attack, and hurt sheets exist |
| NPC | `ForestChapter1` shopkeeper | Exists | Forest chapter shopkeeper idle sheet + shop background in place |

## Animation Standard
Use this as the default target animation list for characters and major enemies.

### Playable character baseline
- Idle
- Walk
- Basic attack
- Charged attack
- Cast
- Hurt
- Defeat
- Victory

### Mob baseline
- Idle
- Move or hover
- Attack
- Hurt
- Defeat

### Boss baseline
- Idle
- Intro
- Attack A
- Attack B
- Hurt
- Defeat
- Optional special or enraged tell

## Playable Characters
These are full-game character art targets. Names below are working production labels and can be renamed later without changing the inventory structure.

| Type | Working Class Name | Required Art | Required Animations | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Fire | `FlameWitch` | Full playable sprite set, portrait, lobby portrait, combat bust, type icon | Idle, Walk, Basic attack, Charged attack, Cast, Hurt, Defeat, Victory | MVP | Partial | Existing sheets cover idle, walk, attack, hurt |
| Ice | `FrostAcolyte` | Full playable sprite set, portrait, lobby portrait, combat bust, type icon | Idle, Walk, Basic attack, Charged attack, Cast, Hurt, Defeat, Victory | Post-MVP | Needed | Second member of Fire-Ice-Earth triangle |
| Earth | `StoneGuard` | Full playable sprite set, portrait, lobby portrait, combat bust, type icon | Idle, Walk, Basic attack, Charged attack, Cast, Hurt, Defeat, Victory | Post-MVP | Needed | Third member of Fire-Ice-Earth triangle |
| Lightning | `StormDuelist` | Full playable sprite set, portrait, lobby portrait, combat bust, type icon | Idle, Walk, Basic attack, Charged attack, Cast, Hurt, Defeat, Victory | Post-MVP | Needed | Part of Lightning-Water-Wind triangle |
| Water | `TideCaller` | Full playable sprite set, portrait, lobby portrait, combat bust, type icon | Idle, Walk, Basic attack, Charged attack, Cast, Hurt, Defeat, Victory | Post-MVP | Needed | Part of Lightning-Water-Wind triangle |
| Wind | `WindRogue` | Full playable sprite set, portrait, lobby portrait, combat bust, type icon | Idle, Walk, Basic attack, Charged attack, Cast, Hurt, Defeat, Victory | Post-MVP | Needed | Part of Lightning-Water-Wind triangle |
| Poison | `PlagueAlchemist` | Full playable sprite set, portrait, lobby portrait, combat bust, type icon | Idle, Walk, Basic attack, Charged attack, Cast, Hurt, Defeat, Victory | Post-MVP | Needed | Part of Poison-Light-Shadow triangle |
| Light | `SunCleric` | Full playable sprite set, portrait, lobby portrait, combat bust, type icon | Idle, Walk, Basic attack, Charged attack, Cast, Hurt, Defeat, Victory | Post-MVP | Needed | Needs readable revive-casting silhouette |
| Shadow | `VoidSeer` | Full playable sprite set, portrait, lobby portrait, combat bust, type icon | Idle, Walk, Basic attack, Charged attack, Cast, Hurt, Defeat, Victory | Post-MVP | Needed | Part of Poison-Light-Shadow triangle |

## Enemy Mobs
The design doc does not fully specify the complete enemy roster yet, so this section tracks current needs by archetype as well as known units.

| Chapter | Enemy | Role | Required Animations | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| MVP / Ch1 | `SwordWitch` | Common mob or elite variant | Idle, Move, Attack, Hurt, Defeat | MVP | Partial | Existing sheets cover idle, attack, hurt |
| Ch1 | `CrystalSkitter` | Light-leaning bug mob | Idle, Move, Attack, Hurt, Defeat | Post-MVP | Needed | Good thematic support for `GemBug` |
| Ch1 | `ShardCaster` | Ranged caster mob | Idle, Move, Cast, Hurt, Defeat | Post-MVP | Needed | Can telegraph typed spell attacks |
| Ch1 | `LanternKnight` | Tankier bruiser mob | Idle, Move, Attack, Hurt, Defeat | Post-MVP | Needed | Helps vary target priority |
| Ch2 | `DrownedGuard` | Water melee mob | Idle, Move, Attack, Hurt, Defeat | Post-MVP | Needed | Supports `The Drowned King` |
| Ch2 | `BarnacleMage` | Water debuff caster | Idle, Move, Cast, Hurt, Defeat | Post-MVP | Needed | Supports Soak-style gameplay |
| Ch2 | `TideSpawn` | Fast swarming mob | Idle, Move, Attack, Hurt, Defeat | Post-MVP | Needed | Good for AoE pressure |
| Ch3 | `VoidCultist` | Shadow caster mob | Idle, Move, Cast, Hurt, Defeat | Post-MVP | Needed | Sets final chapter tone |
| Ch3 | `NightLeech` | Debuff and drain mob | Idle, Move, Attack, Hurt, Defeat | Post-MVP | Needed | Pairs well with attrition fights |
| Ch3 | `UmbraBeast` | Heavy bruiser mob | Idle, Move, Attack, Hurt, Defeat | Post-MVP | Needed | Endgame frontline enemy |

## Mini-Bosses
| Chapter | Enemy | Required Animations | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| MVP / Ch1 | `SwordWitchElite` | Idle, Attack, Hurt, Defeat, Special tell | MVP | Partial | Reuse `SwordWitch` base art first, upgrade later |
| Ch1 | `CrystalMatron` | Idle, Attack, Hurt, Defeat, Special tell | Post-MVP | Needed | Optional dedicated chapter mini-boss |
| Ch2 | `DeepTemplar` | Idle, Attack, Hurt, Defeat, Special tell | Post-MVP | Needed | Water chapter mini-boss |
| Ch3 | `RiftPriest` | Idle, Attack, Hurt, Defeat, Special tell | Post-MVP | Needed | Shadow chapter mini-boss |

## Bosses
| Chapter | Boss | Required Animations | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | `GemBug` | Idle, Intro, Attack, Hurt, Defeat | MVP | Partial | Existing sheets cover idle, attack, hurt |
| 2 | `TheDrownedKing` | Idle, Intro, Attack A, Attack B, Hurt, Defeat | Post-MVP | Needed | Strong silhouette and royal water VFX |
| 3 | `VoidSerpent` | Idle, Intro, Attack A, Attack B, Hurt, Defeat | Post-MVP | Needed | Final boss should read as the largest sprite set |

## Hub World Art
| Asset Group | Required Assets | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- |
| Hub background | Sky, far parallax, mid parallax, ground silhouette, floor tiles | MVP | Needed | One hub map is enough for MVP |
| Portals | Closed portal, open portal, locked portal, glow overlay | MVP | Needed | Portal readability is core to lobby UX |
| Hub props | Signs, stones, torches, grass, banners, crystals | MVP | Needed | Start with light dressing |
| Hub collision set | Platforms, walls, steps, ramps, portal pads | MVP | Needed | Can be mostly invisible collision with simple art first |
| Ambient life | Optional critters or NPC walkers | Post-MVP | Needed | Nice-to-have only |

## Combat Backgrounds
| Scene | Required Assets | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- |
| MVP combat arena | Foreground floor, midground, background, optional overlay | MVP | Needed | Match the rough sketch's forest cave feel |
| Chapter 1 arena set | Shrine or crystal forest variants | Post-MVP | Needed | Can share layout with recolors |
| Chapter 2 arena set | Flooded ruins or shoreline variants | Post-MVP | Needed | Water chapter |
| Chapter 3 arena set | Void temple or shadow wasteland variants | Post-MVP | Needed | Final chapter |
| Shop scene | Merchant background and counter elements | MVP | Needed | Can reuse one scene for all shops |
| Blessing scene | Shrine backdrop and altar | MVP | Needed | A lightweight static scene is enough |

## NPCs And Shopkeepers
| NPC | Required Assets | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- |
| `ForestChapter1` shopkeeper | Animated idle sheet and shop backdrop | MVP | Exists | `Assets/ShopKeepers/ForestChapter1/` supplies idle sheet + bg |
| Hub guide NPC | Idle and talk portrait | Post-MVP | Needed | Helpful if onboarding needs a tutorial character |
| Portal attendant or sign spirit | Idle and talk portrait | Post-MVP | Needed | Optional world flavor |

## UI Art
| UI Group | Required Assets | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- |
| Main menu | Logo, nickname panel, background splash, button states | MVP | Needed | Website landing identity |
| Character select | Character cards, type icons, locked or hover states | MVP | Needed | `FlameWitch` first, scalable to 9 |
| Hub UI | Portal labels, join prompt, lock icon, lobby count badge | MVP | Needed | Needed for shared world clarity |
| Lobby UI | Ready badge, host crown, player slots, password prompt art | MVP | Needed | Can be simple but readable |
| Combat top bar | HP heart, gold coin, energy pip, mana pip, settings icons | MVP | Needed | Rough sketch already suggests this layout |
| Combat action rail | `Spells`, `Swings`, `Items`, `Defend`, `Pass` button states | MVP | Needed | One style system recommended |
| Combat ability cards | Button backgrounds, hover, selected, locked, cooldown-style states | MVP | Needed | Needed for spells, swings, and items |
| Turn banner | `Player Turn`, `Enemy Turn`, timer frame | MVP | Needed | Central readability element |
| Unit frames | Player frame, enemy frame, target highlight, dead state | MVP | Needed | Show buffs and debuffs near frames |
| Results screens | Victory panel, defeat panel, rewards panel | MVP | Needed | End of combat and end of run |

## Icons
| Icon Group | Required Assets | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- |
| Type icons | Fire, Ice, Earth, Lightning, Water, Wind, Poison, Light, Shadow | MVP starts with Fire | Needed | Build all 9 for consistency if possible |
| Resource icons | HP, Energy, Mana, XP, Gold | MVP | Needed | Core HUD set |
| Action icons | Swing, charged swing, power swing, cast, defend, pass | MVP | Needed | Useful for tooltips and compact UI |
| Item icons | Potion, mega potion, ether, energy shard, antidote, smoke bomb, gold nugget | MVP partial | Needed | First pass only needs active item pool |
| Buff icons | Iron Skin, Quick Hands, Mana Spring, Gold Sense, Blessed Blade | MVP partial | Needed | Add more as blessings expand |
| Debuff icons | Burn, stun, poison, soak, weaken, silence if added later | MVP partial | Needed | Burn and stun first |
| Utility icons | Lock, unlock, ready, not ready, party full, invite, settings, audio | MVP | Needed | Shared across menus |

## VFX
| Effect Group | Required Assets | Priority | Status | Notes |
| :---- | :---- | :---- | :---- | :---- |
| Swing effects | Basic slash, charged slash, power slash | MVP | Needed | Recolor or scale to save time |
| Fire spell effects | Ember shot, flame burst, ignite tick, inferno, meteor impact | MVP | Needed | Highest-priority magic effects |
| Generic hit effects | Physical hit spark, magic hit flash, critical flash | MVP | Needed | Supports combat readability |
| Buff and debuff effects | Burn flame, stun stars, shield, healing pulse | MVP | Needed | Low-frame effects are fine |
| Portal effects | Idle portal, portal activate, lobby join flash | MVP | Needed | Important in the hub |
| Reward effects | Gold pickup, XP gain burst, blessing pickup glow | MVP | Needed | Nice feedback for progression |
| Water effects | Splash, soak, wave burst | Post-MVP | Needed | For chapter 2 |
| Shadow effects | Void pulse, curse cloud, dark beam | Post-MVP | Needed | For chapter 3 |
| Light effects | Revive beam, holy burst | Post-MVP | Needed | Important once Light ships |

## Marketing And Shell Assets
| Asset | Priority | Status | Notes |
| :---- | :---- | :---- | :---- |
| Game logo | MVP | Needed | Even a temporary wordmark helps |
| Favicon | MVP | Needed | Useful for website polish |
| Browser social card | Post-MVP | Needed | Optional until public sharing matters |
| Loading screen art | MVP | Needed | Can reuse key art with logo |

## MVP Missing Art Summary
These are the highest-value missing assets for the first playable build:

- `FlameWitch` cast animation
- `FlameWitch` defeat animation
- `FlameWitch` victory animation
- `SwordWitch` move animation
- `SwordWitch` defeat animation
- `GemBug` intro animation
- `GemBug` defeat animation
- Hub background and portal art
- Combat HUD frames, buttons, and icons
- Fire spell VFX
- Shop scene dressing
- Blessing shrine background

## Production Notes
- Reuse existing `SwordWitch` art for the MVP mini-boss to avoid blocking gameplay implementation.
- If speed matters, use one combat background for all MVP encounters and one shopkeeper presentation for all store interactions.
- Keep all sprite sheets organized by unit name and action so the eventual Phaser atlas pipeline stays predictable.
