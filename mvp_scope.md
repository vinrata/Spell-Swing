# SpellSwing MVP Scope

## Goal
Ship a browser-playable first version of `SpellSwing` that proves the full website-to-combat loop:

1. Enter nickname
2. Choose a character
3. Spawn into the shared hub
4. Create or join a lobby through a portal
5. Start a run with other players
6. Complete a short combat-focused run slice
7. Return to the hub cleanly

## MVP Definition
This MVP should favor a complete, reliable loop over broad content coverage. The best first cut is a "thin but real" multiplayer version that includes the hub and lobby flow, but limits classes, enemies, encounters, and content depth.

## What Ships In MVP

### Website and session flow
- Browser landing screen with nickname entry
- Character select screen before entering the hub
- Session handoff from menu to hub scene
- Simple reconnect-friendly player session model

### Shared hub
- One persistent side-view hub map
- Basic left/right movement and idle state
- Visible online players in the same hub instance
- Portal objects that show lobby name, player count, and lock state
- Interaction prompt to create or join a lobby
- Return to hub after run completion or party wipe

### Lobby flow
- 1 to 4 players per lobby
- Host creates lobby with name and optional password
- Players join from the hub or by direct lobby URL
- Character portrait/name display in lobby
- Ready state per player
- Host-only start button

### Combat slice
- Server-authoritative turn-based combat
- Shared player phase, then shared enemy phase
- 30-second player timer
- HP, Energy, Mana, XP, Gold, and level tracking
- Basic Swing, Charged Swing, and Power Swing
- Fire starter spell list for the first playable class
- Item use, Defend, and Pass actions
- Typed damage rules and effectiveness calculation
- Win, loss, and return-to-hub flow

### Run structure
Use a short fixed run instead of the full 30-encounter design. This keeps the architecture aligned with the long-term design while reducing implementation and art scope.

Recommended MVP run:

1. Blessing Shrine
2. Mob Fight
3. Shop or simple Random Event
4. Mini-Boss Fight
5. Boss Fight

## MVP Content Decisions

### First playable character
- Ship one playable class first: `FlameWitch`
- Treat `FlameWitch` as the Fire starter and anchor the first spell set around the Fire spells already defined in the design doc
- Reuse the existing attack sheet for basic and charged swing presentation if needed
- Add dedicated cast, defeat, and victory animation support later if they do not already exist in future art drops

### First enemy roster
- Common mob: `SwordWitch`
- Mini-boss: elite `SwordWitch` variant using the same base art with stronger stats and effects
- Boss: `GemBug`

This is the best MVP content split because it matches art already in the project and avoids blocking implementation on new sprite production.

### First encounter pool
- Blessing Shrine
- Fight Mobs
- Shop
- One simplified Random Event
- Boss Fight

Suggested first Random Event pool:
- `Windfall`
- `Healing Spring`
- `Ambush`

### First item pool
- `Health Potion`
- `Ether`
- `Energy Shard`
- `Smoke Bomb`

### First blessing pool
- `Iron Skin`
- `Quick Hands`
- `Mana Spring`
- `Blessed Blade`

## Existing Assets To Use Now

### Confirmed player art
- `Assets/PlayerCharacters/FlameWitch/character_idle_sheet.png`
- `Assets/PlayerCharacters/FlameWitch/character_attack_sheet.png`
- `Assets/PlayerCharacters/FlameWitch/character_hurt_sheet.png`
- `Assets/PlayerCharacters/FlameWitch/character_front_walk_walk_right_sheet.png`

### Confirmed enemy art
- `Assets/EnemiesMobs/SwordWitch/character_idle_sheet.png`
- `Assets/EnemiesMobs/SwordWitch/character_attack_sheet.png`
- `Assets/EnemiesMobs/SwordWitch/character_hurt_sheet.png`
- `Assets/EnemiesBosses/GemBug/Idle.png`
- `Assets/EnemiesBosses/GemBug/ATTACKING.png`
- `Assets/EnemiesBosses/GemBug/HURT.png`

### Confirmed support art
- `Assets/ShopKeepers/ForestChapter1/forestShopbg1.png`
- `Assets/ShopKeepers/ForestChapter1/ForestShop1character_animation_sheet.png`

## Combat UI Direction
Use `GameDesignRoughSketch.png` as the reference for layout and information density.

Keep these combat HUD ideas in MVP:
- Party characters staged on the left
- Enemies staged on the right
- Big turn-state banner in the center
- Top bar for HP, gold, and core resources
- Left-side action rail for `Spells`, `Swings`, and `Items`
- Bottom panel for selectable abilities
- Buff and debuff icon rows near units

Simplify for MVP:
- Use fewer decorative frames
- Use one consistent button style for all action cards
- Defer polished VFX layering and advanced damage-number treatments

## Explicit Deferrals
- Full 9-character roster
- Full 9-type spell authoring
- Three full chapters
- Thirty-encounter run length
- Complex hub map with multiple portal districts
- Secret Shop
- Large Random Event pool
- Final balancing
- Audio pass
- Cosmetic polish pass
- Matchmaking across many public hub shards

## Technical Shape

### Client
- `Phaser 3` scenes for entry, character select, hub, lobby, combat, and post-combat results
- One shared HUD pattern for combat inputs and party information
- Texture-atlas pipeline for character and enemy sprites once sheets are finalized

### Server
- `Node.js` plus `Express` plus `Socket.io`
- Server-authoritative hub presence
- Server-authoritative lobby state
- Server-authoritative combat resolution and encounter progression
- Stateless HTTP only where convenient; real game state should live over sockets

## Suggested Build Order
1. Project scaffold: Phaser client, Node server, shared data models
2. Entry flow: nickname and character select
3. Hub slice: movement, presence sync, portals
4. Lobby slice: create, join, ready, start
5. Combat core: turns, actions, targeting, win/loss
6. Run loop: blessing, rewards, shop, next encounter
7. Boss flow and return to hub
8. UI readability pass based on the rough sketch

## Acceptance Criteria
- A player can open the site, enter a nickname, select `FlameWitch`, and spawn into the hub.
- Multiple connected players can see each other in the hub and enter the same lobby.
- A host can start a run and all lobby members transition into combat together.
- Players can use swings, spells, items, Defend, and Pass within a 30-second turn timer.
- The party can complete a short run slice ending in `GemBug`.
- Results resolve correctly and players return to the hub without a broken state.
- The MVP uses the existing `FlameWitch`, `SwordWitch`, `GemBug`, and shopkeeper art before requiring new sprite production.
