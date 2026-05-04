**GAME DESIGN DOCUMENT**

*Turn-Based Multiplayer RPG*

Game Jam Edition  |  v0.4  |  Work In Progress

# **1\. Overview**

A turn-based multiplayer RPG playable solo or with up to 4 players. Players choose a typed character, run through 3 chapters of 10 encounters each, fight enemies, collect blessings and loot, and face a typed boss at the end of every chapter. The game is a rogue-lite run — permanent progression within a run, each run starts fresh.

The main hub is a persistent shared 2D world where all online players (including strangers) can run around and enter portals to join or create game lobbies.

# **2\. Player Flow**

## **2.1 Entry**

* Player visits the website

* Prompted to enter a nickname (text field \+ submit)

* Lands in the persistent Hub World as their chosen character

## **2.2 Hub World**

A persistent 2D side-scrolling area where ALL online players exist simultaneously including strangers. Players can run around, see others, and interact with portals.

* Each portal represents an active lobby or option to create a new one

* Portals display: lobby name, player count (e.g. 2/4), lock icon if password protected

* Walking into a portal prompts: Join (+ password if required) or Create New Lobby

* Host can share a direct URL for instant joining (yourgame.com/?lobby=abc123)

* Players always return to the hub after every run ends

## **2.3 Character Select**

Accessed before entering the hub or when creating a new run. Players choose a character class which determines their type, starting stats, and available swings and spells.

## **2.4 Lobby**

* 1 to 4 players per lobby

* Host chooses lobby name and optional password

* Players can see each other's chosen characters

* Host starts the run when all players are ready

# **3\. Character System**

## **3.1 Character Types**

Every character has exactly one Type. There are 9 types total, arranged in three rock-paper-scissors triangles. Each type beats exactly one type and loses to exactly one type. A character's type determines mana generation, available spells, natural resistances, and natural weaknesses.

**The full type chart is the single source of truth at `type_chart.json` in the repo root.** Both the server and any tooling load matchups from that file. Update the JSON, not this section, when balancing.

The three triangles are:

| Triangle | Cycle (each beats the next) | Theme |
| :---- | :---- | :---- |
| Elemental | Water → Fire → Ice → Water | Water extinguishes Fire, Fire melts Ice, Ice freezes Water |
| Storm | Earth → Lightning → Wind → Earth | Earth grounds Lightning, Lightning charges and dominates Wind, Wind erodes Earth |
| Mystical | Poison → Light → Shadow → Poison | Poison corrupts Light, Light banishes Shadow, Shadow smothers Poison |

Type effectiveness is 2x (super effective) when attacking a type you beat, 0.5x (not very effective) when attacking a type you lose to, and 1x (neutral) for all other matchups. Types in different triangles are always neutral to each other.

## **3.2 Character Stats**

| Stat | Description | Typical Value |
| :---- | :---- | :---- |
| Health | Max HP. Reaching 0 means defeated. | 90-125 |
| Swing Damage | Multiplier on all swing damage (Basic/Charged/Power). 1.0 is baseline. | 0.85-1.20 |
| Spell Damage | Multiplier on all outgoing spell base damage. 1.0 is baseline. | 0.85-1.25 |
| Swing Defense | Fraction of incoming physical (swing) damage reduced. Clamped at 90%. | 0%-15% |
| Spell Defense | Fraction of incoming magic (spell / typed attack) damage reduced. Clamped at 90%. Replaces the old "Magic Resistance". | 0%-25% |
| Energy Regen | Energy gained at the start of each turn. Player only. | 1-3 |
| Mana Regen | Mana gained at the start of each turn (of character's type). Player only. | 1-2 |
| Level | Increases via XP. Unlocks higher-level spells and swings. | 1-5 |
| XP | Awarded after combat. Resets each level. | 0 |
| Gold | Run currency. Carries entire run. Earned from encounters. | 0 |

Enemies share all combat stats above except Energy Regen and Mana Regen (enemies do not use resources). Bosses lean toward higher Spell Defense and Spell Damage.

### **Damage Formula**

Flat bonuses from Blessings and Relics are added to the base damage *before* any multiplier, so they scale with character stats and type effectiveness.

```
swingBase = classBase(level) + sum(flat swing bonuses)
spellBase = classBase(level) + sum(flat spell bonuses)

physical  = swingBase * attacker.swingDamage * (1 - defender.swingDefense)
magic     = spellBase * attacker.spellDamage * typeMultiplier * (1 - defender.spellDefense)
```

Charged and Power Swings split their base into a physical half and a magic half, then sum. Basic Swing is purely physical. Enemy attacks are treated as magic (typed) for defense purposes.

## **3.3 Leveling & XP**

XP is awarded to all players after winning combat. Does not carry between runs. Both swing and spell damage scale with player level.

* Fight Mobs victory: 20-40 XP per player

* Mini-Boss victory: 80-120 XP per player

* Boss victory: 200 XP per player

* Random Event (combat): 20-40 XP per player

| Level | XP Required | Unlocks |
| :---- | :---- | :---- |
| 1 | 0 | Starting swings and spells only |
| 2 | 100 | Level 2 swings and spells |
| 3 | 250 | Level 3 swings and spells |
| 4 | 500 | Level 4 swings and spells |
| 5 | 900 | Level 5 swings and spells (max tier) |

# **4\. Combat System**

## **4.1 Overview**

Turn-based, player-versus-enemy. All players act during the player phase then all enemies act. Turn order within the player phase is determined by lobby join order.

## **4.2 Turn Timer**

Each player has 30 seconds per turn in multiplayer. The timer counts down through everything including swing/spell browsing and item menus. No pausing. If the timer expires, the turn is skipped automatically.

## **4.3 Resources**

* Energy: \+2 per turn. Spent on all actions. Rolls over unused.

* Mana: \+1 of your type per turn. Spent on spells and charged swings. Rolls over unused.

## **4.4 Swings**

Swings are physical combat actions available to all character types. There are three tiers:

Successful swings have a 25% chance to apply Bleed. Bleed lasts until the target is defeated or the encounter ends, deals 3 damage per stack at the start of each round, and gains another stack each time Bleed is applied again.

| Swing Tier | Energy Cost | Mana Cost | Damage Split | Description |
| :---- | :---- | :---- | :---- | :---- |
| Basic Swing | 1 | 0 | 100% Physical | Pure physical damage. No type. Bypasses Spell Defense. Reduced by Swing Defense. Always 1x damage regardless of enemy type. Scales with level. |
| Charged Swing | 2 | 1 (your type) | 50% Physical / 50% Magic | Mixed damage. Physical portion bypasses Spell Defense (reduced by Swing Defense). Magic portion is typed and subject to type effectiveness and Spell Defense. Scales with level. |
| Power Swing | 3 | 2 (your type) | 40% Physical / 60% Magic | Stronger mixed damage. Higher magic ratio means more damage against weakness targets but also more exposure to Spell Defense. Scales with level. |

For Charged and Power Swings, calculate physical and magic portions separately then sum them. The magic portion uses the character's type for effectiveness calculations.

Example: Fire character (`swingDamage` 1.0, `spellDamage` 1.15) uses Charged Swing (base 20) vs Ice enemy with `swingDefense` 5% and `spellDefense` 20%. Physical: 10 × 1.0 × 0.95 \= 9.5. Magic: 10 × 1.15 × 2.0 (super effective) × 0.8 \= 18.4. Total: \~28 damage.

## **4.5 Spells**

Spells are typed. A character can only cast spells matching their type. Spells have an energy cost, a mana cost, a level requirement, and an effect. Locked spells appear in the shop but cannot be purchased until the level is met.

| Spell | Type | Energy | Mana | Lvl | Effect |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Ember Shot | Fire | 1 | 1 Fire | 1 | 15 fire damage to one enemy. |
| Flame Burst | Fire | 2 | 2 Fire | 1 | 20 fire damage to all enemies. |
| Ignite | Fire | 1 | 1 Fire | 2 | Apply Burn (5 dmg/turn, 3 turns) to one enemy. |
| Inferno | Fire | 3 | 3 Fire | 3 | 40 fire damage to all enemies. Apply Burn. |
| Meteor | Fire | 3 | 3 Fire | 4 | 60 fire damage to one enemy. Stun 1 turn. |
| Revive | Light | 3 | 3 Light | 2 | Light exclusive. Revive a defeated ally at 30% max HP. |

Each of the 9 types has a comparable spell list. Full spell lists for all types are TBD. The Revive spell is exclusive to Light type and is the only way to revive an ally mid-combat.

## **4.6 Items**

| Item | Energy Cost | Effect |
| :---- | :---- | :---- |
| Health Potion | 1 | Restore 40 HP to self. |
| Mega Potion | 1 | Restore 80 HP to self. |
| Ether | 1 | Restore 3 Mana of your type. |
| Energy Shard | 0 | Gain 2 extra Energy this turn (use before other actions). |
| Antidote | 1 | Remove one debuff from self. |
| Smoke Bomb | 1 | All enemies skip their next attack (once per combat). |
| Gold Nugget | 1 | Sell for 30 gold. No combat use. |

## **4.7 Other Actions**

| Action | Cost | Description |
| :---- | :---- | :---- |
| Defend | 1 Energy | Reduce all incoming damage by 30% this turn. |
| Pass | 0 | Skip turn. Energy and mana still accumulate normally. |

## **4.8 Type Effectiveness**

All typed damage (spells and the magic portion of Charged/Power Swings) uses a multiplicative type effectiveness system based on the three triangles defined in section 3.1:

* Super effective (attacking a type you beat): 2x damage

* Not very effective (attacking a type you lose to): 0.5x damage

* Neutral (all other matchups, including cross-triangle): 1x damage

Both players and enemies have natural resistances and weaknesses based on their type. Spell Defense reduces the magic damage portion only. Basic Swing physical damage always bypasses type effectiveness and Spell Defense, but IS reduced by Swing Defense. Enemies use typed attacks only and have no physical swings; incoming enemy damage is reduced by the target's Spell Defense.

Damage calculation for typed (magic) damage:

* Step 1: Base damage + any flat bonuses (relics, blessings)

* Step 2: Multiply by attacker's `spellDamage`

* Step 3: Apply type effectiveness (2x / 1x / 0.5x)

* Step 4: Apply `(1 - defender.spellDefense)`

* Step 5: Apply as final damage

Damage calculation for physical (swing) damage:

* Step 1: Base damage + any flat bonuses

* Step 2: Multiply by attacker's `swingDamage`

* Step 3: Apply `(1 - defender.swingDefense)`

* Step 4: Apply as final damage

Healing spells and items bypass all defenses.

## **4.9 Death & Revival**

### **Mid-Combat Revival**

Light type characters can cast Revive during combat to bring a defeated ally back at 30% of their max HP. This is the only way to revive mid-combat.

### **Post-Combat Death Penalty**

If a player ends combat at 0 HP (not revived), they respawn for the next encounter with permanently reduced max HP for the rest of the run:

| Death Count | Max HP Multiplier | Example (base 100 HP) |
| :---- | :---- | :---- |
| 1st death | 80% | 80 HP |
| 2nd death | 60% | 60 HP |
| 3rd death | 40% | 40 HP |
| 4th death | 25% | 25 HP |
| 5th death | 15% | 15 HP |
| 6th death | 10% | 10 HP |
| 7th death+ | 1% floor | 1 HP — cannot go lower |

### **Full Party Wipe**

If ALL players reach 0 HP during combat the run ends immediately. All players are returned to the hub lobby. No exceptions.

# **5\. Encounters**

## **5.1 Chapter Structure**

3 chapters per run. 10 encounters per chapter. 30 encounters maximum per full run.

| Encounter \# | Type | Notes |
| :---- | :---- | :---- |
| 1 | Blessing Shrine | Always first. Each player picks 1 of 3 random blessings. |
| 2 | Player Choice | Two portals appear: Fight Mobs or Random Event. |
| 3-4 | Weighted Random | Fight Mobs, Random Event, or Shop. |
| 5 | Mini-Boss | Always a mini-boss fight. |
| 6-8 | Weighted Random | Fight Mobs, Random Event, or Shop. |
| 9 | Shop | Always a shop before the boss. |
| 10 | Boss Battle | Typed boss. Resistances and weaknesses apply. No phases. |

## **5.2 Boss Roster**

One unique boss per chapter. Each boss has a type with resistances and weaknesses from the type chart. No phases — same attack patterns at all HP values.

| Chapter | Boss Name | Type | Beats | Loses To | Difficulty | Notes |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Gem Bug | Light | Shadow | Poison | Introductory | A crystalline insect that radiates blinding light. Hits hard with single-target Light spells. |
| 2 | The Drowned King | Water | Fire | Ice | Moderate | An ancient sunken ruler. Uses AoE Water spells and applies Soak (reduces fire resistance). |
| 3 | Void Serpent | Shadow | Poison | Light | Final / Hardest | A colossal shadow dragon. Heavy debuffs, high Spell Defense, and devastating Shadow spells. |

## **5.3 Encounter Details**

### **Blessing Shrine**

Each player independently picks 1 of 3 random blessings. Permanent for the run.

* Iron Skin: \+20 max HP

* Quick Hands: Start each combat with \+1 Energy

* Mana Spring: Gain 2 mana per turn instead of 1

* Gold Sense: \+20% gold from all sources

* Blessed Blade: \+5 base damage to all swings (Basic, Charged, and Power)

### **Fight Mobs**

* 2-5 mobs. Strength and count scales per chapter.

* Reward: 20-50 gold \+ 20-40 XP per player

### **Fight Mini-Boss**

* Single stronger enemy with higher HP and harder-hitting spells.

* Reward: 60-100 gold \+ 80-120 XP \+ 1 random blessing per player

### **Shop**

* 4 spells \+ 4 items available. Individual per player.

* Spells match player type only. Locked spells shown with level requirement.

### **Secret Shop**

* 30% cheaper (rounded up, whole numbers only). 6 spells \+ 6 items.

* May include rare items not found in the regular shop.

### **Random Event**

| Event | Effect |
| :---- | :---- |
| Windfall | Each player gains 30-60 gold. |
| XP Surge | Each player gains 30-50 XP. |
| Ambush | Triggers a Fight Mobs encounter with no warning. |
| Tax Collector | Each player loses 20-40 gold (min 0). |
| Curse | Each player loses 20-30 XP (min 0). |
| Secret Shop | A discounted shop appears. |
| Healing Spring | All players restore 30 HP. |
| Merchant's Gift | Each player receives 1 random free item. |

# **6\. Shop & Economy**

Gold carries the entire run across all 3 chapters. Resets only on a new run.

| Item Tier | Regular Shop | Secret Shop |
| :---- | :---- | :---- |
| Common item (potion, ether) | 30 gold | 21 gold |
| Rare item (smoke bomb, energy shard) | 60 gold | 42 gold |
| Level 1-2 spell | 50 gold | 35 gold |
| Level 3 spell | 90 gold | 63 gold |
| Level 4-5 spell | 140 gold | 98 gold |

# **7\. Multiplayer**

## **7.1 Lobby System**

* Host or join via portals in the hub world

* Host sets lobby name and optional password

* Direct URL sharing: yourgame.com/?lobby=abc123

* 1-4 players. Host starts the run.

## **7.2 Player Visibility**

All players can see each other's full stats and inventory during a run. Encourages coordination (e.g. knowing a teammate is low HP or has Revive available).

## **7.3 Shared vs Individual**

| Element | Scope |
| :---- | :---- |
| HP, Energy, Mana, Gold, XP | Individual |
| Blessings | Individual (each player picks their own) |
| Shop inventory | Individual (each player sees different items) |
| Stats and inventory visibility | Shared — all lobby members can see each other |
| Encounter outcomes | Shared (all face same encounter) |
| Boss HP | Shared (one boss for the whole party) |

# **8\. Tech Stack**

| Layer | Technology | Notes |
| :---- | :---- | :---- |
| Game engine | Phaser 3 | pixelArt: true for crisp scaling |
| Multiplayer | Socket.io \+ Node.js/Express | Server-authoritative state |
| Hosting | Railway | WebSockets supported natively |
| Assets | Texture atlas (PNG \+ JSON) | Single network request, all sprites packed |
| Art style | Pixel art, 256x256 sprites | Scaled in-engine via setScale() |

# **9\. Locked Design Decisions**

All questions below are finalized.

| Question | Decision |
| :---- | :---- |
| Type count | 9 types total: Fire, Ice, Earth, Lightning, Water, Wind, Poison, Light, Shadow. |
| Type system | 3 rock-paper-scissors triangles. Each type beats one, loses to one, neutral to all others. |
| Turn timer | 30 seconds. Counts through all menus. No pausing. Turn skipped if expired. |
| Full party wipe | Instant run over. All players return to hub lobby. |
| Mid-combat death | Light type only can cast Revive. Otherwise stays dead until combat ends. |
| Death HP penalty | 80% \> 60% \> 40% \> 25% \> 15% \> 10% \> 1% floor. Never below 1%. |
| Player visibility | All stats and inventory visible to all lobby members during run. |
| Subtypes | Removed. Characters have one type only. |
| Swing tiers | Basic (physical only), Charged (50/50 physical+magic), Power (40/60 physical+magic). |
| Basic Swing | Physical only. No type. Bypasses Spell Defense (still reduced by Swing Defense). Always 1x damage. |
| Charged/Power Swing | Mixed damage. Physical bypasses resistance. Magic portion is typed. |
| Swing scaling | All swing tiers scale with player level. |
| Enemy attacks | Typed spells only. Enemies have no physical swings. |
| Defense scope | Spell Defense reduces magic (typed) damage only. Swing Defense reduces physical (swing) damage only. Healing bypasses both. |
| Gold persistence | Carries entire 3-chapter run. Resets only on new run. |
| Chapter count | 3 chapters. 10 encounters each. 30 max per run. |
| Hub world | Persistent. All online players visible including strangers. |
| Boss phases | None. Same attack pattern at all HP values. |
| Boss typing | Each chapter boss has a type with resistances and weaknesses. |
| Type effectiveness math | Multiplicative. 2x super effective / 1x neutral / 0.5x not very effective. |
| Cross-triangle matchups | Always neutral (1x). Only same-triangle matchups have effectiveness. |
| Revive spell | Light type exclusive. 3 Energy \+ 3 Light Mana. Level 2 required. |

# **10\. Remaining TBD**

* Full spell lists for all 9 types (currently only Fire is fully detailed)

* Base damage values for Basic, Charged, and Power Swings at level 1 and scaling formula per level

* Enemy roster: mob types per chapter, mini-boss types, spell sets, and full stat blocks (Health, Swing Damage, Spell Damage, Swing Defense, Spell Defense)

* Hub world map design: size, layout, portal count, background art

* Visual feedback for type effectiveness (super effective flash, damage number colors, etc.)

* Audio: music per encounter type, SFX for swings, spells, and UI

* Game name (currently untitled)

*— End of Document —*