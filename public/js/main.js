(function () {
  const gameShellRoot = document.querySelector(".game-shell");
  const uiRoot = document.getElementById("ui");
  const menuOverlayRoot = document.getElementById("menu-overlay");
  const stageIntroOverlayRoot = document.getElementById("stage-intro-overlay");
  const turnOverlayRoot = document.getElementById("turn-overlay");
  const rewardOverlayRoot = document.getElementById("reward-overlay");
  const topHudRoot = document.getElementById("top-hud");
  const toastRoot = document.getElementById("toast");
  let enhancedBgStartupHintShown = false;
  const modalRoot = document.getElementById("modal-root");
  const combatHudRoot = document.getElementById("combat-hud");
  const combatInfoRoot = document.getElementById("combat-info");
  const lobbyActionsRoot = document.getElementById("lobby-actions");
  const TURN_OVERLAY_FADE_MS = 220;
  const STAGE_INTRO_HOLD_MS = 1800;
  const STAGE_INTRO_FADE_MS = 520;

  const inviteLobbyId = new URLSearchParams(window.location.search).get("lobby");
  const INITIAL_PAGE_SEARCH = window.location.search;
  const INITIAL_URL_PARAMS = new URLSearchParams(INITIAL_PAGE_SEARCH);

  function getInitialUrlParamIgnoreCase(paramName) {
    const want = String(paramName || "").toLowerCase();
    for (const key of INITIAL_URL_PARAMS.keys()) {
      if (String(key).toLowerCase() === want) {
        return INITIAL_URL_PARAMS.get(key);
      }
    }
    return null;
  }

  function deleteUrlSearchParamIgnoreCase(params, paramName) {
    const want = String(paramName || "").toLowerCase();
    const toRemove = [];
    params.forEach((_, key) => {
      if (String(key).toLowerCase() === want) {
        toRemove.push(key);
      }
    });
    toRemove.forEach((key) => params.delete(key));
  }

  function isVibeJamPortalArrivalFromInitialUrl() {
    const portalFlag = getInitialUrlParamIgnoreCase("portal");
    const refRaw = getInitialUrlParamIgnoreCase("ref");
    return (portalFlag === "true" || portalFlag === "1") && Boolean(refRaw && String(refRaw).trim());
  }

  function normalizeVibeJamPortalRef(refRaw) {
    let ref = String(refRaw || "").trim();
    if (!ref) {
      return null;
    }
    if (!/^https?:\/\//i.test(ref)) {
      ref = `https://${ref}`;
    }
    return ref;
  }

  const appState = {
    socket: null,
    game: null,
    sceneKey: "entry",
    player: null,
    hubState: { players: [], lobbies: [] },
    lobbyState: null,
    runState: null,
    pendingCombatAction: null,
    pendingEndTurn: false,
    pendingEndTurnTimer: null,
    combatHoverEnemyId: null,
    combatHoverEnemyName: null,
    combatHoverAllyId: null,
    combatInfoHover: null,
    combatMenuTab: null,
    targetingArrowCursor: null,
    autoJoinLobbyId: inviteLobbyId,
    entryNicknameDraft: "",
    selectedCharacterId: null,
    hoveredCharacterId: null,
    selectedBlessingId: null,
    hoveredBlessingId: null,
    characterSelectLayout: "carousel",
    turnOverlayPhase: null,
    turnOverlayClearTimer: null,
    stageIntroSignature: null,
    stageIntroHideTimer: null,
    stageIntroClearTimer: null,
    rewardOverlaySignature: null,
    selectedLevelUpStatId: null,
    damageFlashTimer: null,
    runEndSummarySignature: null,
    pendingRunEndSummarySignature: null,
    runEndPartyFadeActive: false,
    deferredSceneChangeKey: null,
    visualPartyHpById: {},
    visualPartyHpEventIds: new Set(),
    vibeJamPortalInbound: isVibeJamPortalArrivalFromInitialUrl(),
    vibeJamInboundParams: null,
    vibeJamInboundRefNormalized: null,
    vibeJamPortalBootstrapAttempted: false,
    vibeJamPortalNeedStripQuery: false,
  };

  if (appState.vibeJamPortalInbound) {
    appState.vibeJamInboundParams = new URLSearchParams(INITIAL_URL_PARAMS.toString());
    appState.vibeJamInboundRefNormalized = normalizeVibeJamPortalRef(getInitialUrlParamIgnoreCase("ref"));
  }

  function startSilkBackground() {
    const host = document.getElementById("silk-bg");
    if (!host) {
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    host.appendChild(canvas);

    const baseColor = { r: 154, g: 149, b: 4 };
    const waves = [
      { xScale: 0.0045, yScale: 0.0036, speed: 0.95, phase: 0.0, weight: 0.55 },
      { xScale: 0.0032, yScale: 0.0052, speed: 1.2, phase: 1.5, weight: 0.3 },
      { xScale: 0.0061, yScale: 0.0027, speed: 0.7, phase: 3.1, weight: 0.15 },
    ];

    let frameHandle = 0;
    let width = 0;
    let height = 0;
    let bufferWidth = 1;
    let bufferHeight = 1;
    let cachedImageData = null;
    let lastDrawTime = 0;
    const TARGET_FRAME_INTERVAL_MS = 1000 / 30;
    const renderScale = 0.24;
    const painter = document.createElement("canvas");
    const painterContext = painter.getContext("2d");
    if (!painterContext) {
      return;
    }

    function resize() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      width = Math.floor(window.innerWidth);
      height = Math.floor(window.innerHeight);
      bufferWidth = Math.max(1, Math.floor(width * renderScale));
      bufferHeight = Math.max(1, Math.floor(height * renderScale));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      painter.width = bufferWidth;
      painter.height = bufferHeight;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = true;
      cachedImageData = painterContext.createImageData(bufferWidth, bufferHeight);
    }

    function getNoise(x, y, t) {
      let value = 0;
      for (let index = 0; index < waves.length; index += 1) {
        const wave = waves[index];
        value +=
          Math.sin(x * wave.xScale + t * wave.speed + wave.phase) *
          Math.cos(y * wave.yScale - t * wave.speed * 0.65 - wave.phase) *
          wave.weight;
      }
      return value;
    }

    function draw(timeMs) {
      frameHandle = window.requestAnimationFrame(draw);

      // No work when the tab is hidden — the browser is already throttling rAF
      // here, but we belt-and-suspenders so we don't burn CPU on a paint that
      // the compositor will discard.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        lastDrawTime = timeMs;
        return;
      }

      // Throttle to ~30fps. The silk is a slow-moving ambient effect, the
      // human eye cannot tell it from 60fps but the CPU savings are large.
      if (timeMs - lastDrawTime < TARGET_FRAME_INTERVAL_MS) {
        return;
      }
      lastDrawTime = timeMs;

      if (!cachedImageData || cachedImageData.width !== bufferWidth || cachedImageData.height !== bufferHeight) {
        cachedImageData = painterContext.createImageData(bufferWidth, bufferHeight);
      }

      const t = timeMs * 0.001 * 1.2; // Keeps movement close to the requested speed feel.
      const data = cachedImageData.data;
      let offset = 0;

      for (let y = 0; y < bufferHeight; y += 1) {
        for (let x = 0; x < bufferWidth; x += 1) {
          const noise = getNoise(x, y, t * 3.7);
          const swirl = Math.sin((x + y) * 0.007 + t) * 0.18;
          const lightness = 0.38 + (noise + swirl) * 0.24;
          const intensity = Math.max(0, Math.min(1, lightness));

          data[offset] = Math.floor(baseColor.r * (0.45 + intensity));
          data[offset + 1] = Math.floor(baseColor.g * (0.42 + intensity));
          data[offset + 2] = Math.floor(baseColor.b * (0.35 + intensity));
          data[offset + 3] = 190;
          offset += 4;
        }
      }

      painterContext.putImageData(cachedImageData, 0, 0);
      context.clearRect(0, 0, width, height);
      context.drawImage(painter, 0, 0, width, height);
    }

    resize();
    window.addEventListener("resize", resize);
    frameHandle = window.requestAnimationFrame(draw);

    window.addEventListener("beforeunload", () => {
      if (frameHandle) {
        window.cancelAnimationFrame(frameHandle);
      }
    });
  }

  // NOTE: stats below must mirror server.js PLAYABLE_CHARACTERS so the carousel can
  // preview stats without a server round-trip. Keep the two in sync when balancing.
  const CHARACTER_CARDS = [
    {
      id: "flamewitch",
      name: "Flame Witch",
      type: "Fire",
      folder: "FlameWitch",
      pitch: "Reliable fire spells.",
      tint: null,
      stats: { maxHp: 100, swingDamage: 1.0, spellDamage: 1.15, swingDefense: 0.0, spellDefense: 0.05, energyRegen: 2, manaRegen: 1 },
    },
    {
      id: "fartwizard",
      name: "Fart Wizard",
      type: "Poison",
      folder: "FartWizard",
      pitch: "A poison trickster.",
      tint: null,
      stats: { maxHp: 100, swingDamage: 0.9, spellDamage: 1.1, swingDefense: 0.05, spellDefense: 0.1, energyRegen: 2, manaRegen: 1 },
    },
    {
      id: "waternymph",
      name: "Water Nymph",
      type: "Water",
      folder: "Water Nymph",
      pitch: "Fluid control and crushing tides.",
      tint: null,
      stats: { maxHp: 105, swingDamage: 0.95, spellDamage: 1.2, swingDefense: 0.05, spellDefense: 0.1, energyRegen: 2, manaRegen: 1 },
    },
    {
      id: "sandman",
      name: "Sand Man",
      type: "Earth",
      folder: "Sand Man",
      pitch: "Stone-heavy blows and grit storms.",
      tint: null,
      stats: { maxHp: 125, swingDamage: 1.2, spellDamage: 0.9, swingDefense: 0.15, spellDefense: 0.05, energyRegen: 1, manaRegen: 1 },
    },
    {
      id: "theowl",
      name: "The Owl",
      type: "Wind",
      folder: "The Owl",
      pitch: "Swift air magic and storm pressure.",
      tint: null,
      stats: { maxHp: 95, swingDamage: 1.05, spellDamage: 1.05, swingDefense: 0.0, spellDefense: 0.05, energyRegen: 3, manaRegen: 1 },
    },
    {
      id: "thedark",
      name: "The Dark",
      type: "Shadow",
      folder: "The Dark",
      pitch: "Void sorcery and crushing curses.",
      tint: null,
      stats: { maxHp: 110, swingDamage: 1.1, spellDamage: 1.15, swingDefense: 0.05, spellDefense: 0.15, energyRegen: 2, manaRegen: 1 },
    },
    {
      id: "thecleric",
      name: "The Cleric",
      type: "Light",
      folder: "The Cleric",
      pitch: "Radiant judgment and healing faith.",
      tint: null,
      stats: { maxHp: 108, swingDamage: 0.9, spellDamage: 1.1, swingDefense: 0.1, spellDefense: 0.15, energyRegen: 2, manaRegen: 1 },
    },
    {
      id: "icequeen",
      name: "Ice Queen",
      type: "Ice",
      folder: "Ice Queen",
      pitch: "Frost control and glacial pressure.",
      tint: null,
      stats: { maxHp: 98, swingDamage: 0.85, spellDamage: 1.25, swingDefense: 0.0, spellDefense: 0.1, energyRegen: 2, manaRegen: 2 },
    },
    {
      id: "thedrummer",
      name: "The Drummer",
      type: "Lightning",
      folder: "The Drummer",
      pitch: "Electric rhythms and thunder strikes.",
      tint: null,
      stats: { maxHp: 90, swingDamage: 1.0, spellDamage: 1.2, swingDefense: 0.0, spellDefense: 0.05, energyRegen: 3, manaRegen: 1 },
    },
  ];
  const CHARACTER_TYPE_ORDER = ["Fire", "Water", "Earth", "Wind", "Lightning", "Ice", "Poison", "Light", "Shadow"];

  function getTypeRelations(typeLabel) {
    if (!typeLabel || !TYPE_MATCHUPS[typeLabel]) {
      return { strongAgainst: [], weakAgainst: [] };
    }
    const matchup = TYPE_MATCHUPS[typeLabel];
    return {
      strongAgainst: matchup.beats ? [matchup.beats] : [],
      weakAgainst: matchup.losesTo ? [matchup.losesTo] : [],
    };
  }

  function renderTypeIconList(typeLabels) {
    return typeLabels
      .map((label) => {
        const safeLabel = escapeHtml(label);
        const iconPath = getTypeIconPath(label);
        const iconMarkup = iconPath
          ? `<img class="type-chip-icon type-chip-icon-inline" src="${iconPath}" alt="${safeLabel} icon" />`
          : "";
        return `<span class="type-chip-row type-matchup-chip">${iconMarkup}<span>${safeLabel}</span></span>`;
      })
      .join("");
  }

  function getCharacterIconPath(character) {
    if (!character?.folder) {
      return null;
    }
    return `/Assets/PlayerCharacters/${encodeURI(character.folder)}/icon.png`;
  }
  const CHARACTER_LOOKUP = Object.fromEntries(CHARACTER_CARDS.map((character) => [character.id, character]));
  const RIGHT_FACING_CHARACTER_IDS = new Set(["flamewitch", "waternymph", "sandman", "thecleric", "icequeen", "thedrummer", "theowl"]);
  const MIRRORED_PREVIEW_CHARACTER_IDS = new Set(["fartwizard", "thedark"]);
  const CHARACTER_PORTRAIT_BG_TEXTURES = {
    flamewitch: "portrait-bg-flamewitch",
    waternymph: "portrait-bg-waternymph",
    icequeen: "portrait-bg-icequeen",
    thecleric: "portrait-bg-thecleric",
  };
  const DEFAULT_CHARACTER_PORTRAIT_FRAME_TEXTURE = "character-portrait-frame";
  const CHARACTER_PORTRAIT_FRAME_ASSETS = {
    flamewitch: { texture: "character-portrait-frame-flamewitch", path: "/Assets/UI/flame_witch_frame.png" },
    fartwizard: { texture: "character-portrait-frame-fartwizard", path: "/Assets/UI/fart_wizard_frame.png" },
    waternymph: { texture: "character-portrait-frame-waternymph", path: "/Assets/UI/water_nymph_frame.png" },
    sandman: { texture: "character-portrait-frame-sandman", path: "/Assets/UI/sand_man_frame.png" },
    theowl: { texture: "character-portrait-frame-theowl", path: "/Assets/UI/the_owl_frame.png" },
    thedark: { texture: "character-portrait-frame-thedark", path: "/Assets/UI/the_dark_frame.png" },
    thecleric: { texture: "character-portrait-frame-thecleric", path: "/Assets/UI/the_cleric_frame.png" },
    icequeen: { texture: "character-portrait-frame-icequeen", path: "/Assets/UI/ice_queen_frame.png" },
    thedrummer: { texture: "character-portrait-frame-thedrummer", path: "/Assets/UI/the_drummer_frame.png" },
  };
  const CHARACTER_PORTRAIT_BG_VIDEOS = {
    flamewitch: "portrait-bg-flamewitch-video",
    fartwizard: "portrait-bg-fartwizard-video",
    waternymph: "portrait-bg-waternymph-video",
    sandman: "portrait-bg-sandman-video",
    theowl: "portrait-bg-theowl-video",
    thedark: "portrait-bg-thedark-video",
    thecleric: "portrait-bg-thecleric-video",
    icequeen: "portrait-bg-icequeen-video",
    thedrummer: "portrait-bg-thedrummer-video",
  };
  const PORTRAIT_BG_DISPLAY_WIDTH = 248;
  const PORTRAIT_BG_DISPLAY_HEIGHT = 340;

  const COMBAT_ACTIONS = {
    swings: [
      { id: "basic", name: "Basic Swing", cost: "1 Energy", energyCost: 1, manaCost: 0, target: "single", price: 50 },
      { id: "charged", name: "Charged Swing", cost: "2 Energy / 1 Mana", energyCost: 2, manaCost: 1, target: "single", price: 80 },
      { id: "power", name: "Power Swing", cost: "3 Energy / 2 Mana", energyCost: 3, manaCost: 2, target: "single", price: 110 },
    ],
  };

  const SWING_INFO = {
    basic: {
      name: "Basic Swing",
      energyCost: 1,
      manaCost: 0,
      target: "single",
      description: "Quick physical strike. Scales lightly with level. Successful swings have a 25% chance to apply Bleed.",
    },
    charged: {
      name: "Charged Swing",
      energyCost: 2,
      manaCost: 1,
      target: "single",
      description: "Stronger mixed physical and typed magic damage. Successful swings have a 25% chance to apply Bleed.",
    },
    power: {
      name: "Power Swing",
      energyCost: 3,
      manaCost: 2,
      target: "single",
      description: "Heavier physical + typed magic strike. Successful swings have a 25% chance to apply Bleed.",
    },
  };

  const SPELL_INFO = {
    ember_shot:     { name: "Ember Shot",      type: "Fire",      energyCost: 0, manaCost: 1, levelRequired: 1, target: "single", description: "15 fire damage to one enemy. Fire spells have a 50% chance to Burn." },
    flame_burst:    { name: "Flame Burst",     type: "Fire",      energyCost: 0, manaCost: 2, levelRequired: 1, target: "all",    description: "20 fire damage to all enemies. Fire spells have a 50% chance to Burn." },
    ignite:         { name: "Ignite",          type: "Fire",      energyCost: 0, manaCost: 1, levelRequired: 2, target: "all",    description: "100% chance to apply Burn to all enemies for 5 turns." },
    inferno:        { name: "Inferno",         type: "Fire",      energyCost: 0, manaCost: 3, levelRequired: 3, target: "all",    description: "40 fire damage to all enemies. Fire spells have a 50% chance to Burn." },
    meteor:         { name: "Meteor",          type: "Fire",      energyCost: 0, manaCost: 3, levelRequired: 4, target: "single", description: "60 fire damage to one enemy. Fire spells have a 50% chance to Burn." },
    toxic_bolt:     { name: "Toxic Bolt",      type: "Poison",    energyCost: 0, manaCost: 1, levelRequired: 1, target: "single", description: "15 poison damage to one enemy + Poison stack." },
    noxious_cloud:  { name: "Noxious Cloud",   type: "Poison",    energyCost: 0, manaCost: 2, levelRequired: 1, target: "all",    description: "20 poison damage to all enemies + Poison stack." },
    water_jet:      { name: "Water Jet",       type: "Water",     energyCost: 0, manaCost: 1, levelRequired: 1, target: "single", description: "15 water damage to one enemy and raise Drowned by 50% of damage dealt." },
    tidal_surge:    { name: "Tidal Surge",     type: "Water",     energyCost: 0, manaCost: 2, levelRequired: 1, target: "all",    description: "20 water damage to all enemies and raise Drowned by 50% of damage dealt." },
    whirlpool:      { name: "Whirlpool",       type: "Water",     energyCost: 0, manaCost: 2, levelRequired: 2, target: "single", description: "30 water damage to one enemy and raise Drowned by 50% of damage dealt." },
    tsunami:        { name: "Tsunami",         type: "Water",     energyCost: 0, manaCost: 3, levelRequired: 3, target: "all",    description: "40 water damage to all enemies and raise Drowned by 50% of damage dealt." },
    stone_spike:    { name: "Stone Spike",     type: "Earth",     energyCost: 0, manaCost: 1, levelRequired: 1, target: "single", description: "15 earth damage to one enemy and increase the caster's defense for the encounter." },
    sand_blast:     { name: "Sand Blast",      type: "Earth",     energyCost: 0, manaCost: 2, levelRequired: 1, target: "all",    description: "20 earth damage to all enemies and increase party defense for the encounter." },
    quicksand:      { name: "Quicksand",       type: "Earth",     energyCost: 0, manaCost: 2, levelRequired: 2, target: "single", description: "30 earth damage to one enemy and increase the caster's defense for the encounter." },
    earthquake:     { name: "Earthquake",      type: "Earth",     energyCost: 0, manaCost: 3, levelRequired: 3, target: "all",    description: "40 earth damage to all enemies and increase party defense for the encounter." },
    gust_slash:     { name: "Gust Slash",      type: "Wind",      energyCost: 0, manaCost: 1, levelRequired: 1, target: "single", description: "15 wind damage to one enemy. Wind spells have a 15% chance to apply Updraft." },
    feather_storm:  { name: "Feather Storm",   type: "Wind",      energyCost: 0, manaCost: 2, levelRequired: 1, target: "all",    description: "20 wind damage to all enemies. Wind spells have a 15% chance to apply Updraft." },
    updraft:        { name: "Updraft",         type: "Wind",      energyCost: 0, manaCost: 2, levelRequired: 2, target: "single", description: "30 wind damage to one enemy. Wind spells have a 15% chance to apply Updraft." },
    tempest:        { name: "Tempest",         type: "Wind",      energyCost: 0, manaCost: 3, levelRequired: 3, target: "all",    description: "40 wind damage to all enemies. Wind spells have a 15% chance to apply Updraft." },
    shadow_bolt:    { name: "Shadow Bolt",     type: "Shadow",    energyCost: 0, manaCost: 1, levelRequired: 1, target: "single", description: "15 shadow damage to one enemy and apply Corruption." },
    nightfall:      { name: "Nightfall",       type: "Shadow",    energyCost: 0, manaCost: 2, levelRequired: 1, target: "all",    description: "20 shadow damage to all enemies and apply Corruption." },
    void_bind:      { name: "Void Bind",       type: "Shadow",    energyCost: 0, manaCost: 2, levelRequired: 2, target: "single", description: "30 shadow damage to one enemy and apply Corruption." },
    abyssal_storm:  { name: "Abyssal Storm",   type: "Shadow",    energyCost: 0, manaCost: 3, levelRequired: 3, target: "all",    description: "40 shadow damage to all enemies and apply Corruption." },
    holy_spark:     { name: "Holy Spark",      type: "Light",     energyCost: 0, manaCost: 1, levelRequired: 1, target: "single", description: "15 light damage to one enemy, or heal an ally for 2x damage as The Cleric." },
    radiant_wave:   { name: "Radiant Wave",    type: "Light",     energyCost: 0, manaCost: 2, levelRequired: 1, target: "all",    description: "20 light damage to all enemies, or heal all allies for 2x damage as The Cleric." },
    smite:          { name: "Smite",           type: "Light",     energyCost: 0, manaCost: 2, levelRequired: 2, target: "single", description: "30 light damage to one enemy, or heal an ally for 2x damage as The Cleric." },
    heavenly_wrath: { name: "Heavenly Wrath",  type: "Light",     energyCost: 0, manaCost: 3, levelRequired: 3, target: "all",    description: "40 light damage to all enemies, or heal all allies for 2x damage as The Cleric." },
    frost_bolt:     { name: "Frost Bolt",      type: "Ice",       energyCost: 0, manaCost: 1, levelRequired: 1, target: "single", description: "15 ice damage to one enemy. Ice spells have a 10% chance to Freeze." },
    blizzard:       { name: "Blizzard",        type: "Ice",       energyCost: 0, manaCost: 2, levelRequired: 1, target: "all",    description: "20 ice damage to all enemies. Ice spells have a 10% chance to Freeze." },
    ice_prison:     { name: "Ice Prison",      type: "Ice",       energyCost: 0, manaCost: 2, levelRequired: 2, target: "single", description: "30 ice damage to one enemy. Ice spells have a 10% chance to Freeze." },
    absolute_zero:  { name: "Absolute Zero",   type: "Ice",       energyCost: 0, manaCost: 3, levelRequired: 3, target: "all",    description: "40 ice damage to all enemies. Ice spells have a 10% chance to Freeze." },
    electric_jolt:  { name: "Electric Jolt",   type: "Lightning", energyCost: 0, manaCost: 1, levelRequired: 1, target: "single", description: "15 lightning damage to one enemy. Lightning spells have a 15% chance to Stun." },
    chain_lightning:{ name: "Chain Lightning", type: "Lightning", energyCost: 0, manaCost: 2, levelRequired: 1, target: "all",    description: "20 lightning damage to all enemies. Lightning spells have a 15% chance to Stun." },
    thunder_crash:  { name: "Thunder Crash",   type: "Lightning", energyCost: 0, manaCost: 2, levelRequired: 2, target: "single", description: "30 lightning damage to one enemy. Lightning spells have a 15% chance to Stun." },
    storm_symphony: { name: "Storm Symphony",  type: "Lightning", energyCost: 0, manaCost: 3, levelRequired: 3, target: "all",    description: "40 lightning damage to all enemies. Lightning spells have a 15% chance to Stun." },
  };

  const ITEM_INFO = {
    health_potion: { name: "Health Potion", energyCost: 1, description: "Restore 40 HP." },
    defence_potion: { name: "Defence Potion", energyCost: 1, description: "Reduce incoming damage by half for 3 turns." },
    ether:         { name: "Ether",         energyCost: 1, description: "Restore 3 mana." },
    energy_shard:  { name: "Energy Shard",  energyCost: 0, description: "Gain 2 energy this turn." },
    smoke_bomb:    { name: "Smoke Bomb",    energyCost: 1, description: "Enemies skip their next attack phase." },
  };

  const TYPE_MATCHUPS = {
    Fire: { beats: "Ice", losesTo: "Water" },
    Ice: { beats: "Water", losesTo: "Fire" },
    Water: { beats: "Fire", losesTo: "Ice" },
    Earth: { beats: "Lightning", losesTo: "Wind" },
    Lightning: { beats: "Wind", losesTo: "Earth" },
    Wind: { beats: "Earth", losesTo: "Lightning" },
    Poison: { beats: "Light", losesTo: "Shadow" },
    Light: { beats: "Shadow", losesTo: "Poison" },
    Shadow: { beats: "Poison", losesTo: "Light" },
  };

  function getTypeEffectiveness(attackerType, defenderType) {
    if (!attackerType || !defenderType || !TYPE_MATCHUPS[attackerType]) {
      return "neutral";
    }
    if (TYPE_MATCHUPS[attackerType].beats === defenderType) return "super";
    if (TYPE_MATCHUPS[attackerType].losesTo === defenderType) return "barely";
    return "neutral";
  }

  function actionUsesTypedDamage(action) {
    if (!action) return false;
    if (action.kind === "swing") {
      return action.id === "charged" || action.id === "power";
    }
    if (action.kind === "spell") {
      return action.id !== "ignite";
    }
    return false;
  }

  const BLESSING_INFO = {
    iron_skin:     { name: "Iron Skin",     description: "+20 max HP for the run.", image: "/Assets/Relics/IronSkin.png" },
    quick_hands:   { name: "Quick Hands",   description: "Start each combat with +1 Energy.", image: "/Assets/Relics/QuickHands.png" },
    mana_spring:   { name: "Mana Spring",   description: "Gain 2 mana per turn instead of 1.", image: "/Assets/Relics/ManaSpring.png" },
    blessed_blade: { name: "Blessed Blade", description: "+5 base damage to all swings.", image: "/Assets/Relics/BlessedBlade.png" },
  };
  const LEVEL_THRESHOLDS = [0, 80, 200, 400, 720];

  const SCENE_MAP = {
    entry: "EntryScene",
    characterSelect: "CharacterSelectScene",
    hub: "HubScene",
    lobby: "LobbyScene",
    run: "RunScene",
  };

  const COMBAT_MUSIC_BASE_PATH = "/Assets/Music/CombatMusic";
  const COMBAT_MUSIC_VOLUME = 0.48;

  function getCombatMusicSrc(fileName) {
    return `${COMBAT_MUSIC_BASE_PATH}/${encodeURIComponent(fileName)}`;
  }

  const MUSIC_TRACKS = {
    characterSelect: {
      src: "/Assets/Music/CharacterSelectBGM.mp3",
      volume: 0.5,
    },
    astralHub: {
      src: "/Assets/Music/AstralHubBGM.mp3",
      volume: 0.46,
    },
    lobby: {
      src: "/Assets/Music/LobbyBGM.mp3",
      volume: 0.46,
    },
    shrine: {
      src: "/Assets/Music/ShrineBGM.mp3",
      volume: 0.46,
    },
    shop: {
      src: "/Assets/Music/ShopBGM.mp3",
      volume: 0.45,
    },
    combatAstralHubDrift: {
      src: getCombatMusicSrc("Astral Hub Drift.mp3"),
      volume: COMBAT_MUSIC_VOLUME,
    },
    combatCinderSigilClash: {
      src: getCombatMusicSrc("Cinder Sigil Clash.mp3"),
      volume: COMBAT_MUSIC_VOLUME,
    },
    combatMoonRuneAmbush: {
      src: getCombatMusicSrc("Moon Rune Ambush.mp3"),
      volume: COMBAT_MUSIC_VOLUME,
    },
    combatShadowGroveRite: {
      src: getCombatMusicSrc("Shadow Grove Rite.mp3"),
      volume: COMBAT_MUSIC_VOLUME,
    },
  };
  const COMBAT_MUSIC_TRACK_KEYS = [
    "combatAstralHubDrift",
    "combatCinderSigilClash",
    "combatMoonRuneAmbush",
    "combatShadowGroveRite",
  ];
  const MUSIC_FADE_MS = 600;
  const MUSIC_MUTE_STORAGE_KEY = "spellswing.musicMuted";
  const MUSIC_VOLUME_STORAGE_KEY = "spellswing.musicVolume";
  const SFX_VOLUME_STORAGE_KEY = "spellswing.sfxVolume";
  const ENHANCED_BG_ANIM_STORAGE_KEY = "spellswing.enhancedBgAnimations";
  const DEFAULT_AUDIO_VOLUME = 1;

  function readEnhancedBgAnimationsEnabled() {
    try {
      return window.localStorage.getItem(ENHANCED_BG_ANIM_STORAGE_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function writeEnhancedBgAnimationsEnabled(enabled) {
    try {
      window.localStorage.setItem(ENHANCED_BG_ANIM_STORAGE_KEY, enabled ? "1" : "0");
    } catch (err) {
      // ignore storage errors
    }
  }

  function shouldLoadFullAnimatedBackgrounds() {
    return readEnhancedBgAnimationsEnabled();
  }
  const ATTACK_SFX_BASE_PATH = "/Assets/SoundEffects/Attacks";
  const ATTACK_SFX_BASE_VOLUME = 0.72;
  const UI_SFX_BASE_PATH = "/Assets/SoundEffects/UI";
  const UI_SFX_BASE_VOLUME = 0.8;
  const UI_SFX_FILES = {
    hover: "UI_Button2.mp3",
    click: "UI_Button1.mp3",
    potion: "potion_sound.mp3",
    victory: "victory_sound.mp3",
    failure: "failure_sound.mp3",
  };
  const UI_SFX_INTERACTIVE_SELECTOR = "button, [role='button'], [data-ui-sfx='true']";
  const UI_SFX_POST_CLICK_HOVER_SUPPRESS_MS = 220;
  const UI_SFX_PHASER_HOVER_CLEAR_DELAY_MS = 60;
  const FART_WIZARD_SPELL_IDS = new Set(["toxic_bolt", "noxious_cloud"]);
  const FART_ATTACK_SFX_FILES = ["Fart1.mp3", "Fart2.mp3", "Fart3.mp3", "Fart4.mp3", "Fart5.mp3", "Fart6.mp3", "Fart7.mp3", "Fart8.mp3", "Fart9.mp3", "Fart10.mp3"];
  const ATTACK_SFX_FILES = {
    basic: "Basic_Swing.mp3",
    charged: "Charged_Swing.mp3",
    power: "Power_Swing.mp3",
    ember_shot: "Ember_Shot.mp3",
    flame_burst: "Flame_Burst.mp3",
    ignite: "Ignite.mp3",
    inferno: "Inferno.mp3",
    meteor: "Meteor.mp3",
    water_jet: "Water_Jet.mp3",
    tidal_surge: "Tidal_Surge.mp3",
    whirlpool: "Whirlpool.mp3",
    tsunami: "Tsunami.mp3",
    stone_spike: "Stone_Spike.mp3",
    sand_blast: "Sand_Blast.mp3",
    quicksand: "Quicksand.mp3",
    earthquake: "Earthquake.mp3",
    gust_slash: "Gust_Slash.mp3",
    feather_storm: "Feather_Storm.mp3",
    updraft: "Updraft.mp3",
    tempest: "Tempest.mp3",
    shadow_bolt: "Shadow_Bolt.mp3",
    nightfall: "Nightfall.mp3",
    void_bind: "Void_Bind.mp3",
    abyssal_storm: "Abyssal_Storm.mp3",
    holy_spark: "Holy Spark.mp3",
    radiant_wave: "Radiant_Wave.mp3",
    smite: "Smite.mp3",
    heavenly_wrath: "Heavenly_Wrath.mp3",
    frost_bolt: "Frost_Bolt.mp3",
    blizzard: "Blizzard.mp3",
    ice_prison: "Ice_Prison.mp3",
    absolute_zero: "Absolute_Zero.mp3",
    electric_jolt: "Electric_Jolt.mp3",
    chain_lightning: "Chain_Lightning.mp3",
    thunder_crash: "Thunder_Crash.mp3",
    storm_symphony: "Storm_Symphony.mp3",
  };

  // Attack impact animations (played on the target). Each spritesheet is
  // 8 frames laid out horizontally with square frames; `frame` is the
  // frame width (== height) in pixels for that sheet.
  const ATTACK_ANIMATION_BASE_PATH = "/Assets/AttackAnimations";
  const ATTACK_ANIMATION_FRAME_COUNT = 8;
  const ATTACK_ANIMATION_FRAME_RATE = 18;
  const COMBAT_FEEDBACK_EVENT_STAGGER_MS = 600;
  const ENEMY_ATTACK_FEEDBACK_STAGGER_MS = 900;
  const MULTI_TARGET_FLOATING_TEXT_STAGGER_MS = 180;
  const STATUS_DAMAGE_FEEDBACK_TYPES = new Set(["poison_damage", "bleed_damage", "burn_damage", "drowned_defeat"]);
  const ATTACK_ANIMATION_DEFS = {
    basic:           { file: "basic-swing.png",      frame: 174 },
    charged:         { file: "charged-swing.png",    frame: 192 },
    power:           { file: "power-swing.png",      frame: 192 },
    ember_shot:      { file: "ember-shot.png",       frame: 138 },
    flame_burst:     { file: "flame-burst.png",      frame: 194 },
    ignite:          { file: "ignite.png",           frame: 72  },
    inferno:         { file: "inferno.png",          frame: 204 },
    meteor:          { file: "meteor.png",           frame: 192 },
    toxic_bolt:      { file: "toxic-bolt.png",       frame: 98  },
    noxious_cloud:   { file: "noxious-cloud.png",    frame: 186 },
    water_jet:       { file: "water-jet.png",        frame: 192 },
    tidal_surge:     { file: "tidal-surge.png",      frame: 182 },
    whirlpool:       { file: "whirlpool.png",        frame: 202 },
    tsunami:         { file: "tsunami.png",          frame: 210 },
    stone_spike:     { file: "stone-spike.png",      frame: 204 },
    sand_blast:      { file: "sand-blast.png",       frame: 202 },
    quicksand:       { file: "quicksand.png",        frame: 196 },
    earthquake:      { file: "earthquake.png",       frame: 202 },
    gust_slash:      { file: "gust-slash.png",       frame: 148 },
    feather_storm:   { file: "feather-storm.png",    frame: 182 },
    updraft:         { file: "updraft.png",          frame: 192 },
    tempest:         { file: "tempest.png",          frame: 194 },
    shadow_bolt:     { file: "shadow-bolt.png",      frame: 68  },
    nightfall:       { file: "nightfall.png",        frame: 104 },
    void_bind:       { file: "void-bind.png",        frame: 210 },
    abyssal_storm:   { file: "abyssal-storm.png",    frame: 176 },
    holy_spark:      { file: "holy-spark.png",       frame: 96  },
    radiant_wave:    { file: "radiant-wave.png",     frame: 138 },
    smite:           { file: "smite.png",            frame: 218 },
    heavenly_wrath:  { file: "heavenly-wrath.png",   frame: 218 },
    frost_bolt:      { file: "frost-bolt.png",       frame: 186 },
    blizzard:        { file: "blizzard.png",         frame: 208 },
    ice_prison:      { file: "ice-prison.png",       frame: 202 },
    absolute_zero:   { file: "absolute-zero.png",    frame: 184 },
    electric_jolt:   { file: "electric-jolt.png",    frame: 62  },
    chain_lightning: { file: "chain-lightning.png",  frame: 198 },
    thunder_crash:   { file: "thunder-crash.png",    frame: 192 },
    storm_symphony:  { file: "storm-symphony.png",   frame: 200 },
  };

  const SPELL_EFFECT_ANIMATION_BASE_PATH = "/Assets/SpellEffectAnimations";
  const SPELL_EFFECT_ANIMATION_FRAME_COUNT = 8;
  const SPELL_EFFECT_ANIMATION_FRAME_RATE = 12;
  const SPELL_EFFECT_ANIMATION_DEFS = {
    burn: { file: "burn.png", frameWidth: 58, frameHeight: 58, target: "enemy" },
    poison: { file: "poison.png", frameWidth: 150, frameHeight: 150, target: "enemy" },
    bleed: { file: "bleedEffect.png", frameWidth: 724, frameHeight: 724, frameCount: 3, target: "enemy" },
    drowned: { file: "drowned.png", frameWidth: 88, frameHeight: 88, target: "enemy" },
    updraft: { file: "updraft.png", frameWidth: 152, frameHeight: 152, target: "enemy" },
    corrupted: { file: "corrupted.png", frameWidth: 172, frameHeight: 172, target: "enemy" },
    stun: { file: "stun.png", frameWidth: 126, frameHeight: 126, target: "enemy" },
    earthShield: { file: "earth_shield.png", frameWidth: 166, frameHeight: 166, target: "party" },
  };
  const FROZEN_EFFECT_DEF = {
    key: "spellfx-frozen",
    file: "Frozen.png",
    frameWidth: 256,
    frameHeight: 256,
  };
  const FROZEN_EFFECT_OFFSET_Y = 15;
  const FROZEN_SPRITE_TINT = 0x8fdcff;

  function getAttackAnimationTextureKey(actionId) {
    return `attackfx-${actionId}`;
  }

  function getAttackAnimationKey(actionId) {
    return `attackfx-${actionId}-anim`;
  }

  function getSpellEffectTextureKey(effectId) {
    return `spellfx-${effectId}`;
  }

  function getSpellEffectAnimationKey(effectId) {
    return `spellfx-${effectId}-anim`;
  }

  const ENEMY_COMBAT_Y_OFFSET = 36;

  const ENEMY_SPRITE_SHEET_DEFS = {
    swordwitch: {
      folder: "SwordWitch",
      attackSfx: "attack.mp3",
      frameWidth: 198,
      frameHeight: 198,
      scale: 0.95,
      y: 360,
      flipX: true,
      idle: { file: "character_idle_sheet.png", frames: 16, rate: 10 },
      attack: { file: "character_attack_sheet.png", frames: 8, rate: 12 },
    },
    cinder_forager: {
      folder: "Cinder Forager",
      attackSfx: "fireSlash.mp3",
      frameWidth: 218,
      frameHeight: 218,
      impactFrame: 136,
      scale: 0.84,
      y: 366,
      flipX: false,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    fungal_acolyte: {
      folder: "Fungal Acolyte",
      attackSfx: "poisonattack.mp3",
      frameWidth: 214,
      frameHeight: 214,
      impactFrame: 180,
      scale: 0.86,
      y: 366,
      flipX: false,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    mossbound_soldier: {
      folder: "Mossbound Soldier",
      attackSfx: "attack.mp3",
      frameWidth: 220,
      frameHeight: 220,
      impactFrame: 174,
      scale: 0.88,
      y: 364,
      flipX: true,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    ravenwood_witch: {
      folder: "Ravenwood Witch",
      attackSfx: "attack.mp3",
      frameWidth: 198,
      frameHeight: 198,
      impactFrame: 192,
      scale: 0.94,
      y: 360,
      flipX: false,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    skeleton_mage: {
      folder: "Skeleton Mage",
      attackSfx: "attack.mp3",
      frameWidth: 194,
      frameHeight: 194,
      scale: 0.94,
      y: 360,
      flipX: true,
      idle: { file: "character_idle.png", frames: 8, rate: 8 },
      attack: { file: "character_attack.png", frames: 8, rate: 12 },
      hurt: { file: "character_hurt.png", frames: 8, rate: 10 },
    },
    storm_touched_poacher: {
      folder: "Storm-Touched Poacher",
      attackSfx: "attack.mp3",
      frameWidth: 208,
      frameHeight: 208,
      impactFrame: 144,
      scale: 0.9,
      y: 362,
      flipX: false,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    sunlit_exile: {
      folder: "Sunlit Exile",
      attackSfx: "attack.mp3",
      frameWidth: 200,
      frameHeight: 200,
      impactFrame: 96,
      scale: 0.92,
      y: 362,
      flipX: false,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    hollow_cultist: {
      folder: "Hollow Cultist",
      attackSfx: "darkattack.mp3",
      frameWidth: 218,
      frameHeight: 218,
      impactFrame: 182,
      scale: 0.84,
      y: 364,
      flipX: false,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    frostbark_revenant: {
      folder: "Frostbark Revenant",
      attackSfx: "iceSlash.mp3",
      frameWidth: 214,
      frameHeight: 214,
      impactFrame: 182,
      scale: 0.89,
      y: 360,
      flipX: false,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    drowned_woodsman: {
      folder: "Drowned Woodsman",
      attackSfx: "waterSlash.mp3",
      frameWidth: 198,
      frameHeight: 198,
      impactFrame: 98,
      scale: 0.92,
      y: 366,
      flipX: false,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    thornshield_guard: {
      folder: "Thornshield Guard",
      attackSfx: "attack.mp3",
      frameWidth: 214,
      frameHeight: 214,
      impactFrame: 180,
      scale: 0.87,
      y: 362,
      flipX: false,
      idle: { file: "idle.png", frames: 8, rate: 8 },
      attack: { file: "attack.png", frames: 8, rate: 12 },
      impact: { file: "impact.png", frames: 8, rate: 18 },
    },
    the_sunken_king: {
      folder: "../EnemiesBosses/The Sunken King",
      attackSfx: "attack_sound.mp3",
      frameWidth: 170,
      frameHeight: 170,
      impactFrame: 170,
      scale: 1.9,
      y: 412,
      hpBarPosition: "aboveSprite",
      hpBarTopGap: 18,
      flipX: false,
      useImpactForSwing: true,
      idle: { file: "idle.png", frames: 12, rate: 8 },
      attack: { file: "attack.png", frames: 10, rate: 12 },
      impact: { file: "impact.png", frames: 12, rate: 18 },
    },
  };

  function getEnemySheetTextureKey(artKey, state) {
    return `${artKey.replace(/_/g, "-")}-${state}`;
  }

  function getEnemySheetAnimKey(artKey, state) {
    return `${artKey.replace(/_/g, "-")}-${state}-anim`;
  }

  function getEnemyAssetBasePath(def) {
    return def.folder.startsWith("../EnemiesBosses") ? `/Assets/${def.folder.slice(3)}` : `/Assets/EnemiesMobs/${def.folder}`;
  }

  function getEnemyAttackSfxUrl(def) {
    return def?.attackSfx ? `${getEnemyAssetBasePath(def)}/${def.attackSfx}` : null;
  }

  const musicState = {
    elements: {},
    currentKey: null,
    pendingKey: null,
    combatSignature: null,
    combatTrackKey: null,
    volume: DEFAULT_AUDIO_VOLUME,
    unlocked: false,
    fadeIntervals: {},
  };
  const attackSfxState = {
    resolvedUrls: {},
    missingFiles: new Set(),
    warnedAutoplay: false,
    volume: DEFAULT_AUDIO_VOLUME,
  };
  const uiSfxState = {
    elements: {},
    missingFiles: new Set(),
    warnedAutoplay: false,
    interactionsBound: false,
    suppressHoverUntil: 0,
    phaserHoverTarget: null,
    phaserHoverClearTimer: null,
  };

  function clampAudioVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_AUDIO_VOLUME;
    }
    return Math.max(0, Math.min(1, numeric));
  }

  function readStoredAudioVolume(storageKey, fallback = DEFAULT_AUDIO_VOLUME) {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored == null) {
        return fallback;
      }
      return clampAudioVolume(stored);
    } catch (err) {
      return fallback;
    }
  }

  function readStoredMusicVolume() {
    try {
      const storedVolume = window.localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY);
      if (storedVolume != null) {
        return clampAudioVolume(storedVolume);
      }
      return window.localStorage.getItem(MUSIC_MUTE_STORAGE_KEY) === "1" ? 0 : DEFAULT_AUDIO_VOLUME;
    } catch (err) {
      return DEFAULT_AUDIO_VOLUME;
    }
  }

  function writeStoredAudioVolume(storageKey, value) {
    try {
      window.localStorage.setItem(storageKey, String(clampAudioVolume(value)));
    } catch (err) {
      // ignore storage errors (private mode, etc.)
    }
  }

  function getMusicTargetVolume(key) {
    return (MUSIC_TRACKS[key]?.volume || 0) * musicState.volume;
  }

  function getMusicElement(key) {
    if (!MUSIC_TRACKS[key]) {
      return null;
    }
    if (musicState.elements[key]) {
      return musicState.elements[key];
    }
    const audio = new Audio(MUSIC_TRACKS[key].src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    audio.crossOrigin = "anonymous";
    audio.addEventListener("error", () => {
      console.warn(`[music] failed to load ${MUSIC_TRACKS[key].src}`, audio.error);
    });
    musicState.elements[key] = audio;
    return audio;
  }

  function preloadMusic() {
    Object.keys(MUSIC_TRACKS).forEach((key) => {
      getMusicElement(key);
    });
  }

  function clearMusicFade(key) {
    if (musicState.fadeIntervals[key]) {
      clearInterval(musicState.fadeIntervals[key]);
      delete musicState.fadeIntervals[key];
    }
  }

  function fadeMusic(key, targetVolume, durationMs, onComplete) {
    const audio = musicState.elements[key];
    if (!audio) {
      if (onComplete) onComplete();
      return;
    }
    clearMusicFade(key);
    const start = audio.volume;
    const startTime = performance.now();
    musicState.fadeIntervals[key] = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / Math.max(1, durationMs));
      audio.volume = start + (targetVolume - start) * progress;
      if (progress >= 1) {
        clearMusicFade(key);
        if (onComplete) onComplete();
      }
    }, 30);
  }

  function ensureMusicPlaying(trackKey) {
    const audio = getMusicElement(trackKey);
    if (!audio) {
      return null;
    }
    if (!audio.paused) {
      return audio;
    }
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        console.warn(`[music] autoplay blocked for ${trackKey}; will retry on next user gesture`, err?.name || err);
      });
    }
    return audio;
  }

  function playMusic(trackKey) {
    if (musicState.currentKey === trackKey) {
      if (trackKey) {
        ensureMusicPlaying(trackKey);
        fadeMusic(trackKey, getMusicTargetVolume(trackKey), MUSIC_FADE_MS);
      }
      return;
    }

    const previousKey = musicState.currentKey;
    musicState.currentKey = trackKey || null;
    musicState.pendingKey = trackKey || null;

    // Fade the previously-active track down to 0 (but keep it playing so the
    // browser doesn't lose the gesture-granted permission).
    if (previousKey && musicState.elements[previousKey]) {
      fadeMusic(previousKey, 0, MUSIC_FADE_MS);
    }

    if (!trackKey) {
      return;
    }

    const audio = ensureMusicPlaying(trackKey);
    if (!audio) {
      return;
    }
    const targetVolume = getMusicTargetVolume(trackKey);

    fadeMusic(trackKey, targetVolume, MUSIC_FADE_MS);
  }

  function applyMusicVolumeState() {
    Object.keys(musicState.elements).forEach((key) => {
      const audio = musicState.elements[key];
      if (!audio) return;
      clearMusicFade(key);
      if (key === musicState.currentKey) {
        audio.volume = getMusicTargetVolume(key);
        ensureMusicPlaying(key);
      } else {
        audio.volume = 0;
      }
    });
  }

  function setMusicVolume(value) {
    musicState.volume = clampAudioVolume(value);
    writeStoredAudioVolume(MUSIC_VOLUME_STORAGE_KEY, musicState.volume);
    try {
      window.localStorage.setItem(MUSIC_MUTE_STORAGE_KEY, musicState.volume <= 0 ? "1" : "0");
    } catch (err) {
      // ignore storage errors (private mode, etc.)
    }
    applyMusicVolumeState();
    updateSettingsAccessButtonUi();
  }

  function setSfxVolume(value) {
    attackSfxState.volume = clampAudioVolume(value);
    writeStoredAudioVolume(SFX_VOLUME_STORAGE_KEY, attackSfxState.volume);
  }

  function formatVolumePercent(value) {
    return `${Math.round(clampAudioVolume(value) * 100)}%`;
  }

  function updateAudioSettingsLabels() {
    const musicValue = modalRoot?.querySelector("[data-audio-music-value]");
    const sfxValue = modalRoot?.querySelector("[data-audio-sfx-value]");
    if (musicValue) {
      musicValue.textContent = formatVolumePercent(musicState.volume);
    }
    if (sfxValue) {
      sfxValue.textContent = formatVolumePercent(attackSfxState.volume);
    }
  }

  function showSettingsModal() {
    if (!modalRoot) {
      return;
    }

    const enhancedChecked = readEnhancedBgAnimationsEnabled();

    modalRoot.innerHTML = `
      <div class="modal-card audio-settings-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
        <h2 id="settings-modal-title" class="modal-title">Settings</h2>
        <p class="modal-subtitle">Audio</p>
        <div class="audio-slider-row">
          <div class="audio-slider-label">
            <label for="audio-music-volume">Music</label>
            <span data-audio-music-value>${formatVolumePercent(musicState.volume)}</span>
          </div>
          <input id="audio-music-volume" type="range" min="0" max="100" step="1" value="${Math.round(musicState.volume * 100)}" data-audio-music-slider />
        </div>
        <div class="audio-slider-row">
          <div class="audio-slider-label">
            <label for="audio-sfx-volume">Sound Effects</label>
            <span data-audio-sfx-value>${formatVolumePercent(attackSfxState.volume)}</span>
          </div>
          <input id="audio-sfx-volume" type="range" min="0" max="100" step="1" value="${Math.round(attackSfxState.volume * 100)}" data-audio-sfx-slider />
        </div>
        <p class="modal-subtitle settings-visuals-heading">Visuals</p>
        <label class="settings-enhanced-row">
          <input type="checkbox" data-enhanced-bg-anim ${enhancedChecked ? "checked" : ""} />
          <span>Enhanced background animations</span>
        </label>
        <p class="modal-subtitle settings-enhanced-disclaimer">Loads full lobby, shrine, and combat background loops (~6s load time on a fast connection).</p>
        <div class="modal-actions">
          <button type="button" class="primary-btn" data-settings-close>Done</button>
        </div>
      </div>
    `;

    modalRoot.classList.add("is-open");
    modalRoot.setAttribute("aria-hidden", "false");

    const musicSlider = modalRoot.querySelector("[data-audio-music-slider]");
    const sfxSlider = modalRoot.querySelector("[data-audio-sfx-slider]");
    const enhancedCheckbox = modalRoot.querySelector("[data-enhanced-bg-anim]");
    const closeButton = modalRoot.querySelector("[data-settings-close]");

    const cleanup = () => {
      modalRoot.classList.remove("is-open");
      modalRoot.setAttribute("aria-hidden", "true");
      modalRoot.innerHTML = "";
      document.removeEventListener("keydown", onKeyDown);
      modalRoot.removeEventListener("mousedown", onBackdrop);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup();
      }
    };

    const onBackdrop = (event) => {
      if (event.target === modalRoot) {
        cleanup();
      }
    };

    musicSlider?.addEventListener("input", (event) => {
      setMusicVolume(Number(event.target.value) / 100);
      updateAudioSettingsLabels();
    });
    sfxSlider?.addEventListener("input", (event) => {
      setSfxVolume(Number(event.target.value) / 100);
      updateAudioSettingsLabels();
    });
    enhancedCheckbox?.addEventListener("change", (event) => {
      const enabled = Boolean(event.target.checked);
      writeEnhancedBgAnimationsEnabled(enabled);
      if (enabled) {
        runEnhancedBackgroundAnimationsLoad();
      }
    });
    closeButton?.addEventListener("click", cleanup);
    document.addEventListener("keydown", onKeyDown);
    modalRoot.addEventListener("mousedown", onBackdrop);
    setTimeout(() => musicSlider?.focus(), 30);
  }

  function getRunEndSummarySignature(summary) {
    if (!summary) {
      return null;
    }
    const partyIds = (summary.party || []).map((member) => member.id).sort().join(",");
    return `${summary.lobbyId || "run"}:${summary.chapter || 1}:${summary.floor || 1}:${partyIds}`;
  }

  function renderRunEndPartyMemberMarkup(member) {
    const character = getCharacterDefinition(member.characterId);
    const iconPath = getCharacterIconPath(character);
    const currentHp = Math.max(0, Number(member.hp) || 0);
    const maxHp = Math.max(1, Number(member.maxHp) || 1);
    const hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
    const portraitMarkup = iconPath
      ? `<img class="run-end-portrait" src="${iconPath}" alt="${escapeHtml(character.name)} portrait" />`
      : `<div class="run-end-portrait run-end-portrait-fallback">${escapeHtml((character.name || "?").slice(0, 1))}</div>`;

    return `
      <div class="run-end-member-card">
        ${portraitMarkup}
        <div class="run-end-member-body">
          <div class="run-end-member-heading">
            <h3>${escapeHtml(member.nickname || "Player")}</h3>
            <span>Level ${Number(member.level) || 1}</span>
          </div>
          <p>${escapeHtml(character.name || member.type || "Adventurer")}</p>
          <div class="run-end-hp-bar" role="img" aria-label="HP ${currentHp}/${maxHp}">
            <div class="run-end-hp-fill" style="width:${hpPercent}%"></div>
          </div>
          <div class="run-end-member-stats">
            <span>HP ${currentHp}/${maxHp}</span>
            <span>${Number(member.gold) || 0} Gold</span>
            <span>${Number(member.xp) || 0} XP</span>
          </div>
        </div>
      </div>
    `;
  }

  function showRunEndSummaryModal(summary) {
    if (!modalRoot || !summary || summary.success) {
      return;
    }

    const signature = getRunEndSummarySignature(summary);
    if (signature && appState.runEndSummarySignature === signature) {
      return;
    }
    appState.runEndSummarySignature = signature;
    playUiSfx("failure");

    const party = Array.isArray(summary.party) ? summary.party : [];
    const partyMarkup = party.length
      ? party.map((member) => renderRunEndPartyMemberMarkup(member)).join("")
      : `<p class="modal-subtitle">No party data was available.</p>`;
    const floor = Math.max(1, Number(summary.floor) || 1);
    const chapter = Math.max(1, Number(summary.chapter) || 1);
    const stageName = summary.stageName ? ` &bull; ${escapeHtml(summary.stageName)}` : "";

    modalRoot.innerHTML = `
      <div class="modal-card run-end-modal" role="dialog" aria-modal="true" aria-labelledby="run-end-title">
        <p class="run-end-kicker">Party Defeated</p>
        <h2 id="run-end-title" class="modal-title">Run Score</h2>
        <p class="run-end-floor">Chapter ${chapter} &bull; Floor ${floor}${stageName}</p>
        <div class="run-end-party-grid">
          ${partyMarkup}
        </div>
        <div class="modal-actions">
          <button type="button" class="primary-btn" data-run-end-close>Okay</button>
        </div>
      </div>
    `;
    modalRoot.classList.add("is-open");
    modalRoot.setAttribute("aria-hidden", "false");

    const closeButton = modalRoot.querySelector("[data-run-end-close]");
    closeButton?.addEventListener("click", () => {
      modalRoot.classList.remove("is-open");
      modalRoot.setAttribute("aria-hidden", "true");
      modalRoot.innerHTML = "";
    });
    setTimeout(() => closeButton?.focus(), 30);
  }

  function initAudioSettings() {
    musicState.volume = readStoredMusicVolume();
    attackSfxState.volume = readStoredAudioVolume(SFX_VOLUME_STORAGE_KEY);
    updateSettingsAccessButtonUi();
  }

  function updateSettingsAccessButtonUi() {
    const btn = document.getElementById("settings-access-btn");
    if (!btn) return;
    const isMusicMuted = musicState.volume <= 0;
    btn.classList.toggle("is-muted", isMusicMuted);
    btn.setAttribute("aria-pressed", isMusicMuted ? "true" : "false");
    btn.setAttribute("aria-label", "Open settings");
    btn.setAttribute("aria-haspopup", "dialog");
    const icon = btn.querySelector(".settings-access-speaker-icon");
    if (icon) {
      icon.innerHTML = isMusicMuted ? "&#x1F507;" : "&#x1F50A;";
    }
  }

  function initSettingsAccessButton() {
    initAudioSettings();
    const btn = document.getElementById("settings-access-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        showSettingsModal();
      });
    }
    preloadUiSfx();
    initUiSfxInteractions();
    initAudioUnlock();
  }

  function initAudioUnlock() {
    const unlock = () => {
      if (musicState.unlocked) {
        if (musicState.currentKey && musicState.volume > 0) {
          ensureMusicPlaying(musicState.currentKey);
          fadeMusic(musicState.currentKey, getMusicTargetVolume(musicState.currentKey), MUSIC_FADE_MS);
        }
        return;
      }
      musicState.unlocked = true;
      console.info("[music] unlocking audio after user gesture");

      // Prime only the requested track. Other music is created lazily when a
      // later scene asks for it, keeping startup network work small.
      const key = musicState.pendingKey || musicState.currentKey;
      const audio = key ? getMusicElement(key) : null;
      if (audio) {
        audio.volume = 0;
        const p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            console.info(`[music] primed ${key}`);
          }).catch((err) => {
            console.warn(`[music] failed to start ${key}`, err?.name || err);
          });
        }
      }

      // If a track was requested before the gesture, fade it in now.
      if (musicState.pendingKey && musicState.volume > 0) {
        const pending = musicState.pendingKey;
        fadeMusic(pending, getMusicTargetVolume(pending), MUSIC_FADE_MS);
      }
    };

    const opts = { capture: true };
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
  }

  function getAttackSfxFile(action) {
    if (!action || (action.kind !== "swing" && action.kind !== "spell")) {
      return null;
    }
    if (action.kind === "spell" && FART_WIZARD_SPELL_IDS.has(action.id)) {
      const index = Math.floor(Math.random() * FART_ATTACK_SFX_FILES.length);
      return FART_ATTACK_SFX_FILES[index];
    }
    return ATTACK_SFX_FILES[action.id] || null;
  }

  function playAttackSfx(action) {
    const soundFile = getAttackSfxFile(action);
    if (!soundFile || attackSfxState.missingFiles.has(soundFile)) {
      return;
    }
    const cachedUrl = attackSfxState.resolvedUrls[soundFile];
    if (cachedUrl) {
      playAttackSfxUrl(cachedUrl, soundFile);
      return;
    }
    const url = `${ATTACK_SFX_BASE_PATH}/${encodeURIComponent(soundFile)}`;
    playAttackSfxUrl(url, soundFile);
  }

  function playAttackSfxUrl(url, soundFile) {
    if (attackSfxState.volume <= 0) {
      return;
    }
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = ATTACK_SFX_BASE_VOLUME * attackSfxState.volume;
    audio.addEventListener("error", () => {
      attackSfxState.missingFiles.add(soundFile);
    }, { once: true });
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          attackSfxState.resolvedUrls[soundFile] = url;
        })
        .catch((err) => {
          if (err?.name === "NotAllowedError" && !attackSfxState.warnedAutoplay) {
            attackSfxState.warnedAutoplay = true;
            console.warn("[sfx] attack sound blocked until the next user gesture", err);
          } else if (err?.name === "NotSupportedError") {
            attackSfxState.missingFiles.add(soundFile);
          }
        });
    }
  }

  function getCombatMusicSignature(runState) {
    if (!runState || runState.stageType !== "combat") {
      return null;
    }
    return [
      runState.lobbyId || "run",
      runState.stageIndex ?? "-",
      runState.stageCombatKey || runState.stageName || "combat",
    ].join(":");
  }

  function pickRandomCombatMusicTrack() {
    if (!COMBAT_MUSIC_TRACK_KEYS.length) {
      return null;
    }
    const index = Math.floor(Math.random() * COMBAT_MUSIC_TRACK_KEYS.length);
    return COMBAT_MUSIC_TRACK_KEYS[index];
  }

  function getCombatMusicTrack(runState) {
    const signature = getCombatMusicSignature(runState);
    if (!signature) {
      musicState.combatSignature = null;
      musicState.combatTrackKey = null;
      return null;
    }

    if (musicState.combatSignature !== signature || !musicState.combatTrackKey) {
      musicState.combatSignature = signature;
      musicState.combatTrackKey = pickRandomCombatMusicTrack();
    }

    return musicState.combatTrackKey;
  }

  function updateMusicForState() {
    let target = null;
    if (appState.sceneKey === "entry" || appState.sceneKey === "characterSelect") {
      target = "characterSelect";
    } else if (appState.sceneKey === "hub") {
      target = "astralHub";
    } else if (appState.sceneKey === "lobby") {
      target = "lobby";
    } else if (appState.sceneKey === "run" && appState.runState?.stageType === "combat") {
      target = getCombatMusicTrack(appState.runState);
    } else if (appState.sceneKey === "run" && appState.runState?.stageType === "blessing") {
      target = "shrine";
    } else if (appState.sceneKey === "run" && appState.runState?.stageType === "shop") {
      target = "shop";
    }
    if (appState.sceneKey !== "run" || appState.runState?.stageType !== "combat") {
      getCombatMusicTrack(null);
    }
    if (target !== musicState.currentKey) {
      console.info(`[music] scene=${appState.sceneKey} stage=${appState.runState?.stageType ?? "-"} -> track=${target ?? "(silence)"}`);
    }
    playMusic(target);
  }
  const SHRINE_BACKGROUND = {
    animKey: "shrine-bg-animated-loop",
    basePath: "/Assets/Backgrounds/ShrineBG/ShrineBG",
    framePrefix: "ezgif-frame-",
    frameCount: 31,
    frameRate: 12,
    texturePrefix: "shrine-bg-frame",
    type: "animation",
  };
  const SHOP_BACKGROUND = {
    key: "shop-bg-video",
    path: "/Assets/Backgrounds/ShopBGVideo/forestShop1VideoLoop.mp4",
    type: "video",
  };
  const LOBBY_BACKGROUND = {
    key: "lobby-bg",
    path: "/Assets/Backgrounds/lobbyBG.png",
    type: "image",
  };
  const LOBBY_BACKGROUND_ANIMATION = {
    animKey: "lobby-bg-animated-loop",
    basePath: "/Assets/Backgrounds/LobbgBGAnimated",
    framePrefix: "ezgif-frame-",
    frameCount: 31,
    frameRate: 12,
    texturePrefix: "lobby-bg-animated-frame",
  };
  const FOREST_PORTAL_ANIMATION = {
    key: "portal-forest",
    animKey: "portal-forest-anim",
    path: "/Assets/UI/PortalAnimationForest.png",
    frameWidth: 158,
    frameHeight: 158,
    frameCount: 12,
    frameRate: 12,
  };

  /* Near default hub spawn (~220,560) so both portals are on-screen without crossing the map. */
  const VIBE_JAM_RETURN_PORTAL_POS = { x: 640, y: 560 };
  const VIBE_JAM_ARRIVAL_HUB_SPAWN = { x: 480, y: 560 };
  const VIBE_JAM_EXIT_PORTAL_POS = { x: 820, y: 560 };
  const VIBE_JAM_EXIT_PORTAL_TINT = 0xff6ec7;
  const VIBE_JAM_EXIT_GLOW = 0xff52a8;
  const VIBE_JAM_RETURN_PORTAL_TINT = 0x3dffec;
  const VIBE_JAM_RETURN_GLOW = 0x2ee6d6;
  const VIBE_JAM_RETURN_PORTAL_GRACE_MS = 5000;
  const VIBE_JAM_HUB_SPEED_PARAM = "17";

  function maybeStripVibeJamPortalUrl() {
    if (!appState.vibeJamPortalNeedStripQuery) {
      return;
    }
    appState.vibeJamPortalNeedStripQuery = false;
    try {
      const path = window.location.pathname || "/";
      history.replaceState({}, "", path + window.location.hash);
    } catch (_) {
      /* ignore replaceState failures (e.g. opaque origins) */
    }
  }

  const VIBE_JAM_TYPE_TO_COLOR = {
    Fire: "red",
    Water: "#38bdf8",
    Earth: "#ca8a04",
    Wind: "#a3e635",
    Lightning: "#facc15",
    Ice: "#7dd3fc",
    Poison: "#a855f7",
    Light: "#fde047",
    Shadow: "#6b21a8",
  };

  function getVibeJamColorForCharacterId(characterId) {
    const character = getCharacterDefinition(characterId);
    const type = character?.type;
    return (type && VIBE_JAM_TYPE_TO_COLOR[type]) || "#ffffff";
  }

  function tryVibeJamPortalBootstrap() {
    if (!appState.socket || !appState.socket.connected) {
      return;
    }
    if (!appState.vibeJamPortalInbound || !appState.vibeJamInboundRefNormalized) {
      return;
    }
    if (appState.vibeJamPortalBootstrapAttempted) {
      return;
    }
    const player = appState.player;
    if (!player || player.scene !== "entry") {
      return;
    }
    if (String(player.nickname || "").trim()) {
      return;
    }
    appState.vibeJamPortalBootstrapAttempted = true;
    const fromUrl = String(getInitialUrlParamIgnoreCase("username") || "").trim().slice(0, 18);
    const nickname = fromUrl || "Traveler";
    const characterId = CHARACTER_CARDS[Math.floor(Math.random() * CHARACTER_CARDS.length)].id;
    appState.vibeJamPortalNeedStripQuery = true;
    appState.entryNicknameDraft = nickname;
    appState.selectedCharacterId = characterId;
    emit("registerPlayer", {
      nickname,
      characterId,
      hubSpawn: { x: VIBE_JAM_ARRIVAL_HUB_SPAWN.x, y: VIBE_JAM_ARRIVAL_HUB_SPAWN.y },
    });
  }

  function buildVibeJamExitPortalUrl() {
    const params = new URLSearchParams(window.location.search);
    if (appState.vibeJamInboundParams) {
      appState.vibeJamInboundParams.forEach((value, key) => {
        const k = String(key).toLowerCase();
        if (k === "ref" || k === "portal") {
          return;
        }
        if (!params.has(key) && value != null && String(value) !== "") {
          params.set(key, value);
        }
      });
    }
    const player = appState.player;
    params.set("portal", "true");
    params.set("ref", window.location.hostname || "");
    if (player?.nickname) {
      params.set("username", String(player.nickname));
    }
    if (player?.characterId) {
      params.set("color", getVibeJamColorForCharacterId(player.characterId));
      const character = getCharacterDefinition(player.characterId);
      const maxHp = character?.stats?.maxHp;
      if (Number.isFinite(maxHp)) {
        params.set("hp", String(Math.max(1, Math.min(100, Math.round(maxHp)))));
      }
    }
    params.set("speed", VIBE_JAM_HUB_SPEED_PARAM);
    return `https://vibej.am/portal/2026?${params.toString()}`;
  }

  function buildVibeJamReturnPortalUrl() {
    const ref = appState.vibeJamInboundRefNormalized;
    if (!ref) {
      return "";
    }
    const params = new URLSearchParams(
      appState.vibeJamInboundParams ? appState.vibeJamInboundParams.toString() : "",
    );
    deleteUrlSearchParamIgnoreCase(params, "ref");
    const player = appState.player;
    if (player?.nickname) {
      params.set("username", String(player.nickname));
    }
    if (player?.characterId) {
      params.set("color", getVibeJamColorForCharacterId(player.characterId));
      const character = getCharacterDefinition(player.characterId);
      const maxHp = character?.stats?.maxHp;
      if (Number.isFinite(maxHp)) {
        params.set("hp", String(Math.max(1, Math.min(100, Math.round(maxHp)))));
      }
    }
    params.set("speed", VIBE_JAM_HUB_SPEED_PARAM);
    params.set("portal", "true");
    const tail = params.toString();
    if (!tail) {
      return ref;
    }
    const joiner = ref.includes("?") ? "&" : "?";
    return `${ref}${joiner}${tail}`;
  }

  function shouldVibeJamPortalSkipEntryOverlay() {
    if (!appState.vibeJamPortalInbound) {
      return false;
    }
    if (appState.sceneKey !== "entry" && appState.sceneKey !== "characterSelect") {
      return false;
    }
    const player = appState.player;
    if (player && String(player.nickname || "").trim()) {
      return false;
    }
    return true;
  }

  function getLobbyBackgroundFrameKey(frameNumber) {
    return `${LOBBY_BACKGROUND_ANIMATION.texturePrefix}-${String(frameNumber).padStart(3, "0")}`;
  }
  const LOBBY_STUMP_SLOTS = [
    { x: 195, footY: 482, labelY: 565, beamTopX: 220, beamWidth: 155 },
    { x: 500, footY: 480, labelY: 563, beamTopX: 498, beamWidth: 150 },
    { x: 790, footY: 470, labelY: 555, beamTopX: 776, beamWidth: 150 },
    { x: 1092, footY: 480, labelY: 563, beamTopX: 1060, beamWidth: 160 },
  ];
  const CHAPTER1_MOB_COMBAT_BACKGROUNDS = [
    {
      id: "forest-bg-1",
      animKey: "forest-combat-bg-1-anim",
      basePath: "/Assets/Backgrounds/ForestChapter/bg1/bg1",
      framePrefix: "ezgif-frame-",
      frameStart: 2,
      frameCount: 30,
      frameRate: 12,
      texturePrefix: "forest-combat-bg-1-frame",
      type: "animation",
    },
    {
      id: "forest-bg-2",
      animKey: "forest-combat-bg-2-anim",
      basePath: "/Assets/Backgrounds/ForestChapter/bg2/bg2",
      framePrefix: "ezgif-frame-",
      frameCount: 22,
      frameRate: 12,
      texturePrefix: "forest-combat-bg-2-frame",
      type: "animation",
    },
    {
      id: "forest-bg-3",
      animKey: "forest-combat-bg-3-anim",
      basePath: "/Assets/Backgrounds/ForestChapter/bg3/bg3",
      framePrefix: "ezgif-frame-",
      frameStart: 3,
      frameCount: 29,
      frameRate: 12,
      texturePrefix: "forest-combat-bg-3-frame",
      type: "animation",
    },
    {
      id: "forest-bg-4",
      animKey: "forest-combat-bg-4-anim",
      basePath: "/Assets/Backgrounds/ForestChapter/bg4/bg4",
      framePrefix: "ezgif-frame-",
      frameCount: 31,
      frameRate: 12,
      texturePrefix: "forest-combat-bg-4-frame",
      type: "animation",
    },
  ];
  const CHAPTER1_MOB_COMBAT_FOREGROUNDS = [
    {
      id: "forest-fg-1",
      key: "forest-combat-fg-1",
      path: "/Assets/Foregrounds/Chapter1Forest/ForestForeground1.png",
      type: "image",
    },
    {
      id: "forest-fg-2",
      key: "forest-combat-fg-2",
      path: "/Assets/Foregrounds/Chapter1Forest/ForestForeground2.png",
      type: "image",
    },
  ];

  function getCombatAnimationFrameKey(animation, frameNumber) {
    return `${animation.texturePrefix}-${String(frameNumber).padStart(3, "0")}`;
  }

  function getCombatAnimationStartFrame(animation) {
    return animation.frameStart || 1;
  }

  function getFrameAnimationKey(animation, frameNumber) {
    return `${animation.texturePrefix}-${String(frameNumber).padStart(3, "0")}`;
  }

  function getRandomCombatLayerOption(options) {
    if (!options.length) {
      return null;
    }
    const index = Math.floor(Math.random() * options.length);
    return options[index];
  }

  function getRandomChapter1MobCombatEnvironment() {
    const background = getRandomCombatLayerOption(CHAPTER1_MOB_COMBAT_BACKGROUNDS);
    const foreground = getRandomCombatLayerOption(CHAPTER1_MOB_COMBAT_FOREGROUNDS);
    if (!background || !foreground) {
      return null;
    }
    return { background, foreground };
  }

  function shouldUseChapter1CombatEnvironment(runState) {
    if (!runState || runState.stageType !== "combat") {
      return false;
    }
    return true;
  }

  const AVAILABLE_TYPE_ICON_IDS = new Set(["dark", "earth", "electric", "fire", "ice", "light", "poison", "water", "wind"]);

  function getTypeIconPath(typeLabel) {
    if (!typeLabel) {
      return null;
    }
    const normalized = String(typeLabel).trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const iconAlias = normalized === "shadow" ? "dark" : normalized === "lightning" ? "electric" : normalized;
    const iconId = AVAILABLE_TYPE_ICON_IDS.has(iconAlias) ? iconAlias : "dark";
    return `/Assets/TypeIcons/${iconId}.png`;
  }

  function renderNameWithTypeIcon(name, typeLabel) {
    const safeName = escapeHtml(name);
    const safeType = escapeHtml(typeLabel || "");
    const iconPath = getTypeIconPath(typeLabel);
    if (!iconPath) {
      return safeName;
    }
    return `
      <span class="type-chip-row type-name-row">
        <img class="type-chip-icon type-chip-icon-inline" src="${iconPath}" alt="${safeType} icon" />
        <span>${safeName}</span>
      </span>
    `;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatStatMultiplier(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "x1.00";
    }
    return `x${value.toFixed(2)}`;
  }

  function formatStatPercent(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "0%";
    }
    return `${Math.round(value * 100)}%`;
  }

  const STAT_DEFINITIONS = {
    health: {
      label: "Health",
      barMin: 0,
      barMax: 150,
      format: (v) => String(v),
      tooltip: "Maximum hit points. At 0 you are defeated.",
    },
    swingDamage: {
      label: "Swing Damage",
      barMin: 0.5,
      barMax: 1.5,
      format: formatStatMultiplier,
      tooltip: "Multiplier on every swing attack. 1.00 is baseline. Higher = harder-hitting Basic, Charged, and Power Swings.",
    },
    spellDamage: {
      label: "Spell Damage",
      barMin: 0.5,
      barMax: 1.5,
      format: formatStatMultiplier,
      tooltip: "Multiplier on outgoing spell damage and the magic half of Charged/Power Swings. 1.00 is baseline.",
    },
    swingDefense: {
      label: "Swing Defense",
      barMin: 0,
      barMax: 0.5,
      format: formatStatPercent,
      tooltip: "Percent of incoming physical (swing) damage blocked. Caps at 90%.",
    },
    spellDefense: {
      label: "Spell Defense",
      barMin: 0,
      barMax: 0.5,
      format: formatStatPercent,
      tooltip: "Percent of incoming magic (spell / typed) damage blocked. Caps at 90%.",
    },
    energyRegen: {
      label: "Energy Regen",
      barMin: 0,
      barMax: 5,
      format: (v) => `+${v}/turn`,
      tooltip: "Energy gained at the start of each turn. Spent on all actions.",
    },
    manaRegen: {
      label: "Mana Regen",
      barMin: 0,
      barMax: 5,
      format: (v) => `+${v}/turn`,
      tooltip: "Mana of your type gained at the start of each turn. Spent on spells and Charged/Power Swings.",
    },
  };

  function renderStatBarMarkup(statKey, value, overrides = {}) {
    const def = STAT_DEFINITIONS[statKey];
    if (!def) return "";
    const barMin = overrides.barMin ?? def.barMin;
    const barMax = overrides.barMax ?? def.barMax;
    const safeValue = typeof value === "number" && Number.isFinite(value) ? value : barMin;
    const ratio = barMax > barMin ? (safeValue - barMin) / (barMax - barMin) : 0;
    const fillPct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    const displayValue = def.format(safeValue);
    const tooltip = overrides.tooltip ?? def.tooltip;
    const safeTooltip = escapeHtml(tooltip);
    const safeLabel = escapeHtml(def.label);
    return `
      <div class="stat-bar" tabindex="0" role="group" aria-label="${safeLabel}: ${escapeHtml(displayValue)}. ${safeTooltip}" data-tooltip="${safeTooltip}">
        <div class="stat-bar-header">
          <span class="stat-bar-label">${safeLabel}</span>
          <span class="stat-bar-value">${escapeHtml(displayValue)}</span>
        </div>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${fillPct}%"></div></div>
      </div>
    `;
  }

  function setUi(html) {
    uiRoot.innerHTML = html;
    bindUiActions();
  }

  function setMenuOverlay(html) {
    menuOverlayRoot.innerHTML = html;
    menuOverlayRoot.classList.toggle("is-active", Boolean(html));
    if (html) {
      bindUiActions();
    }
  }

  function setLobbyActions(html) {
    lobbyActionsRoot.innerHTML = html;
    lobbyActionsRoot.classList.toggle("is-active", Boolean(html));
    if (html) {
      bindUiActions();
    }
  }

  function setCombatHud(html) {
    combatHudRoot.innerHTML = html;
    combatHudRoot.classList.toggle("is-active", Boolean(html));
    gameShellRoot?.classList.toggle("has-combat-hud", Boolean(html));
    if (html) {
      bindUiActions();
    }
  }

  function setTurnOverlay(html, phase = null) {
    if (!turnOverlayRoot) {
      return;
    }
    if (appState.turnOverlayClearTimer) {
      clearTimeout(appState.turnOverlayClearTimer);
      appState.turnOverlayClearTimer = null;
    }

    if (!html) {
      appState.turnOverlayPhase = null;
      if (!turnOverlayRoot.classList.contains("is-active")) {
        turnOverlayRoot.innerHTML = "";
        return;
      }
      turnOverlayRoot.classList.remove("is-active");
      appState.turnOverlayClearTimer = setTimeout(() => {
        turnOverlayRoot.innerHTML = "";
        appState.turnOverlayClearTimer = null;
      }, TURN_OVERLAY_FADE_MS);
      return;
    }

    const isActive = turnOverlayRoot.classList.contains("is-active");
    const samePhase = isActive && appState.turnOverlayPhase === phase;
    if (samePhase) {
      turnOverlayRoot.innerHTML = html;
      return;
    }

    const applyOverlay = () => {
      turnOverlayRoot.innerHTML = html;
      appState.turnOverlayPhase = phase;
      turnOverlayRoot.classList.remove("is-active");
      window.requestAnimationFrame(() => {
        turnOverlayRoot.classList.add("is-active");
      });
    };

    if (isActive) {
      turnOverlayRoot.classList.remove("is-active");
      appState.turnOverlayClearTimer = setTimeout(() => {
        appState.turnOverlayClearTimer = null;
        applyOverlay();
      }, TURN_OVERLAY_FADE_MS);
      return;
    }

    applyOverlay();
  }

  function clearStageIntroTimers() {
    if (appState.stageIntroHideTimer) {
      clearTimeout(appState.stageIntroHideTimer);
      appState.stageIntroHideTimer = null;
    }
    if (appState.stageIntroClearTimer) {
      clearTimeout(appState.stageIntroClearTimer);
      appState.stageIntroClearTimer = null;
    }
  }

  function setStageIntroAudioHidden(isHidden) {
    gameShellRoot?.classList.toggle("has-stage-intro-overlay", Boolean(isHidden));
  }

  function hideStageIntroOverlay({ resetSignature = false } = {}) {
    if (!stageIntroOverlayRoot) {
      return;
    }
    clearStageIntroTimers();
    stageIntroOverlayRoot.style.transition = "";
    stageIntroOverlayRoot.classList.remove("is-active");
    appState.stageIntroClearTimer = setTimeout(() => {
      stageIntroOverlayRoot.innerHTML = "";
      setStageIntroAudioHidden(false);
      appState.stageIntroClearTimer = null;
    }, STAGE_INTRO_FADE_MS);
    if (resetSignature) {
      appState.stageIntroSignature = null;
    }
  }

  function getStageIntroSignature(runState) {
    if (!runState || !["combat", "shop"].includes(runState.stageType)) {
      return null;
    }
    return `${runState.lobbyId || "run"}:${runState.stageIndex}:${runState.stageType}`;
  }

  function getStageIntroFloorNumber(runState) {
    const stageIndex = Number(runState?.stageIndex) || 0;
    return Math.max(1, stageIndex);
  }

  function renderStageIntroMarkup(runState) {
    const subtitle = runState.stageType === "shop" ? "Shop" : runState.stageName || "";
    return `
      <div class="stage-intro-card">
        <p class="stage-intro-chapter">Chapter 1</p>
        <h2 class="stage-intro-floor">Floor ${getStageIntroFloorNumber(runState)}</h2>
        ${subtitle ? `<p class="stage-intro-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      </div>
    `;
  }

  function syncStageIntroOverlay(runState) {
    if (!stageIntroOverlayRoot) {
      return;
    }
    const signature = getStageIntroSignature(runState);
    if (!signature || appState.sceneKey !== "run") {
      if (stageIntroOverlayRoot?.classList.contains("is-active")) {
        hideStageIntroOverlay({ resetSignature: !signature });
      } else if (!signature) {
        appState.stageIntroSignature = null;
      }
      return;
    }
    if (appState.stageIntroSignature === signature) {
      return;
    }

    clearStageIntroTimers();
    appState.stageIntroSignature = signature;
    stageIntroOverlayRoot.innerHTML = renderStageIntroMarkup(runState);
    stageIntroOverlayRoot.style.transition = "none";
    stageIntroOverlayRoot.classList.add("is-active");
    setStageIntroAudioHidden(true);
    stageIntroOverlayRoot.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      stageIntroOverlayRoot.style.transition = "";
    });
    appState.stageIntroHideTimer = setTimeout(() => {
      stageIntroOverlayRoot.classList.remove("is-active");
      appState.stageIntroHideTimer = null;
      appState.stageIntroClearTimer = setTimeout(() => {
        stageIntroOverlayRoot.innerHTML = "";
        setStageIntroAudioHidden(false);
        appState.stageIntroClearTimer = null;
      }, STAGE_INTRO_FADE_MS);
    }, STAGE_INTRO_HOLD_MS);
  }

  function setTopHud(html) {
    if (!topHudRoot) {
      return;
    }
    topHudRoot.innerHTML = html;
    topHudRoot.classList.toggle("is-active", Boolean(html));
  }

  function setCombatInfo(html) {
    if (!combatInfoRoot) {
      return;
    }
    combatInfoRoot.innerHTML = html || "";
    combatInfoRoot.classList.toggle("is-active", Boolean(html));
  }

  function hideRewardOverlay() {
    if (!rewardOverlayRoot) {
      return;
    }
    rewardOverlayRoot.innerHTML = "";
    rewardOverlayRoot.classList.remove("is-active");
    appState.rewardOverlaySignature = null;
    appState.selectedLevelUpStatId = null;
  }

  function getLevelUpPendingEntries(runState) {
    return Object.entries(runState?.levelUpChoices?.pending || {});
  }

  function getCurrentLevelUpState(runState) {
    const playerId = appState.player?.id;
    return playerId ? runState?.levelUpChoices?.pending?.[playerId] || null : null;
  }

  function getLevelUpSignature(runState) {
    return getLevelUpPendingEntries(runState)
      .map(([playerId, choiceState]) => `${playerId}:${choiceState.selectedStatId || "pending"}`)
      .sort()
      .join(",");
  }

  function renderRewardMemberMarkup(member) {
    const character = getCharacterDefinition(member.characterId);
    const iconPath = getCharacterIconPath(character);
    const beforeProgress = getRewardXpProgress(member, false);
    const afterProgress = getRewardXpProgress(member, true);
    const levelUpMarkup =
      member.levelAfter > member.levelBefore
        ? `<span class="reward-level-up">Level Up! ${member.levelBefore} -> ${member.levelAfter}</span>`
        : `<span class="reward-level">Level ${member.levelAfter}</span>`;
    const deathPenaltyMarkup =
      member.wasDowned && Number(member.maxHpBefore) > Number(member.maxHpAfter)
        ? `<p class="small-copy">Downed: Max HP ${member.maxHpBefore} -> ${member.maxHpAfter}</p>`
        : member.wasDowned
          ? `<p class="small-copy">Downed: revived at ${member.maxHpAfter || 1} HP</p>`
          : "";
    const portraitMarkup = iconPath
      ? `<img class="reward-portrait" src="${iconPath}" alt="${escapeHtml(character.name)} portrait" />`
      : `<div class="reward-portrait reward-portrait-fallback">${escapeHtml((character.name || "?").slice(0, 1))}</div>`;

    return `
      <div class="reward-member-card">
        ${portraitMarkup}
        <div class="reward-member-body">
          <div class="reward-member-header">
            <div>
              <h3>${escapeHtml(member.nickname || "")}</h3>
              <p>${escapeHtml(character.name || member.type || "")}</p>
            </div>
            ${levelUpMarkup}
          </div>
          <div class="reward-line">
            <span>XP</span>
            <strong>+${member.xpGained}</strong>
          </div>
          <div class="reward-xp-track" role="img" aria-label="XP ${afterProgress.xpProgressLabel}">
            <div
              class="reward-xp-fill"
              data-after-width="${afterProgress.xpPercent}"
              data-level-up="${member.levelAfter > member.levelBefore ? "true" : "false"}"
              style="width:${beforeProgress.xpPercent}%"
            ></div>
          </div>
          <p class="reward-xp-label">${beforeProgress.xpProgressLabel} -> ${afterProgress.xpProgressLabel}</p>
          <div class="reward-line">
            <span>Gold</span>
            <strong>+${member.goldGained}</strong>
          </div>
          <p class="reward-gold">
            <span
              data-reward-count
              data-from="${member.goldBefore}"
              data-to="${member.goldAfter}"
            >${member.goldBefore}</span>
            Gold
          </p>
          ${deathPenaltyMarkup}
        </div>
      </div>
    `;
  }

  function renderLevelUpUpgradeMarkup(runState) {
    const choices = runState?.levelUpChoices?.choices || [];
    const pendingEntries = getLevelUpPendingEntries(runState);
    if (pendingEntries.length === 0) {
      return "";
    }

    const currentChoiceState = getCurrentLevelUpState(runState);
    const hasCurrentPendingChoice = currentChoiceState && !currentChoiceState.completed;
    if (!hasCurrentPendingChoice && appState.selectedLevelUpStatId) {
      appState.selectedLevelUpStatId = null;
    }
    const selectedStatId = appState.selectedLevelUpStatId;
    const canContinue = Boolean(hasCurrentPendingChoice && selectedStatId);
    const currentPlayerId = appState.player?.id;
    const pendingStatus = pendingEntries
      .map(([playerId, choiceState]) => {
        const member = runState.party?.find((entry) => entry.id === playerId);
        const label = choiceState.completed ? "Ready" : playerId === currentPlayerId ? "Choose your upgrade" : "Choosing...";
        return `<span class="reward-ready-chip ${choiceState.completed ? "is-ready" : ""}">${escapeHtml(member?.nickname || "Player")}: ${escapeHtml(label)}</span>`;
      })
      .join("");

    if (!currentChoiceState) {
      return `
        <div class="reward-level-up-panel">
          <h3>Level-Up Upgrades</h3>
          <p class="reward-level-up-copy">Waiting for leveled players to choose their stat upgrades.</p>
          <div class="reward-ready-row">${pendingStatus}</div>
        </div>
      `;
    }

    if (currentChoiceState.completed) {
      const selectedChoice = choices.find((choice) => choice.id === currentChoiceState.selectedStatId);
      return `
        <div class="reward-level-up-panel">
          <h3>Upgrade Locked In</h3>
          <p class="reward-level-up-copy">You chose ${escapeHtml(selectedChoice?.name || "an upgrade")}. Waiting for the party.</p>
          <div class="reward-ready-row">${pendingStatus}</div>
        </div>
      `;
    }

    return `
      <div class="reward-level-up-panel">
        <h3>Choose Your Level ${currentChoiceState.levelAfter} Upgrade</h3>
        <p class="reward-level-up-copy">Pick one stat upgrade, then continue to the next floor.</p>
        <div class="reward-upgrade-grid">
          ${choices
            .map(
              (choice) => `
                <button
                  class="reward-upgrade-card ${selectedStatId === choice.id ? "is-selected" : ""}"
                  type="button"
                  data-action="select-level-up-stat"
                  data-stat-id="${escapeHtml(choice.id)}"
                >
                  <strong>${escapeHtml(choice.name)}</strong>
                  <span>${escapeHtml(choice.description)}</span>
                </button>
              `,
            )
            .join("")}
        </div>
        <div class="reward-ready-row">${pendingStatus}</div>
        <div class="button-row reward-continue-row">
          <button class="primary-btn" data-action="submit-level-up-stat" ${canContinue ? "" : "disabled"}>Continue</button>
        </div>
      </div>
    `;
  }

  function renderRewardOverlayMarkup(summary, runState) {
    const members = Array.isArray(summary.members) ? summary.members : [];
    return `
      <div class="reward-panel">
        <div class="reward-panel-header">
          <p>Encounter Complete</p>
          <h2>${escapeHtml(summary.stageName || "Victory")}</h2>
          <span>+${summary.xpGained || 0} XP | +${summary.goldGained || 0} Gold</span>
        </div>
        <div class="reward-member-grid">
          ${members.map((member) => renderRewardMemberMarkup(member)).join("")}
        </div>
        ${renderLevelUpUpgradeMarkup(runState)}
      </div>
    `;
  }

  function animateRewardOverlay() {
    if (!rewardOverlayRoot) {
      return;
    }
    rewardOverlayRoot.querySelectorAll(".reward-xp-fill").forEach((fill) => {
      const afterWidth = Number(fill.dataset.afterWidth) || 0;
      window.requestAnimationFrame(() => {
        if (fill.dataset.levelUp === "true") {
          fill.style.width = "100%";
          window.setTimeout(() => {
            fill.style.transition = "none";
            fill.style.width = "0%";
            fill.getBoundingClientRect();
            fill.style.transition = "";
            window.requestAnimationFrame(() => {
              fill.style.width = `${afterWidth}%`;
            });
          }, 720);
          return;
        }
        fill.style.width = `${afterWidth}%`;
      });
    });

    const startTime = performance.now();
    const duration = 1100;
    const counters = Array.from(rewardOverlayRoot.querySelectorAll("[data-reward-count]")).map((node) => ({
      node,
      from: Number(node.dataset.from) || 0,
      to: Number(node.dataset.to) || 0,
    }));

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      counters.forEach(({ node, from, to }) => {
        node.textContent = String(Math.round(from + (to - from) * eased));
      });
      if (progress < 1 && rewardOverlayRoot.classList.contains("is-active")) {
        window.requestAnimationFrame(tick);
      }
    };
    window.requestAnimationFrame(tick);
  }

  function syncRewardOverlay(runState) {
    if (!rewardOverlayRoot) {
      return;
    }
    const summary = runState?.rewardSummary;
    const signature =
      summary && runState?.turn?.phase === "victory"
        ? `${runState.lobbyId}:${summary.stageIndex}:${summary.stageName}:${getLevelUpSignature(runState)}`
        : null;
    if (!signature) {
      hideRewardOverlay();
      return;
    }
    if (appState.rewardOverlaySignature === signature) {
      return;
    }

    appState.rewardOverlaySignature = signature;
    rewardOverlayRoot.innerHTML = renderRewardOverlayMarkup(summary, runState);
    rewardOverlayRoot.classList.add("is-active");
    playUiSfx("victory");
    bindUiActions();
    animateRewardOverlay();
  }

  function getActionInfo(action) {
    if (!action) return null;
    if (action.kind === "swing") return SWING_INFO[action.id] || null;
    if (action.kind === "spell") return SPELL_INFO[action.id] || null;
    if (action.kind === "item") return ITEM_INFO[action.id] || null;
    return null;
  }

  function getActiveCombatInfoSubject() {
    if (appState.combatInfoHover) {
      return appState.combatInfoHover;
    }
    if (appState.pendingCombatAction) {
      return { kind: "action", action: appState.pendingCombatAction };
    }
    if (appState.combatHoverEnemyId) {
      return { kind: "enemy", enemyId: appState.combatHoverEnemyId };
    }
    return null;
  }

  function renderTypeChipMarkup(typeLabel) {
    if (!typeLabel) return "";
    const iconPath = getTypeIconPath(typeLabel);
    const safeType = escapeHtml(typeLabel);
    if (!iconPath) {
      return `<span class="combat-info-chip">${safeType}</span>`;
    }
    return `<span class="combat-info-chip"><img class="type-chip-icon" src="${iconPath}" alt="${safeType}" style="width:12px;height:12px;vertical-align:-2px;margin-right:4px" />${safeType}</span>`;
  }

  function renderInfoBarMarkup(label, current, max, variant) {
    const percent = Math.max(0, Math.min(100, max > 0 ? (current / max) * 100 : 0));
    return `
      <div class="combat-info-bar"><div class="combat-info-bar-fill ${variant}" style="width:${percent}%"></div></div>
      <span class="combat-info-subtitle">${escapeHtml(label)} ${current}/${max}</span>
    `;
  }

  function renderRainbowLetters(label) {
    return String(label)
      .split("")
      .map((char, index) => {
        if (char === " ") {
          return " ";
        }
        return `<span class="rainbow-letter rainbow-letter-${index % 6}">${escapeHtml(char)}</span>`;
      })
      .join("");
  }

  function renderEffectivenessLabel(effectiveness) {
    if (effectiveness === "super") {
      return `<strong class="effectiveness-label is-super">${renderRainbowLetters("Super Effective")}</strong>`;
    }
    if (effectiveness === "barely") {
      return `<strong class="effectiveness-label is-barely">Barely Effective</strong>`;
    }
    return `<strong class="effectiveness-label">Neutral</strong>`;
  }

  function getEnemyIntendedTargetIds(enemy) {
    if (Array.isArray(enemy?.intendedTargetIds) && enemy.intendedTargetIds.length > 0) {
      return enemy.intendedTargetIds;
    }
    return [enemy?.intendedTargetId].filter(Boolean);
  }

  function getEnemyIntentActionLabel(enemy) {
    const action = enemy?.intendedAction;
    if (!action?.kind) {
      return "Attack";
    }
    if (action.kind === "spell") {
      return action.name ? `Spell: ${action.name}` : "Spell";
    }
    return action.name ? `Swing: ${action.name}` : "Swing";
  }

  function enemyIntentUsesTypedDamage(enemy) {
    const action = enemy?.intendedAction;
    return action?.kind === "spell" || (action?.kind === "swing" && action.id !== "basic");
  }

  function triggerLocalDamageFlash() {
    if (!gameShellRoot) {
      return;
    }
    let flash = document.getElementById("damage-flash-overlay");
    if (!flash) {
      flash = document.createElement("div");
      flash.id = "damage-flash-overlay";
      flash.className = "damage-flash-overlay";
      flash.setAttribute("aria-hidden", "true");
      gameShellRoot.appendChild(flash);
    }
    flash.classList.remove("is-active");
    void flash.offsetWidth;
    flash.classList.add("is-active");
    if (appState.damageFlashTimer) {
      clearTimeout(appState.damageFlashTimer);
    }
    appState.damageFlashTimer = setTimeout(() => {
      flash.classList.remove("is-active");
      appState.damageFlashTimer = null;
    }, 260);
  }

  function maybeFlashForLocalDamage(previousRunState, nextRunState) {
    const viewerId = nextRunState?.viewerId || appState.player?.id;
    if (!viewerId || previousRunState?.stageIndex !== nextRunState?.stageIndex) {
      return;
    }
    const previousMember = (previousRunState?.party || []).find((member) => member.id === viewerId);
    const nextMember = (nextRunState?.party || []).find((member) => member.id === viewerId);
    if (previousMember && nextMember && nextMember.hp < previousMember.hp) {
      triggerLocalDamageFlash();
    }
  }

  function renderEffectivenessLine(label, attackerType, defenderType) {
    if (!attackerType || !defenderType) {
      return "";
    }
    const effectiveness = getTypeEffectiveness(attackerType, defenderType);
    return `<span>${escapeHtml(label)} <strong>${escapeHtml(attackerType)}</strong> vs <strong>${escapeHtml(defenderType)}</strong>: ${renderEffectivenessLabel(effectiveness)}</span>`;
  }

  function renderYourAttackEffectivenessBanner(attackerType, defenderType) {
    if (!attackerType || !defenderType) {
      return "";
    }
    const effectiveness = getTypeEffectiveness(attackerType, defenderType);
    if (effectiveness === "neutral") {
      return "";
    }
    return `<p class="combat-info-effectiveness-banner">(Your attacks are ${renderEffectivenessLabel(effectiveness)})</p>`;
  }

  function renderEnemyIncomingEffectivenessMarkup(enemy, runState) {
    const targetIds = getEnemyIntendedTargetIds(enemy);
    if (!enemy?.type || targetIds.length === 0) {
      return "";
    }
    const rows = targetIds
      .map((targetId) => {
        const targetMember = (runState?.party || []).find((member) => member.id === targetId);
        if (!targetMember?.alive || !targetMember.type) {
          return "";
        }
        if (!enemyIntentUsesTypedDamage(enemy)) {
          return `<div class="combat-info-matchup-line"><span>${escapeHtml(`${enemy.name || "Enemy"} uses ${getEnemyIntentActionLabel(enemy)}`)}</span><strong>Physical</strong></div>`;
        }
        return renderEffectivenessLine(`${enemy.name || "Enemy"} uses ${getEnemyIntentActionLabel(enemy)}`, enemy.type, targetMember.type);
      })
      .filter(Boolean)
      .join("");
    return rows ? `<p class="combat-info-section-label">Incoming Type Matchup</p><div class="combat-info-matchups">${rows}</div>` : "";
  }

  function renderEnemyInfoMarkup(enemy, runState) {
    const statuses = getEnemyStatusList(enemy.effects).map((s) => `<span class="combat-info-chip">${escapeHtml(s.label)}</span>`).join("");
    const buffs = getCombatBuffList(enemy).map((buff) => `<span class="combat-info-chip">${escapeHtml(buff.label)}</span>`).join("");
    const attackTxt = typeof enemy.attackDamage === "number" ? enemy.attackDamage : "—";
    const swingDmg = formatStatMultiplier(enemy.swingDamage);
    const spellDmg = formatStatMultiplier(enemy.spellDamage);
    const swingDef = formatStatPercent(enemy.swingDefense);
    const spellDef = formatStatPercent(enemy.spellDefense);
    const currentMember = getCurrentMember();
    const outgoingEffectiveness = renderYourAttackEffectivenessBanner(currentMember?.type, enemy.type);
    const incomingEffectiveness = renderEnemyIncomingEffectivenessMarkup(enemy, runState);
    return `
      ${outgoingEffectiveness}
      <div class="combat-info-header">
        <h3 class="combat-info-title">${escapeHtml(enemy.name)}</h3>
      </div>
      <div class="combat-info-chiprow">${renderTypeChipMarkup(enemy.type)}</div>
      ${renderInfoBarMarkup("HP", enemy.hp, enemy.maxHp, "is-hp")}
      <div class="combat-info-stats">
        <span>Attack <strong>${attackTxt}</strong></span>
        <span>Swing Dmg <strong>${swingDmg}</strong></span>
        <span>Spell Dmg <strong>${spellDmg}</strong></span>
        <span>Swing Def <strong>${swingDef}</strong></span>
        <span>Spell Def <strong>${spellDef}</strong></span>
      </div>
      ${incomingEffectiveness}
      ${statuses ? `<p class="combat-info-section-label">Status</p><div class="combat-info-chiprow">${statuses}</div>` : ""}
      ${buffs ? `<p class="combat-info-section-label">Buffs</p><div class="combat-info-chiprow">${buffs}</div>` : ""}
    `;
  }

  function renderPlayerInfoMarkup(member, runState) {
    const charDef = getCharacterDefinition(getRunMemberCharacterRef(member, runState));
    const className = charDef?.name || "";
    const blessings = (member.blessings || [])
      .map((id) => BLESSING_INFO[id]?.name || id)
      .map((label) => `<span class="combat-info-chip">${escapeHtml(label)}</span>`)
      .join("");
    const spellChips = (member.knownSpells || [])
      .slice(0, 8)
      .map((id) => SPELL_INFO[id]?.name || id)
      .map((label) => `<span class="combat-info-chip">${escapeHtml(label)}</span>`)
      .join("");
    const buffs = getCombatBuffList(member).map((buff) => `<span class="combat-info-chip">${escapeHtml(buff.label)}</span>`).join("");
    const statuses = getEnemyStatusList(member.effects).map((status) => `<span class="combat-info-chip">${escapeHtml(status.label)}</span>`).join("");
    const incomingRows = (runState?.enemies || [])
      .filter((enemy) => enemy?.alive && (enemy.effects?.stunTurns || 0) <= 0 && (enemy.effects?.freezeChecks || 0) <= 0 && getEnemyIntendedTargetIds(enemy).includes(member.id))
      .map((enemy) => {
        if (!enemyIntentUsesTypedDamage(enemy)) {
          return `<div class="combat-info-matchup-line"><span>${escapeHtml(`${enemy.name || "Enemy"} uses ${getEnemyIntentActionLabel(enemy)}`)}</span><strong>Physical</strong></div>`;
        }
        return renderEffectivenessLine(`${enemy.name || "Enemy"} uses ${getEnemyIntentActionLabel(enemy)}`, enemy.type, member.type);
      })
      .filter(Boolean)
      .join("");
    return `
      <div class="combat-info-header">
        <h3 class="combat-info-title">${escapeHtml(member.nickname)}<span class="combat-info-subtitle">${escapeHtml(className)}</span></h3>
      </div>
      <div class="combat-info-chiprow">${renderTypeChipMarkup(member.type)}</div>
      ${renderInfoBarMarkup("HP", member.hp, member.maxHp, "is-hp")}
      <div class="combat-info-stats">
        <span>Energy <strong>${member.energy}</strong></span>
        <span>Mana <strong>${member.mana}</strong></span>
        <span>Level <strong>${member.level}</strong></span>
        <span>Gold <strong>${member.gold}</strong></span>
        <span>Swing Dmg <strong>${formatStatMultiplier(member.swingDamage)}</strong></span>
        <span>Spell Dmg <strong>${formatStatMultiplier(member.spellDamage)}</strong></span>
        <span>Swing Def <strong>${formatStatPercent(member.swingDefense)}</strong></span>
        <span>Spell Def <strong>${formatStatPercent(member.spellDefense)}</strong></span>
        <span>Energy Regen <strong>+${member.energyRegen ?? 2}/turn</strong></span>
        <span>Mana Regen <strong>+${member.manaRegen ?? 1}/turn</strong></span>
      </div>
      ${incomingRows ? `<p class="combat-info-section-label">Incoming Type Matchup</p><div class="combat-info-matchups">${incomingRows}</div>` : ""}
      ${statuses ? `<p class="combat-info-section-label">Status</p><div class="combat-info-chiprow">${statuses}</div>` : ""}
      ${blessings ? `<p class="combat-info-section-label">Relics</p><div class="combat-info-chiprow">${blessings}</div>` : ""}
      ${spellChips ? `<p class="combat-info-section-label">Spells</p><div class="combat-info-chiprow">${spellChips}</div>` : ""}
      ${buffs ? `<p class="combat-info-section-label">Buffs</p><div class="combat-info-chiprow">${buffs}</div>` : ""}
    `;
  }

  function renderActionInfoMarkup(action) {
    const info = getActionInfo(action);
    if (!info) {
      return `<p class="combat-info-empty">No info available.</p>`;
    }
    if (action.kind === "swing") {
      return `
        <div class="combat-info-header">
          <h3 class="combat-info-title">${escapeHtml(info.name)}<span class="combat-info-subtitle">Swing — ${info.target === "all" ? "All enemies" : "Single target"}</span></h3>
        </div>
        <div class="combat-info-stats">
          <span>Mana <strong>${info.manaCost}</strong></span>
        </div>
        <p class="combat-info-desc">${escapeHtml(info.description)}</p>
      `;
    }
    if (action.kind === "spell") {
      return `
        <div class="combat-info-header">
          <h3 class="combat-info-title">${escapeHtml(info.name)}<span class="combat-info-subtitle">Spell — ${info.target === "all" ? "All enemies" : "Single target"}</span></h3>
        </div>
        <div class="combat-info-chiprow">${renderTypeChipMarkup(info.type)}</div>
        <div class="combat-info-stats">
          <span>Energy <strong>${info.energyCost}</strong></span>
          <span>Mana <strong>${info.manaCost}</strong></span>
          <span>Req Lvl <strong>${info.levelRequired}</strong></span>
        </div>
        <p class="combat-info-desc">${escapeHtml(info.description)}</p>
      `;
    }
    if (action.kind === "item") {
      return `
        <div class="combat-info-header">
          <h3 class="combat-info-title">${escapeHtml(info.name)}<span class="combat-info-subtitle">Item</span></h3>
        </div>
        <div class="combat-info-stats">
          <span>Energy <strong>${info.energyCost}</strong></span>
        </div>
        <p class="combat-info-desc">${escapeHtml(info.description)}</p>
      `;
    }
    return "";
  }

  function renderCombatInfo(runState) {
    if (!combatInfoRoot) return;
    if (!runState || runState.stageType !== "combat") {
      setCombatInfo("");
      return;
    }
    const visualRunState = getVisualRunState(runState);
    const subject = getActiveCombatInfoSubject();
    if (!subject) {
      setCombatInfo(`<p class="combat-info-empty">Hover an ally, an enemy, a swing, or a spell to inspect it.</p>`);
      return;
    }
    if (subject.kind === "enemy") {
      const enemy = (visualRunState.enemies || []).find((e) => e.id === subject.enemyId);
      if (!enemy) {
        setCombatInfo(`<p class="combat-info-empty">Target lost.</p>`);
        return;
      }
      setCombatInfo(renderEnemyInfoMarkup(enemy, visualRunState));
      return;
    }
    if (subject.kind === "player") {
      const member = (visualRunState.party || []).find((m) => m.id === subject.memberId);
      if (!member) {
        setCombatInfo(`<p class="combat-info-empty">Ally not found.</p>`);
        return;
      }
      setCombatInfo(renderPlayerInfoMarkup(member, visualRunState));
      return;
    }
    if (subject.kind === "action") {
      setCombatInfo(renderActionInfoMarkup(subject.action));
      return;
    }
    setCombatInfo("");
  }

  function refreshCombatInfo() {
    renderCombatInfo(appState.runState);
  }

  function getXpProgressForLevel(xp, level) {
    const levelIndex = Math.max(0, Math.min(LEVEL_THRESHOLDS.length - 1, (level || 1) - 1));
    const levelFloorXp = LEVEL_THRESHOLDS[levelIndex] || 0;
    const nextLevelXp = LEVEL_THRESHOLDS[levelIndex + 1] || null;
    const levelProgressCurrent = Math.max(0, (xp || 0) - levelFloorXp);
    const levelProgressNeeded = nextLevelXp ? Math.max(1, nextLevelXp - levelFloorXp) : 1;
    const xpPercent = nextLevelXp ? Math.max(0, Math.min(100, (levelProgressCurrent / levelProgressNeeded) * 100)) : 100;
    const xpProgressLabel = nextLevelXp ? `${levelProgressCurrent}/${levelProgressNeeded}` : "MAX";
    return { xpPercent, xpProgressLabel };
  }

  function getMemberProgress(member) {
    return getXpProgressForLevel(member?.xp || 0, member?.level || 1);
  }

  function getRewardXpProgress(rewardMember, useAfter = false) {
    return getXpProgressForLevel(
      useAfter ? rewardMember.xpAfter : rewardMember.xpBefore,
      useAfter ? rewardMember.levelAfter : rewardMember.levelBefore,
    );
  }

  function renderSelfStatsMarkup(member) {
    const { xpPercent, xpProgressLabel } = getMemberProgress(member);
    return `
      <div class="party-hud-self-stats">
        <div class="party-hud-self-row">
          <span class="top-hud-chip">Gold ${member.gold}</span>
          <span class="top-hud-chip">Level ${member.level}</span>
        </div>
        <div class="top-hud-xp-wrap" role="img" aria-label="XP ${xpProgressLabel}">
          <div class="top-hud-xp-fill" style="width:${xpPercent}%"></div>
        </div>
        <p class="top-hud-xp-label">XP ${xpProgressLabel}</p>
      </div>
    `;
  }

  function getMemberBlessingIds(member, character) {
    const blessingIds = [...(member?.blessings || [])];
    const hasRecordedIronSkin = blessingIds.includes("iron_skin");
    const baseMaxHp = Number(character?.maxHp) || 0;
    if (!hasRecordedIronSkin && baseMaxHp > 0 && (member?.maxHp || 0) >= baseMaxHp + 20) {
      blessingIds.unshift("iron_skin");
    }
    return blessingIds;
  }

  function renderPartyHudRelicsMarkup(member, character) {
    const relics = getMemberBlessingIds(member, character)
      .map((blessingId) => getBlessingRelicInfo(blessingId))
      .filter((relic) => relic?.id);
    if (!relics.length) {
      return "";
    }
    const relicIcons = relics
      .map((relic) => {
        const name = relic.name || "Relic";
        const description = relic.description || "A mysterious shrine relic.";
        const tooltip = `${name}: ${description}`;
        return `
          <span class="party-hud-relic-slot" tabindex="0" aria-label="${escapeHtml(tooltip)}" data-tooltip="${escapeHtml(tooltip)}">
            <img class="party-hud-relic-icon" src="${escapeHtml(relic.image)}" alt="" aria-hidden="true" />
          </span>
        `;
      })
      .join("");
    return `<div class="party-hud-relic-grid" aria-label="Relics">${relicIcons}</div>`;
  }

  function renderPartyHudCardMarkup(member, runState, currentMember) {
    const charRef = getRunMemberCharacterRef(member, runState);
    const character = getCharacterDefinition(charRef);
    const iconPath = getCharacterIconPath(character);
    const hpPercent = Math.max(0, Math.min(100, getHealthRatio(member.hp, member.maxHp) * 100));
    const drownedPercent = Math.max(0, Math.min(100, getHealthRatio(member.effects?.drownedValue || 0, member.maxHp) * 100));
    const drownedWidthPercent = Math.min(hpPercent, drownedPercent);
    const drownedLeftPercent = Math.max(0, hpPercent - drownedWidthPercent);
    const isSelf = currentMember && member.id === currentMember.id;
    const isDown = !member.alive;
    const cardClass = [
      "party-hud-card",
      isSelf ? "is-self" : "",
      isDown ? "is-down" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const iconMarkup = iconPath
      ? `<img class="party-hud-icon" src="${iconPath}" alt="${escapeHtml(character.name)} icon" />`
      : `<div class="party-hud-icon party-hud-icon-fallback">${escapeHtml((character.name || "?").slice(0, 1))}</div>`;
    const selfStatsMarkup = isSelf ? renderSelfStatsMarkup(member) : "";
    const relicGridMarkup = isSelf ? renderPartyHudRelicsMarkup(member, character) : "";
    const cardMarkup = `
      <div class="${cardClass}" data-member-id="${escapeHtml(member.id)}">
        ${iconMarkup}
        <div class="party-hud-info">
          <div class="party-hud-name-row">
            <span class="party-hud-nickname">${escapeHtml(member.nickname || "")}</span>
            <span class="party-hud-classname">${escapeHtml(character.name || "")}</span>
          </div>
          <div class="party-hud-hp-bar" role="img" aria-label="HP ${member.hp}/${member.maxHp}">
            <div class="party-hud-hp-fill" style="width:${hpPercent}%"></div>
            ${drownedWidthPercent > 0 ? `<div class="party-hud-hp-drowned" style="left:${drownedLeftPercent}%; width:${drownedWidthPercent}%"></div>` : ""}
          </div>
          <p class="party-hud-hp-text">HP ${member.hp}/${member.maxHp}</p>
          ${selfStatsMarkup}
        </div>
      </div>
    `;
    if (isSelf && relicGridMarkup) {
      return `<div class="party-hud-self-layout">${cardMarkup}${relicGridMarkup}</div>`;
    }
    return cardMarkup;
  }

  function renderPartyHudListMarkup(runState, currentMember) {
    if (!runState || !["combat", "shop"].includes(runState.stageType) || !Array.isArray(runState.party) || runState.party.length === 0) {
      return "";
    }
    const selfId = currentMember?.id || null;
    const visualRunState = getVisualRunState(runState);
    const visualCurrentMember = currentMember ? getVisualPartyMember(currentMember) : currentMember;
    const ordered = [...visualRunState.party].sort((a, b) => {
      if (a.id === selfId) return -1;
      if (b.id === selfId) return 1;
      return 0;
    });
    const cards = ordered.map((member) => renderPartyHudCardMarkup(member, visualRunState, visualCurrentMember)).join("");
    return `<div class="party-hud-list">${cards}</div>`;
  }

  function renderStatsBlockMarkup(currentMember) {
    const { xpPercent, xpProgressLabel } = getMemberProgress(currentMember);
    return `
      <div class="top-hud-stats">
        <div class="top-hud-row">
          <span class="top-hud-chip">Gold ${currentMember.gold}</span>
          <span class="top-hud-chip">Level ${currentMember.level}</span>
        </div>
        <div class="top-hud-xp-wrap" role="img" aria-label="XP ${xpProgressLabel}">
          <div class="top-hud-xp-fill" style="width:${xpPercent}%"></div>
        </div>
        <p class="top-hud-xp-label">XP ${xpProgressLabel}</p>
        <div class="top-hud-item-slot" aria-label="Item slot placeholder"></div>
      </div>
    `;
  }

  function renderTopHudMarkup(currentMember, runState) {
    if (!currentMember) {
      return "";
    }
    if (["combat", "shop"].includes(runState?.stageType)) {
      // In combat and shop stages the top-left box is the local player's party-hud
      // card, followed by the rest of the party beneath it.
      return renderPartyHudListMarkup(runState, currentMember);
    }
    return renderStatsBlockMarkup(currentMember);
  }

  function showToast(message, type, durationMs) {
    const node = document.createElement("div");
    node.className = `toast-card ${type || "info"}`;
    node.textContent = message;
    toastRoot.appendChild(node);
    const ms = typeof durationMs === "number" ? durationMs : 3400;
    setTimeout(() => {
      node.remove();
    }, ms);
  }

  function maybeShowEnhancedBgStartupHint() {
    if (enhancedBgStartupHintShown || readEnhancedBgAnimationsEnabled()) {
      return;
    }
    enhancedBgStartupHintShown = true;
    setTimeout(() => {
      showToast("Go to Settings to enable Enhanced Background Animations", "info", 5200);
    }, 450);
  }

  // Custom in-app prompt modal that replaces window.prompt with a styled
  // window. Returns a Promise that resolves to an object keyed by field name
  // when the user confirms, or null when they cancel.
  function showPromptModal(options) {
    if (!modalRoot) {
      return Promise.resolve(null);
    }

    const {
      title = "",
      subtitle = "",
      fields = [],
      confirmLabel = "Confirm",
      cancelLabel = "Cancel",
    } = options || {};

    return new Promise((resolve) => {
      const fieldsHtml = fields
        .map((field) => {
          const inputId = `modal-field-${field.name}`;
          const type = field.type || "text";
          const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
          const value = field.defaultValue != null ? escapeHtml(String(field.defaultValue)) : "";
          const labelMarkup = field.label
            ? `<label for="${inputId}">${escapeHtml(field.label)}</label>`
            : "";
          return `
            <div class="modal-field">
              ${labelMarkup}
              <input id="${inputId}" name="${escapeHtml(field.name)}" type="${escapeHtml(type)}" value="${value}"${placeholder} autocomplete="off" />
            </div>
          `;
        })
        .join("");

      modalRoot.innerHTML = `
        <form class="modal-card" data-modal-form>
          ${title ? `<h2 class="modal-title">${escapeHtml(title)}</h2>` : ""}
          ${subtitle ? `<p class="modal-subtitle">${escapeHtml(subtitle)}</p>` : ""}
          ${fieldsHtml}
          <div class="modal-actions">
            <button type="button" class="ghost-btn" data-modal-cancel>${escapeHtml(cancelLabel)}</button>
            <button type="submit" class="primary-btn" data-modal-confirm>${escapeHtml(confirmLabel)}</button>
          </div>
        </form>
      `;

      modalRoot.classList.add("is-open");
      modalRoot.setAttribute("aria-hidden", "false");

      const form = modalRoot.querySelector("[data-modal-form]");
      const firstInput = form?.querySelector("input");
      if (firstInput) {
        setTimeout(() => {
          firstInput.focus();
          firstInput.select?.();
        }, 30);
      }

      const cleanup = () => {
        modalRoot.classList.remove("is-open");
        modalRoot.setAttribute("aria-hidden", "true");
        modalRoot.innerHTML = "";
        document.removeEventListener("keydown", onKeyDown);
        modalRoot.removeEventListener("mousedown", onBackdrop);
      };

      const finish = (result) => {
        cleanup();
        resolve(result);
      };

      const collectValues = () => {
        const result = {};
        fields.forEach((field) => {
          const input = form.querySelector(`input[name="${field.name}"]`);
          result[field.name] = input ? input.value : "";
        });
        return result;
      };

      const onSubmit = (event) => {
        event.preventDefault();
        finish(collectValues());
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        }
      };

      const onBackdrop = (event) => {
        if (event.target === modalRoot) {
          finish(null);
        }
      };

      form.addEventListener("submit", onSubmit);
      form.querySelector("[data-modal-cancel]").addEventListener("click", () => finish(null));
      document.addEventListener("keydown", onKeyDown);
      modalRoot.addEventListener("mousedown", onBackdrop);
    });
  }

  function emit(eventName, payload) {
    if (appState.socket) {
      appState.socket.emit(eventName, payload);
    }
  }

  function getCurrentMember() {
    if (!appState.runState || !appState.player) {
      return null;
    }
    return appState.runState.party.find((member) => member.id === appState.player.id) || null;
  }

  function getVisualPartyHp(member) {
    if (!member?.id || !Object.prototype.hasOwnProperty.call(appState.visualPartyHpById, member.id)) {
      return member?.hp;
    }
    return Math.max(0, Math.min(member.maxHp || 0, appState.visualPartyHpById[member.id]));
  }

  function getVisualPartyMember(member) {
    if (!member) {
      return member;
    }
    const hp = getVisualPartyHp(member);
    if (hp === member.hp) {
      return member;
    }
    return {
      ...member,
      hp,
      alive: hp > 0,
    };
  }

  function getVisualParty(runState) {
    return (runState?.party || []).map((member) => getVisualPartyMember(member));
  }

  function getVisualRunState(runState) {
    if (!runState?.party) {
      return runState;
    }
    return {
      ...runState,
      party: getVisualParty(runState),
    };
  }

  function getPendingEnemyAttackEvents(runState) {
    return (runState?.combatFeedbackEvents || []).filter((event) => event?.id && event.type === "enemy_attack");
  }

  function prepareVisualEnemyAttackHp(previousRunState, nextRunState) {
    const previousEventIds = new Set((previousRunState?.combatFeedbackEvents || []).map((event) => event?.id).filter(Boolean));
    const attackEvents = getPendingEnemyAttackEvents(nextRunState).filter((event) => !previousEventIds.has(event.id) && !appState.visualPartyHpEventIds.has(event.id));
    const hasDamage = attackEvents.some((event) => (event.targets || []).some((target) => (Number(target?.amount) || 0) > 0));
    if (nextRunState?.turn?.phase !== "enemy" || !hasDamage) {
      appState.visualPartyHpById = {};
      appState.visualPartyHpEventIds = new Set();
      return;
    }

    const previousMembers = new Map((previousRunState?.party || []).map((member) => [member.id, member]));
    const nextMembers = new Map((nextRunState?.party || []).map((member) => [member.id, member]));
    const nextVisualHpById = {};
    const pendingDamageById = {};

    attackEvents.forEach((event) => {
      (event.targets || []).forEach((target) => {
        const targetId = target?.targetId;
        const member = nextMembers.get(targetId);
        if (!member) {
          return;
        }
        pendingDamageById[targetId] = (pendingDamageById[targetId] || 0) + Math.max(0, Number(target.amount) || 0);
        const previousHp = previousMembers.get(targetId)?.hp;
        nextVisualHpById[targetId] = Number.isFinite(previousHp) ? previousHp : member.hp + pendingDamageById[targetId];
      });
    });

    appState.visualPartyHpById = nextVisualHpById;
    appState.visualPartyHpEventIds = new Set(attackEvents.map((event) => event.id));
  }

  function applyVisualEnemyAttackDamage(event) {
    if (!event?.id || !appState.visualPartyHpEventIds.has(event.id)) {
      return false;
    }

    let changed = false;
    (event.targets || []).forEach((target) => {
      const targetId = target?.targetId;
      const amount = Math.max(0, Number(target?.amount) || 0);
      if (!targetId || amount <= 0 || !Object.prototype.hasOwnProperty.call(appState.visualPartyHpById, targetId)) {
        return;
      }
      appState.visualPartyHpById[targetId] = Math.max(0, appState.visualPartyHpById[targetId] - amount);
      changed = true;
    });
    appState.visualPartyHpEventIds.delete(event.id);

    if (appState.visualPartyHpEventIds.size === 0) {
      const finalHpById = new Map((appState.runState?.party || []).map((member) => [member.id, member.hp]));
      Object.keys(appState.visualPartyHpById).forEach((memberId) => {
        const finalHp = finalHpById.get(memberId);
        if (typeof finalHp === "number") {
          appState.visualPartyHpById[memberId] = finalHp;
        }
      });
    }

    return changed;
  }

  function getRunMemberCharacterRef(member, runState) {
    // Trust server run-party data first so each client renders the same roster.
    // Falling back to local session state can desync visuals if session state is stale.
    return member?.characterId || member?.artKey || appState.player?.characterId || "flamewitch";
  }

  function getTurnBannerAsset(turn) {
    if (!turn) {
      return null;
    }
    if (turn.phase === "enemy") {
      return {
        src: "/Assets/UI/enemy_turn.png",
        alt: "Enemy turn",
      };
    }
    if (turn.phase === "player") {
      return {
        src: "/Assets/UI/your_turn.png",
        alt: "Your turn",
      };
    }
    return null;
  }

  function getCountdownSeconds() {
    const turn = appState.runState?.turn;
    if (!turn?.turnEndsAt) {
      return null;
    }
    return Math.max(0, Math.ceil((turn.turnEndsAt - Date.now()) / 1000));
  }

  const AOE_SPELL_IDS = new Set([
    "flame_burst",
    "noxious_cloud",
    "tidal_surge",
    "sand_blast",
    "feather_storm",
    "nightfall",
    "radiant_wave",
    "blizzard",
    "inferno",
    "tsunami",
    "earthquake",
    "tempest",
    "abyssal_storm",
    "heavenly_wrath",
    "absolute_zero",
    "chain_lightning",
    "storm_symphony",
  ]);

  function actionIsAoe(action) {
    if (!action) {
      return false;
    }
    return action.kind === "spell" && AOE_SPELL_IDS.has(action.id);
  }

  function actionIsClericLightSpell(action) {
    if (!action || action.kind !== "spell") {
      return false;
    }
    const currentMember = getCurrentMember();
    const spellInfo = SPELL_INFO[action.id];
    return currentMember?.characterId === "thecleric" && spellInfo?.type === "Light";
  }

  function actionNeedsTarget(action) {
    if (!action) {
      return false;
    }
    if (action.kind === "swing") {
      return true;
    }
    if (action.kind === "spell") {
      return !AOE_SPELL_IDS.has(action.id);
    }
    return false;
  }

  function actionHasAttackTarget(action) {
    return actionNeedsTarget(action) || actionIsAoe(action);
  }

  function canAffordCosts(member, energyCost, manaCost) {
    if (!member) {
      return false;
    }
    const e = Number(energyCost) || 0;
    const m = Number(manaCost) || 0;
    return (member.energy || 0) >= e && (member.mana || 0) >= m;
  }

  function countActionCopies(actionIds, actionId) {
    return Array.isArray(actionIds) ? actionIds.filter((id) => id === actionId).length : 0;
  }

  function getGroupedActionIds(actionIds) {
    const seen = new Set();
    return (Array.isArray(actionIds) ? actionIds : [])
      .filter((id) => {
        if (seen.has(id)) {
          return false;
        }
        seen.add(id);
        return true;
      })
      .map((id) => ({
        id,
        count: countActionCopies(actionIds, id),
      }));
  }

  function getTurnUsedActionCount(runState, memberId, kind, actionId) {
    return Number(runState?.turn?.usedActionCountsByPlayerId?.[memberId]?.[kind]?.[actionId]) || 0;
  }

  function renderCombatActionCostMarkup(action) {
    const energyCost = Number(action?.energyCost) || 0;
    const manaCost = Number(action?.manaCost) || 0;
    const costs = [
      energyCost > 0
        ? { label: "Energy", value: energyCost, icon: "/Assets/UI/EnergyOrb.png", className: "is-energy" }
        : null,
      manaCost > 0
        ? { label: "Mana", value: manaCost, icon: "/Assets/UI/ManaOrb.png", className: "is-mana" }
        : null,
    ].filter(Boolean);

    if (!costs.length) {
      return `<span class="combat-action-cost is-free">Free</span>`;
    }

    return costs
      .map(
        (cost) => `
          <span class="combat-action-cost ${cost.className}" aria-label="${cost.value} ${cost.label}">
            <img class="combat-action-cost-icon" src="${cost.icon}" alt="" aria-hidden="true" />
            <span class="combat-action-cost-value">${cost.value}</span>
          </span>
        `,
      )
      .join("");
  }

  function renderCombatActionCardMarkup({
    kind,
    id,
    name,
    energyCost = 0,
    manaCost = 0,
    type = "",
    target = "",
    selected = false,
    unaffordable = false,
    disabled = false,
    title = "",
    copyCount = 1,
    remainingUses = 1,
    stackLabel = "",
  }) {
    const hasStack = stackLabel || remainingUses > 1;
    const cardClasses = [
      "action-btn",
      "combat-action-card",
      `is-${kind}-card`,
      hasStack ? "has-card-stack" : "",
      selected ? "is-selected" : "",
      unaffordable ? "is-unaffordable" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const targetLabel = target === "all" ? "Multi Target" : target === "single" ? "Single Target" : "";
    const metaLabel = [type, targetLabel].filter(Boolean).join(" | ");

    return `
      <button class="${cardClasses}" data-action="queue-combat-action" data-kind="${escapeHtml(kind)}" data-id="${escapeHtml(id)}" data-copy-count="${copyCount}" ${disabled ? "disabled" : ""} title="${escapeHtml(title)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="combat-action-cost-row">${renderCombatActionCostMarkup({ energyCost, manaCost })}</span>
        <span class="combat-action-name">${escapeHtml(name)}</span>
        ${metaLabel ? `<span class="combat-action-meta">${escapeHtml(metaLabel)}</span>` : ""}
        ${hasStack ? `<span class="combat-action-stack-badge">${escapeHtml(stackLabel || `${Math.max(0, remainingUses)}/${copyCount}`)}</span>` : ""}
      </button>
    `;
  }

  function clearPendingCombatAction() {
    appState.pendingCombatAction = null;
    appState.combatHoverEnemyId = null;
    appState.combatHoverEnemyName = null;
    appState.combatHoverAllyId = null;
    if (appState.combatInfoHover?.kind === "action") {
      appState.combatInfoHover = null;
    }
    updateRunSceneHighlights();
    renderUi();
    updateTargetingArrow();
  }

  function getActionLabel(action) {
    if (!action) {
      return "";
    }
    if (action.kind === "swing") {
      return {
        basic: "Basic Swing",
        charged: "Charged Swing",
        power: "Power Swing",
      }[action.id] || "Swing";
    }
    if (action.kind === "spell") {
      return {
        ember_shot: "Ember Shot",
        flame_burst: "Flame Burst",
        toxic_bolt: "Toxic Bolt",
        noxious_cloud: "Noxious Cloud",
        ignite: "Ignite",
        inferno: "Inferno",
        meteor: "Meteor",
        water_jet: "Water Jet",
        tidal_surge: "Tidal Surge",
        whirlpool: "Whirlpool",
        tsunami: "Tsunami",
        stone_spike: "Stone Spike",
        sand_blast: "Sand Blast",
        quicksand: "Quicksand",
        earthquake: "Earthquake",
        gust_slash: "Gust Slash",
        feather_storm: "Feather Storm",
        updraft: "Updraft",
        tempest: "Tempest",
        shadow_bolt: "Shadow Bolt",
        nightfall: "Nightfall",
        void_bind: "Void Bind",
        abyssal_storm: "Abyssal Storm",
        holy_spark: "Holy Spark",
        radiant_wave: "Radiant Wave",
        smite: "Smite",
        heavenly_wrath: "Heavenly Wrath",
        frost_bolt: "Frost Bolt",
        blizzard: "Blizzard",
        ice_prison: "Ice Prison",
        absolute_zero: "Absolute Zero",
        electric_jolt: "Electric Jolt",
        chain_lightning: "Chain Lightning",
        thunder_crash: "Thunder Crash",
        storm_symphony: "Storm Symphony",
      }[action.id] || "Spell";
    }
    if (action.kind === "item") {
      return action.id.replaceAll("_", " ");
    }
    return action.id || action.kind;
  }

  function getSceneInstance(sceneKey) {
    if (!appState.game) {
      return null;
    }
    const sceneName = SCENE_MAP[sceneKey];
    if (!sceneName) {
      return null;
    }
    return appState.game.scene.getScene(sceneName);
  }

  const SCENE_FADE_IN_MS = 340;
  const SCENE_FADE_OUT_MS = 240;

  function playSceneFadeIn(scene, duration = SCENE_FADE_IN_MS) {
    const camera = scene?.cameras?.main;
    if (!camera) {
      return;
    }
    if (typeof camera.resetFX === "function") {
      camera.resetFX();
    }
    camera.fadeIn(duration, 0, 0, 0);
  }

  function playSceneFadeOut(scene, duration = SCENE_FADE_OUT_MS, onComplete) {
    const camera = scene?.cameras?.main;
    if (!camera) {
      if (typeof onComplete === "function") {
        onComplete();
      }
      return;
    }
    if (typeof camera.resetFX === "function") {
      camera.resetFX();
    }
    if (typeof onComplete === "function") {
      camera.once("camerafadeoutcomplete", onComplete);
    }
    camera.fadeOut(duration, 0, 0, 0);
  }

  function canCurrentPlayerAct() {
    const currentMember = getCurrentMember();
    const turn = appState.runState?.turn;
    if (!currentMember || !turn || turn.phase !== "player" || !currentMember.alive) {
      return false;
    }
    return !(turn.actedPlayerIds || []).includes(appState.player?.id);
  }

  function canCurrentPlayerCancelEndTurn() {
    const currentMember = getCurrentMember();
    const turn = appState.runState?.turn;
    if (!currentMember || !turn || turn.phase !== "player" || !currentMember.alive || isCombatantFrozen(currentMember)) {
      return false;
    }
    return appState.pendingEndTurn || (turn.actedPlayerIds || []).includes(appState.player?.id);
  }

  function canTargetEnemy() {
    return Boolean(
      appState.sceneKey === "run" &&
        canCurrentPlayerAct() &&
        !isCombatantFrozen(getCurrentMember()) &&
        appState.pendingCombatAction &&
        actionHasAttackTarget(appState.pendingCombatAction),
    );
  }

  function canTargetAlly() {
    return Boolean(
      appState.sceneKey === "run" &&
      canCurrentPlayerAct() &&
      !isCombatantFrozen(getCurrentMember()) &&
      appState.pendingCombatAction &&
      actionIsClericLightSpell(appState.pendingCombatAction),
    );
  }

  function getPendingTargetEffectiveness(enemyId) {
    const pending = appState.pendingCombatAction;
    const attackerType = getCurrentMember()?.type || null;
    const enemy = (appState.runState?.enemies || []).find((entry) => entry.id === enemyId);
    if (!pending || !actionUsesTypedDamage(pending) || !attackerType || !enemy?.type) {
      return "neutral";
    }
    return getTypeEffectiveness(attackerType, enemy.type);
  }

  function getTargetingEffectivenessClass(effectiveness) {
    if (effectiveness === "super") {
      return " is-super-effective";
    }
    if (effectiveness === "barely") {
      return " is-barely-effective";
    }
    return "";
  }

  function updateRunSceneHighlights() {
    const scene = getSceneInstance("run");
    if (scene && scene.scene.isActive() && typeof scene.updateEnemyHighlights === "function") {
      scene.updateEnemyHighlights();
    }
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  function initTargetingArrow() {
    const overlay = document.getElementById("targeting-arrow-overlay");
    const shell = document.querySelector(".game-shell");
    if (!overlay || !shell) {
      return;
    }

    overlay.innerHTML = "";
    const defs = document.createElementNS(SVG_NS, "defs");
    const rainbowGradient = document.createElementNS(SVG_NS, "linearGradient");
    rainbowGradient.setAttribute("id", "targeting-arrow-rainbow-gradient");
    rainbowGradient.setAttribute("x1", "0%");
    rainbowGradient.setAttribute("y1", "0%");
    rainbowGradient.setAttribute("x2", "100%");
    rainbowGradient.setAttribute("y2", "0%");
    [
      ["0%", "#ff3b3b"],
      ["18%", "#ff9f1c"],
      ["34%", "#ffe66d"],
      ["50%", "#33d17a"],
      ["66%", "#2ec4ff"],
      ["82%", "#8f5cff"],
      ["100%", "#ff5fd2"],
    ].forEach(([offset, color]) => {
      const stop = document.createElementNS(SVG_NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      rainbowGradient.appendChild(stop);
    });
    defs.appendChild(rainbowGradient);

    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", "targeting-arrow-head");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const markerPath = document.createElementNS(SVG_NS, "path");
    markerPath.setAttribute("d", "M0,0 L10,5 L0,10 Z");
    markerPath.setAttribute("fill", "#ffffff");
    markerPath.setAttribute("filter", "drop-shadow(0 0 3px rgba(255,255,255,0.6))");
    marker.appendChild(markerPath);
    defs.appendChild(marker);

    const rainbowMarker = document.createElementNS(SVG_NS, "marker");
    rainbowMarker.setAttribute("id", "targeting-arrow-rainbow-head");
    rainbowMarker.setAttribute("viewBox", "0 0 10 10");
    rainbowMarker.setAttribute("refX", "8");
    rainbowMarker.setAttribute("refY", "5");
    rainbowMarker.setAttribute("markerWidth", "6");
    rainbowMarker.setAttribute("markerHeight", "6");
    rainbowMarker.setAttribute("orient", "auto-start-reverse");
    const rainbowMarkerPath = document.createElementNS(SVG_NS, "path");
    rainbowMarkerPath.setAttribute("d", "M0,0 L10,5 L0,10 Z");
    rainbowMarkerPath.setAttribute("fill", "url(#targeting-arrow-rainbow-gradient)");
    rainbowMarkerPath.setAttribute("filter", "drop-shadow(0 0 4px rgba(255,255,255,0.8))");
    rainbowMarker.appendChild(rainbowMarkerPath);
    defs.appendChild(rainbowMarker);

    const barelyMarker = document.createElementNS(SVG_NS, "marker");
    barelyMarker.setAttribute("id", "targeting-arrow-barely-head");
    barelyMarker.setAttribute("viewBox", "0 0 10 10");
    barelyMarker.setAttribute("refX", "8");
    barelyMarker.setAttribute("refY", "5");
    barelyMarker.setAttribute("markerWidth", "6");
    barelyMarker.setAttribute("markerHeight", "6");
    barelyMarker.setAttribute("orient", "auto-start-reverse");
    const barelyMarkerPath = document.createElementNS(SVG_NS, "path");
    barelyMarkerPath.setAttribute("d", "M0,0 L10,5 L0,10 Z");
    barelyMarkerPath.setAttribute("fill", "#ffd84d");
    barelyMarkerPath.setAttribute("filter", "drop-shadow(0 0 4px rgba(255,216,77,0.9))");
    barelyMarker.appendChild(barelyMarkerPath);
    defs.appendChild(barelyMarker);

    const allyMarker = document.createElementNS(SVG_NS, "marker");
    allyMarker.setAttribute("id", "targeting-arrow-ally-head");
    allyMarker.setAttribute("viewBox", "0 0 10 10");
    allyMarker.setAttribute("refX", "8");
    allyMarker.setAttribute("refY", "5");
    allyMarker.setAttribute("markerWidth", "6");
    allyMarker.setAttribute("markerHeight", "6");
    allyMarker.setAttribute("orient", "auto-start-reverse");
    const allyMarkerPath = document.createElementNS(SVG_NS, "path");
    allyMarkerPath.setAttribute("d", "M0,0 L10,5 L0,10 Z");
    allyMarkerPath.setAttribute("fill", "#33d17a");
    allyMarkerPath.setAttribute("filter", "drop-shadow(0 0 4px rgba(51,209,122,0.9))");
    allyMarker.appendChild(allyMarkerPath);
    defs.appendChild(allyMarker);

    overlay.appendChild(defs);

    const linesGroup = document.createElementNS(SVG_NS, "g");
    linesGroup.setAttribute("id", "targeting-arrow-lines");
    overlay.appendChild(linesGroup);

    shell.addEventListener("mousemove", (event) => {
      const rect = shell.getBoundingClientRect();
      appState.targetingArrowCursor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      updateTargetingArrow();
    });

    window.addEventListener("resize", () => {
      updateTargetingArrow();
    });

    if (typeof window !== "undefined") {
      if (window.__spellSwingArrowFrame) {
        cancelAnimationFrame(window.__spellSwingArrowFrame);
      }
      const tick = () => {
        const pending = appState.pendingCombatAction;
        if (pending && actionIsAoe(pending)) {
          updateTargetingArrow();
        }
        window.__spellSwingArrowFrame = requestAnimationFrame(tick);
      };
      window.__spellSwingArrowFrame = requestAnimationFrame(tick);
    }
  }

  function ensureArrowLineCount(linesGroup, count) {
    const existing = linesGroup.querySelectorAll("line.targeting-arrow-line");
    if (existing.length < count) {
      for (let i = existing.length; i < count; i += 1) {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("class", "targeting-arrow-line");
        line.setAttribute("marker-end", "url(#targeting-arrow-head)");
        linesGroup.appendChild(line);
      }
    } else if (existing.length > count) {
      for (let i = existing.length - 1; i >= count; i -= 1) {
        existing[i].remove();
      }
    }
    return linesGroup.querySelectorAll("line.targeting-arrow-line");
  }

  function updateTargetingArrow() {
    const overlay = document.getElementById("targeting-arrow-overlay");
    const shell = document.querySelector(".game-shell");
    if (!overlay || !shell) {
      return;
    }
    const linesGroup = overlay.querySelector("#targeting-arrow-lines");
    if (!linesGroup) {
      return;
    }

    if (!canTargetEnemy() && !canTargetAlly()) {
      ensureArrowLineCount(linesGroup, 0);
      overlay.classList.remove("is-active");
      return;
    }

    const sourceButton = document.querySelector("#combat-hud .action-btn.is-selected");
    if (!sourceButton) {
      ensureArrowLineCount(linesGroup, 0);
      overlay.classList.remove("is-active");
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const btnRect = sourceButton.getBoundingClientRect();
    const sourceX = btnRect.left + btnRect.width / 2 - shellRect.left;
    const sourceY = btnRect.top - shellRect.top;

    const pending = appState.pendingCombatAction;
    const targetPoints = [];

    if (appState.combatHoverAllyId && canTargetAlly()) {
      const scene = getSceneInstance("run");
      if (scene && typeof scene.getPartyScreenPositions === "function") {
        const livingPartyIds = new Set((appState.runState?.party || []).filter((member) => member.alive).map((member) => member.id));
        scene.getPartyScreenPositions()
          .filter((pos) => (actionIsAoe(pending) ? livingPartyIds.has(pos.id) : pos.id === appState.combatHoverAllyId))
          .forEach((pos) => {
            targetPoints.push({
              x: pos.clientX - shellRect.left,
              y: pos.clientY - shellRect.top,
              targetKind: "ally",
            });
          });
      }
      if (targetPoints.length === 0 && appState.targetingArrowCursor) {
        targetPoints.push({
          x: appState.targetingArrowCursor.x,
          y: appState.targetingArrowCursor.y,
          targetKind: "ally",
        });
      }
    } else if (actionIsAoe(pending)) {
      const scene = getSceneInstance("run");
      if (scene && typeof scene.getEnemyScreenPositions === "function") {
        scene.getEnemyScreenPositions().forEach((pos) => {
          targetPoints.push({
            x: pos.clientX - shellRect.left,
            y: pos.clientY - shellRect.top,
            enemyId: pos.id,
          });
        });
      }
    } else if (appState.targetingArrowCursor) {
      targetPoints.push({
        x: appState.targetingArrowCursor.x,
        y: appState.targetingArrowCursor.y,
        enemyId: appState.combatHoverEnemyId,
      });
    }

    const validTargets = targetPoints.filter((p) => {
      const dx = p.x - sourceX;
      const dy = p.y - sourceY;
      return dx * dx + dy * dy >= 16;
    });

    if (validTargets.length === 0) {
      ensureArrowLineCount(linesGroup, 0);
      overlay.classList.remove("is-active");
      return;
    }

    overlay.setAttribute("viewBox", `0 0 ${shellRect.width} ${shellRect.height}`);
    overlay.setAttribute("width", String(shellRect.width));
    overlay.setAttribute("height", String(shellRect.height));

    const lines = ensureArrowLineCount(linesGroup, validTargets.length);
    validTargets.forEach((point, index) => {
      const line = lines[index];
      const effectiveness = point.enemyId ? getPendingTargetEffectiveness(point.enemyId) : "neutral";
      const allyClass = point.targetKind === "ally" ? " is-ally-heal" : "";
      line.setAttribute("class", `targeting-arrow-line${allyClass}${allyClass ? "" : getTargetingEffectivenessClass(effectiveness)}`);
      line.setAttribute(
        "marker-end",
        point.targetKind === "ally"
          ? "url(#targeting-arrow-ally-head)"
          : effectiveness === "super"
          ? "url(#targeting-arrow-rainbow-head)"
          : effectiveness === "barely"
            ? "url(#targeting-arrow-barely-head)"
            : "url(#targeting-arrow-head)",
      );
      line.setAttribute("x1", String(sourceX));
      line.setAttribute("y1", String(sourceY));
      line.setAttribute("x2", String(point.x));
      line.setAttribute("y2", String(point.y));
    });
    overlay.classList.add("is-active");
  }

  function initEnemyIntentOverlay() {
    const overlay = document.getElementById("enemy-intent-overlay");
    if (!overlay) {
      return;
    }

    overlay.innerHTML = "";
    const defs = document.createElementNS(SVG_NS, "defs");
    const rainbowGradient = document.createElementNS(SVG_NS, "linearGradient");
    rainbowGradient.setAttribute("id", "enemy-intent-rainbow-gradient");
    rainbowGradient.setAttribute("x1", "0%");
    rainbowGradient.setAttribute("y1", "0%");
    rainbowGradient.setAttribute("x2", "100%");
    rainbowGradient.setAttribute("y2", "0%");
    [
      ["0%", "#ff3b3b"],
      ["18%", "#ff9f1c"],
      ["34%", "#ffe66d"],
      ["50%", "#33d17a"],
      ["66%", "#2ec4ff"],
      ["82%", "#8f5cff"],
      ["100%", "#ff5fd2"],
    ].forEach(([offset, color]) => {
      const stop = document.createElementNS(SVG_NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      rainbowGradient.appendChild(stop);
    });
    defs.appendChild(rainbowGradient);

    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", "enemy-intent-arrowhead");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto-start-reverse");
    const markerPath = document.createElementNS(SVG_NS, "path");
    markerPath.setAttribute("d", "M0,0 L10,5 L0,10 Z");
    markerPath.setAttribute("fill", "#ff3344");
    markerPath.setAttribute("filter", "drop-shadow(0 0 4px rgba(255,60,80,0.9))");
    marker.appendChild(markerPath);
    defs.appendChild(marker);

    const rainbowMarker = document.createElementNS(SVG_NS, "marker");
    rainbowMarker.setAttribute("id", "enemy-intent-rainbow-arrowhead");
    rainbowMarker.setAttribute("viewBox", "0 0 10 10");
    rainbowMarker.setAttribute("refX", "8");
    rainbowMarker.setAttribute("refY", "5");
    rainbowMarker.setAttribute("markerWidth", "7");
    rainbowMarker.setAttribute("markerHeight", "7");
    rainbowMarker.setAttribute("orient", "auto-start-reverse");
    const rainbowMarkerPath = document.createElementNS(SVG_NS, "path");
    rainbowMarkerPath.setAttribute("d", "M0,0 L10,5 L0,10 Z");
    rainbowMarkerPath.setAttribute("fill", "url(#enemy-intent-rainbow-gradient)");
    rainbowMarkerPath.setAttribute("filter", "drop-shadow(0 0 5px rgba(255,255,255,0.85))");
    rainbowMarker.appendChild(rainbowMarkerPath);
    defs.appendChild(rainbowMarker);

    overlay.appendChild(defs);

    const arcsGroup = document.createElementNS(SVG_NS, "g");
    arcsGroup.setAttribute("id", "enemy-intent-arcs");
    overlay.appendChild(arcsGroup);

    const labelsGroup = document.createElementNS(SVG_NS, "g");
    labelsGroup.setAttribute("id", "enemy-intent-labels");
    overlay.appendChild(labelsGroup);

    window.addEventListener("resize", () => {
      updateEnemyIntentOverlay();
    });

    if (typeof window !== "undefined") {
      if (window.__spellSwingIntentFrame) {
        cancelAnimationFrame(window.__spellSwingIntentFrame);
      }
      const tick = () => {
        updateEnemyIntentOverlay();
        window.__spellSwingIntentFrame = requestAnimationFrame(tick);
      };
      window.__spellSwingIntentFrame = requestAnimationFrame(tick);
    }
  }

  function ensureIntentArcCount(arcsGroup, count) {
    const existing = arcsGroup.querySelectorAll("path.enemy-intent-arc");
    if (existing.length < count) {
      for (let i = existing.length; i < count; i += 1) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", "enemy-intent-arc");
        path.setAttribute("marker-end", "url(#enemy-intent-arrowhead)");
        arcsGroup.appendChild(path);
      }
    } else if (existing.length > count) {
      for (let i = existing.length - 1; i >= count; i -= 1) {
        existing[i].remove();
      }
    }
    return arcsGroup.querySelectorAll("path.enemy-intent-arc");
  }

  function ensureIntentLabelCount(labelsGroup, count) {
    const existing = labelsGroup.querySelectorAll("text.enemy-intent-label");
    if (existing.length < count) {
      for (let i = existing.length; i < count; i += 1) {
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("class", "enemy-intent-label");
        labelsGroup.appendChild(label);
      }
    } else if (existing.length > count) {
      for (let i = existing.length - 1; i >= count; i -= 1) {
        existing[i].remove();
      }
    }
    return labelsGroup.querySelectorAll("text.enemy-intent-label");
  }

  function updateEnemyIntentOverlay() {
    const overlay = document.getElementById("enemy-intent-overlay");
    const shell = document.querySelector(".game-shell");
    if (!overlay || !shell) {
      return;
    }
    const arcsGroup = overlay.querySelector("#enemy-intent-arcs");
    const labelsGroup = overlay.querySelector("#enemy-intent-labels");
    if (!arcsGroup || !labelsGroup) {
      return;
    }

    const runState = appState.runState;
    const isPlayerPhase =
      appState.sceneKey === "run" &&
      runState &&
      runState.stageType === "combat" &&
      runState.turn?.phase === "player";

    if (!isPlayerPhase) {
      ensureIntentArcCount(arcsGroup, 0);
      ensureIntentLabelCount(labelsGroup, 0);
      overlay.classList.remove("is-active");
      return;
    }

    const scene = getSceneInstance("run");
    if (!scene || typeof scene.getEnemyScreenPositions !== "function" || typeof scene.getPartyScreenPositions !== "function") {
      ensureIntentArcCount(arcsGroup, 0);
      ensureIntentLabelCount(labelsGroup, 0);
      overlay.classList.remove("is-active");
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const enemyPositions = new Map(scene.getEnemyScreenPositions().map((pos) => [pos.id, pos]));
    const partyPositions = new Map(scene.getPartyScreenPositions().map((pos) => [pos.id, pos]));
    const hoveredEnemyId = appState.combatInfoHover?.kind === "enemy" ? appState.combatInfoHover.enemyId : null;

    if (!hoveredEnemyId) {
      ensureIntentArcCount(arcsGroup, 0);
      ensureIntentLabelCount(labelsGroup, 0);
      overlay.classList.remove("is-active");
      return;
    }

    const pairs = [];
    for (const enemy of runState.enemies || []) {
      if (enemy.id !== hoveredEnemyId || !enemy.alive || (enemy.effects?.stunTurns || 0) > 0 || (enemy.effects?.freezeChecks || 0) > 0) {
        continue;
      }
      const enemyPos = enemyPositions.get(enemy.id);
      const intendedTargetIds = Array.isArray(enemy.intendedTargetIds) && enemy.intendedTargetIds.length > 0
        ? enemy.intendedTargetIds
        : [enemy.intendedTargetId].filter(Boolean);
      if (!enemyPos || intendedTargetIds.length === 0) {
        continue;
      }
      for (const targetId of intendedTargetIds) {
        const targetPos = partyPositions.get(targetId);
        if (!targetPos) {
          continue;
        }
        const targetMember = (runState.party || []).find((member) => member.id === targetId);
        if (!targetMember || !targetMember.alive) {
          continue;
        }
        pairs.push({
          x1: enemyPos.clientX - shellRect.left,
          y1: enemyPos.clientY - shellRect.top,
          x2: targetPos.clientX - shellRect.left,
          y2: targetPos.clientY - shellRect.top,
          isSuperEffective: enemyIntentUsesTypedDamage(enemy) && getTypeEffectiveness(enemy.type, targetMember.type) === "super",
          label: getEnemyIntentActionLabel(enemy),
        });
      }
    }

    if (pairs.length === 0) {
      ensureIntentArcCount(arcsGroup, 0);
      ensureIntentLabelCount(labelsGroup, 0);
      overlay.classList.remove("is-active");
      return;
    }

    overlay.setAttribute("viewBox", `0 0 ${shellRect.width} ${shellRect.height}`);
    overlay.setAttribute("width", String(shellRect.width));
    overlay.setAttribute("height", String(shellRect.height));

    const arcs = ensureIntentArcCount(arcsGroup, pairs.length);
    const labels = ensureIntentLabelCount(labelsGroup, pairs.length);
    pairs.forEach((pair, index) => {
      const arc = arcs[index];
      const label = labels[index];
      arc.setAttribute("class", `enemy-intent-arc${pair.isSuperEffective ? " is-super-effective" : ""}`);
      arc.setAttribute("marker-end", pair.isSuperEffective ? "url(#enemy-intent-rainbow-arrowhead)" : "url(#enemy-intent-arrowhead)");
      const dx = pair.x2 - pair.x1;
      const dy = pair.y2 - pair.y1;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const midX = (pair.x1 + pair.x2) / 2;
      const midY = (pair.y1 + pair.y2) / 2;
      const arcLift = Math.max(60, Math.min(220, dist * 0.35));
      const spread = (index - (pairs.length - 1) / 2) * 16;
      const cx = midX + spread;
      const cy = midY - arcLift;
      arc.setAttribute(
        "d",
        `M ${pair.x1.toFixed(1)} ${pair.y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${pair.x2.toFixed(1)} ${pair.y2.toFixed(1)}`,
      );
      label.setAttribute("class", `enemy-intent-label${pair.isSuperEffective ? " is-super-effective" : ""}`);
      label.setAttribute("x", String(midX.toFixed(1)));
      label.setAttribute("y", String((midY - Math.min(84, arcLift * 0.42)).toFixed(1)));
      label.textContent = pair.label;
    });
    overlay.classList.add("is-active");
  }

  function scheduleEnemyIntentOverlayUpdate() {
    updateEnemyIntentOverlay();
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => updateEnemyIntentOverlay());
    }
  }

  function submitCombatAction(action, targetId) {
    if (actionNeedsTarget(action) && !targetId) {
      showToast("Select a target first.", "warning");
      return;
    }
    if (action?.kind === "pass" || action?.kind === "cancelEndTurn") {
      if (appState.pendingEndTurnTimer) {
        clearTimeout(appState.pendingEndTurnTimer);
        appState.pendingEndTurnTimer = null;
      }
      appState.pendingEndTurn = false;
    }
    const payload = { ...action };
    if (targetId) {
      payload.targetId = targetId;
    }
    emit("combatAction", payload);
    appState.pendingCombatAction = null;
    appState.combatHoverEnemyId = null;
    appState.combatHoverEnemyName = null;
    appState.combatHoverAllyId = null;
    if (appState.combatInfoHover?.kind === "action") {
      appState.combatInfoHover = null;
    }
    updateRunSceneHighlights();
    updateTargetingArrow();
  }

  function startPendingEndTurn() {
    if (!canCurrentPlayerAct()) {
      return;
    }
    if (appState.pendingEndTurnTimer) {
      clearTimeout(appState.pendingEndTurnTimer);
    }
    appState.combatMenuTab = null;
    appState.pendingCombatAction = null;
    appState.pendingEndTurn = true;
    appState.pendingEndTurnTimer = setTimeout(() => {
      appState.pendingEndTurnTimer = null;
      if (!appState.pendingEndTurn || !canCurrentPlayerAct()) {
        appState.pendingEndTurn = false;
        renderUi();
        return;
      }
      submitCombatAction({ kind: "pass" });
      renderUi();
    }, 1400);
    renderUi();
  }

  function cancelPendingEndTurn() {
    if (appState.pendingEndTurnTimer) {
      clearTimeout(appState.pendingEndTurnTimer);
      appState.pendingEndTurnTimer = null;
    }
    if (appState.pendingEndTurn) {
      appState.pendingEndTurn = false;
      renderUi();
      return;
    }
    submitCombatAction({ kind: "cancelEndTurn" });
    renderUi();
  }

  function formatInventory(inventory) {
    return Object.entries(inventory || {})
      .filter(([, count]) => count > 0)
      .map(([itemId, count]) => `<span class="status-chip">${itemId.replaceAll("_", " ")} x${count}</span>`)
      .join(" ");
  }

  function getHealthRatio(hp, maxHp) {
    if (!maxHp || maxHp <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, hp / maxHp));
  }

  function renderHealthBarMarkup(hp, maxHp, variantClass = "", effects = {}) {
    const percent = Math.round(getHealthRatio(hp, maxHp) * 100);
    const drownedPercent = Math.round(getHealthRatio(effects?.drownedValue || 0, maxHp) * 100);
    const drownedWidthPercent = Math.min(percent, drownedPercent);
    const drownedLeftPercent = Math.max(0, percent - drownedWidthPercent);
    return `
      <div class="combat-healthbar ${variantClass}">
        <div class="combat-healthbar-fill" style="width:${percent}%"></div>
        ${drownedWidthPercent > 0 ? `<div class="combat-healthbar-drowned" style="left:${drownedLeftPercent}%; width:${drownedWidthPercent}%"></div>` : ""}
      </div>
    `;
  }

  function renderEnemyHealthBarMarkup(enemy) {
    const hpPercent = Math.round(getHealthRatio(enemy?.hp, enemy?.maxHp) * 100);
    const drownedPercent = Math.round(getHealthRatio(enemy?.effects?.drownedValue || 0, enemy?.maxHp) * 100);
    const drownedWidthPercent = Math.min(hpPercent, drownedPercent);
    const drownedLeftPercent = Math.max(0, hpPercent - drownedWidthPercent);
    return `
      <div class="combat-healthbar is-enemy">
        <div class="combat-healthbar-fill" style="width:${hpPercent}%"></div>
        ${drownedWidthPercent > 0 ? `<div class="combat-healthbar-drowned" style="left:${drownedLeftPercent}%; width:${drownedWidthPercent}%"></div>` : ""}
      </div>
    `;
  }

  function renderBossTurnOverlayHealthBar(runState) {
    if (runState?.stageCombatKey !== "boss") {
      return "";
    }
    const boss = (runState.enemies || []).find((enemy) => enemy.alive) || (runState.enemies || [])[0];
    if (!boss) {
      return "";
    }
    const hpPercent = Math.round(getHealthRatio(boss.hp, boss.maxHp) * 100);
    const drownedPercent = Math.round(getHealthRatio(boss.effects?.drownedValue || 0, boss.maxHp) * 100);
    const drownedWidthPercent = Math.min(hpPercent, drownedPercent);
    const drownedLeftPercent = Math.max(0, hpPercent - drownedWidthPercent);
    return `
      <div class="boss-turn-health" aria-label="${escapeHtml(boss.name)} health">
        <div class="boss-turn-health-name">${escapeHtml(boss.name)}</div>
        <div class="boss-turn-health-bar">
          <div class="boss-turn-health-fill" style="width:${hpPercent}%"></div>
          ${drownedWidthPercent > 0 ? `<div class="boss-turn-health-drowned" style="left:${drownedLeftPercent}%; width:${drownedWidthPercent}%"></div>` : ""}
        </div>
        <div class="boss-turn-health-value">${Math.max(0, Math.round(boss.hp))}/${Math.round(boss.maxHp)} HP</div>
      </div>
    `;
  }

  function getEnemyStatusList(effects) {
    const statuses = [];
    if ((effects?.poisonStacks || 0) > 0) {
      const poisonDamage = 4 + (effects.poisonStacks - 1) * 2;
      statuses.push({
        key: "poison",
        label: `Poison ${effects.poisonStacks} (taking ${poisonDamage} damage per turn)`,
        shortLabel: `Poison ${effects.poisonStacks}`,
      });
    }
    if ((effects?.bleedStacks || 0) > 0) {
      const bleedDamage = effects.bleedStacks * 3;
      statuses.push({
        key: "bleed",
        label: `Bleed ${effects.bleedStacks} (taking ${bleedDamage} damage per turn)`,
        shortLabel: `Bleed ${effects.bleedStacks}`,
      });
    }
    if ((effects?.burnTurns || 0) > 0) {
      statuses.push({ key: "burn", label: `Burn ${effects.burnTurns} (taking 5 damage per turn)`, shortLabel: `Burn ${effects.burnTurns}` });
    }
    if ((effects?.stunTurns || 0) > 0) {
      statuses.push({ key: "stun", label: `Stun ${effects.stunTurns} (misses next attack)`, shortLabel: `Stun ${effects.stunTurns}` });
    }
    if ((effects?.freezeChecks || 0) > 0) {
      const thawChances = [10, 25, 50, 75, 100];
      const nextChance = thawChances[Math.min((effects.freezeChecks || 1) - 1, thawChances.length - 1)];
      statuses.push({ key: "freeze", label: `Freeze (next thaw check ${nextChance}%)`, shortLabel: "Freeze" });
    }
    if (effects?.updraft) {
      statuses.push({ key: "updraft", label: "Updraft (50% chance to miss attacks)", shortLabel: "Updraft" });
    }
    if (effects?.corrupted) {
      statuses.push({ key: "corruption", label: "Corruption (deals 20% less damage)", shortLabel: "Corruption" });
    }
    if ((effects?.drownedValue || 0) > 0) {
      statuses.push({ key: "drowned", label: `Drowned ${effects.drownedValue} (defeated at this HP or less)`, shortLabel: `Drowned ${effects.drownedValue}` });
    }
    return statuses;
  }

  function isCombatantFrozen(combatant) {
    return (combatant?.effects?.freezeChecks || 0) > 0;
  }

  function getFreezeThawChancePercent(combatant) {
    const thawChances = [10, 25, 50, 75, 100];
    const freezeChecks = combatant?.effects?.freezeChecks || 1;
    return thawChances[Math.min(freezeChecks - 1, thawChances.length - 1)];
  }

  function getCombatBuffList(combatant) {
    const buffs = [];
    const effects = combatant?.effects || {};
    if ((effects.earthDefenseBonus || 0) > 0) {
      buffs.push({
        key: "earthShield",
        label: `Shield (+${Math.round(effects.earthDefenseBonus * 100)}% defenses)`,
      });
    }
    if ((effects.defencePotionTurns || 0) > 0) {
      buffs.push({
        key: "defencePotion",
        label: `Defence Potion: Halves incoming damage for ${effects.defencePotionTurns} turns`,
      });
    }
    if (combatant?.isDefending) {
      buffs.push({ key: "defending", label: "Defending" });
    }
    return buffs;
  }

  function renderEnemyStatusMarkup(effects) {
    const statuses = getEnemyStatusList(effects);
    if (!statuses.length) {
      return '<p class="small-copy">Status: None</p>';
    }
    return `<p class="small-copy">Status: ${statuses.map((entry) => `<span class="status-chip">${escapeHtml(entry.label)}</span>`).join(" ")}</p>`;
  }

  function formatEnemyStatusInline(effects) {
    const statuses = getEnemyStatusList(effects).map((entry) => entry.shortLabel || entry.label);
    return statuses.length ? ` | ${statuses.join(" | ")}` : "";
  }

  function getCharacterDefinition(characterId) {
    return CHARACTER_LOOKUP[characterId] || CHARACTER_CARDS[0];
  }

  function getCharacterVisualProfile(characterRef) {
    const character = getCharacterDefinition(characterRef);
    if (character.id === "fartwizard") {
      return {
        ...character,
        texture: "fartwizard-idle",
        idleAnim: "fartwizard-idle-anim",
        walkAnim: "fartwizard-walk-anim",
        attackAnim: "fartwizard-attack-anim",
        hurtAnim: "fartwizard-hurt-anim",
        portraitYOffset: 28,
        layoutYOffsets: { carousel: 30 },
      };
    }
    if (character.id === "waternymph") {
      return {
        ...character,
        texture: "waternymph-idle",
        idleAnim: "waternymph-idle-anim",
        walkAnim: "waternymph-walk-anim",
        attackAnim: "waternymph-cast-anim",
        hurtAnim: "waternymph-hurt-anim",
        deathAnim: "waternymph-death-anim",
        scaleMultiplier: 1.0,
        portraitScaleMultiplier: 0.82,
      };
    }
    if (character.id === "sandman") {
      return {
        ...character,
        texture: "sandman-idle",
        idleAnim: "sandman-idle-anim",
        walkAnim: "sandman-walk-anim",
        attackAnim: "sandman-attack-anim",
        scaleMultiplier: 1.9,
        portraitScaleMultiplier: 1.55,
      };
    }
    if (character.id === "theowl") {
      return {
        ...character,
        texture: "theowl-idle",
        idleAnim: "theowl-idle-anim",
        walkAnim: "theowl-walk-anim",
        attackAnim: "theowl-attack-anim",
        hurtAnim: "theowl-hurt-anim",
        scaleMultiplier: 0.98,
        layoutYOffsets: { carousel: 30 },
      };
    }
    if (character.id === "thedark") {
      return {
        ...character,
        texture: "thedark-idle",
        idleAnim: "thedark-idle-anim",
        walkAnim: "thedark-walk-anim",
        attackAnim: "thedark-attack-anim",
        hurtAnim: "thedark-hurt-anim",
        scaleMultiplier: 0.96,
      };
    }
    if (character.id === "thecleric") {
      return {
        ...character,
        texture: "thecleric-idle",
        idleAnim: "thecleric-idle-anim",
        walkAnim: "thecleric-walk-anim",
        attackAnim: "thecleric-attack-anim",
        hurtAnim: "thecleric-hurt-anim",
        scaleMultiplier: 1.02,
      };
    }
    if (character.id === "icequeen") {
      return {
        ...character,
        texture: "icequeen-idle",
        idleAnim: "icequeen-idle-anim",
        walkAnim: "icequeen-walk-anim",
        attackAnim: "icequeen-attack-anim",
        hurtAnim: "icequeen-hurt-anim",
        scaleMultiplier: 1.02,
      };
    }
    if (character.id === "thedrummer") {
      return {
        ...character,
        texture: "thedrummer-idle",
        idleAnim: "thedrummer-idle-anim",
        walkAnim: "thedrummer-walk-anim",
        attackAnim: "thedrummer-attack-anim",
        hurtAnim: "thedrummer-hurt-anim",
        scaleMultiplier: 1.02,
        animYOffsets: { walk: 10 },
        layoutYOffsets: { carousel: 30 },
      };
    }
    return {
      ...character,
      texture: "flamewitch-idle",
      idleAnim: "flamewitch-idle-anim",
      walkAnim: "flamewitch-walk-anim",
      attackAnim: "flamewitch-attack-anim",
    };
  }

  function getEnemyVisualProfile(artKey) {
    const def = ENEMY_SPRITE_SHEET_DEFS[artKey];
    if (def) {
      return {
        texture: getEnemySheetTextureKey(artKey, "idle"),
        idleAnim: getEnemySheetAnimKey(artKey, "idle"),
        attackAnim: getEnemySheetAnimKey(artKey, "attack"),
        hurtAnim: getEnemySheetAnimKey(artKey, def.hurt ? "hurt" : "idle"),
        impactTexture: def.impact ? getEnemySheetTextureKey(artKey, "impact") : null,
        impactAnim: def.impact ? getEnemySheetAnimKey(artKey, "impact") : null,
        impactFrame: def.impactFrame || def.frameWidth,
        attackSfxUrl: getEnemyAttackSfxUrl(def),
        frameHeight: def.frameHeight,
        y: def.y,
        scale: def.scale,
        flipX: def.flipX,
        useImpactForSwing: !!def.useImpactForSwing,
      };
    }
    return {
      texture: "swordwitch-idle",
      idleAnim: "swordwitch-idle-anim",
      attackAnim: "swordwitch-attack-anim",
      hurtAnim: "swordwitch-idle-anim",
      frameHeight: 198,
      y: 360,
      scale: 0.95,
      flipX: true,
    };
  }

  function applyCharacterSpriteVisuals(sprite, characterRef, options) {
    const profile = getCharacterVisualProfile(characterRef);
    const expectedTexturePrefix = `${profile.id}-`;
    const hasCharacterTexture = typeof sprite.texture?.key === "string" && sprite.texture.key.startsWith(expectedTexturePrefix);
    if (!hasCharacterTexture && sprite.texture.key !== profile.texture) {
      sprite.setTexture(profile.texture);
    }
    const baseScale = sprite.getData("baseScale");
    if (!baseScale) {
      sprite.setData("baseScale", { x: sprite.scaleX || 1, y: sprite.scaleY || 1 });
    }
    const resolvedBaseScale = sprite.getData("baseScale");
    const isPortrait = !!options?.portrait;
    const scaleMultiplier =
      (isPortrait && profile.portraitScaleMultiplier) || profile.scaleMultiplier || 1;
    sprite.setScale(resolvedBaseScale.x * scaleMultiplier, resolvedBaseScale.y * scaleMultiplier);
    if (profile.tint) {
      sprite.setTint(profile.tint);
    } else {
      sprite.clearTint();
    }
    return profile;
  }

  function syncCharacterSetupStateFromPlayer() {
    if (!appState.entryNicknameDraft && appState.player?.nickname) {
      appState.entryNicknameDraft = appState.player.nickname;
    }
    if (!appState.selectedCharacterId && appState.player?.characterId) {
      appState.selectedCharacterId = appState.player.characterId;
    }
  }

  function getCharacterSetupNickname() {
    return appState.entryNicknameDraft || appState.player?.nickname || "";
  }

  function getActiveCharacterCard() {
    if (appState.hoveredCharacterId) {
      return getCharacterDefinition(appState.hoveredCharacterId);
    }
    if (appState.selectedCharacterId) {
      return getCharacterDefinition(appState.selectedCharacterId);
    }
    return CHARACTER_CARDS[0];
  }

  function isCharacterSetupReady() {
    return Boolean(getCharacterSetupNickname().trim() && appState.selectedCharacterId);
  }

  function updateEntrySubmitState() {
    const submitButton = document.querySelector("[data-action='register-player']");
    if (submitButton) {
      submitButton.disabled = !isCharacterSetupReady();
    }
  }

  function getCharacterPreviewMarkup(activeCharacterCard) {
    if (!activeCharacterCard) {
      return `<p class="small-copy">Hover a character icon to preview its sprite.</p>`;
    }
    const previewTypeIcon = getTypeIconPath(activeCharacterCard.type);
    const safeType = escapeHtml(activeCharacterCard.type);
    const relations = getTypeRelations(activeCharacterCard.type);
    const strongMarkup = relations.strongAgainst.length
      ? `<p class="small-copy type-matchup-line type-matchup-strong"><span class="type-matchup-label">${safeType} is strong against</span>${renderTypeIconList(relations.strongAgainst)}</p>`
      : "";
    const weakMarkup = relations.weakAgainst.length
      ? `<p class="small-copy type-matchup-line type-matchup-weak"><span class="type-matchup-label">${safeType} is weak against</span>${renderTypeIconList(relations.weakAgainst)}</p>`
      : "";
    return `
      <div class="character-preview-title-row">
        <h3>${escapeHtml(activeCharacterCard.name)}</h3>
        ${previewTypeIcon ? `<img class="type-chip-icon type-chip-icon-lg" src="${previewTypeIcon}" alt="${safeType} icon" />` : ""}
      </div>
      <p class="small-copy">Type: ${safeType}</p>
      ${strongMarkup}
      ${weakMarkup}
      <p class="small-copy">${escapeHtml(activeCharacterCard.pitch)}</p>
    `;
  }

  function getCharacterSelectionHintText() {
    const selectedName = appState.selectedCharacterId
      ? getCharacterDefinition(appState.selectedCharacterId).name
      : "";
    return selectedName
      ? `Selected: ${selectedName}`
      : "Hover an icon to preview. Click to select.";
  }

  function updateCharacterSelectionState() {
    const overlay = menuOverlayRoot;
    if (!overlay) {
      return;
    }

    overlay.querySelectorAll("[data-action='character-icon']").forEach((iconButton) => {
      const id = iconButton.dataset.characterId;
      iconButton.classList.toggle("is-selected", id === appState.selectedCharacterId);
      iconButton.classList.toggle("is-hovered", id === appState.hoveredCharacterId);
    });

    const previewCard = overlay.querySelector(".character-preview-card");
    if (previewCard) {
      previewCard.innerHTML = getCharacterPreviewMarkup(getActiveCharacterCard());
    }

    const identityCard = overlay.querySelector(".character-identity-card");
    if (identityCard) {
      identityCard.innerHTML = getCharacterIdentityMarkup(getActiveCharacterCard());
    }

    const statsCard = overlay.querySelector(".character-stats-card");
    if (statsCard) {
      statsCard.innerHTML = getCharacterStatsMarkup(getActiveCharacterCard());
    }

    const spellEffectsCard = overlay.querySelector(".character-spell-effects-card");
    if (spellEffectsCard) {
      spellEffectsCard.innerHTML = getSpellTypeEffectsMarkup(getActiveCharacterCard());
    }

    const hintNode = overlay.querySelector(".character-overlay-hint");
    if (hintNode) {
      hintNode.textContent = getCharacterSelectionHintText();
    }

    const submitButton = overlay.querySelector("[data-action='register-player']");
    if (submitButton) {
      submitButton.disabled = !isCharacterSetupReady();
    }

    refreshActiveCharacterSelectionScene();
  }

  function cycleSelectedCharacter(delta) {
    const list = CHARACTER_CARDS;
    if (!list.length) return;
    const scene = getCharacterSelectionScene();
    if (
      appState.characterSelectLayout === "carousel" &&
      scene &&
      typeof scene.startCharacterGalleryTransition === "function" &&
      scene.startCharacterGalleryTransition(delta)
    ) {
      return;
    }
    const currentId = appState.selectedCharacterId || appState.hoveredCharacterId || list[0].id;
    const currentIdx = Math.max(
      0,
      list.findIndex((entry) => entry.id === currentId),
    );
    const nextIdx = (currentIdx + delta + list.length) % list.length;
    const nextId = list[nextIdx].id;
    appState.selectedCharacterId = nextId;
    appState.hoveredCharacterId = nextId;
    updateCharacterSelectionState();
  }

  function getNextCharacterId(currentCharacterId, delta) {
    const list = CHARACTER_CARDS;
    if (!list.length) {
      return null;
    }
    const direction = delta < 0 ? -1 : 1;
    const currentIdx = getCharacterIndex(currentCharacterId || list[0].id);
    return list[(currentIdx + direction + list.length) % list.length]?.id || null;
  }

  function cycleLobbyCharacter(delta) {
    const currentPlayer = appState.player;
    if (!currentPlayer || appState.sceneKey !== "lobby") {
      return;
    }
    const nextCharacterId = getNextCharacterId(currentPlayer.characterId, delta);
    if (!nextCharacterId || nextCharacterId === currentPlayer.characterId) {
      return;
    }
    emit("updateLobbyCharacter", { characterId: nextCharacterId });
  }

  function setCharacterSelectLayout(mode) {
    const next = mode === "carousel" ? "carousel" : "grid";
    if (appState.characterSelectLayout === next) {
      return;
    }
    appState.characterSelectLayout = next;
    if (next === "carousel" && !appState.selectedCharacterId) {
      const defaultCharacter =
        CHARACTER_CARDS.find((entry) => entry.id === "flamewitch") ||
        CHARACTER_CARDS[0];
      if (defaultCharacter) {
        appState.selectedCharacterId = defaultCharacter.id;
        appState.hoveredCharacterId = defaultCharacter.id;
      }
    }
    renderCharacterSetupUi();
  }

  function getCharacterIdentityMarkup(activeCharacterCard) {
    if (!activeCharacterCard) {
      return `<p class="small-copy">Use the arrows to pick a character.</p>`;
    }
    const previewTypeIcon = getTypeIconPath(activeCharacterCard.type);
    const safeType = escapeHtml(activeCharacterCard.type);
    const relations = getTypeRelations(activeCharacterCard.type);
    const strongMarkup = relations.strongAgainst.length
      ? `<p class="small-copy type-matchup-line type-matchup-strong"><span class="type-matchup-label">${safeType} is strong against</span>${renderTypeIconList(relations.strongAgainst)}</p>`
      : "";
    const weakMarkup = relations.weakAgainst.length
      ? `<p class="small-copy type-matchup-line type-matchup-weak"><span class="type-matchup-label">${safeType} is weak against</span>${renderTypeIconList(relations.weakAgainst)}</p>`
      : "";
    const matchupBlock = (strongMarkup || weakMarkup)
      ? `<div class="character-identity-matchups">
          <p class="small-copy character-identity-matchup-label">Matchups</p>
          ${strongMarkup || `<p class="small-copy">No type advantage.</p>`}
          ${weakMarkup || `<p class="small-copy">No notable weakness.</p>`}
        </div>`
      : "";
    return `
      <div class="character-preview-title-row">
        <h3>${escapeHtml(activeCharacterCard.name)}</h3>
        ${previewTypeIcon ? `<img class="type-chip-icon type-chip-icon-lg" src="${previewTypeIcon}" alt="${safeType} icon" />` : ""}
      </div>
      <p class="small-copy character-identity-type">Type: ${safeType}</p>
      <p class="small-copy character-identity-pitch">${escapeHtml(activeCharacterCard.pitch)}</p>
      ${matchupBlock}
    `;
  }

  function getCharacterStatsMarkup(activeCharacterCard) {
    if (!activeCharacterCard || !activeCharacterCard.stats) {
      return `<p class="small-copy">Select a character to see stats.</p>`;
    }
    const s = activeCharacterCard.stats;
    return `
      <h3 class="character-stats-title">Stats</h3>
      <div class="stat-bar-list">
        ${renderStatBarMarkup("health", s.maxHp)}
        ${renderStatBarMarkup("swingDamage", s.swingDamage)}
        ${renderStatBarMarkup("spellDamage", s.spellDamage)}
        ${renderStatBarMarkup("swingDefense", s.swingDefense)}
        ${renderStatBarMarkup("spellDefense", s.spellDefense)}
        ${renderStatBarMarkup("energyRegen", s.energyRegen)}
        ${renderStatBarMarkup("manaRegen", s.manaRegen)}
      </div>
    `;
  }

  function getSpellTypeEffectsMarkup(activeCharacterCard) {
    const type = activeCharacterCard?.type || "";
    const effects = {
      Fire: "50% chance to Burn.",
      Poison: "Applies Poison stacks.",
      Water: "Applies Drowned; Enemies die when their HP reaches their Drowned value.",
      Earth: "Single spells buff caster defense; AoE buffs party defense.",
      Wind: "15% chance to apply Updraft, causing 50% chance attack misses.",
      Shadow: "Applies Corruption, lowering enemy damage.",
      Light: "Target allies to heal for 2x damage value.",
      Ice: "10% chance to Freeze.",
      Lightning: "15% chance to Stun.",
    };
    if (!type || !effects[type]) {
      return `
        <h3 class="character-effects-title">Spell Type Effect</h3>
        <p class="small-copy">Select a character to see its spell type effect.</p>
      `;
    }
    return `
      <h3 class="character-effects-title">${escapeHtml(type)} Spell Effect</h3>
      <div class="character-spell-effects-list">
        <div class="character-spell-effect-row">
          ${renderTypeChipMarkup(type)}
          <p class="small-copy">${escapeHtml(effects[type])}</p>
        </div>
      </div>
    `;
  }

  function renderCharacterSetupUi() {
    syncCharacterSetupStateFromPlayer();
    if (shouldVibeJamPortalSkipEntryOverlay()) {
      setMenuOverlay("");
      uiRoot.innerHTML = "";
      return;
    }
    uiRoot.innerHTML = "";

    if (
      appState.characterSelectLayout === "carousel" &&
      !appState.selectedCharacterId &&
      CHARACTER_CARDS.length > 0
    ) {
      const defaultCharacter =
        CHARACTER_CARDS.find((entry) => entry.id === "flamewitch") ||
        CHARACTER_CARDS[0];
      appState.selectedCharacterId = defaultCharacter.id;
      appState.hoveredCharacterId = defaultCharacter.id;
    }

    const activeCharacterCard = getActiveCharacterCard();

    const grouped = {};
    CHARACTER_CARDS.forEach((character) => {
      if (!grouped[character.type]) {
        grouped[character.type] = [];
      }
      grouped[character.type].push(character);
    });
    const orderedTypes = [
      ...CHARACTER_TYPE_ORDER.filter((type) => grouped[type]),
      ...Object.keys(grouped).filter((type) => !CHARACTER_TYPE_ORDER.includes(type)),
    ];

    const categoriesMarkup = orderedTypes
      .map((type) => {
        const typeIconPath = getTypeIconPath(type);
        const iconsMarkup = grouped[type]
          .map((character) => {
            const iconPath = getCharacterIconPath(character);
            const isSelected = appState.selectedCharacterId === character.id;
            const isHovered = appState.hoveredCharacterId === character.id;
            const isMirrored = character.id === "fartwizard" || character.id === "thedark";
            const stateClasses = [
              "character-icon",
              isSelected ? "is-selected" : "",
              isHovered ? "is-hovered" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const iconImgStyle = isMirrored ? ' style="transform: scaleX(-1);"' : "";
            return `
              <button
                class="${stateClasses}"
                type="button"
                data-action="character-icon"
                data-character-id="${escapeHtml(character.id)}"
                title="${escapeHtml(character.name)}"
              >
                ${iconPath ? `<img src="${iconPath}" alt="${escapeHtml(character.name)} icon" draggable="false"${iconImgStyle} />` : `<span class="character-icon-fallback">${escapeHtml(character.name.charAt(0))}</span>`}
              </button>
            `;
          })
          .join("");
        return `
          <div class="character-category">
            <div class="character-category-label">
              ${typeIconPath ? `<img class="character-category-icon" src="${typeIconPath}" alt="${escapeHtml(type)} type icon" />` : ""}
              <span>${escapeHtml(type)}</span>
            </div>
            <div class="character-icon-row">${iconsMarkup}</div>
          </div>
        `;
      })
      .join("");

    const previewMarkup = getCharacterPreviewMarkup(activeCharacterCard);
    const identityMarkup = getCharacterIdentityMarkup(activeCharacterCard);
    const statsMarkup = getCharacterStatsMarkup(activeCharacterCard);
    const spellTypeEffectsMarkup = getSpellTypeEffectsMarkup(activeCharacterCard);
    const hintText = getCharacterSelectionHintText();
    const isCarousel = appState.characterSelectLayout === "carousel";
    const layoutClass = isCarousel ? "is-carousel" : "is-grid";
    const layoutToggleLabel = isCarousel ? "Grid Layout" : "Carousel Layout";
    const layoutToggleTarget = isCarousel ? "grid" : "carousel";
    const layoutToggleMarkup = isCarousel
      ? ""
      : `
          <button
            class="ghost-btn character-layout-toggle"
            type="button"
            data-action="toggle-character-layout"
            data-target-layout="${layoutToggleTarget}"
          >${escapeHtml(layoutToggleLabel)}</button>
        `;
    const headerCopyMarkup = isCarousel
      ? ""
      : `
          <h2 class="character-overlay-title">Choose Your Character</h2>
          <p class="character-overlay-hint small-copy">${escapeHtml(hintText)}</p>
        `;

    const bodyMarkup = isCarousel
      ? `
        <button
          class="character-carousel-zone character-carousel-zone-left"
          type="button"
          data-action="cycle-character"
          data-direction="-1"
          aria-label="Previous character"
        >
          <span class="character-carousel-zone-glow" aria-hidden="true"></span>
          <span class="character-carousel-zone-arrows" aria-hidden="true">
            <span class="character-carousel-zone-arrow">&#x2190;</span>
          </span>
        </button>
        <div class="character-select-body is-carousel">
          <aside class="character-info-card character-spell-effects-card">${spellTypeEffectsMarkup}</aside>
          <div class="character-carousel-stage-wrap">
            <div class="character-carousel-stage" aria-hidden="true"></div>
          </div>
          <div class="character-carousel-side-panel">
            <aside class="character-info-card character-identity-card">${identityMarkup}</aside>
            <aside class="character-info-card character-stats-card">${statsMarkup}</aside>
          </div>
        </div>
        <button
          class="character-carousel-zone character-carousel-zone-right"
          type="button"
          data-action="cycle-character"
          data-direction="1"
          aria-label="Next character"
        >
          <span class="character-carousel-zone-glow" aria-hidden="true"></span>
          <span class="character-carousel-zone-arrows" aria-hidden="true">
            <span class="character-carousel-zone-arrow">&#x2192;</span>
          </span>
        </button>`
      : `
        <div class="character-select-body is-grid">
          <div class="character-select-left">
            ${categoriesMarkup}
          </div>
          <div class="character-select-right">
            <div class="character-preview-card">${previewMarkup}</div>
            <div class="character-preview-frame" aria-hidden="true"></div>
          </div>
        </div>`;

    setMenuOverlay(`
      <div class="character-select-layout ${layoutClass}">
        <div class="character-select-header">
          ${layoutToggleMarkup}
          ${headerCopyMarkup}
        </div>

        ${bodyMarkup}

        <div class="character-select-footer">
          <div class="character-submit-wrap">
            <input id="nickname-input" class="form-input character-name-input" maxlength="18" placeholder="Enter nickname" value="${escapeHtml(getCharacterSetupNickname())}" />
            <button class="primary-btn character-submit-btn" data-action="register-player" ${isCharacterSetupReady() ? "" : "disabled"}>Submit</button>
          </div>
        </div>
      </div>
    `);

    refreshActiveCharacterSelectionScene();
  }

  function renderEntryUi() {
    renderCharacterSetupUi();
  }

  function renderCharacterSelectUi() {
    renderCharacterSetupUi();
  }

  function renderHubUi() {
    maybeStripVibeJamPortalUrl();
    setMenuOverlay(`
      <div class="shrine-relic-prompt scene-title-card card" aria-label="Scene title">
        <h2 class="panel-title">Astral Hub</h2>
      </div>
    `);
    setUi(`
      <div class="column">
        <div class="card">
          <p class="panel-copy">Move with <strong>A / D</strong> or the arrow keys. Press <strong>E</strong> near a portal, or use the bottom scene buttons.</p>
        </div>
      </div>
    `);
  }

  function renderLobbyUi() {
    const lobby = appState.lobbyState?.lobby;
    if (!lobby) {
      setUi(`<div class="card"><p>Waiting for lobby data...</p></div>`);
      setLobbyActions("");
      setMenuOverlay("");
      return;
    }

    const playerList = lobby.players
      .map((member) => {
        const character = getCharacterDefinition(member.characterId);
        const isCurrentPlayer = member.id === appState.player?.id;
        const characterControls = isCurrentPlayer
          ? `
            <div class="lobby-character-controls" aria-label="Change character">
              <button class="ghost-btn lobby-character-arrow" type="button" data-action="cycle-lobby-character" data-direction="-1" aria-label="Previous character">&lt;</button>
              <span class="lobby-character-current">${escapeHtml(character.name)}</span>
              <button class="ghost-btn lobby-character-arrow" type="button" data-action="cycle-lobby-character" data-direction="1" aria-label="Next character">&gt;</button>
            </div>
          `
          : `<p class="lobby-character-current">${escapeHtml(character.name)}</p>`;
        return `
          <div class="card wide-card lobby-player-card ${isCurrentPlayer ? "is-current-player" : ""}">
            ${characterControls}
            <h3>${escapeHtml(member.nickname)}</h3>
            <div class="button-row">
              ${member.id === lobby.hostId ? '<span class="status-chip host">Host</span>' : ""}
              ${member.ready ? '<span class="status-chip ready">Ready</span>' : '<span class="status-chip">Not Ready</span>'}
            </div>
          </div>
        `;
      })
      .join("");
    const currentPlayerReady = lobby.players.find((entry) => entry.id === appState.player?.id)?.ready;

    setMenuOverlay(`
      <div class="shrine-relic-prompt scene-title-card card" aria-label="Lobby name">
        <h2 class="panel-title">${escapeHtml(lobby.name)}</h2>
      </div>
    `);
    setLobbyActions(`
      <button class="secondary-btn" data-action="toggle-ready">${currentPlayerReady ? "Unready" : "Ready Up"}</button>
      ${
        lobby.hostId === appState.player?.id
          ? '<button class="primary-btn" data-action="start-run">Start Run</button>'
          : ""
      }
      <button class="ghost-btn" data-action="leave-lobby">Leave Lobby</button>
    `);
    setUi(`
      <div class="column">
        <div class="card lobby-invite-card">
          <p class="panel-copy">Invite link: <code>${escapeHtml(window.location.origin + lobby.inviteUrl)}</code></p>
        </div>
        <div class="row">${playerList}</div>
      </div>
    `);
  }

  function getBlessingRelicInfo(blessingOrId) {
    const id = typeof blessingOrId === "string" ? blessingOrId : blessingOrId?.id;
    const source = typeof blessingOrId === "string" ? BLESSING_INFO[id] : blessingOrId;
    const fallback = BLESSING_INFO[id] || {};
    return {
      id,
      name: source?.name || fallback.name || id || "Relic",
      description: source?.description || fallback.description || "A mysterious shrine relic.",
      image: source?.image || fallback.image || "/Assets/Relics/IronSkin.png",
    };
  }

  function syncBlessingSelection(runState) {
    if (!runState || runState.stageType !== "blessing") {
      appState.selectedBlessingId = null;
      appState.hoveredBlessingId = null;
      return;
    }
    const availableIds = new Set((runState.blessingChoices || []).map((blessing) => blessing.id));
    if (runState.chosenBlessing && availableIds.has(runState.chosenBlessing)) {
      appState.selectedBlessingId = runState.chosenBlessing;
    } else if (appState.selectedBlessingId && !availableIds.has(appState.selectedBlessingId)) {
      appState.selectedBlessingId = null;
    }
    if (appState.hoveredBlessingId && !availableIds.has(appState.hoveredBlessingId)) {
      appState.hoveredBlessingId = null;
    }
  }

  function renderBlessingInfoMarkup(runState) {
    syncBlessingSelection(runState);
    const activeBlessingId = appState.hoveredBlessingId || appState.selectedBlessingId;
    if (!activeBlessingId) {
      return `<p class="combat-info-empty">Hover or click a relic to inspect it.</p>`;
    }
    const blessing = (runState.blessingChoices || []).find((choice) => choice.id === activeBlessingId) || activeBlessingId;
    const relic = getBlessingRelicInfo(blessing);
    const isSelected = appState.selectedBlessingId === activeBlessingId;
    return `
      <div class="combat-info-header">
        <img class="combat-info-icon" src="${escapeHtml(relic.image)}" alt="" aria-hidden="true" />
        <h3 class="combat-info-title">${escapeHtml(relic.name)}<span class="combat-info-subtitle">${isSelected ? "Selected Relic" : "Shrine Relic"}</span></h3>
      </div>
      <p class="combat-info-desc">${escapeHtml(relic.description)}</p>
    `;
  }

  function renderBlessingUi(runState, currentMember) {
    syncBlessingSelection(runState);
    const chosenBlessing = runState.chosenBlessing;
    const selectedBlessingId = appState.selectedBlessingId;
    const blessingCards = runState.blessingChoices
      .map((blessing, index) => {
        const relic = getBlessingRelicInfo(blessing);
        const isSelected = selectedBlessingId === blessing.id;
        const isChosen = chosenBlessing === blessing.id;
        const placementClass = `shrine-relic-slot-${index + 1}`;
        return `
          <button
            class="shrine-relic-choice ${placementClass} ${isSelected ? "is-selected" : ""} ${isChosen ? "is-chosen" : ""}"
            type="button"
            data-action="select-blessing"
            data-blessing-id="${escapeHtml(blessing.id)}"
            aria-pressed="${isSelected ? "true" : "false"}"
            ${chosenBlessing ? "disabled" : ""}
          >
            <img class="shrine-relic-image" src="${escapeHtml(relic.image)}" alt="${escapeHtml(relic.name)}" />
            <span class="shrine-relic-label">${escapeHtml(relic.name)}</span>
          </button>
        `;
      })
      .join("");

    return `
      <div class="shrine-relic-overlay" aria-label="Shrine relic choices">
        <div class="shrine-relic-prompt card">
          <h2 class="panel-title">${escapeHtml(runState.stageName)}</h2>
          <p class="panel-copy">Pick one relic for ${escapeHtml(currentMember.nickname)}.</p>
        </div>
        <div class="shrine-relic-scene">
          ${blessingCards}
        </div>
        <div class="shrine-relic-actions">
          <button class="primary-btn" data-action="submit-blessing" ${selectedBlessingId && !chosenBlessing ? "" : "disabled"}>
            ${chosenBlessing ? "Relic Chosen" : selectedBlessingId ? "Claim Relic" : "Select a Relic"}
          </button>
        </div>
      </div>
    `;
  }

  function renderShopUi(runState, currentMember) {
    const memberCharacter = getCharacterDefinition(getRunMemberCharacterRef(currentMember, runState));
    const memberType = currentMember.type || memberCharacter?.type || "";
    const spellCards = (runState.shop?.spells || [])
      .filter((spell) => !memberType || spell.type === memberType)
      .map((spell) => {
        const ownedCount = countActionCopies(currentMember.knownSpells, spell.id);
        const locked = currentMember.level < spell.levelRequired;
        const canBuy = currentMember.gold >= spell.price && !locked;
        return `
          <div class="card wide-card">
            <h3>${escapeHtml(spell.name)}</h3>
            <p>${escapeHtml(spell.description)}</p>
            <p class="small-copy">Cost: ${spell.price} gold | Requires level ${spell.levelRequired} | Owned ${ownedCount}</p>
            <div class="button-row" style="margin-top:12px">
              <button class="secondary-btn" data-action="buy-shop-item" data-kind="spell" data-id="${escapeHtml(spell.id)}" ${canBuy ? "" : "disabled"}>
                ${locked ? "Locked" : "Buy"}
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    const swingCards = (runState.shop?.swings || COMBAT_ACTIONS.swings)
      .map((swing) => {
        const ownedCount = countActionCopies(currentMember.knownSwings || COMBAT_ACTIONS.swings.map((entry) => entry.id), swing.id);
        const canBuy = currentMember.gold >= swing.price;
        return `
          <div class="card wide-card">
            <h3>${escapeHtml(swing.name)}</h3>
            <p>${escapeHtml(swing.description || SWING_INFO[swing.id]?.description || "")}</p>
            <p class="small-copy">Cost: ${swing.price} gold | Owned ${ownedCount}</p>
            <div class="button-row" style="margin-top:12px">
              <button class="secondary-btn" data-action="buy-shop-item" data-kind="swing" data-id="${escapeHtml(swing.id)}" ${canBuy ? "" : "disabled"}>Buy</button>
            </div>
          </div>
        `;
      })
      .join("");

    const itemCards = (runState.shop?.items || [])
      .map((item) => {
        const canBuy = currentMember.gold >= item.price;
        return `
          <div class="card wide-card">
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.description)}</p>
            <p class="small-copy">Cost: ${item.price} gold</p>
            <div class="button-row" style="margin-top:12px">
              <button class="secondary-btn" data-action="buy-shop-item" data-kind="item" data-id="${escapeHtml(item.id)}" ${canBuy ? "" : "disabled"}>Buy</button>
            </div>
          </div>
        `;
      })
      .join("");

    const relicCards = (runState.shop?.relics || [])
      .map((relic) => {
        const ownedCount = countActionCopies(getMemberBlessingIds(currentMember, memberCharacter), relic.id);
        const canBuy = currentMember.gold >= relic.price;
        const ownedText = ownedCount > 0 ? ` | Owned ${ownedCount}` : "";
        return `
          <div class="card wide-card">
            <h3>${escapeHtml(relic.name)}</h3>
            <p>${escapeHtml(relic.description)}</p>
            <p class="small-copy">Cost: ${relic.price} gold${ownedText}</p>
            <div class="button-row" style="margin-top:12px">
              <button class="secondary-btn" data-action="buy-shop-item" data-kind="relic" data-id="${escapeHtml(relic.id)}" ${canBuy ? "" : "disabled"}>Buy</button>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="column">
        <div class="card">
          <h2 class="panel-title">Shop</h2>
          <p class="panel-copy">Gold: ${currentMember.gold}. Showing ${escapeHtml(memberType || "all")} spells for ${escapeHtml(currentMember.nickname)}. Buy what you need, then mark ready to move on.</p>
          <div class="button-row">
            <button class="primary-btn" data-action="mark-shop-ready" ${runState.stageReady?.[appState.player.id] ? "disabled" : ""}>Ready To Continue</button>
          </div>
        </div>
        <div class="row">${spellCards}</div>
        <div class="row">${swingCards}</div>
        <div class="row">${itemCards}</div>
        <div class="row">${relicCards}</div>
      </div>
    `;
  }

  function renderCombatUi(runState, currentMember) {
    const visualRunState = getVisualRunState(runState);
    const visualCurrentMember = getVisualPartyMember(currentMember);
    const yourTurn = canCurrentPlayerAct() && !appState.pendingEndTurn;
    const isFrozen = isCombatantFrozen(currentMember);
    const countdown = getCountdownSeconds();
    const pending = appState.pendingCombatAction;
    const activeTab = !isFrozen && ["swings", "spells", "items"].includes(appState.combatMenuTab) ? appState.combatMenuTab : null;
    const enemies = visualRunState.enemies.filter((enemy) => enemy.alive);
    const actedPlayerIds = new Set(runState.turn?.actedPlayerIds || []);
    const livingPartyCount = visualRunState.party.filter((member) => member.alive).length;
    const readyCount = visualRunState.party.filter((member) => member.alive && actedPlayerIds.has(member.id)).length;
    const showReadyCount = livingPartyCount > 1;
    const partyCards = visualRunState.party
      .map(
        (member) => {
          const memberCharacter = getCharacterDefinition(getRunMemberCharacterRef(member, visualRunState));
          const memberType = member.type || memberCharacter?.type || "";
          return `
          <div class="card wide-card">
            <h3>${renderNameWithTypeIcon(member.nickname, memberType)}</h3>
            <p>HP ${member.hp}/${member.maxHp} | Energy ${member.energy} | Mana ${member.mana}</p>
            ${renderHealthBarMarkup(member.hp, member.maxHp, "is-party", member.effects)}
            <p class="small-copy">Level ${member.level} | Gold ${member.gold} | XP ${member.xp}</p>
            <div class="button-row" style="margin-top:8px">
              <span class="status-chip ${actedPlayerIds.has(member.id) ? "ready" : ""}">${actedPlayerIds.has(member.id) ? "Ready" : member.alive ? "Acting" : "Down"}</span>
            </div>
          </div>
        `;
        },
      )
      .join("");

    const enemyCards = enemies
      .map(
        (enemy) => `
          <div class="card wide-card">
            <h3>${renderNameWithTypeIcon(enemy.name, enemy.type)}</h3>
            <p>HP ${enemy.hp}/${enemy.maxHp}</p>
            ${renderEnemyHealthBarMarkup(enemy)}
            <p class="small-copy">Type: ${enemy.type}</p>
            ${renderEnemyStatusMarkup(enemy.effects)}
            <p class="small-copy">${yourTurn && !isFrozen && pending && actionHasAttackTarget(pending) ? (actionIsClericLightSpell(pending) ? "Click an enemy to damage or an ally to heal." : actionIsAoe(pending) ? "Click any enemy to confirm AoE." : "Click the battlefield sprite to target.") : "Battlefield target"}</p>
          </div>
        `,
      )
      .join("");

    const knownSpellGroups = getGroupedActionIds(currentMember.knownSpells);
    const spellButtons = knownSpellGroups
      .map(({ id: spellId, count }) => {
        const fallbackSpell = {
          ember_shot: { name: "Ember Shot", energyCost: 0, manaCost: 1 },
          flame_burst: { name: "Flame Burst", energyCost: 0, manaCost: 2 },
          toxic_bolt: { name: "Toxic Bolt", energyCost: 0, manaCost: 1 },
          noxious_cloud: { name: "Noxious Cloud", energyCost: 0, manaCost: 2 },
          ignite: { name: "Ignite", energyCost: 0, manaCost: 1 },
          inferno: { name: "Inferno", energyCost: 0, manaCost: 3 },
          meteor: { name: "Meteor", energyCost: 0, manaCost: 3 },
          water_jet: { name: "Water Jet", energyCost: 0, manaCost: 1 },
          tidal_surge: { name: "Tidal Surge", energyCost: 0, manaCost: 2 },
          whirlpool: { name: "Whirlpool", energyCost: 0, manaCost: 2 },
          tsunami: { name: "Tsunami", energyCost: 0, manaCost: 3 },
          stone_spike: { name: "Stone Spike", energyCost: 0, manaCost: 1 },
          sand_blast: { name: "Sand Blast", energyCost: 0, manaCost: 2 },
          quicksand: { name: "Quicksand", energyCost: 0, manaCost: 2 },
          earthquake: { name: "Earthquake", energyCost: 0, manaCost: 3 },
          gust_slash: { name: "Gust Slash", energyCost: 0, manaCost: 1 },
          feather_storm: { name: "Feather Storm", energyCost: 0, manaCost: 2 },
          updraft: { name: "Updraft", energyCost: 0, manaCost: 2 },
          tempest: { name: "Tempest", energyCost: 0, manaCost: 3 },
          shadow_bolt: { name: "Shadow Bolt", energyCost: 0, manaCost: 1 },
          nightfall: { name: "Nightfall", energyCost: 0, manaCost: 2 },
          void_bind: { name: "Void Bind", energyCost: 0, manaCost: 2 },
          abyssal_storm: { name: "Abyssal Storm", energyCost: 0, manaCost: 3 },
          holy_spark: { name: "Holy Spark", energyCost: 0, manaCost: 1 },
          radiant_wave: { name: "Radiant Wave", energyCost: 0, manaCost: 2 },
          smite: { name: "Smite", energyCost: 0, manaCost: 2 },
          heavenly_wrath: { name: "Heavenly Wrath", energyCost: 0, manaCost: 3 },
          frost_bolt: { name: "Frost Bolt", energyCost: 0, manaCost: 1 },
          blizzard: { name: "Blizzard", energyCost: 0, manaCost: 2 },
          ice_prison: { name: "Ice Prison", energyCost: 0, manaCost: 2 },
          absolute_zero: { name: "Absolute Zero", energyCost: 0, manaCost: 3 },
          electric_jolt: { name: "Electric Jolt", energyCost: 0, manaCost: 1 },
          chain_lightning: { name: "Chain Lightning", energyCost: 0, manaCost: 2 },
          thunder_crash: { name: "Thunder Crash", energyCost: 0, manaCost: 2 },
          storm_symphony: { name: "Storm Symphony", energyCost: 0, manaCost: 3 },
        }[spellId];
        const shopSpell = (runState.shop?.spells || []).find((entry) => entry.id === spellId);
        const spell = { ...fallbackSpell, ...SPELL_INFO[spellId], ...shopSpell };
        const usedCount = getTurnUsedActionCount(runState, currentMember.id, "spell", spellId);
        const remainingUses = Math.max(0, count - usedCount);
        if (remainingUses <= 0) {
          return "";
        }
        const canAfford = canAffordCosts(currentMember, 0, spell.manaCost);
        const isDisabled = !yourTurn || !canAfford;
        return renderCombatActionCardMarkup({
          kind: "spell",
          id: spellId,
          name: spell.name,
          energyCost: spell.energyCost,
          manaCost: spell.manaCost,
          type: spell.type,
          target: spell.target,
          selected: pending?.kind === "spell" && pending?.id === spellId && remainingUses > 0,
          unaffordable: yourTurn && !canAfford,
          disabled: isDisabled,
          title: yourTurn && !canAfford ? "Not enough mana" : "",
          copyCount: count,
          remainingUses,
        });
      })
      .join("");

    const itemButtons = Object.entries(currentMember.inventory)
      .filter(([, count]) => count > 0)
      .map(([itemId, count]) => {
        const item = ITEM_INFO[itemId] || { name: itemId.replaceAll("_", " "), energyCost: 0 };
        const canAfford = canAffordCosts(currentMember, item.energyCost, item.manaCost);
        const isDisabled = !yourTurn || !canAfford;
        return renderCombatActionCardMarkup({
          kind: "item",
          id: itemId,
          name: item.name,
          energyCost: item.energyCost,
          manaCost: item.manaCost,
          type: "Item",
          selected: pending?.kind === "item" && pending?.id === itemId,
          unaffordable: yourTurn && !canAfford,
          disabled: isDisabled,
          title: yourTurn && !canAfford ? "Not enough energy/mana" : "",
          copyCount: count,
          remainingUses: count,
          stackLabel: `x${count}`,
        });
      })
      .join("");

    const promptCopy = yourTurn
      ? isFrozen
        ? `You are frozen. Use Thaw for a ${getFreezeThawChancePercent(currentMember)}% chance to act again; failure ends your turn.`
        : pending && actionIsAoe(pending)
        ? `${getActionLabel(pending)} will strike every enemy. Click any enemy to confirm.`
        : pending && actionNeedsTarget(pending)
          ? appState.combatHoverEnemyName
            ? `${getActionLabel(pending)} on ${appState.combatHoverEnemyName}. Click the highlighted enemy to confirm.`
            : `Hover an enemy sprite to target ${getActionLabel(pending)}, then click to confirm.`
          : "Choose attacks/items as needed, then press End Turn when you are done."
      : runState.turn?.phase === "enemy"
        ? "Enemies are resolving their phase."
        : currentMember.alive
          ? "You ended your turn. Wait for teammates to press End Turn."
          : "You are down for this combat.";
    const turnBanner = getTurnBannerAsset(runState.turn);
    const bossTurnHealthBar = renderBossTurnOverlayHealthBar(runState);
    setTurnOverlay(
      turnBanner
        ? `${countdown !== null ? `<p class="small-copy">Timer: ${countdown}s</p>` : ""}<img class="turn-banner-image" src="${turnBanner.src}" alt="${turnBanner.alt}" />${bossTurnHealthBar}`
        : "",
      runState.turn?.phase || null,
    );
    const categoryButtons = [
      { id: "swings", label: "Swings", icon: "/Assets/UI/swingsIcon.png" },
      { id: "spells", label: "Spells", icon: "/Assets/UI/spellsIcon.png" },
      { id: "items", label: "Items", icon: "/Assets/UI/ItemsIcon.png" },
    ]
      .map(
        (tab) => `
          <button class="action-btn combat-category-btn ${activeTab === tab.id ? "is-selected" : ""}" data-action="set-combat-tab" data-tab="${tab.id}" aria-label="${tab.label}" title="${tab.label}">
            <img class="combat-category-icon" src="${tab.icon}" alt="" aria-hidden="true" />
            <span class="combat-category-label">${tab.label}</span>
          </button>
        `,
      )
      .join("");
    const canCancelEndTurn = canCurrentPlayerCancelEndTurn();
    const endTurnButtonLabel = yourTurn ? "End Turn" : "Turn Ended";
    const cancelEndTurnButton = canCancelEndTurn
      ? `<button class="ghost-btn combat-cancel-end-turn-btn combat-image-btn" data-action="combat-cancel-end-turn" aria-label="Cancel End Turn" title="Cancel End Turn">
          <img class="combat-button-icon" src="/Assets/UI/CancelButtonIcon.png" alt="" aria-hidden="true" />
          <span class="combat-button-label">Cancel End Turn</span>
        </button>`
      : "";
    const endTurnControlsMarkup = `
      <div class="combat-end-turn-stack">
        <button class="primary-btn combat-end-turn-btn combat-image-btn" data-action="combat-end-turn" aria-label="${endTurnButtonLabel}" title="${endTurnButtonLabel}" ${yourTurn && !isFrozen ? "" : "disabled"}>
          <img class="combat-button-icon" src="/Assets/UI/EndTurnButtonIcon.png" alt="" aria-hidden="true" />
          <span class="combat-button-label">${endTurnButtonLabel}</span>
          ${showReadyCount ? `<span class="combat-end-turn-ready">${readyCount}/${livingPartyCount} Ready</span>` : ""}
        </button>
        ${cancelEndTurnButton}
      </div>
    `;
    const thawCard = renderCombatActionCardMarkup({
      kind: "thaw",
      id: "thaw",
      name: "Thaw",
      type: `${getFreezeThawChancePercent(currentMember)}% Chance`,
      target: "Self",
      disabled: !yourTurn,
      title: "Try to break free from Freeze. Failure ends your turn.",
    });

    const knownSwingIds = Array.isArray(currentMember.knownSwings) && currentMember.knownSwings.length > 0
      ? currentMember.knownSwings
      : COMBAT_ACTIONS.swings.map((swing) => swing.id);
    const knownSwingGroups = getGroupedActionIds(knownSwingIds);
    const tabPanels = {
      swings: knownSwingGroups
        .map(({ id: swingId, count }) => {
          const fallbackSwing = COMBAT_ACTIONS.swings.find((entry) => entry.id === swingId);
          const shopSwing = (runState.shop?.swings || []).find((entry) => entry.id === swingId);
          const swing = { ...fallbackSwing, ...SWING_INFO[swingId], ...shopSwing, id: swingId };
          const usedCount = getTurnUsedActionCount(runState, currentMember.id, "swing", swingId);
          const remainingUses = Math.max(0, count - usedCount);
          if (remainingUses <= 0) {
            return "";
          }
          const canAfford = canAffordCosts(currentMember, swing.energyCost, swing.manaCost);
          const isDisabled = !yourTurn || !canAfford;
          return renderCombatActionCardMarkup({
            kind: "swing",
            id: swing.id,
            name: swing.name,
            energyCost: swing.energyCost,
            manaCost: swing.manaCost,
            target: swing.target,
            selected: pending?.kind === "swing" && pending?.id === swing.id && remainingUses > 0,
            unaffordable: yourTurn && !canAfford,
            disabled: isDisabled,
            title: yourTurn && !canAfford ? "Not enough energy/mana" : "",
            copyCount: count,
            remainingUses,
          });
        })
        .join("") || (knownSwingGroups.length ? "<span class='small-copy'>No swing uses left this turn.</span>" : "<span class='small-copy'>No swings learned.</span>"),
      spells: spellButtons || (knownSpellGroups.length ? "<span class='small-copy'>No spell casts left this turn.</span>" : "<span class='small-copy'>No spells learned.</span>"),
      items: itemButtons || "<span class='small-copy'>No usable items.</span>",
    };
    const actionPanelMarkup = isFrozen
      ? `
        <div class="hud-action-row">
          ${thawCard}
        </div>
      `
      : activeTab
      ? `
        <div class="hud-action-row">
          ${tabPanels[activeTab] || ""}
        </div>
      `
      : `
        <div class="hud-action-row hud-category-row">
          ${categoryButtons}
          <div class="combat-category-endturn">
            ${endTurnControlsMarkup}
          </div>
        </div>
      `;
    const navControlsMarkup = activeTab && !isFrozen
      ? `
        <div class="combat-hud-nav">
          ${pending
            ? `<button class="ghost-btn hud-cancel-btn combat-image-btn" data-action="clear-combat-action" aria-label="Cancel Selection" title="Cancel Selection">
                <img class="combat-button-icon" src="/Assets/UI/CancelButtonIcon.png" alt="" aria-hidden="true" />
                <span class="combat-button-label">Cancel Selection</span>
              </button>`
            : ""}
          <button class="ghost-btn hud-back-btn combat-image-btn" data-action="return-combat-categories" aria-label="Back" title="Back">
            <img class="combat-button-icon" src="/Assets/UI/BackButtonIcon.png" alt="" aria-hidden="true" />
            <span class="combat-button-label">Back</span>
          </button>
        </div>
      `
      : "";
    const dockedEndTurnMarkup = activeTab || isFrozen
      ? `
        <div class="combat-hud-endturn">
          ${endTurnControlsMarkup}
        </div>
      `
      : "";

    const hudHtml = `
      <div class="combat-hud-resources">
        <div class="orb-resource">
          <div class="orb-resource-visual">
            <img class="orb-resource-image" src="/Assets/UI/EnergyOrb.png" alt="Energy orb" />
            <span class="orb-resource-value">${currentMember.energy}</span>
          </div>
          <span class="orb-resource-label">Energy</span>
        </div>
        <div class="orb-resource">
          <div class="orb-resource-visual">
            <img class="orb-resource-image" src="/Assets/UI/ManaOrb.png" alt="Mana orb" />
            <span class="orb-resource-value">${currentMember.mana}</span>
          </div>
          <span class="orb-resource-label">Mana</span>
        </div>
      </div>
      ${navControlsMarkup}
      <div class="combat-hud-actions">
        ${actionPanelMarkup}
      </div>
      ${dockedEndTurnMarkup}
    `;
    setCombatHud(hudHtml);

    return `
      <div class="combat-columns">
        <div class="column">
          <div class="card">
            <h3>Party</h3>
            <div class="row" style="margin-top:12px">${partyCards}</div>
          </div>
        </div>
        <div class="column">
          <div class="card">
            <p class="small-copy">${promptCopy}</p>
            <div class="resource-grid" style="margin-top:12px">
              <div class="resource-tile">HP ${visualCurrentMember.hp}/${visualCurrentMember.maxHp}</div>
              <div class="resource-tile">Gold ${currentMember.gold}</div>
            </div>
          </div>
          <div class="card">
            <h3>Enemies</h3>
            <div class="row" style="margin-top:12px">${enemyCards}</div>
          </div>
          <div class="card">
            <h3>Battle Log</h3>
            <ul class="list-reset log-list" style="margin-top:12px">
              ${runState.battleLog.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  function renderRunUi() {
    const runState = appState.runState;
    const currentMember = getCurrentMember();
    syncStageIntroOverlay(runState);
    syncRewardOverlay(runState);

    if (!runState || !currentMember) {
      setCombatHud("");
      setCombatInfo("");
      setTurnOverlay("");
      setTopHud("");
      setUi(`<div class="card"><p>Waiting for run data...</p></div>`);
      return;
    }

    if (runState.stageType === "blessing") {
      setCombatHud("");
      setCombatInfo(renderBlessingInfoMarkup(runState));
      setTurnOverlay("");
      setTopHud("");
      setUi("");
      setMenuOverlay(renderBlessingUi(runState, currentMember));
      return;
    }

    setTopHud(renderTopHudMarkup(currentMember, runState));

    if (runState.stageType === "shop") {
      setCombatHud("");
      setCombatInfo("");
      setTurnOverlay("");
      setMenuOverlay(`
        <div class="shrine-relic-prompt scene-title-card card" aria-label="Scene title">
          <h2 class="panel-title">Forest Fairy Shop</h2>
        </div>
      `);
      // Shop UI is rendered inside Phaser via Rex UI (speech bubble + shop window).
      // Keep the lower HTML UI empty so the Phaser canvas owns the shop interaction.
      setUi("");
      return;
    }

    setUi(renderCombatUi(runState, currentMember));
    renderCombatInfo(runState);
  }

  function renderUi() {
    updateTargetingArrow();
    scheduleEnemyIntentOverlayUpdate();
    gameShellRoot?.classList.toggle("is-shop-stage", appState.sceneKey === "run" && appState.runState?.stageType === "shop");
    if (appState.sceneKey === "entry") {
      setLobbyActions("");
      setCombatHud("");
      setCombatInfo("");
      setTurnOverlay("");
      setTopHud("");
      renderEntryUi();
      return;
    }
    if (appState.sceneKey === "characterSelect") {
      setLobbyActions("");
      setCombatHud("");
      setCombatInfo("");
      setTurnOverlay("");
      setTopHud("");
      renderCharacterSelectUi();
      return;
    }
    setMenuOverlay("");
    if (appState.sceneKey === "hub") {
      setLobbyActions("");
      setCombatHud("");
      setCombatInfo("");
      setTurnOverlay("");
      setTopHud("");
      renderHubUi();
      return;
    }
    if (appState.sceneKey === "lobby") {
      setCombatHud("");
      setCombatInfo("");
      setTurnOverlay("");
      setTopHud("");
      renderLobbyUi();
      return;
    }
    if (appState.sceneKey === "run") {
      setLobbyActions("");
      renderRunUi();
    }
    updateTargetingArrow();
    scheduleEnemyIntentOverlayUpdate();
  }

  async function promptCreateLobby() {
    const defaultName = `${appState.player?.nickname || "Party"}'s Lobby`;
    const result = await showPromptModal({
      title: "Create Lobby",
      subtitle: "Set a name and an optional password for your party.",
      confirmLabel: "Create Lobby",
      fields: [
        {
          name: "name",
          label: "Lobby name",
          defaultValue: defaultName,
          placeholder: "Lobby name",
        },
        {
          name: "password",
          label: "Password (optional)",
          type: "password",
          placeholder: "Leave blank for none",
        },
      ],
    });
    if (!result) {
      return;
    }
    const name = String(result.name || "").trim();
    if (!name) {
      showToast("Lobby name can't be empty.", "warning");
      return;
    }
    emit("createLobby", { name, password: result.password || "" });
  }

  async function promptJoinLobby(lobbyId) {
    const lobby = appState.hubState?.lobbies?.find((entry) => entry.id === lobbyId);
    if (!lobby) {
      return;
    }
    if (!lobby.passwordProtected) {
      emit("joinLobby", { lobbyId, password: "" });
      return;
    }
    const result = await showPromptModal({
      title: `Join "${lobby.name}"`,
      subtitle: "This lobby is password protected.",
      confirmLabel: "Join Lobby",
      fields: [
        {
          name: "password",
          label: "Password",
          type: "password",
          placeholder: "Enter lobby password",
        },
      ],
    });
    if (!result) {
      return;
    }
    emit("joinLobby", { lobbyId, password: result.password || "" });
  }

  function submitCharacterSetup() {
    const input = document.getElementById("nickname-input");
    const nickname = String(input?.value || getCharacterSetupNickname()).trim();

    if (!nickname) {
      showToast("Enter a nickname first.", "warning");
      return;
    }
    if (!appState.selectedCharacterId) {
      showToast("Choose a character first.", "warning");
      return;
    }

    appState.entryNicknameDraft = nickname;

    if (appState.sceneKey === "entry") {
      emit("registerPlayer", { nickname, characterId: appState.selectedCharacterId });
      return;
    }

    emit("selectCharacter", { characterId: appState.selectedCharacterId });
  }

  const CHARACTER_PREVIEW_POSITIONS = {
    grid: { x: 1090, y: 450 },
    carousel: { x: 628, y: 336 },
  };
  const CHARACTER_PREVIEW_FRAME_SIZES = {
    grid: { w: 330, h: 436 },
    carousel: { w: 352, h: 466 },
  };
  const CHARACTER_PREVIEW_PORTRAIT_SIZES = {
    grid: { w: PORTRAIT_BG_DISPLAY_WIDTH, h: PORTRAIT_BG_DISPLAY_HEIGHT },
    carousel: { w: 265, h: 363 },
  };
  const CHARACTER_PREVIEW_SPRITE_SCALES = {
    grid: 1.5,
    carousel: 1.58,
  };
  const CHARACTER_GALLERY_CAROUSEL_SLOTS = {
    previous: { x: 434, y: 336, scale: 0.58, alpha: 0.24, depth: 0, visible: true },
    current: { x: 628, y: 336, scale: 1, alpha: 1, depth: 2, visible: true },
    next: { x: 822, y: 336, scale: 0.58, alpha: 0.24, depth: 0, visible: true },
    offPrevious: { x: 230, y: 336, scale: 0.5, alpha: 0, depth: -1, visible: true },
    offNext: { x: 1026, y: 336, scale: 0.5, alpha: 0, depth: -1, visible: true },
  };
  const CHARACTER_GALLERY_TRANSITION_MS = 360;

  function getCurrentCharacterLayoutKey() {
    return appState.characterSelectLayout === "carousel" ? "carousel" : "grid";
  }

  function getCurrentPreviewPosition() {
    return CHARACTER_PREVIEW_POSITIONS[getCurrentCharacterLayoutKey()];
  }

  function getCurrentPreviewFrameSize() {
    return CHARACTER_PREVIEW_FRAME_SIZES[getCurrentCharacterLayoutKey()];
  }

  function getCurrentPreviewPortraitSize() {
    return CHARACTER_PREVIEW_PORTRAIT_SIZES[getCurrentCharacterLayoutKey()];
  }

  function getCurrentPreviewSpriteScale() {
    return CHARACTER_PREVIEW_SPRITE_SCALES[getCurrentCharacterLayoutKey()];
  }

  function getCharacterGallerySlots() {
    if (getCurrentCharacterLayoutKey() === "carousel") {
      return CHARACTER_GALLERY_CAROUSEL_SLOTS;
    }
    const pos = getCurrentPreviewPosition();
    return {
      previous: { x: pos.x, y: pos.y, scale: 1, alpha: 0, depth: 0, visible: false },
      current: { x: pos.x, y: pos.y, scale: 1, alpha: 1, depth: 2, visible: true },
      next: { x: pos.x, y: pos.y, scale: 1, alpha: 0, depth: 0, visible: false },
      offPrevious: { x: pos.x, y: pos.y, scale: 1, alpha: 0, depth: -1, visible: false },
      offNext: { x: pos.x, y: pos.y, scale: 1, alpha: 0, depth: -1, visible: false },
    };
  }

  function getCharacterIndex(characterId) {
    const index = CHARACTER_CARDS.findIndex((entry) => entry.id === characterId);
    return index >= 0 ? index : 0;
  }

  function getAdjacentCharacterIds(centerId) {
    const count = CHARACTER_CARDS.length;
    if (!count) {
      return { previous: null, current: null, next: null };
    }
    const currentIndex = getCharacterIndex(centerId);
    return {
      previous: CHARACTER_CARDS[(currentIndex - 1 + count) % count].id,
      current: CHARACTER_CARDS[currentIndex].id,
      next: CHARACTER_CARDS[(currentIndex + 1) % count].id,
    };
  }

  function buildCharacterSelectionScene(scene, palette) {
    const hasBgImage = scene.textures.exists("character-select-bg");
    if (hasBgImage) {
      scene.add
        .image(640, 360, "character-select-bg")
        .setDisplaySize(1280, 720)
        .setDepth(-3);
      // Subtle dark tint on top of the image so foreground UI stays readable.
      scene.add
        .rectangle(640, 360, 1280, 720, palette.base, 0.28)
        .setDepth(-2);
    } else {
      scene.add.rectangle(640, 360, 1280, 720, palette.base).setDepth(-3);
    }
    scene.add
      .rectangle(640, 360, 1280, 720, palette.glow, palette.glowAlpha * 0.55)
      .setDepth(-1);
    scene.add
      .rectangle(640, 586, 1280, 268, palette.floor, 0.55)
      .setDepth(-1);

    scene.previewGalleryGroups = {
      previous: createCharacterGalleryGroup(scene),
      current: createCharacterGalleryGroup(scene),
      next: createCharacterGalleryGroup(scene),
    };
    scene.characterGalleryTransitioning = false;
    scene.startCharacterGalleryTransition = (delta) => startCharacterGalleryTransition(scene, delta);
    syncCharacterGalleryScene(scene, getActiveCharacterCard()?.id || CHARACTER_CARDS[0]?.id);
  }

  function createCharacterGalleryGroup(scene) {
    const frameSize = getCurrentPreviewFrameSize();
    const portraitSize = getCurrentPreviewPortraitSize();
    const container = scene.add.container(0, 0).setDepth(0);
    const portraitPlate = scene.add.rectangle(0, 0, 260, 340, 0x0a1826, 0.32).setDepth(0);
    const portraitBg = scene.add
      .image(0, 0, "portrait-bg-flamewitch")
      .setDisplaySize(portraitSize.w, portraitSize.h)
      .setDepth(1)
      .setVisible(false);
    const portraitBgVideo = scene.add
      .video(0, 0, "portrait-bg-flamewitch-video")
      .setDepth(1)
      .setVisible(false);
    portraitBgVideo.setLoop(true);
    portraitBgVideo.setMute(true);
    const sprite = scene.add.sprite(0, 0, "flamewitch-idle").setDepth(2);
    const previewFrame = scene.add
      .image(0, 0, "character-portrait-frame")
      .setDisplaySize(frameSize.w, frameSize.h)
      .setDepth(3);

    container.add([portraitPlate, portraitBg, portraitBgVideo, sprite, previewFrame]);
    return {
      container,
      previewPlate: portraitPlate,
      portraitBg,
      portraitBgVideo,
      previewSprite: sprite,
      previewFrame,
      characterId: null,
    };
  }

  function fitPortraitBgVideo(portraitBgVideo) {
    if (!portraitBgVideo?.setDisplaySize) {
      return;
    }
    const portraitSize = getCurrentPreviewPortraitSize();
    portraitBgVideo.setDisplaySize(portraitSize.w, portraitSize.h);
  }

  function schedulePortraitBgVideoFit(portraitBgVideo) {
    const scene = portraitBgVideo?.scene;
    if (!scene?.time?.delayedCall) {
      fitPortraitBgVideo(portraitBgVideo);
      return;
    }
    [0, 50, 150, 300].forEach((delay) => {
      scene.time.delayedCall(delay, () => {
        if (portraitBgVideo?.active && portraitBgVideo.visible) {
          fitPortraitBgVideo(portraitBgVideo);
        }
      });
    });
  }

  function applyCharacterPortraitBg(portraitBg, portraitBgVideo, characterId) {
    const videoKey = CHARACTER_PORTRAIT_BG_VIDEOS[characterId];
    const textureKey = CHARACTER_PORTRAIT_BG_TEXTURES[characterId];
    const hasVideo = !!videoKey && !!portraitBgVideo && !!portraitBgVideo.scene?.cache?.video?.exists?.(videoKey);

    if (hasVideo) {
      if (portraitBg) {
        portraitBg.setVisible(false);
      }
      if (portraitBgVideo.getVideoKey?.() !== videoKey) {
        portraitBgVideo.changeSource(videoKey, false, true, 0, 0);
        portraitBgVideo.setLoop(true);
        portraitBgVideo.setMute(true);
      }
      fitPortraitBgVideo(portraitBgVideo);
      portraitBgVideo.setVisible(true);
      if (!portraitBgVideo.isPlaying?.()) {
        portraitBgVideo.play(true);
      }
      fitPortraitBgVideo(portraitBgVideo);
      schedulePortraitBgVideoFit(portraitBgVideo);
      return;
    }

    if (portraitBgVideo) {
      if (portraitBgVideo.isPlaying?.()) {
        portraitBgVideo.stop();
      }
      portraitBgVideo.setVisible(false);
    }

    if (!portraitBg) {
      return;
    }
    if (textureKey && portraitBg.scene?.textures?.exists(textureKey)) {
      const portraitSize = getCurrentPreviewPortraitSize();
      portraitBg.setTexture(textureKey);
      portraitBg.setDisplaySize(portraitSize.w, portraitSize.h);
      portraitBg.setVisible(true);
    } else {
      portraitBg.setVisible(false);
    }
  }

  function applyCharacterPortraitFrame(previewFrame, characterId) {
    if (!previewFrame) {
      return;
    }
    const textureKey = CHARACTER_PORTRAIT_FRAME_ASSETS[characterId]?.texture || DEFAULT_CHARACTER_PORTRAIT_FRAME_TEXTURE;
    if (previewFrame.scene?.textures?.exists(textureKey)) {
      previewFrame.setTexture(textureKey);
    }
  }

  function getPreviewSpriteYOffset(characterRef) {
    if (!characterRef) return 0;
    const profile = getCharacterVisualProfile(characterRef);
    const baseOffset = profile?.portraitYOffset || 0;
    const layoutOffsets = profile?.layoutYOffsets;
    const layoutKey = getCurrentCharacterLayoutKey();
    const layoutExtra = (layoutOffsets && layoutOffsets[layoutKey]) || 0;
    return baseOffset + layoutExtra;
  }

  function applyCurrentPreviewTransform(scene) {
    if (!scene) return;
    syncCharacterGalleryScene(scene, getActiveCharacterCard()?.id);
  }

  function applyCharacterGalleryGroupCharacter(group, characterId) {
    if (!group || !characterId) {
      return;
    }
    const frameSize = getCurrentPreviewFrameSize();
    const portraitSize = getCurrentPreviewPortraitSize();
    const spriteScale = getCurrentPreviewSpriteScale();

    group.previewPlate.setSize(260, 340);
    group.previewFrame.setDisplaySize(frameSize.w, frameSize.h);
    group.portraitBg.setDisplaySize(portraitSize.w, portraitSize.h);
    fitPortraitBgVideo(group.portraitBgVideo);
    group.previewSprite.setScale(spriteScale);
    group.previewSprite.setPosition(0, getPreviewSpriteYOffset(characterId));
    applyCharacterPortraitFrame(group.previewFrame, characterId);

    if (group.characterId === characterId) {
      return;
    }
    const profile = applyCharacterSpriteVisuals(group.previewSprite, characterId, { portrait: true });
    group.previewSprite.play(profile.idleAnim, true);
    group.previewSprite.setFlipX(MIRRORED_PREVIEW_CHARACTER_IDS.has(characterId));
    applyCharacterPortraitBg(group.portraitBg, group.portraitBgVideo, characterId);
    group.characterId = characterId;
  }

  function applyCharacterGalleryGroupSlot(group, slot) {
    if (!group || !slot) {
      return;
    }
    if (slot.visible === false && group.portraitBgVideo?.isPlaying?.()) {
      group.portraitBgVideo.stop();
    }
    group.container
      .setPosition(slot.x, slot.y)
      .setScale(slot.scale)
      .setAlpha(slot.alpha)
      .setDepth(slot.depth)
      .setVisible(slot.visible !== false);
  }

  function syncCharacterGalleryScene(scene, centerId) {
    if (!scene?.previewGalleryGroups || !centerId) {
      return;
    }
    const ids = getAdjacentCharacterIds(centerId);
    const slots = getCharacterGallerySlots();
    const groups = scene.previewGalleryGroups;

    applyCharacterGalleryGroupCharacter(groups.previous, ids.previous);
    applyCharacterGalleryGroupCharacter(groups.current, ids.current);
    applyCharacterGalleryGroupCharacter(groups.next, ids.next);
    applyCharacterGalleryGroupSlot(groups.previous, slots.previous);
    applyCharacterGalleryGroupSlot(groups.current, slots.current);
    applyCharacterGalleryGroupSlot(groups.next, slots.next);

    scene.previewSprite = groups.current.previewSprite;
    scene.previewFrame = groups.current.previewFrame;
    scene.previewPlate = groups.current.previewPlate;
    scene.portraitBg = groups.current.portraitBg;
    scene.portraitBgVideo = groups.current.portraitBgVideo;
  }

  function refreshCharacterSelectionScene(scene) {
    if (!scene?.previewGalleryGroups || scene.characterGalleryTransitioning) {
      return;
    }
    const active = getActiveCharacterCard();
    if (!active) {
      return;
    }
    applyCurrentPreviewTransform(scene);
  }

  function setCharacterGalleryTransitionClass(isTransitioning, direction = 0) {
    const layout = menuOverlayRoot?.querySelector(".character-select-layout.is-carousel");
    if (layout) {
      layout.classList.toggle("is-transitioning", isTransitioning);
      layout.classList.toggle("is-transitioning-left", isTransitioning && direction < 0);
      layout.classList.toggle("is-transitioning-right", isTransitioning && direction > 0);
    }
  }

  function tweenCharacterGalleryGroup(scene, group, slot, onComplete) {
    if (!group || !slot) {
      onComplete?.();
      return;
    }
    group.container.setVisible(slot.visible !== false).setDepth(slot.depth);
    scene.tweens.add({
      targets: group.container,
      x: slot.x,
      y: slot.y,
      scale: slot.scale,
      alpha: slot.alpha,
      duration: CHARACTER_GALLERY_TRANSITION_MS,
      ease: "Cubic.easeInOut",
      onComplete,
    });
  }

  function startCharacterGalleryTransition(scene, delta) {
    if (!scene?.previewGalleryGroups || getCurrentCharacterLayoutKey() !== "carousel") {
      return false;
    }
    if (scene.characterGalleryTransitioning) {
      return true;
    }
    const list = CHARACTER_CARDS;
    if (!list.length) {
      return false;
    }

    const direction = delta < 0 ? -1 : 1;
    const currentId = appState.selectedCharacterId || appState.hoveredCharacterId || list[0].id;
    const currentIdx = getCharacterIndex(currentId);
    const nextId = list[(currentIdx + direction + list.length) % list.length].id;
    if (!nextId || nextId === currentId) {
      return false;
    }

    syncCharacterGalleryScene(scene, currentId);
    scene.characterGalleryTransitioning = true;
    setCharacterGalleryTransitionClass(true, direction);

    const groups = scene.previewGalleryGroups;
    const slots = getCharacterGallerySlots();
    const incomingGroup = direction > 0 ? groups.next : groups.previous;
    const farGroup = direction > 0 ? groups.previous : groups.next;
    const currentTarget = direction > 0 ? slots.previous : slots.next;
    const farTarget = direction > 0 ? slots.offPrevious : slots.offNext;
    let remainingTweens = 3;
    const finishOne = () => {
      remainingTweens -= 1;
      if (remainingTweens > 0) {
        return;
      }
      appState.selectedCharacterId = nextId;
      appState.hoveredCharacterId = nextId;
      scene.characterGalleryTransitioning = false;
      setCharacterGalleryTransitionClass(false);
      if (direction > 0) {
        scene.previewGalleryGroups = {
          previous: groups.current,
          current: groups.next,
          next: groups.previous,
        };
      } else {
        scene.previewGalleryGroups = {
          previous: groups.next,
          current: groups.previous,
          next: groups.current,
        };
      }
      const nextIds = getAdjacentCharacterIds(nextId);
      const nextSlots = getCharacterGallerySlots();
      const rotatedGroups = scene.previewGalleryGroups;
      applyCharacterGalleryGroupCharacter(rotatedGroups.previous, nextIds.previous);
      applyCharacterGalleryGroupCharacter(rotatedGroups.current, nextIds.current);
      applyCharacterGalleryGroupCharacter(rotatedGroups.next, nextIds.next);
      applyCharacterGalleryGroupSlot(rotatedGroups.previous, nextSlots.previous);
      applyCharacterGalleryGroupSlot(rotatedGroups.current, nextSlots.current);
      applyCharacterGalleryGroupSlot(rotatedGroups.next, nextSlots.next);
      scene.previewSprite = rotatedGroups.current.previewSprite;
      scene.previewFrame = rotatedGroups.current.previewFrame;
      scene.previewPlate = rotatedGroups.current.previewPlate;
      scene.portraitBg = rotatedGroups.current.portraitBg;
      scene.portraitBgVideo = rotatedGroups.current.portraitBgVideo;
      updateCharacterSelectionState();
    };

    tweenCharacterGalleryGroup(scene, groups.current, currentTarget, finishOne);
    tweenCharacterGalleryGroup(scene, incomingGroup, slots.current, finishOne);
    tweenCharacterGalleryGroup(scene, farGroup, farTarget, finishOne);
    return true;
  }

  function getCharacterSelectionScene() {
    if (appState.sceneKey === "characterSelect") {
      return getSceneInstance("characterSelect");
    }
    return getSceneInstance("entry");
  }

  function refreshActiveCharacterSelectionScene() {
    const scene = getCharacterSelectionScene();
    if (scene && typeof scene.refreshState === "function") {
      scene.refreshState();
    }
  }

  function applyAnimationYOffset(sprite, profile, animationType) {
    const offsetPx = profile?.animYOffsets?.[animationType] || 0;
    if (!offsetPx) {
      sprite.setOrigin(0.5, 0.5);
      return;
    }
    const frameHeight = sprite.frame?.height || sprite.height || 0;
    if (!frameHeight) {
      sprite.setOrigin(0.5, 0.5);
      return;
    }
    sprite.setOrigin(0.5, 0.5 - offsetPx / frameHeight);
  }

  function playCharacterAnimation(sprite, characterRef, animationType = "idle") {
    const profile = applyCharacterSpriteVisuals(sprite, characterRef);
    const animationKey = animationType === "walk" ? profile.walkAnim : animationType === "attack" ? profile.attackAnim : profile.idleAnim;
    sprite.play(animationKey, true);
    applyAnimationYOffset(sprite, profile, animationType);
    return profile;
  }

  function shouldFlipCharacterSprite(characterRef, facing) {
    const character = getCharacterDefinition(characterRef);
    return RIGHT_FACING_CHARACTER_IDS.has(character.id) ? facing === -1 : facing === 1;
  }

  // bindUiActions() is invoked from setUi/setMenuOverlay/setCombatHud and queries the
  // entire document. When a single render touches more than one root (e.g. setCombatHud
  // followed by setUi during a combat update) the same buttons would otherwise get a
  // click listener attached twice, causing actions like "Use Health Potion" to fire
  // twice on a single click. Coalesce all binds within a tick into one microtask so
  // listeners are attached exactly once after all innerHTML mutations settle.
  let bindUiActionsScheduled = false;
  function bindUiActions() {
    if (bindUiActionsScheduled) {
      return;
    }
    bindUiActionsScheduled = true;
    queueMicrotask(() => {
      bindUiActionsScheduled = false;
      bindUiActionsImpl();
    });
  }

  function bindUiActionsImpl() {
    const registerButton = document.querySelector("[data-action='register-player']");
    if (registerButton) {
      registerButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        submitCharacterSetup();
      });
    }

    const nicknameInput = document.getElementById("nickname-input");
    if (nicknameInput) {
      nicknameInput.addEventListener("input", () => {
        const nextValue = nicknameInput.value.slice(0, 18);
        if (nextValue !== nicknameInput.value) {
          nicknameInput.value = nextValue;
        }
        appState.entryNicknameDraft = nextValue;
        updateEntrySubmitState();
      });

      nicknameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && isCharacterSetupReady()) {
          submitCharacterSetup();
        }
      });
    }

    document.querySelectorAll("[data-action='select-character']").forEach((button) => {
      button.addEventListener("click", () => {
        emit("selectCharacter", { characterId: button.dataset.characterId });
      });
    });

    document.querySelectorAll("[data-action='toggle-character-layout']").forEach((button) => {
      button.addEventListener("click", () => {
        setCharacterSelectLayout(button.dataset.targetLayout);
      });
    });

    document.querySelectorAll("[data-action='cycle-character']").forEach((button) => {
      button.addEventListener("click", () => {
        const delta = Number(button.dataset.direction) || 1;
        cycleSelectedCharacter(delta);
      });
    });

    document.querySelectorAll("[data-action='cycle-lobby-character']").forEach((button) => {
      button.addEventListener("click", () => {
        const delta = Number(button.dataset.direction) || 1;
        cycleLobbyCharacter(delta);
      });
    });

    document.querySelectorAll("[data-action='character-icon']").forEach((button) => {
      const characterId = button.dataset.characterId;
      if (!characterId) {
        return;
      }
      button.addEventListener("mouseenter", () => {
        if (appState.hoveredCharacterId === characterId) {
          return;
        }
        appState.hoveredCharacterId = characterId;
        updateCharacterSelectionState();
      });
      button.addEventListener("mouseleave", () => {
        if (appState.hoveredCharacterId !== characterId) {
          return;
        }
        appState.hoveredCharacterId = null;
        updateCharacterSelectionState();
      });
      button.addEventListener("focus", () => {
        if (appState.hoveredCharacterId === characterId) {
          return;
        }
        appState.hoveredCharacterId = characterId;
        updateCharacterSelectionState();
      });
      button.addEventListener("click", () => {
        appState.selectedCharacterId = characterId;
        appState.hoveredCharacterId = characterId;
        updateCharacterSelectionState();
      });
    });

    document.querySelectorAll("[data-action='create-lobby']").forEach((button) => {
      button.addEventListener("click", promptCreateLobby);
    });

    document.querySelectorAll("[data-action='join-lobby']").forEach((button) => {
      button.addEventListener("click", () => promptJoinLobby(button.dataset.lobbyId));
    });

    document.querySelectorAll("[data-action='toggle-ready']").forEach((button) => {
      button.addEventListener("click", () => emit("toggleReady"));
    });

    document.querySelectorAll("[data-action='leave-lobby']").forEach((button) => {
      button.addEventListener("click", () => emit("leaveLobby"));
    });

    document.querySelectorAll("[data-action='start-run']").forEach((button) => {
      button.addEventListener("click", () => emit("startRun"));
    });

    document.querySelectorAll("[data-action='select-blessing']").forEach((button) => {
      const blessingId = button.dataset.blessingId;
      button.addEventListener("mouseenter", () => {
        appState.hoveredBlessingId = blessingId;
        setCombatInfo(renderBlessingInfoMarkup(appState.runState));
      });
      button.addEventListener("mouseleave", () => {
        if (appState.hoveredBlessingId === blessingId) {
          appState.hoveredBlessingId = null;
          setCombatInfo(renderBlessingInfoMarkup(appState.runState));
        }
      });
      button.addEventListener("focus", () => {
        appState.hoveredBlessingId = blessingId;
        setCombatInfo(renderBlessingInfoMarkup(appState.runState));
      });
      button.addEventListener("click", () => {
        appState.selectedBlessingId = blessingId;
        appState.hoveredBlessingId = blessingId;
        renderUi();
      });
    });

    document.querySelectorAll("[data-action='submit-blessing']").forEach((button) => {
      button.addEventListener("click", () => {
        if (!appState.selectedBlessingId) {
          return;
        }
        emit("chooseBlessing", { blessingId: appState.selectedBlessingId });
      });
    });

    document.querySelectorAll("[data-action='choose-blessing']").forEach((button) => {
      button.addEventListener("click", () => emit("chooseBlessing", { blessingId: button.dataset.blessingId }));
    });

    document.querySelectorAll("[data-action='buy-shop-item']").forEach((button) => {
      button.addEventListener("click", () =>
        emit("buyShopItem", { kind: button.dataset.kind, id: button.dataset.id }),
      );
    });

    document.querySelectorAll("[data-action='mark-shop-ready']").forEach((button) => {
      button.addEventListener("click", () => emit("markShopReady"));
    });

    document.querySelectorAll("[data-action='select-level-up-stat']").forEach((button) => {
      button.addEventListener("click", () => {
        appState.selectedLevelUpStatId = button.dataset.statId || null;
        appState.rewardOverlaySignature = null;
        syncRewardOverlay(appState.runState);
      });
    });

    document.querySelectorAll("[data-action='submit-level-up-stat']").forEach((button) => {
      button.addEventListener("click", () => {
        if (!appState.selectedLevelUpStatId) {
          return;
        }
        button.disabled = true;
        emit("chooseLevelUpStat", { statId: appState.selectedLevelUpStatId });
      });
    });

    document.querySelectorAll("[data-action='set-combat-tab']").forEach((button) => {
      button.addEventListener("click", () => {
        if (appState.combatMenuTab !== button.dataset.tab) {
          appState.pendingCombatAction = null;
          appState.combatHoverEnemyId = null;
          appState.combatHoverEnemyName = null;
          appState.combatHoverAllyId = null;
          updateRunSceneHighlights();
          updateTargetingArrow();
        }
        appState.combatMenuTab = button.dataset.tab;
        renderUi();
      });
    });

    document.querySelectorAll("[data-action='return-combat-categories']").forEach((button) => {
      button.addEventListener("click", () => {
        clearPendingCombatAction();
        appState.combatMenuTab = null;
        renderUi();
      });
    });

    document.querySelectorAll("[data-action='queue-combat-action']").forEach((button) => {
      button.addEventListener("click", () => {
        const action = { kind: button.dataset.kind, id: button.dataset.id };
        appState.combatMenuTab = action.kind === "spell" ? "spells" : action.kind === "swing" ? "swings" : action.kind === "item" ? "items" : null;
        if (action.kind === "defend" || action.kind === "pass" || action.kind === "item") {
          submitCombatAction(action);
          renderUi();
          return;
        }
        if (!actionHasAttackTarget(action)) {
          submitCombatAction(action);
          renderUi();
          return;
        }
        appState.pendingCombatAction = action;
        appState.combatHoverEnemyId = null;
        appState.combatHoverEnemyName = null;
        appState.combatHoverAllyId = null;
        updateRunSceneHighlights();
        updateTargetingArrow();
        renderUi();
      });

      button.addEventListener("mouseenter", () => {
        appState.combatInfoHover = {
          kind: "action",
          action: { kind: button.dataset.kind, id: button.dataset.id },
        };
        refreshCombatInfo();
      });
      button.addEventListener("mouseleave", () => {
        if (appState.combatInfoHover?.kind === "action" && appState.combatInfoHover.action?.id === button.dataset.id) {
          appState.combatInfoHover = null;
          refreshCombatInfo();
        }
      });
    });

    document.querySelectorAll("[data-action='clear-combat-action']").forEach((button) => {
      button.addEventListener("click", clearPendingCombatAction);
    });

    document.querySelectorAll("[data-action='combat-end-turn']").forEach((button) => {
      button.addEventListener("click", () => {
        startPendingEndTurn();
      });
    });

    document.querySelectorAll("[data-action='combat-cancel-end-turn']").forEach((button) => {
      button.addEventListener("click", () => {
        if (!canCurrentPlayerCancelEndTurn()) {
          return;
        }
        cancelPendingEndTurn();
      });
    });
  }

  const ASSET_GROUPS = {
    characterSelect: "characterSelect",
    hub: "hub",
    lobby: "lobby",
    shrine: "shrine",
    run: "run",
  };
  const loadedAssetGroups = new Set();

  const CHARACTER_SPRITE_SHEETS = {
    flamewitch: {
      idle: { key: "flamewitch-idle", path: "/Assets/PlayerCharacters/FlameWitch/character_idle_sheet.png", frameWidth: 218, frameHeight: 218, frames: 8, rate: 8 },
      walk: { key: "flamewitch-walk", path: "/Assets/PlayerCharacters/FlameWitch/character_front_walk_walk_right_sheet.png", frameWidth: 218, frameHeight: 218, frames: 8, rate: 12 },
      attack: { key: "flamewitch-attack", path: "/Assets/PlayerCharacters/FlameWitch/character_attack_sheet.png", frameWidth: 218, frameHeight: 218, frames: 8, rate: 14 },
    },
    fartwizard: {
      idle: { key: "fartwizard-idle", path: "/Assets/PlayerCharacters/FartWizard/character_idle_sheet.png", frameWidth: 174, frameHeight: 174, frames: 12, rate: 8 },
      walk: { key: "fartwizard-walk", path: "/Assets/PlayerCharacters/FartWizard/character_walk_sheet.png", frameWidth: 174, frameHeight: 174, frames: 12, rate: 12 },
      attack: { key: "fartwizard-attack", path: "/Assets/PlayerCharacters/FartWizard/character_attack_sheet.png", frameWidth: 174, frameHeight: 174, frames: 12, rate: 14 },
      hurt: { key: "fartwizard-hurt", path: "/Assets/PlayerCharacters/FartWizard/character_hurt_sheet.png", frameWidth: 174, frameHeight: 174, frames: 12, rate: 10, repeat: 0 },
    },
    waternymph: {
      idle: { key: "waternymph-idle", path: "/Assets/PlayerCharacters/Water Nymph/character_animation_sheet_idle.png", frameWidth: 216, frameHeight: 216, frames: 16, rate: 9, yoyo: true },
      walk: { key: "waternymph-walk", path: "/Assets/PlayerCharacters/Water Nymph/character_animation_sheet_Right_Movement.png", frameWidth: 216, frameHeight: 216, frames: 16, rate: 13, yoyo: true },
      attack: { key: "waternymph-attack", path: "/Assets/PlayerCharacters/Water Nymph/character_attack_sheet.png", frameWidth: 216, frameHeight: 216, frames: 8, rate: 14, repeat: 0, animKey: "waternymph-cast-anim" },
      hurt: { key: "waternymph-hurt", path: "/Assets/PlayerCharacters/Water Nymph/character_hurt.png", frameWidth: 216, frameHeight: 216, frames: 14, rate: 12, repeat: 0 },
      death: { key: "waternymph-death", path: "/Assets/PlayerCharacters/Water Nymph/character_death.png", frameWidth: 216, frameHeight: 216, frames: 14, rate: 10, repeat: 0 },
    },
    sandman: {
      idle: { key: "sandman-idle", path: "/Assets/PlayerCharacters/Sand Man/character_idle.png", frameWidth: 104, frameHeight: 104, frames: 8, rate: 8 },
      walk: { key: "sandman-walk", path: "/Assets/PlayerCharacters/Sand Man/character_Movement_Right.png", frameWidth: 104, frameHeight: 104, frames: 8, rate: 12 },
      attack: { key: "sandman-attack", path: "/Assets/PlayerCharacters/Sand Man/Sandman_attack_animation_sheet.png", frameWidth: 88, frameHeight: 88, frames: 8, rate: 14 },
    },
    theowl: {
      idle: { key: "theowl-idle", path: "/Assets/PlayerCharacters/The Owl/character_idle_sheet.png", frameWidth: 194, frameHeight: 194, frames: 8, rate: 8 },
      walk: { key: "theowl-walk", path: "/Assets/PlayerCharacters/The Owl/character_front_walk_walk_right_sheet.png", frameWidth: 194, frameHeight: 194, frames: 8, rate: 12 },
      attack: { key: "theowl-attack", path: "/Assets/PlayerCharacters/The Owl/character_attack_sheet.png", frameWidth: 194, frameHeight: 194, frames: 8, rate: 14 },
      hurt: { key: "theowl-hurt", path: "/Assets/PlayerCharacters/The Owl/character_hurt_sheet.png", frameWidth: 194, frameHeight: 194, frames: 8, rate: 10, repeat: 0 },
    },
    thedark: {
      idle: { key: "thedark-idle", path: "/Assets/PlayerCharacters/The Dark/character_idle.png", frameWidth: 202, frameHeight: 202, frames: 8, rate: 8 },
      walk: { key: "thedark-walk", path: "/Assets/PlayerCharacters/The Dark/character_front_walk_walk_right_sheet.png", frameWidth: 202, frameHeight: 202, frames: 8, rate: 12 },
      attack: { key: "thedark-attack", path: "/Assets/PlayerCharacters/The Dark/character_attack.png", frameWidth: 202, frameHeight: 202, frames: 8, rate: 14 },
      hurt: { key: "thedark-hurt", path: "/Assets/PlayerCharacters/The Dark/character_hurt.png", frameWidth: 202, frameHeight: 202, frames: 8, rate: 10, repeat: 0 },
    },
    thecleric: {
      idle: { key: "thecleric-idle", path: "/Assets/PlayerCharacters/The Cleric/character_idle.png", frameWidth: 190, frameHeight: 190, frames: 8, rate: 8 },
      walk: { key: "thecleric-walk", path: "/Assets/PlayerCharacters/The Cleric/character_front_walk_walk_right.png", frameWidth: 190, frameHeight: 190, frames: 8, rate: 12 },
      attack: { key: "thecleric-attack", path: "/Assets/PlayerCharacters/The Cleric/character_attack.png", frameWidth: 190, frameHeight: 190, frames: 8, rate: 14 },
      hurt: { key: "thecleric-hurt", path: "/Assets/PlayerCharacters/The Cleric/character_hurt.png", frameWidth: 190, frameHeight: 190, frames: 8, rate: 10, repeat: 0 },
    },
    icequeen: {
      idle: { key: "icequeen-idle", path: "/Assets/PlayerCharacters/Ice Queen/character_animation_sheet_idle.png", frameWidth: 182, frameHeight: 182, frames: 16, rate: 8 },
      walk: { key: "icequeen-walk", path: "/Assets/PlayerCharacters/Ice Queen/character_animation_sheet_walking_right.png", frameWidth: 182, frameHeight: 182, frames: 14, rate: 12 },
      attack: { key: "icequeen-attack", path: "/Assets/PlayerCharacters/Ice Queen/character_animation_sheet_attack.png", frameWidth: 182, frameHeight: 182, frames: 10, rate: 14 },
      hurt: { key: "icequeen-hurt", path: "/Assets/PlayerCharacters/Ice Queen/character_animation_sheet_hurt.png", frameWidth: 182, frameHeight: 182, frames: 10, rate: 10, repeat: 0 },
    },
    thedrummer: {
      idle: { key: "thedrummer-idle", path: "/Assets/PlayerCharacters/The Drummer/character_idle.png", frameWidth: 172, frameHeight: 172, frames: 8, rate: 8 },
      walk: { key: "thedrummer-walk", path: "/Assets/PlayerCharacters/The Drummer/character_front_walk_walk_right.png", frameWidth: 172, frameHeight: 172, frames: 14, rate: 12 },
      attack: { key: "thedrummer-attack", path: "/Assets/PlayerCharacters/The Drummer/character_attack.png", frameWidth: 172, frameHeight: 172, frames: 8, rate: 14 },
      hurt: { key: "thedrummer-hurt", path: "/Assets/PlayerCharacters/The Drummer/character_hurt.png", frameWidth: 172, frameHeight: 172, frames: 8, rate: 10, repeat: 0 },
    },
  };

  const PORTRAIT_BG_VIDEO_SOURCES = [
    ["portrait-bg-flamewitch-video", "/Assets/PlayerCharacters/FlameWitch/FlameWitch_PortraitBG_Video.mp4"],
    ["portrait-bg-fartwizard-video", "/Assets/PlayerCharacters/FartWizard/FartWizard_PortraitBG_Video.mp4"],
    ["portrait-bg-waternymph-video", "/Assets/PlayerCharacters/Water Nymph/WaterNymph_PortraitBG_Video.mp4"],
    ["portrait-bg-sandman-video", "/Assets/PlayerCharacters/Sand Man/SandMan_PortraitBG_Video.mp4"],
    ["portrait-bg-theowl-video", "/Assets/PlayerCharacters/The Owl/TheOwl_PortraitBG_Video.mp4"],
    ["portrait-bg-thedark-video", "/Assets/PlayerCharacters/The Dark/TheDark_PortraitBG_Video.mp4"],
    ["portrait-bg-thecleric-video", "/Assets/PlayerCharacters/The Cleric/TheCleric_PortraitBG_Video.mp4"],
    ["portrait-bg-icequeen-video", "/Assets/PlayerCharacters/Ice Queen/IceQueen_PortraitBG_Video.mp4"],
    ["portrait-bg-thedrummer-video", "/Assets/PlayerCharacters/The Drummer/TheDrummer_PortraitBG_Video.mp4"],
  ];

  function queueImage(scene, key, path) {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, path);
    }
  }

  function queueSpritesheet(scene, key, path, config) {
    if (!scene.textures.exists(key)) {
      scene.load.spritesheet(key, path, config);
    }
  }

  function queueVideo(scene, key, path) {
    const videoCache = scene.cache?.video;
    if (!scene.textures.exists(key) && !(videoCache && videoCache.exists(key))) {
      scene.load.video(key, path, "loadeddata", false, true);
    }
  }

  function queueCharacterSpriteSheets(scene, states) {
    Object.values(CHARACTER_SPRITE_SHEETS).forEach((sheets) => {
      states.forEach((state) => {
        const sheet = sheets[state];
        if (sheet) {
          queueSpritesheet(scene, sheet.key, sheet.path, {
            frameWidth: sheet.frameWidth,
            frameHeight: sheet.frameHeight,
          });
        }
      });
    });
  }

  function loadCharacterSelectAssets(scene) {
    queueCharacterSpriteSheets(scene, ["idle"]);
    queueImage(scene, "character-portrait-frame", "/Assets/UI/CharacterPortraitFrame1.png");
    Object.values(CHARACTER_PORTRAIT_FRAME_ASSETS).forEach(({ texture, path }) => {
      queueImage(scene, texture, path);
    });
    queueImage(scene, "character-select-bg", "/Assets/UI/StoneWallBG.png");
    PORTRAIT_BG_VIDEO_SOURCES.forEach(([key, url]) => {
      queueVideo(scene, key, url);
    });
  }

  function loadHubAssets(scene) {
    queueCharacterSpriteSheets(scene, ["walk"]);
    queueSpritesheet(scene, FOREST_PORTAL_ANIMATION.key, FOREST_PORTAL_ANIMATION.path, {
      frameWidth: FOREST_PORTAL_ANIMATION.frameWidth,
      frameHeight: FOREST_PORTAL_ANIMATION.frameHeight,
    });
  }

  function loadLobbyAssets(scene) {
    queueImage(scene, LOBBY_BACKGROUND.key, LOBBY_BACKGROUND.path);
    const maxLobbyFrame = shouldLoadFullAnimatedBackgrounds() ? LOBBY_BACKGROUND_ANIMATION.frameCount : 1;
    for (let frameNumber = 1; frameNumber <= maxLobbyFrame; frameNumber += 1) {
      const paddedFrame = String(frameNumber).padStart(3, "0");
      queueImage(
        scene,
        getLobbyBackgroundFrameKey(frameNumber),
        `${LOBBY_BACKGROUND_ANIMATION.basePath}/${LOBBY_BACKGROUND_ANIMATION.framePrefix}${paddedFrame}.png`,
      );
    }
  }

  function loadShrineAssets(scene) {
    queueImage(scene, "shop-forest1-bg", "/Assets/ShopKeepers/ForestChapter1/forestShopbg1.png");
    if (SHRINE_BACKGROUND.type === "animation") {
      const maxShrineFrame = shouldLoadFullAnimatedBackgrounds() ? SHRINE_BACKGROUND.frameCount : 1;
      for (let frameNumber = 1; frameNumber <= maxShrineFrame; frameNumber += 1) {
        const paddedFrame = String(frameNumber).padStart(3, "0");
        queueImage(
          scene,
          getFrameAnimationKey(SHRINE_BACKGROUND, frameNumber),
          `${SHRINE_BACKGROUND.basePath}/${SHRINE_BACKGROUND.framePrefix}${paddedFrame}.png`,
        );
      }
    }
  }

  function loadRunAssets(scene) {
    queueCharacterSpriteSheets(scene, ["walk", "attack", "hurt", "death"]);
    Object.entries(ENEMY_SPRITE_SHEET_DEFS).forEach(([artKey, def]) => {
      ["idle", "attack", "hurt", "impact"].forEach((state) => {
        const sheet = def[state];
        if (!sheet) {
          return;
        }
        const basePath = getEnemyAssetBasePath(def);
        const frameSize = state === "impact" ? def.impactFrame : def.frameWidth;
        queueSpritesheet(scene, getEnemySheetTextureKey(artKey, state), `${basePath}/${sheet.file}`, {
          frameWidth: frameSize,
          frameHeight: state === "impact" ? def.impactFrame : def.frameHeight,
        });
      });
    });
    loadShrineAssets(scene);
    queueSpritesheet(scene, "shopkeeper-forest1", "/Assets/ShopKeepers/ForestChapter1/ForestShop1character_animation_sheet.png", {
      frameWidth: 160,
      frameHeight: 160,
    });
    queueSpritesheet(scene, "fx-super-effective", "/Assets/UI/SUPER_EFFECTIVE.png", {
      frameWidth: 178,
      frameHeight: 178,
    });
    queueSpritesheet(scene, "fx-barely-effective", "/Assets/UI/BARELY_EFFECTIVE.png", {
      frameWidth: 164,
      frameHeight: 164,
    });
    Object.entries(ATTACK_ANIMATION_DEFS).forEach(([actionId, def]) => {
      queueSpritesheet(scene, getAttackAnimationTextureKey(actionId), `${ATTACK_ANIMATION_BASE_PATH}/${def.file}`, {
        frameWidth: def.frame,
        frameHeight: def.frame,
      });
    });
    Object.entries(SPELL_EFFECT_ANIMATION_DEFS).forEach(([effectId, def]) => {
      queueSpritesheet(scene, getSpellEffectTextureKey(effectId), `${SPELL_EFFECT_ANIMATION_BASE_PATH}/${def.file}`, {
        frameWidth: def.frameWidth,
        frameHeight: def.frameHeight,
      });
    });
    queueImage(scene, FROZEN_EFFECT_DEF.key, `${SPELL_EFFECT_ANIMATION_BASE_PATH}/${FROZEN_EFFECT_DEF.file}`);
    CHAPTER1_MOB_COMBAT_BACKGROUNDS.forEach((background) => {
      if (background.type === "video") {
        queueVideo(scene, background.key, background.path);
      } else if (background.type === "animation") {
        const startFrame = getCombatAnimationStartFrame(background);
        const endFrame = shouldLoadFullAnimatedBackgrounds()
          ? startFrame + background.frameCount - 1
          : startFrame;
        for (let frameNumber = startFrame; frameNumber <= endFrame; frameNumber += 1) {
          const paddedFrame = String(frameNumber).padStart(3, "0");
          queueImage(
            scene,
            getCombatAnimationFrameKey(background, frameNumber),
            `${background.basePath}/${background.framePrefix}${paddedFrame}.png`,
          );
        }
      } else {
        queueImage(scene, background.key, background.path);
      }
    });
    CHAPTER1_MOB_COMBAT_FOREGROUNDS.forEach((foreground) => {
      if (foreground.type === "image") {
        queueImage(scene, foreground.key, foreground.path);
      }
    });
  }

  function hasAllLobbyAnimatedFrames(scene) {
    for (let i = 1; i <= LOBBY_BACKGROUND_ANIMATION.frameCount; i++) {
      if (!scene.textures.exists(getLobbyBackgroundFrameKey(i))) {
        return false;
      }
    }
    return true;
  }

  function hasAllShrineAnimatedFrames(scene) {
    if (SHRINE_BACKGROUND.type !== "animation") {
      return true;
    }
    for (let i = 1; i <= SHRINE_BACKGROUND.frameCount; i++) {
      if (!scene.textures.exists(getFrameAnimationKey(SHRINE_BACKGROUND, i))) {
        return false;
      }
    }
    return true;
  }

  function hasAllCombatAnimatedFrames(scene, background) {
    if (background.type !== "animation") {
      return true;
    }
    const startFrame = getCombatAnimationStartFrame(background);
    for (let i = 0; i < background.frameCount; i++) {
      if (!scene.textures.exists(getCombatAnimationFrameKey(background, startFrame + i))) {
        return false;
      }
    }
    return true;
  }

  function queueRemainingAnimatedBackgroundFrames(scene) {
    let queued = false;
    for (let frameNumber = 2; frameNumber <= LOBBY_BACKGROUND_ANIMATION.frameCount; frameNumber += 1) {
      const textureKey = getLobbyBackgroundFrameKey(frameNumber);
      if (!scene.textures.exists(textureKey)) {
        const paddedFrame = String(frameNumber).padStart(3, "0");
        queueImage(
          scene,
          textureKey,
          `${LOBBY_BACKGROUND_ANIMATION.basePath}/${LOBBY_BACKGROUND_ANIMATION.framePrefix}${paddedFrame}.png`,
        );
        queued = true;
      }
    }
    if (SHRINE_BACKGROUND.type === "animation") {
      for (let frameNumber = 2; frameNumber <= SHRINE_BACKGROUND.frameCount; frameNumber += 1) {
        const textureKey = getFrameAnimationKey(SHRINE_BACKGROUND, frameNumber);
        if (!scene.textures.exists(textureKey)) {
          const paddedFrame = String(frameNumber).padStart(3, "0");
          queueImage(
            scene,
            textureKey,
            `${SHRINE_BACKGROUND.basePath}/${SHRINE_BACKGROUND.framePrefix}${paddedFrame}.png`,
          );
          queued = true;
        }
      }
    }
    CHAPTER1_MOB_COMBAT_BACKGROUNDS.forEach((background) => {
      if (background.type !== "animation") {
        return;
      }
      const startFrame = getCombatAnimationStartFrame(background);
      const endFrame = startFrame + background.frameCount - 1;
      for (let frameNumber = startFrame; frameNumber <= endFrame; frameNumber += 1) {
        const textureKey = getCombatAnimationFrameKey(background, frameNumber);
        if (!scene.textures.exists(textureKey)) {
          const paddedFrame = String(frameNumber).padStart(3, "0");
          queueImage(
            scene,
            textureKey,
            `${background.basePath}/${background.framePrefix}${paddedFrame}.png`,
          );
          queued = true;
        }
      }
    });
    return queued;
  }

  function getPhaserSceneForAssetLoader() {
    const game = appState.game;
    if (!game) {
      return null;
    }
    const preferredKeys = ["RunScene", "LobbyScene", "HubScene", "EntryScene", "CharacterSelectScene", "LoadingScene"];
    for (let i = 0; i < preferredKeys.length; i++) {
      const phaserScene = game.scene.getScene(preferredKeys[i]);
      if (phaserScene && phaserScene.scene.isActive()) {
        return phaserScene;
      }
    }
    return game.scene.getScene("BootScene");
  }

  function refreshScenesAfterEnhancedBackgroundLoad() {
    const game = appState.game;
    if (!game) {
      return;
    }
    const lobby = game.scene.getScene("LobbyScene");
    if (lobby?.scene.isActive() && typeof lobby.recreateAnimatedBackground === "function") {
      lobby.recreateAnimatedBackground();
    }
    const runScene = game.scene.getScene("RunScene");
    if (runScene?.scene.isActive() && typeof runScene.refreshBackgroundAnimationsAfterEnhancedLoad === "function") {
      runScene.refreshBackgroundAnimationsAfterEnhancedLoad();
    }
  }

  function runEnhancedBackgroundAnimationsLoad() {
    const scene = getPhaserSceneForAssetLoader();
    if (!scene) {
      return false;
    }
    if (typeof scene.load.isLoading === "function" && scene.load.isLoading()) {
      return false;
    }
    const queued = queueRemainingAnimatedBackgroundFrames(scene);
    if (!queued) {
      createGameAnimations(scene);
      refreshScenesAfterEnhancedBackgroundLoad();
      return true;
    }
    scene.load.once("complete", () => {
      createGameAnimations(scene);
      refreshScenesAfterEnhancedBackgroundLoad();
    });
    scene.load.start();
    return true;
  }

  function createGameAnimations(scene) {
    const createAnim = (key, texture, endFrame, rate = 8, repeat = -1, yoyo = false) => {
      if (scene.anims.exists(key) || !scene.textures.exists(texture)) {
        return;
      }
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(texture, { start: 0, end: endFrame }),
        frameRate: rate,
        repeat,
        yoyo,
      });
    };

    Object.entries(CHARACTER_SPRITE_SHEETS).forEach(([characterId, sheets]) => {
      Object.entries(sheets).forEach(([state, sheet]) => {
        const animState = sheet.animKey ? null : state === "attack" ? "attack" : state;
        const animKey = sheet.animKey || `${characterId}-${animState}-anim`;
        createAnim(animKey, sheet.key, sheet.frames - 1, sheet.rate, sheet.repeat ?? -1, !!sheet.yoyo);
      });
    });
    Object.entries(ENEMY_SPRITE_SHEET_DEFS).forEach(([artKey, def]) => {
      ["idle", "attack", "hurt", "impact"].forEach((state) => {
        const sheet = def[state];
        if (!sheet) {
          return;
        }
        createAnim(
          getEnemySheetAnimKey(artKey, state),
          getEnemySheetTextureKey(artKey, state),
          sheet.frames - 1,
          sheet.rate,
          state === "idle" ? -1 : 0,
        );
      });
    });
    createAnim("shopkeeper-forest1-idle-anim", "shopkeeper-forest1", 13, 8);
    createAnim("fx-super-effective-anim", "fx-super-effective", 13, 18);
    createAnim("fx-barely-effective-anim", "fx-barely-effective", 7, 14);
    createAnim(
      FOREST_PORTAL_ANIMATION.animKey,
      FOREST_PORTAL_ANIMATION.key,
      FOREST_PORTAL_ANIMATION.frameCount - 1,
      FOREST_PORTAL_ANIMATION.frameRate,
    );
    if (SHRINE_BACKGROUND.type === "animation" && !scene.anims.exists(SHRINE_BACKGROUND.animKey) && hasAllShrineAnimatedFrames(scene)) {
      scene.anims.create({
        key: SHRINE_BACKGROUND.animKey,
        frames: Array.from({ length: SHRINE_BACKGROUND.frameCount }, (_, index) => ({
          key: getFrameAnimationKey(SHRINE_BACKGROUND, index + 1),
        })),
        frameRate: SHRINE_BACKGROUND.frameRate,
        repeat: -1,
        yoyo: true,
      });
    }
    CHAPTER1_MOB_COMBAT_BACKGROUNDS.forEach((background) => {
      const startFrame = getCombatAnimationStartFrame(background);
      if (background.type !== "animation" || scene.anims.exists(background.animKey) || !hasAllCombatAnimatedFrames(scene, background)) {
        return;
      }
      scene.anims.create({
        key: background.animKey,
        frames: Array.from({ length: background.frameCount }, (_, index) => ({
          key: getCombatAnimationFrameKey(background, startFrame + index),
        })),
        frameRate: background.frameRate,
        repeat: -1,
        yoyo: true,
      });
    });
    Object.keys(ATTACK_ANIMATION_DEFS).forEach((actionId) => {
      createAnim(
        getAttackAnimationKey(actionId),
        getAttackAnimationTextureKey(actionId),
        ATTACK_ANIMATION_FRAME_COUNT - 1,
        ATTACK_ANIMATION_FRAME_RATE,
        0,
      );
    });
    Object.entries(SPELL_EFFECT_ANIMATION_DEFS).forEach(([effectId, def]) => {
      createAnim(
        getSpellEffectAnimationKey(effectId),
        getSpellEffectTextureKey(effectId),
        (def.frameCount || SPELL_EFFECT_ANIMATION_FRAME_COUNT) - 1,
        def.frameRate || SPELL_EFFECT_ANIMATION_FRAME_RATE,
        0,
      );
    });
  }

  function getRequiredAssetGroups(sceneKey) {
    if (sceneKey === "hub") {
      return [ASSET_GROUPS.hub];
    }
    if (sceneKey === "lobby") {
      return [ASSET_GROUPS.lobby];
    }
    if (sceneKey === "run") {
      if (appState.runState?.stageType === "blessing") {
        return [ASSET_GROUPS.shrine];
      }
      return [ASSET_GROUPS.run];
    }
    return [];
  }

  function loadAssetGroup(scene, group) {
    if (group === ASSET_GROUPS.characterSelect) {
      loadCharacterSelectAssets(scene);
    } else if (group === ASSET_GROUPS.hub) {
      loadHubAssets(scene);
    } else if (group === ASSET_GROUPS.lobby) {
      loadLobbyAssets(scene);
    } else if (group === ASSET_GROUPS.shrine) {
      loadShrineAssets(scene);
    } else if (group === ASSET_GROUPS.run) {
      loadRunAssets(scene);
    }
  }

  function getMissingAssetGroups(sceneKey) {
    return getRequiredAssetGroups(sceneKey).filter((group) => !loadedAssetGroups.has(group));
  }

  class BootScene extends Phaser.Scene {
    constructor() {
      super("BootScene");
    }

    preload() {
      loadCharacterSelectAssets(this);
      loadHubAssets(this);
      loadLobbyAssets(this);
      loadShrineAssets(this);
    }

    preloadLegacyAllAssets() {
      this.load.spritesheet("flamewitch-idle", "/Assets/PlayerCharacters/FlameWitch/character_idle_sheet.png", {
        frameWidth: 218,
        frameHeight: 218,
      });
      this.load.spritesheet("flamewitch-walk", "/Assets/PlayerCharacters/FlameWitch/character_front_walk_walk_right_sheet.png", {
        frameWidth: 218,
        frameHeight: 218,
      });
      this.load.spritesheet("flamewitch-attack", "/Assets/PlayerCharacters/FlameWitch/character_attack_sheet.png", {
        frameWidth: 218,
        frameHeight: 218,
      });
      this.load.spritesheet("fartwizard-idle", "/Assets/PlayerCharacters/FartWizard/character_idle_sheet.png", {
        frameWidth: 174,
        frameHeight: 174,
      });
      this.load.spritesheet("fartwizard-walk", "/Assets/PlayerCharacters/FartWizard/character_walk_sheet.png", {
        frameWidth: 174,
        frameHeight: 174,
      });
      this.load.spritesheet("fartwizard-attack", "/Assets/PlayerCharacters/FartWizard/character_attack_sheet.png", {
        frameWidth: 174,
        frameHeight: 174,
      });
      this.load.spritesheet("fartwizard-hurt", "/Assets/PlayerCharacters/FartWizard/character_hurt_sheet.png", {
        frameWidth: 174,
        frameHeight: 174,
      });
      this.load.spritesheet("waternymph-idle", "/Assets/PlayerCharacters/Water Nymph/character_animation_sheet_idle.png", {
        frameWidth: 216,
        frameHeight: 216,
      });
      this.load.spritesheet("waternymph-walk", "/Assets/PlayerCharacters/Water Nymph/character_animation_sheet_Right_Movement.png", {
        frameWidth: 216,
        frameHeight: 216,
      });
      this.load.spritesheet("waternymph-attack", "/Assets/PlayerCharacters/Water Nymph/character_attack_sheet.png", {
        frameWidth: 216,
        frameHeight: 216,
      });
      this.load.spritesheet("waternymph-hurt", "/Assets/PlayerCharacters/Water Nymph/character_hurt.png", {
        frameWidth: 216,
        frameHeight: 216,
      });
      this.load.spritesheet("waternymph-death", "/Assets/PlayerCharacters/Water Nymph/character_death.png", {
        frameWidth: 216,
        frameHeight: 216,
      });
      this.load.spritesheet("sandman-idle", "/Assets/PlayerCharacters/Sand Man/character_idle.png", {
        frameWidth: 104,
        frameHeight: 104,
      });
      this.load.spritesheet("sandman-walk", "/Assets/PlayerCharacters/Sand Man/character_Movement_Right.png", {
        frameWidth: 104,
        frameHeight: 104,
      });
      this.load.spritesheet("sandman-attack", "/Assets/PlayerCharacters/Sand Man/Sandman_attack_animation_sheet.png", {
        frameWidth: 88,
        frameHeight: 88,
      });
      this.load.spritesheet("theowl-idle", "/Assets/PlayerCharacters/The Owl/character_idle_sheet.png", {
        frameWidth: 194,
        frameHeight: 194,
      });
      this.load.spritesheet("theowl-walk", "/Assets/PlayerCharacters/The Owl/character_front_walk_walk_right_sheet.png", {
        frameWidth: 194,
        frameHeight: 194,
      });
      this.load.spritesheet("theowl-attack", "/Assets/PlayerCharacters/The Owl/character_attack_sheet.png", {
        frameWidth: 194,
        frameHeight: 194,
      });
      this.load.spritesheet("theowl-hurt", "/Assets/PlayerCharacters/The Owl/character_hurt_sheet.png", {
        frameWidth: 194,
        frameHeight: 194,
      });
      this.load.spritesheet("thedark-idle", "/Assets/PlayerCharacters/The Dark/character_idle.png", {
        frameWidth: 202,
        frameHeight: 202,
      });
      this.load.spritesheet("thedark-walk", "/Assets/PlayerCharacters/The Dark/character_front_walk_walk_right_sheet.png", {
        frameWidth: 202,
        frameHeight: 202,
      });
      this.load.spritesheet("thedark-attack", "/Assets/PlayerCharacters/The Dark/character_attack.png", {
        frameWidth: 202,
        frameHeight: 202,
      });
      this.load.spritesheet("thedark-hurt", "/Assets/PlayerCharacters/The Dark/character_hurt.png", {
        frameWidth: 202,
        frameHeight: 202,
      });
      this.load.spritesheet("thecleric-idle", "/Assets/PlayerCharacters/The Cleric/character_idle.png", {
        frameWidth: 190,
        frameHeight: 190,
      });
      this.load.spritesheet("thecleric-walk", "/Assets/PlayerCharacters/The Cleric/character_front_walk_walk_right.png", {
        frameWidth: 190,
        frameHeight: 190,
      });
      this.load.spritesheet("thecleric-attack", "/Assets/PlayerCharacters/The Cleric/character_attack.png", {
        frameWidth: 190,
        frameHeight: 190,
      });
      this.load.spritesheet("thecleric-hurt", "/Assets/PlayerCharacters/The Cleric/character_hurt.png", {
        frameWidth: 190,
        frameHeight: 190,
      });
      this.load.spritesheet("icequeen-idle", "/Assets/PlayerCharacters/Ice Queen/character_animation_sheet_idle.png", {
        frameWidth: 182,
        frameHeight: 182,
      });
      this.load.spritesheet("icequeen-walk", "/Assets/PlayerCharacters/Ice Queen/character_animation_sheet_walking_right.png", {
        frameWidth: 182,
        frameHeight: 182,
      });
      this.load.spritesheet("icequeen-attack", "/Assets/PlayerCharacters/Ice Queen/character_animation_sheet_attack.png", {
        frameWidth: 182,
        frameHeight: 182,
      });
      this.load.spritesheet("icequeen-hurt", "/Assets/PlayerCharacters/Ice Queen/character_animation_sheet_hurt.png", {
        frameWidth: 182,
        frameHeight: 182,
      });
      this.load.spritesheet("thedrummer-idle", "/Assets/PlayerCharacters/The Drummer/character_idle.png", {
        frameWidth: 172,
        frameHeight: 172,
      });
      this.load.spritesheet("thedrummer-walk", "/Assets/PlayerCharacters/The Drummer/character_front_walk_walk_right.png", {
        frameWidth: 172,
        frameHeight: 172,
      });
      this.load.spritesheet("thedrummer-attack", "/Assets/PlayerCharacters/The Drummer/character_attack.png", {
        frameWidth: 172,
        frameHeight: 172,
      });
      this.load.spritesheet("thedrummer-hurt", "/Assets/PlayerCharacters/The Drummer/character_hurt.png", {
        frameWidth: 172,
        frameHeight: 172,
      });
      Object.entries(ENEMY_SPRITE_SHEET_DEFS).forEach(([artKey, def]) => {
        ["idle", "attack", "hurt", "impact"].forEach((state) => {
          const sheet = def[state];
          if (!sheet) {
            return;
          }
          const basePath = getEnemyAssetBasePath(def);
          const frameSize = state === "impact" ? def.impactFrame : def.frameWidth;
          this.load.spritesheet(getEnemySheetTextureKey(artKey, state), `${basePath}/${sheet.file}`, {
            frameWidth: frameSize,
            frameHeight: state === "impact" ? def.impactFrame : def.frameHeight,
          });
        });
      });
      this.load.image("shop-forest1-bg", "/Assets/ShopKeepers/ForestChapter1/forestShopbg1.png");
      this.load.spritesheet("shopkeeper-forest1", "/Assets/ShopKeepers/ForestChapter1/ForestShop1character_animation_sheet.png", {
        frameWidth: 160,
        frameHeight: 160,
      });
      this.load.spritesheet("fx-super-effective", "/Assets/UI/SUPER_EFFECTIVE.png", {
        frameWidth: 178,
        frameHeight: 178,
      });
      this.load.spritesheet("fx-barely-effective", "/Assets/UI/BARELY_EFFECTIVE.png", {
        frameWidth: 164,
        frameHeight: 164,
      });
      Object.entries(ATTACK_ANIMATION_DEFS).forEach(([actionId, def]) => {
        this.load.spritesheet(getAttackAnimationTextureKey(actionId), `${ATTACK_ANIMATION_BASE_PATH}/${def.file}`, {
          frameWidth: def.frame,
          frameHeight: def.frame,
        });
      });
      Object.entries(SPELL_EFFECT_ANIMATION_DEFS).forEach(([effectId, def]) => {
        this.load.spritesheet(getSpellEffectTextureKey(effectId), `${SPELL_EFFECT_ANIMATION_BASE_PATH}/${def.file}`, {
          frameWidth: def.frameWidth,
          frameHeight: def.frameHeight,
        });
      });
      this.load.image(FROZEN_EFFECT_DEF.key, `${SPELL_EFFECT_ANIMATION_BASE_PATH}/${FROZEN_EFFECT_DEF.file}`);
      this.load.image("character-portrait-frame", "/Assets/UI/CharacterPortraitFrame1.png");
      Object.values(CHARACTER_PORTRAIT_FRAME_ASSETS).forEach(({ texture, path }) => {
        this.load.image(texture, path);
      });
      this.load.image("character-select-bg", "/Assets/UI/StoneWallBG.png");
      if (SHRINE_BACKGROUND.type === "animation") {
        const legacyMaxShrineFrame = shouldLoadFullAnimatedBackgrounds() ? SHRINE_BACKGROUND.frameCount : 1;
        for (let frameNumber = 1; frameNumber <= legacyMaxShrineFrame; frameNumber += 1) {
          const paddedFrame = String(frameNumber).padStart(3, "0");
          this.load.image(
            getFrameAnimationKey(SHRINE_BACKGROUND, frameNumber),
            `${SHRINE_BACKGROUND.basePath}/${SHRINE_BACKGROUND.framePrefix}${paddedFrame}.png`,
          );
        }
      }
      this.load.image(LOBBY_BACKGROUND.key, LOBBY_BACKGROUND.path);
      const legacyMaxLobbyFrame = shouldLoadFullAnimatedBackgrounds() ? LOBBY_BACKGROUND_ANIMATION.frameCount : 1;
      for (let frameNumber = 1; frameNumber <= legacyMaxLobbyFrame; frameNumber += 1) {
        const paddedFrame = String(frameNumber).padStart(3, "0");
        this.load.image(
          getLobbyBackgroundFrameKey(frameNumber),
          `${LOBBY_BACKGROUND_ANIMATION.basePath}/${LOBBY_BACKGROUND_ANIMATION.framePrefix}${paddedFrame}.png`,
        );
      }
      this.load.spritesheet(FOREST_PORTAL_ANIMATION.key, FOREST_PORTAL_ANIMATION.path, {
        frameWidth: FOREST_PORTAL_ANIMATION.frameWidth,
        frameHeight: FOREST_PORTAL_ANIMATION.frameHeight,
      });
      const PORTRAIT_BG_VIDEO_SOURCES = [
        ["portrait-bg-flamewitch-video", "/Assets/PlayerCharacters/FlameWitch/FlameWitch_PortraitBG_Video.mp4"],
        ["portrait-bg-fartwizard-video", "/Assets/PlayerCharacters/FartWizard/FartWizard_PortraitBG_Video.mp4"],
        ["portrait-bg-waternymph-video", "/Assets/PlayerCharacters/Water Nymph/WaterNymph_PortraitBG_Video.mp4"],
        ["portrait-bg-sandman-video", "/Assets/PlayerCharacters/Sand Man/SandMan_PortraitBG_Video.mp4"],
        ["portrait-bg-theowl-video", "/Assets/PlayerCharacters/The Owl/TheOwl_PortraitBG_Video.mp4"],
        ["portrait-bg-thedark-video", "/Assets/PlayerCharacters/The Dark/TheDark_PortraitBG_Video.mp4"],
        ["portrait-bg-thecleric-video", "/Assets/PlayerCharacters/The Cleric/TheCleric_PortraitBG_Video.mp4"],
        ["portrait-bg-icequeen-video", "/Assets/PlayerCharacters/Ice Queen/IceQueen_PortraitBG_Video.mp4"],
        ["portrait-bg-thedrummer-video", "/Assets/PlayerCharacters/The Drummer/TheDrummer_PortraitBG_Video.mp4"],
      ];
      PORTRAIT_BG_VIDEO_SOURCES.forEach(([key, url]) => {
        this.load.video(key, url, "loadeddata", false, true);
      });
      CHAPTER1_MOB_COMBAT_BACKGROUNDS.forEach((background) => {
        if (background.type === "video") {
          this.load.video(background.key, background.path, "loadeddata", false, true);
        } else if (background.type === "animation") {
          const startFrame = getCombatAnimationStartFrame(background);
          const endFrame = shouldLoadFullAnimatedBackgrounds()
            ? startFrame + background.frameCount - 1
            : startFrame;
          for (let frameNumber = startFrame; frameNumber <= endFrame; frameNumber += 1) {
            const paddedFrame = String(frameNumber).padStart(3, "0");
            this.load.image(
              getCombatAnimationFrameKey(background, frameNumber),
              `${background.basePath}/${background.framePrefix}${paddedFrame}.png`,
            );
          }
        } else {
          this.load.image(background.key, background.path);
        }
      });
      CHAPTER1_MOB_COMBAT_FOREGROUNDS.forEach((foreground) => {
        if (foreground.type === "image") {
          this.load.image(foreground.key, foreground.path);
        }
      });
    }

    create() {
      loadedAssetGroups.add(ASSET_GROUPS.characterSelect);
      loadedAssetGroups.add(ASSET_GROUPS.hub);
      loadedAssetGroups.add(ASSET_GROUPS.lobby);
      loadedAssetGroups.add(ASSET_GROUPS.shrine);
      createGameAnimations(this);
      this.scene.start("EntryScene");
    }

    createLegacyAllAnimations() {
      const createAnim = (key, texture, endFrame, rate = 8, repeat = -1, yoyo = false) => {
        if (this.anims.exists(key)) {
          return;
        }
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(texture, { start: 0, end: endFrame }),
          frameRate: rate,
          repeat,
          yoyo,
        });
      };

      createAnim("flamewitch-idle-anim", "flamewitch-idle", 7, 8);
      createAnim("flamewitch-walk-anim", "flamewitch-walk", 7, 12);
      createAnim("flamewitch-attack-anim", "flamewitch-attack", 7, 14);
      createAnim("fartwizard-idle-anim", "fartwizard-idle", 11, 8);
      createAnim("fartwizard-walk-anim", "fartwizard-walk", 11, 12);
      createAnim("fartwizard-attack-anim", "fartwizard-attack", 11, 14);
      createAnim("fartwizard-hurt-anim", "fartwizard-hurt", 11, 10, 0);
      createAnim("waternymph-idle-anim", "waternymph-idle", 15, 9, -1, true);
      createAnim("waternymph-walk-anim", "waternymph-walk", 15, 13, -1, true);
      createAnim("waternymph-cast-anim", "waternymph-attack", 7, 14, 0);
      createAnim("waternymph-hurt-anim", "waternymph-hurt", 13, 12, 0);
      createAnim("waternymph-death-anim", "waternymph-death", 13, 10, 0);
      createAnim("sandman-idle-anim", "sandman-idle", 7, 8);
      createAnim("sandman-walk-anim", "sandman-walk", 7, 12);
      createAnim("sandman-attack-anim", "sandman-attack", 7, 14);
      createAnim("theowl-idle-anim", "theowl-idle", 7, 8);
      createAnim("theowl-walk-anim", "theowl-walk", 7, 12);
      createAnim("theowl-attack-anim", "theowl-attack", 7, 14);
      createAnim("theowl-hurt-anim", "theowl-hurt", 7, 10, 0);
      createAnim("thedark-idle-anim", "thedark-idle", 7, 8);
      createAnim("thedark-walk-anim", "thedark-walk", 7, 12);
      createAnim("thedark-attack-anim", "thedark-attack", 7, 14);
      createAnim("thedark-hurt-anim", "thedark-hurt", 7, 10, 0);
      createAnim("thecleric-idle-anim", "thecleric-idle", 7, 8);
      createAnim("thecleric-walk-anim", "thecleric-walk", 7, 12);
      createAnim("thecleric-attack-anim", "thecleric-attack", 7, 14);
      createAnim("thecleric-hurt-anim", "thecleric-hurt", 7, 10, 0);
      createAnim("icequeen-idle-anim", "icequeen-idle", 15, 8);
      createAnim("icequeen-walk-anim", "icequeen-walk", 13, 12);
      createAnim("icequeen-attack-anim", "icequeen-attack", 9, 14);
      createAnim("icequeen-hurt-anim", "icequeen-hurt", 9, 10, 0);
      createAnim("thedrummer-idle-anim", "thedrummer-idle", 7, 8);
      createAnim("thedrummer-walk-anim", "thedrummer-walk", 13, 12);
      createAnim("thedrummer-attack-anim", "thedrummer-attack", 7, 14);
      createAnim("thedrummer-hurt-anim", "thedrummer-hurt", 7, 10, 0);
      Object.entries(ENEMY_SPRITE_SHEET_DEFS).forEach(([artKey, def]) => {
        ["idle", "attack", "hurt", "impact"].forEach((state) => {
          const sheet = def[state];
          if (!sheet) {
            return;
          }
          createAnim(
            getEnemySheetAnimKey(artKey, state),
            getEnemySheetTextureKey(artKey, state),
            sheet.frames - 1,
            sheet.rate,
            state === "idle" ? -1 : 0,
          );
        });
      });
      createAnim("shopkeeper-forest1-idle-anim", "shopkeeper-forest1", 13, 8);
      createAnim("fx-super-effective-anim", "fx-super-effective", 13, 18);
      createAnim("fx-barely-effective-anim", "fx-barely-effective", 7, 14);
      createAnim(
        FOREST_PORTAL_ANIMATION.animKey,
        FOREST_PORTAL_ANIMATION.key,
        FOREST_PORTAL_ANIMATION.frameCount - 1,
        FOREST_PORTAL_ANIMATION.frameRate,
      );
      if (SHRINE_BACKGROUND.type === "animation" && !this.anims.exists(SHRINE_BACKGROUND.animKey) && hasAllShrineAnimatedFrames(this)) {
        this.anims.create({
          key: SHRINE_BACKGROUND.animKey,
          frames: Array.from({ length: SHRINE_BACKGROUND.frameCount }, (_, index) => ({
            key: getFrameAnimationKey(SHRINE_BACKGROUND, index + 1),
          })),
          frameRate: SHRINE_BACKGROUND.frameRate,
          repeat: -1,
          yoyo: true,
        });
      }
      CHAPTER1_MOB_COMBAT_BACKGROUNDS.forEach((background) => {
        if (background.type !== "animation" || this.anims.exists(background.animKey) || !hasAllCombatAnimatedFrames(this, background)) {
          return;
        }
        const startFrame = getCombatAnimationStartFrame(background);
        this.anims.create({
          key: background.animKey,
          frames: Array.from({ length: background.frameCount }, (_, index) => ({
            key: getCombatAnimationFrameKey(background, startFrame + index),
          })),
          frameRate: background.frameRate,
          repeat: -1,
          yoyo: true,
        });
      });
      Object.keys(ATTACK_ANIMATION_DEFS).forEach((actionId) => {
        createAnim(
          getAttackAnimationKey(actionId),
          getAttackAnimationTextureKey(actionId),
          ATTACK_ANIMATION_FRAME_COUNT - 1,
          ATTACK_ANIMATION_FRAME_RATE,
          0,
        );
      });
      Object.entries(SPELL_EFFECT_ANIMATION_DEFS).forEach(([effectId, def]) => {
        createAnim(
          getSpellEffectAnimationKey(effectId),
          getSpellEffectTextureKey(effectId),
          (def.frameCount || SPELL_EFFECT_ANIMATION_FRAME_COUNT) - 1,
          def.frameRate || SPELL_EFFECT_ANIMATION_FRAME_RATE,
          0,
        );
      });

      this.scene.start("EntryScene");
    }
  }

  class LoadingScene extends Phaser.Scene {
    constructor() {
      super("LoadingScene");
    }

    init(data) {
      this.targetScene = data?.targetScene || "EntryScene";
      this.assetGroups = Array.isArray(data?.assetGroups) ? data.assetGroups : [];
      this.loadingLabel = data?.label || "Loading";
    }

    preload() {
      this.assetGroups.forEach((group) => {
        loadAssetGroup(this, group);
      });
    }

    create() {
      this.assetGroups.forEach((group) => {
        loadedAssetGroups.add(group);
      });
      createGameAnimations(this);
      this.scene.start(this.targetScene);
    }
  }

  class EntryScene extends Phaser.Scene {
    constructor() {
      super("EntryScene");
    }

    create() {
      playSceneFadeIn(this);
      buildCharacterSelectionScene(this, {
        base: 0x0e1d2e,
        glow: 0x13283e,
        glowAlpha: 0.46,
        floor: 0x0c1826,
      });
      this.refreshState();
      renderUi();
      maybeShowEnhancedBgStartupHint();
    }

    refreshState() {
      refreshCharacterSelectionScene(this);
    }
  }

  class CharacterSelectScene extends Phaser.Scene {
    constructor() {
      super("CharacterSelectScene");
    }

    create() {
      playSceneFadeIn(this);
      buildCharacterSelectionScene(this, {
        base: 0x101926,
        glow: 0x142338,
        glowAlpha: 0.52,
        floor: 0x0d1624,
      });
      this.refreshState();
      renderUi();
    }

    refreshState() {
      refreshCharacterSelectionScene(this);
    }
  }

  class HubScene extends Phaser.Scene {
    constructor() {
      super("HubScene");
      this.remoteSprites = new Map();
      this.portals = [];
      this.portalSignature = "";
      this.lobbyBrowserSignature = "";
      this.worldWidth = 3600;
      this.worldHeight = 2200;
      this.minimapGraphics = null;
      this.nebulaLayers = [];
      this.onlineCountText = null;
      this.hubButtons = [];
      this.lobbyBrowserVisible = false;
      this.lobbyBrowserStatic = [];
      this.lobbyBrowserEntries = [];
      this.vibeJamReturnPortalReadyAt = 0;
    }

    create() {
      playSceneFadeIn(this);
      this.vibeJamReturnPortalReadyAt = appState.vibeJamInboundRefNormalized
        ? Date.now() + VIBE_JAM_RETURN_PORTAL_GRACE_MS
        : 0;
      this.cameras.main.setBackgroundColor("#070916");
      this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
      if (this.physics?.world?.setBounds) {
        this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
      }
      this.buildAstralBackdrop();

      const spawnX = appState.player?.x ?? 220;
      const spawnY = appState.player?.y ?? 560;
      this.localSprite = this.add.sprite(spawnX, spawnY, "flamewitch-idle").setScale(0.9).setDepth(20);
      playCharacterAnimation(this.localSprite, appState.player?.characterId, "idle");
      this.localLabel = this.add.text(0, 0, "", { fontSize: "20px", color: "#ffffff" }).setDepth(21);
      this.portalGroup = this.add.group();
      this.portalTextGroup = this.add.group();
      this.interactText = this.add.text(420, 620, "", { fontSize: "22px", color: "#ffe1a1" }).setScrollFactor(0).setDepth(30);
      this.cameras.main.startFollow(this.localSprite, true, 0.12, 0.12);
      this.cameras.main.setDeadzone(220, 140);

      this.keys = this.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        altLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
        altRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        altUp: Phaser.Input.Keyboard.KeyCodes.UP,
        altDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
        interact: Phaser.Input.Keyboard.KeyCodes.E,
      });
      this.createMinimap();
      this.createHubSceneUi();

      this.lastSent = 0;
      this.lastSyncedState = null;

      // When the tab regains visibility, force a position resync next frame.
      // While the tab is hidden, the update loop is throttled or paused, so
      // other clients may have stale data for us.
      this.handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          this.lastSyncedState = null;
          this.lastSent = 0;
        }
      };
      document.addEventListener("visibilitychange", this.handleVisibilityChange);

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        document.removeEventListener("visibilitychange", this.handleVisibilityChange);
        this.remoteSprites.forEach((entry) => {
          if (entry.sprite?.active) {
            entry.sprite.destroy();
          }
          if (entry.label?.active) {
            entry.label.destroy();
          }
        });
        this.remoteSprites.clear();
        if (this.minimapGraphics?.active) {
          this.minimapGraphics.destroy();
        }
        if (this.onlineCountText?.active) {
          this.onlineCountText.destroy();
        }
        this.hubButtons.forEach((entry) => {
          if (entry.bg?.active) {
            entry.bg.destroy();
          }
          if (entry.label?.active) {
            entry.label.destroy();
          }
        });
        this.hubButtons = [];
        this.lobbyBrowserStatic.forEach((obj) => {
          if (obj?.active) {
            obj.destroy();
          }
        });
        this.lobbyBrowserStatic = [];
        this.lobbyBrowserEntries.forEach((entry) => {
          [entry.rowBg, entry.nameText, entry.metaText, entry.joinBg, entry.joinText].forEach((obj) => {
            if (obj?.active) {
              obj.destroy();
            }
          });
        });
        this.lobbyBrowserEntries = [];
      });
      this.refreshState();
      renderUi();
    }

    buildAstralBackdrop() {
      this.nebulaLayers = [];
      this.add.rectangle(this.worldWidth * 0.5, this.worldHeight * 0.5, this.worldWidth, this.worldHeight, 0x070916).setDepth(-20);
      this.add.rectangle(this.worldWidth * 0.5, this.worldHeight * 0.5, this.worldWidth, this.worldHeight, 0x130c26, 0.46).setDepth(-19);

      for (let index = 0; index < 26; index += 1) {
        const x = Phaser.Math.Between(120, this.worldWidth - 120);
        const y = Phaser.Math.Between(120, this.worldHeight - 120);
        const radius = Phaser.Math.Between(180, 460);
        const color = Phaser.Utils.Array.GetRandom([0x6f3cff, 0x2ab9ff, 0xff4fd8, 0x8a66ff]);
        const baseAlpha = Phaser.Math.FloatBetween(0.078, 0.165);
        const nebula = this.add.circle(x, y, radius, color, baseAlpha).setDepth(-18);
        nebula.setBlendMode(Phaser.BlendModes.ADD);
        const baseColor = Phaser.Display.Color.IntegerToColor(color);
        const subtleShiftColor = Phaser.Display.Color.GetColor(
          Phaser.Math.Clamp(baseColor.red + Phaser.Math.Between(-12, 12), 0, 255),
          Phaser.Math.Clamp(baseColor.green + Phaser.Math.Between(-12, 12), 0, 255),
          Phaser.Math.Clamp(baseColor.blue + Phaser.Math.Between(-12, 12), 0, 255),
        );
        this.nebulaLayers.push({
          shape: nebula,
          baseAlpha,
          phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
          speed: Phaser.Math.FloatBetween(0.78, 1.22),
          colorA: baseColor,
          colorB: Phaser.Display.Color.IntegerToColor(subtleShiftColor),
        });
      }

      for (let index = 0; index < 650; index += 1) {
        const x = Phaser.Math.Between(0, this.worldWidth);
        const y = Phaser.Math.Between(0, this.worldHeight);
        const radius = Phaser.Math.FloatBetween(0.7, 2.2);
        const alpha = Phaser.Math.FloatBetween(0.2, 0.74);
        const star = this.add.circle(x, y, radius, 0xe8f1ff, alpha).setDepth(-17);
        if (Math.random() < 0.48) {
          const lowAlpha = Math.max(0.08, alpha * Phaser.Math.FloatBetween(0.3, 0.55));
          const highAlpha = Math.min(0.95, alpha * Phaser.Math.FloatBetween(1.05, 1.45));
          this.tweens.add({
            targets: star,
            alpha: { from: lowAlpha, to: highAlpha },
            duration: Phaser.Math.Between(2600, 6200),
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
            delay: Phaser.Math.Between(0, 4200),
          });
        }
      }

      if (!this.textures.exists("hub-star")) {
        const star = this.make.graphics({ x: 0, y: 0, add: false });
        star.fillStyle(0xffffff, 1);
        star.fillCircle(4, 4, 4);
        star.generateTexture("hub-star", 8, 8);
        star.destroy();
      }
      if (!this.textures.exists("hub-streak")) {
        const streak = this.make.graphics({ x: 0, y: 0, add: false });
        streak.fillStyle(0xf7fbff, 1);
        streak.fillRect(0, 2, 28, 2);
        streak.generateTexture("hub-streak", 28, 6);
        streak.destroy();
      }

      this.astralDust = this.add.particles(0, 0, "hub-star", {
        x: { min: 0, max: this.worldWidth },
        y: { min: 0, max: this.worldHeight },
        speedX: { min: -12, max: 12 },
        speedY: { min: -8, max: 8 },
        lifespan: { min: 5000, max: 11000 },
        scale: { start: 0.6, end: 0.08 },
        alpha: { start: 0.75, end: 0 },
        quantity: 1,
        frequency: 85,
        blendMode: Phaser.BlendModes.ADD,
      });
      this.astralDust.setDepth(-16);

      this.shootingStars = this.add.particles(0, 0, "hub-streak", {
        x: { min: -80, max: this.worldWidth * 0.7 },
        y: { min: -120, max: this.worldHeight * 0.48 },
        speedX: { min: 300, max: 520 },
        speedY: { min: 150, max: 300 },
        lifespan: { min: 650, max: 1050 },
        scale: { start: 0.55, end: 0.12 },
        alpha: { start: 0.36, end: 0 },
        rotate: { min: 22, max: 34 },
        quantity: 1,
        frequency: 2100,
        blendMode: Phaser.BlendModes.ADD,
      });
      this.shootingStars.setDepth(-15);
    }

    updateNebulaBackdrop(time) {
      if (!this.nebulaLayers.length) {
        return;
      }
      this.nebulaLayers.forEach((layer) => {
        if (!layer.shape?.active) {
          return;
        }
        const pulse = (Math.sin(time * 0.00018 * layer.speed + layer.phase) + 1) * 0.5;
        const alpha = layer.baseAlpha * (0.92 + pulse * 0.16);
        const mix = (Math.sin(time * 0.0001 * layer.speed + layer.phase * 0.73) + 1) * 0.5;
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(layer.colorA, layer.colorB, 100, mix * 100);
        layer.shape.setFillStyle(Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b), alpha);
      });
    }

    createMinimap() {
      this.minimapGraphics = this.add.graphics().setScrollFactor(0).setDepth(35);
      this.drawMinimap();
    }

    createSceneButton(centerX, centerY, width, label, onClick) {
      const bg = this.add
        .rectangle(centerX, centerY, width, 44, 0x102643, 0.74)
        .setScrollFactor(0)
        .setDepth(36)
        .setStrokeStyle(2, 0xa6cbff, 0.68)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(centerX, centerY, label, {
          fontSize: "20px",
          color: "#f1f6ff",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(37)
        .setInteractive({ useHandCursor: true });

      const clickHandler = () => {
        onClick();
      };
      const sfxHoverTarget = {};
      [bg, text].forEach((target) => {
        bindPhaserUiSfx(target, undefined, sfxHoverTarget);
        target.on("pointerdown", clickHandler);
        target.on("pointerover", () => bg.setFillStyle(0x17406d, 0.82));
        target.on("pointerout", () => bg.setFillStyle(0x102643, 0.74));
      });
      const button = { bg, label: text };
      this.hubButtons.push(button);
      return button;
    }

    createHubSceneUi() {
      this.onlineCountText = this.add
        .text(0, 0, "", {
          fontSize: "20px",
          color: "#d8e6ff",
          stroke: "#0a1020",
          strokeThickness: 4,
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(36);

      const y = this.scale.height - 34;
      const createButton = this.createSceneButton(this.scale.width * 0.5 - 130, y, 190, "Create Lobby", () => {
        promptCreateLobby();
      });
      const browseButton = this.createSceneButton(this.scale.width * 0.5 + 130, y, 230, "Browse Lobbies", () => {
        this.setLobbyBrowserVisible(!this.lobbyBrowserVisible);
      });
      createButton.bg.setDepth(38);
      createButton.label.setDepth(39);
      browseButton.bg.setDepth(38);
      browseButton.label.setDepth(39);

      const panelX = this.scale.width * 0.5;
      const panelY = this.scale.height * 0.5 + 12;
      const panelW = 620;
      const panelH = 360;
      const backdrop = this.add
        .rectangle(panelX, panelY, panelW, panelH, 0x0a1428, 0.92)
        .setScrollFactor(0)
        .setDepth(41)
        .setStrokeStyle(2, 0xa9c6ff, 0.7);
      const title = this.add
        .text(panelX - panelW * 0.5 + 24, panelY - panelH * 0.5 + 20, "Active Lobbies", {
          fontSize: "30px",
          color: "#eef4ff",
          fontStyle: "bold",
        })
        .setScrollFactor(0)
        .setDepth(42);
      const closeBg = this.add
        .rectangle(panelX + panelW * 0.5 - 28, panelY - panelH * 0.5 + 30, 34, 34, 0x243856, 0.9)
        .setScrollFactor(0)
        .setDepth(42)
        .setStrokeStyle(2, 0xcadfff, 0.66)
        .setInteractive({ useHandCursor: true });
      const closeText = this.add
        .text(panelX + panelW * 0.5 - 28, panelY - panelH * 0.5 + 30, "X", {
          fontSize: "18px",
          color: "#f3f7ff",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(43)
        .setInteractive({ useHandCursor: true });

      const closeSfxHoverTarget = {};
      [closeBg, closeText].forEach((target) => {
        bindPhaserUiSfx(target, undefined, closeSfxHoverTarget);
        target.on("pointerdown", () => this.setLobbyBrowserVisible(false));
        target.on("pointerover", () => closeBg.setFillStyle(0x365079, 0.94));
        target.on("pointerout", () => closeBg.setFillStyle(0x243856, 0.9));
      });

      this.lobbyBrowserStatic = [backdrop, title, closeBg, closeText];
      this.setLobbyBrowserVisible(false);
      this.rebuildLobbyBrowserList();
    }

    setLobbyBrowserVisible(visible) {
      this.lobbyBrowserVisible = visible;
      this.lobbyBrowserStatic.forEach((obj) => obj.setVisible(visible));
      this.lobbyBrowserEntries.forEach((entry) => {
        [entry.rowBg, entry.nameText, entry.metaText, entry.joinBg, entry.joinText].forEach((obj) => obj.setVisible(visible));
      });
    }

    rebuildLobbyBrowserList() {
      const lobbies = appState.hubState?.lobbies || [];
      const lobbySignature = JSON.stringify(
        lobbies.slice(0, 5).map((lobby) => [lobby.id, lobby.name, lobby.playerCount, lobby.passwordProtected]),
      );
      if (lobbySignature === this.lobbyBrowserSignature) {
        return;
      }
      this.lobbyBrowserSignature = lobbySignature;

      this.lobbyBrowserEntries.forEach((entry) => {
        [entry.rowBg, entry.nameText, entry.metaText, entry.joinBg, entry.joinText].forEach((obj) => {
          if (obj?.active) {
            obj.destroy();
          }
        });
      });
      this.lobbyBrowserEntries = [];

      const panelX = this.scale.width * 0.5;
      const panelY = this.scale.height * 0.5 + 12;
      const panelW = 620;
      const panelH = 360;
      const listStartY = panelY - panelH * 0.5 + 84;
      const rowHeight = 72;

      if (!lobbies.length) {
        const emptyText = this.add
          .text(panelX - panelW * 0.5 + 24, listStartY + 16, "No active lobbies right now.", {
            fontSize: "22px",
            color: "#d5e3ff",
          })
          .setScrollFactor(0)
          .setDepth(42)
          .setVisible(this.lobbyBrowserVisible);
        this.lobbyBrowserEntries.push({
          rowBg: emptyText,
          nameText: this.add.zone(0, 0, 0, 0).setVisible(false),
          metaText: this.add.zone(0, 0, 0, 0).setVisible(false),
          joinBg: this.add.zone(0, 0, 0, 0).setVisible(false),
          joinText: this.add.zone(0, 0, 0, 0).setVisible(false),
        });
        return;
      }

      lobbies.slice(0, 5).forEach((lobby, index) => {
        const rowY = listStartY + index * rowHeight;
        const rowBg = this.add
          .rectangle(panelX, rowY + 24, panelW - 46, 60, 0x162846, 0.78)
          .setScrollFactor(0)
          .setDepth(42)
          .setStrokeStyle(1, 0x8fb2e6, 0.5)
          .setVisible(this.lobbyBrowserVisible);
        const nameText = this.add
          .text(panelX - panelW * 0.5 + 28, rowY + 4, lobby.name, {
            fontSize: "21px",
            color: "#f1f6ff",
            fontStyle: "bold",
          })
          .setScrollFactor(0)
          .setDepth(43)
          .setVisible(this.lobbyBrowserVisible);
        const metaText = this.add
          .text(panelX - panelW * 0.5 + 28, rowY + 32, `${lobby.playerCount}/4 players${lobby.passwordProtected ? " | Password" : ""}`, {
            fontSize: "16px",
            color: "#bed0ee",
          })
          .setScrollFactor(0)
          .setDepth(43)
          .setVisible(this.lobbyBrowserVisible);
        const joinBg = this.add
          .rectangle(panelX + panelW * 0.5 - 92, rowY + 24, 120, 36, 0x335f96, 0.9)
          .setScrollFactor(0)
          .setDepth(43)
          .setStrokeStyle(1, 0xcfe2ff, 0.7)
          .setInteractive({ useHandCursor: true })
          .setVisible(this.lobbyBrowserVisible);
        const joinText = this.add
          .text(panelX + panelW * 0.5 - 92, rowY + 24, "Join", {
            fontSize: "18px",
            color: "#f7fbff",
            fontStyle: "bold",
          })
          .setOrigin(0.5, 0.5)
          .setScrollFactor(0)
          .setDepth(44)
          .setInteractive({ useHandCursor: true })
          .setVisible(this.lobbyBrowserVisible);

        const joinHandler = () => {
          this.setLobbyBrowserVisible(false);
          promptJoinLobby(lobby.id);
        };
        const joinSfxHoverTarget = {};
        [joinBg, joinText].forEach((target) => {
          bindPhaserUiSfx(target, undefined, joinSfxHoverTarget);
          target.on("pointerdown", joinHandler);
          target.on("pointerover", () => joinBg.setFillStyle(0x4b77af, 0.94));
          target.on("pointerout", () => joinBg.setFillStyle(0x335f96, 0.9));
        });
        this.lobbyBrowserEntries.push({ rowBg, nameText, metaText, joinBg, joinText });
      });
    }

    getPortalEntries() {
      const portalBaseX = this.worldWidth * 0.5;
      const portalBaseY = this.worldHeight * 0.55;
      const entries = [
        { id: "create", label: "Create Lobby", x: portalBaseX - 280, y: portalBaseY, kind: "create" },
        ...((appState.hubState?.lobbies || []).slice(0, 3).map((lobby, index) => ({
          id: lobby.id,
          label: `${lobby.name}\n${lobby.playerCount}/4`,
          x: portalBaseX + index * 220,
          y: portalBaseY,
          kind: "join",
          lobbyId: lobby.id,
        }))),
        {
          id: "vibejam-return",
          label: appState.vibeJamInboundRefNormalized
            ? "Inbound portal\n(Vibe Jam — return)"
            : "Inbound portal",
          x: VIBE_JAM_RETURN_PORTAL_POS.x,
          y: VIBE_JAM_RETURN_PORTAL_POS.y,
          kind: "vibejam-return",
        },
        {
          id: "vibejam-exit",
          label: "Vibe Jam Portal\nNext game",
          x: VIBE_JAM_EXIT_PORTAL_POS.x,
          y: VIBE_JAM_EXIT_PORTAL_POS.y,
          kind: "vibejam-exit",
        },
      ];
      return entries;
    }

    drawMinimap() {
      if (!this.minimapGraphics || !this.minimapGraphics.active) {
        return;
      }
      const width = this.scale.width;
      const minimapWidth = 230;
      const minimapHeight = 146;
      const margin = 32;
      const panelX = width - minimapWidth - margin;
      const panelY = margin;
      const innerPadding = 11;
      const mapX = panelX + innerPadding;
      const mapY = panelY + innerPadding;
      const mapWidth = minimapWidth - innerPadding * 2;
      const mapHeight = minimapHeight - innerPadding * 2;
      const scaleX = mapWidth / this.worldWidth;
      const scaleY = mapHeight / this.worldHeight;
      if (this.onlineCountText?.active) {
        const playersOnline = appState.hubState?.players?.length || 0;
        this.onlineCountText.setText(`Online in hub: ${playersOnline}`).setPosition(panelX + minimapWidth, panelY - 22);
      }

      this.minimapGraphics.clear();
      this.minimapGraphics.fillStyle(0x091223, 0.45);
      this.minimapGraphics.fillRoundedRect(panelX, panelY, minimapWidth, minimapHeight, 10);
      this.minimapGraphics.lineStyle(2, 0xb7d3ff, 0.5);
      this.minimapGraphics.strokeRoundedRect(panelX, panelY, minimapWidth, minimapHeight, 10);

      this.minimapGraphics.fillStyle(0x030712, 0.62);
      this.minimapGraphics.fillRect(mapX, mapY, mapWidth, mapHeight);
      this.minimapGraphics.lineStyle(1, 0x89a7dd, 0.45);
      this.minimapGraphics.strokeRect(mapX, mapY, mapWidth, mapHeight);

      const players = appState.hubState?.players || [];
      players.forEach((entry) => {
        if (entry.id === appState.player?.id) {
          return;
        }
        const px = mapX + Phaser.Math.Clamp(entry.x, 0, this.worldWidth) * scaleX;
        const py = mapY + Phaser.Math.Clamp(entry.y, 0, this.worldHeight) * scaleY;
        this.minimapGraphics.fillStyle(0xb7c9ff, 0.8);
        this.minimapGraphics.fillCircle(px, py, 2.6);
      });
      const localPlayer = appState.player;
      if (localPlayer) {
        const localX = mapX + Phaser.Math.Clamp(localPlayer.x, 0, this.worldWidth) * scaleX;
        const localY = mapY + Phaser.Math.Clamp(localPlayer.y, 0, this.worldHeight) * scaleY;
        this.minimapGraphics.fillStyle(0xffed98, 0.98);
        this.minimapGraphics.fillCircle(localX, localY, 3.6);
      }

      this.portals.forEach((portal) => {
        const px = mapX + portal.x * scaleX;
        const py = mapY + portal.y * scaleY;
        let dot = 0xcf9fff;
        if (portal.kind === "create") {
          dot = 0x67d2ff;
        } else if (portal.kind === "vibejam-exit") {
          dot = VIBE_JAM_EXIT_GLOW;
        } else if (portal.kind === "vibejam-return") {
          dot = appState.vibeJamInboundRefNormalized ? VIBE_JAM_RETURN_GLOW : 0x5a8a82;
        }
        this.minimapGraphics.fillStyle(dot, 0.9);
        this.minimapGraphics.fillCircle(px, py, 3);
      });

      const camera = this.cameras.main;
      const camX = mapX + Phaser.Math.Clamp(camera.worldView.x, 0, this.worldWidth) * scaleX;
      const camY = mapY + Phaser.Math.Clamp(camera.worldView.y, 0, this.worldHeight) * scaleY;
      const camW = Phaser.Math.Clamp(camera.worldView.width * scaleX, 8, mapWidth);
      const camH = Phaser.Math.Clamp(camera.worldView.height * scaleY, 8, mapHeight);
      this.minimapGraphics.lineStyle(1.5, 0xffffff, 0.8);
      this.minimapGraphics.strokeRect(camX, camY, camW, camH);
    }

    refreshState() {
      const player = appState.player;
      if (player) {
        applyCharacterSpriteVisuals(this.localSprite, player.characterId);
        this.localSprite.setPosition(player.x, player.y).setFlipX(shouldFlipCharacterSprite(player.characterId, player.facing));
        this.localLabel.setText(player.nickname || "").setPosition(player.x - 24, player.y - 116);
      }

      const seenRemoteIds = new Set();
      (appState.hubState?.players || []).forEach((hubPlayer) => {
        if (hubPlayer.id === appState.player?.id) {
          return;
        }
        seenRemoteIds.add(hubPlayer.id);

        const existing = this.remoteSprites.get(hubPlayer.id);
        if (existing) {
          existing.targetX = hubPlayer.x;
          existing.targetY = hubPlayer.y;
          existing.facing = hubPlayer.facing;
          existing.characterId = hubPlayer.characterId;
          existing.nickname = hubPlayer.nickname;
          applyCharacterSpriteVisuals(existing.sprite, hubPlayer.characterId);
          existing.label.setText(hubPlayer.nickname);

          // Browsers throttle requestAnimationFrame for unfocused windows, which
          // means our update()-loop interpolation can run at <1fps while socket
          // events still fire at full speed. To keep remote players from looking
          // frozen in those windows, we apply position updates here in the socket
          // handler too. We snap when the sprite is significantly behind its
          // new target (so an unfocused window catches up immediately on the
          // next hubState), and otherwise nudge the sprite forward so it never
          // stalls indefinitely even if update() is barely running.
          const dx = existing.targetX - existing.sprite.x;
          const dy = existing.targetY - existing.sprite.y;
          const drift = Math.hypot(dx, dy);
          if (drift > 64) {
            existing.sprite.setPosition(existing.targetX, existing.targetY);
            existing.label.setPosition(existing.targetX - 24, existing.targetY - 116);
            existing.sprite.setFlipX(shouldFlipCharacterSprite(existing.characterId, existing.facing));
          } else if (drift > 1) {
            const stepX = existing.sprite.x + dx * 0.5;
            const stepY = existing.sprite.y + dy * 0.5;
            existing.sprite.setPosition(stepX, stepY);
            existing.label.setPosition(stepX - 24, stepY - 116);
            existing.sprite.setFlipX(shouldFlipCharacterSprite(existing.characterId, existing.facing));
          }
          return;
        }

        const sprite = this.add.sprite(hubPlayer.x, hubPlayer.y, "flamewitch-idle").setScale(0.9).setDepth(20);
        playCharacterAnimation(sprite, hubPlayer.characterId, "idle");
        sprite.setFlipX(shouldFlipCharacterSprite(hubPlayer.characterId, hubPlayer.facing));
        const label = this.add.text(hubPlayer.x - 24, hubPlayer.y - 116, hubPlayer.nickname, {
          fontSize: "18px",
          color: "#fff",
        }).setDepth(21);
        this.remoteSprites.set(hubPlayer.id, {
          sprite,
          label,
          targetX: hubPlayer.x,
          targetY: hubPlayer.y,
          facing: hubPlayer.facing,
          characterId: hubPlayer.characterId,
          nickname: hubPlayer.nickname,
        });
      });

      this.remoteSprites.forEach((entry, remoteId) => {
        if (seenRemoteIds.has(remoteId)) {
          return;
        }
        entry.sprite.destroy();
        entry.label.destroy();
        this.remoteSprites.delete(remoteId);
      });

      const portalEntries = this.getPortalEntries();
      const portalSignature = JSON.stringify(
        portalEntries.map((entry) => [entry.id, entry.label, entry.x, entry.y, entry.kind, entry.lobbyId || ""]),
      );
      if (portalSignature !== this.portalSignature) {
        this.portalSignature = portalSignature;
        this.portalGroup.clear(true, true);
        this.portalTextGroup.clear(true, true);
        this.portals = [];

        const hasInboundReturnRef = Boolean(appState.vibeJamInboundRefNormalized);
        portalEntries.forEach((entry) => {
          let glowColor = 0xc28fff;
          let portalScale = entry.kind === "create" ? 0.86 : 0.76;
          let glowFillAlpha = 0.22;
          if (entry.kind === "create") {
            glowColor = 0x50b1ff;
          } else if (entry.kind === "join") {
            glowColor = 0xc28fff;
          } else if (entry.kind === "vibejam-exit") {
            glowColor = VIBE_JAM_EXIT_GLOW;
            portalScale = 0.8;
          } else if (entry.kind === "vibejam-return") {
            glowColor = VIBE_JAM_RETURN_GLOW;
            portalScale = hasInboundReturnRef ? 0.8 : 0.72;
            if (!hasInboundReturnRef) {
              glowFillAlpha = 0.11;
            }
          }
          const glow = this.add.circle(entry.x, entry.y, 62, glowColor, glowFillAlpha);
          const portal = this.add
            .sprite(entry.x, entry.y, FOREST_PORTAL_ANIMATION.key)
            .setDepth(14)
            .setScale(portalScale);
          glow.setDepth(13);
          glow.setBlendMode(Phaser.BlendModes.ADD);
          portal.play(FOREST_PORTAL_ANIMATION.animKey);
          if (entry.kind === "join") {
            portal.setTint(0xdcb8ff);
          } else if (entry.kind === "vibejam-exit") {
            portal.setTint(VIBE_JAM_EXIT_PORTAL_TINT);
          } else if (entry.kind === "vibejam-return") {
            portal.setTint(VIBE_JAM_RETURN_PORTAL_TINT);
            if (!hasInboundReturnRef) {
              portal.setAlpha(0.55);
            }
          } else {
            portal.clearTint();
          }
          const text = this.add.text(entry.x - 74, entry.y + 62, entry.label, {
            align: "center",
            fontSize: "18px",
            color: "#fff",
            wordWrap: { width: 150 },
          }).setDepth(14);
          const tweenDelay =
            entry.kind === "create"
              ? 100
              : entry.kind === "join"
                ? 300 + (entry.x % 4) * 120
                : 400 + (entry.x % 4) * 90;
          this.tweens.add({
            targets: glow,
            alpha: { from: 0.14, to: 0.45 },
            scale: { from: 0.88, to: 1.26 },
            duration: 1450,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
            delay: tweenDelay,
          });
          this.portalGroup.addMultiple([glow, portal]);
          this.portalTextGroup.add(text);
          this.portals.push({ ...entry, glow, sprite: portal, text });
        });
      }

      if (appState.autoJoinLobbyId) {
        const inviteLobby = (appState.hubState?.lobbies || []).find((lobby) => lobby.id === appState.autoJoinLobbyId);
        if (inviteLobby) {
          promptJoinLobby(inviteLobby.id);
          appState.autoJoinLobbyId = null;
        }
      }
      this.rebuildLobbyBrowserList();
      this.drawMinimap();
    }

    ensurePortalVisuals() {
      if (!this.portals.length) {
        return;
      }
      const needsRebuild = this.portals.some((portal) => !portal.sprite?.active || !portal.glow?.active || !portal.text?.active);
      if (needsRebuild) {
        this.portalSignature = "";
        this.refreshState();
        return;
      }
      this.portals.forEach((portal) => {
        portal.glow.setVisible(true);
        portal.text.setVisible(true);
        portal.sprite.setVisible(true).setAlpha(1);
        if (!portal.sprite.anims?.isPlaying || portal.sprite.anims.currentAnim?.key !== FOREST_PORTAL_ANIMATION.animKey) {
          portal.sprite.play(FOREST_PORTAL_ANIMATION.animKey, true);
        }
        const kind = portal.kind;
        if (kind === "join") {
          portal.sprite.setTint(0xdcb8ff);
        } else if (kind === "vibejam-exit") {
          portal.sprite.setTint(VIBE_JAM_EXIT_PORTAL_TINT);
        } else if (kind === "vibejam-return") {
          portal.sprite.setTint(VIBE_JAM_RETURN_PORTAL_TINT);
          portal.sprite.setAlpha(appState.vibeJamInboundRefNormalized ? 1 : 0.55);
        } else {
          portal.sprite.clearTint();
        }
      });
    }

    update(time, delta) {
      const player = appState.player;
      if (!player) {
        return;
      }
      if (!this.localSprite?.active || !this.localLabel?.active || !this.keys) {
        return;
      }

      const moveLeft = this.keys.left.isDown || this.keys.altLeft.isDown;
      const moveRight = this.keys.right.isDown || this.keys.altRight.isDown;
      const moveUp = this.keys.up.isDown || this.keys.altUp.isDown;
      const moveDown = this.keys.down.isDown || this.keys.altDown.isDown;
      const moveX = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
      const moveY = (moveDown ? 1 : 0) - (moveUp ? 1 : 0);

      if (moveX !== 0 || moveY !== 0) {
        const magnitude = Math.hypot(moveX, moveY) || 1;
        const speedX = moveX / magnitude;
        const speedY = moveY / magnitude;
        player.x = Phaser.Math.Clamp(player.x + speedX * delta * 0.28, 48, this.worldWidth - 48);
        player.y = Phaser.Math.Clamp(player.y + speedY * delta * 0.28, 64, this.worldHeight - 64);
        if (moveX !== 0) {
          player.facing = moveX;
        }
        playCharacterAnimation(this.localSprite, player.characterId, "walk");
      } else {
        const localProfile = getCharacterVisualProfile(player.characterId);
        if (this.localSprite.anims?.currentAnim?.key !== localProfile.idleAnim) {
          playCharacterAnimation(this.localSprite, player.characterId, "idle");
        }
      }

      this.localSprite.setPosition(player.x, player.y).setFlipX(shouldFlipCharacterSprite(player.characterId, player.facing));
      this.localLabel.setPosition(player.x - 24, player.y - 116);

      // Frame-rate independent smoothing: target ~85% closure over 100ms regardless of fps.
      const smoothing = 1 - Math.pow(1 - 0.2, Math.max(1, delta) / 16.6667);

      this.remoteSprites.forEach((entry, remoteId) => {
        if (!entry?.sprite || !entry.sprite.active || !entry?.label || !entry.label.active) {
          this.remoteSprites.delete(remoteId);
          return;
        }

        // Snap when a remote sprite has drifted far from its latest server position
        // (e.g. they were off-screen for a while or just teleported).
        const distanceToTarget = Phaser.Math.Distance.Between(entry.sprite.x, entry.sprite.y, entry.targetX, entry.targetY);
        if (distanceToTarget > 96) {
          entry.sprite.setPosition(entry.targetX, entry.targetY);
        }

        // Always interpolate the sprite to its authoritative server position.
        // We deliberately do NOT toggle setVisible() here: Phaser's camera will
        // naturally not render anything outside its viewport, so the sprite
        // walks smoothly off the screen edge and back on. Explicit visibility
        // gating caused the sprite to pop out before it actually reached the
        // edge (the sprite always lags slightly behind its target while lerping)
        // which read as "stuck on the edge".
        const nextX = Phaser.Math.Linear(entry.sprite.x, entry.targetX, smoothing);
        const nextY = Phaser.Math.Linear(entry.sprite.y, entry.targetY, smoothing);
        entry.sprite.setPosition(nextX, nextY).setFlipX(shouldFlipCharacterSprite(entry.characterId, entry.facing));
        entry.label.setPosition(nextX - 24, nextY - 116);
        if (!entry.sprite.visible) {
          entry.sprite.setVisible(true);
        }
        if (!entry.label.visible) {
          entry.label.setVisible(true);
        }

        const isMoving = Math.abs(entry.targetX - nextX) > 2 || Math.abs(entry.targetY - nextY) > 2;
        const profile = getCharacterVisualProfile(entry.characterId);
        const wantedAnim = isMoving ? profile.walkAnim : profile.idleAnim;
        const wantedAnimType = isMoving ? "walk" : "idle";
        if (entry.sprite.anims && entry.sprite.anims.currentAnim?.key !== wantedAnim) {
          playCharacterAnimation(entry.sprite, entry.characterId, wantedAnimType);
        } else {
          applyCharacterSpriteVisuals(entry.sprite, entry.characterId);
          applyAnimationYOffset(entry.sprite, profile, wantedAnimType);
        }
      });

      const nextSyncState = { x: Math.round(player.x), y: Math.round(player.y), facing: player.facing };
      const positionChanged =
        !this.lastSyncedState ||
        this.lastSyncedState.x !== nextSyncState.x ||
        this.lastSyncedState.y !== nextSyncState.y ||
        this.lastSyncedState.facing !== nextSyncState.facing;

      // Heartbeat: even when the player is standing still, re-send the position
      // every ~1.5s so a single dropped packet, a sessionState replacing
      // appState.player, or a tab refocus can never leave other clients with a
      // stale position for us indefinitely.
      const sinceLastSent = time - this.lastSent;
      const heartbeatDue = sinceLastSent > 1500;
      const moveThrottleReady = sinceLastSent > 50;

      if ((positionChanged && moveThrottleReady) || heartbeatDue) {
        this.lastSent = time;
        this.lastSyncedState = nextSyncState;
        emit("updateHubMovement", nextSyncState);
      }

      this.ensurePortalVisuals();
      const nearestInRange = this.portals.find(
        (portal) => Phaser.Math.Distance.Between(player.x, player.y, portal.x, portal.y) < 92,
      );
      let interactLabel = "";
      let nearestInteractable = null;
      if (nearestInRange) {
        if (nearestInRange.kind === "vibejam-return" && appState.vibeJamInboundRefNormalized && Date.now() < this.vibeJamReturnPortalReadyAt) {
          interactLabel = "Return portal stabilizing…";
        } else {
          nearestInteractable = nearestInRange;
          if (nearestInRange.kind === "create") {
            interactLabel = "Press E to create this lobby.";
          } else if (nearestInRange.kind === "join") {
            interactLabel = "Press E to join this lobby.";
          } else if (nearestInRange.kind === "vibejam-exit") {
            interactLabel = "Press E to open the Vibe Jam portal.";
          } else if (nearestInRange.kind === "vibejam-return") {
            if (!appState.vibeJamInboundRefNormalized) {
              interactLabel = "Inbound portal — open this game from another jam game.";
            } else {
              interactLabel = "Press E to use the inbound portal (return).";
            }
          }
        }
      }
      this.interactText.setText(interactLabel);

      if (Phaser.Input.Keyboard.JustDown(this.keys.interact) && nearestInteractable) {
        if (nearestInteractable.kind === "create") {
          promptCreateLobby();
        } else if (nearestInteractable.lobbyId) {
          promptJoinLobby(nearestInteractable.lobbyId);
        } else if (nearestInteractable.kind === "vibejam-exit") {
          window.location.assign(buildVibeJamExitPortalUrl());
        } else if (nearestInteractable.kind === "vibejam-return") {
          const back = buildVibeJamReturnPortalUrl();
          if (back) {
            window.location.assign(back);
          } else {
            showToast("Arrive here with ?portal=true&ref=… from another Vibe Jam game to unlock return.", "info");
          }
        }
      }

      this.updateNebulaBackdrop(time);
      this.drawMinimap();
    }
  }

  class LobbyScene extends Phaser.Scene {
    constructor() {
      super("LobbyScene");
    }

    create() {
      playSceneFadeIn(this);
      this.createAnimatedBackground();
      this.add.rectangle(640, 360, 1280, 720, 0x07121f, 0.26).setDepth(-10);
      this.createStumpLighting();
      this.partySprites = [];
      this.refreshState();
      renderUi();
    }

    createAnimatedBackground() {
      const firstFrameKey = getLobbyBackgroundFrameKey(1);
      const hasFirstFrame = this.textures.exists(firstFrameKey);
      if (hasAllLobbyAnimatedFrames(this) && !this.anims.exists(LOBBY_BACKGROUND_ANIMATION.animKey)) {
        this.anims.create({
          key: LOBBY_BACKGROUND_ANIMATION.animKey,
          frames: Array.from({ length: LOBBY_BACKGROUND_ANIMATION.frameCount }, (_, index) => ({
            key: getLobbyBackgroundFrameKey(index + 1),
          })),
          frameRate: LOBBY_BACKGROUND_ANIMATION.frameRate,
          repeat: -1,
          yoyo: true,
        });
      }

      const textureKey = hasFirstFrame ? firstFrameKey : LOBBY_BACKGROUND.key;
      const background = hasFirstFrame
        ? this.add.sprite(640, 360, textureKey).setDepth(-20)
        : this.add.image(640, 360, textureKey).setDepth(-20);
      const sourceImage = this.textures.get(textureKey)?.getSourceImage();
      const sourceWidth = sourceImage?.width || 1280;
      const sourceHeight = sourceImage?.height || 720;
      background.setScale(Math.max(1280 / sourceWidth, 720 / sourceHeight));

      if (hasFirstFrame && this.anims.exists(LOBBY_BACKGROUND_ANIMATION.animKey)) {
        background.play(LOBBY_BACKGROUND_ANIMATION.animKey);
      }
      this.lobbyBackgroundDisplay = background;
    }

    recreateAnimatedBackground() {
      if (this.lobbyBackgroundDisplay) {
        this.lobbyBackgroundDisplay.destroy();
        this.lobbyBackgroundDisplay = null;
      }
      this.createAnimatedBackground();
    }

    createStumpLighting() {
      LOBBY_STUMP_SLOTS.forEach((slot, index) => {
        const beam = this.add
          .polygon(
            slot.x,
            250,
            [
              -slot.beamWidth * 0.28,
              -260,
              slot.beamWidth * 0.28,
              -260,
              slot.beamWidth * 0.5,
              170,
              -slot.beamWidth * 0.5,
              170,
            ],
            0xfff1a8,
            0.12,
          )
          .setDepth(-8)
          .setBlendMode(Phaser.BlendModes.ADD);
        beam.setAngle(slot.beamTopX < slot.x ? -2 : 2);

        const glow = this.add
          .ellipse(slot.x, slot.footY + 8, 158, 46, 0xffe8a3, 0.16)
          .setDepth(-7)
          .setBlendMode(Phaser.BlendModes.ADD);

        this.tweens.add({
          targets: [beam, glow],
          alpha: { from: 0.09, to: 0.2 },
          duration: 2200 + index * 180,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      });
    }

    refreshState() {
      this.partySprites.forEach((entry) => {
        entry.sprite.destroy();
        entry.label.destroy();
        entry.controls?.forEach((control) => control.destroy());
      });
      this.partySprites = [];

      const lobby = appState.lobbyState?.lobby;
      (lobby?.players || []).forEach((member, index) => {
        const slot = LOBBY_STUMP_SLOTS[index] || LOBBY_STUMP_SLOTS[LOBBY_STUMP_SLOTS.length - 1];
        const character = getCharacterDefinition(member.characterId);
        const sprite = this.add.sprite(slot.x, slot.footY, "flamewitch-idle").setScale(1).setDepth(10);
        playCharacterAnimation(sprite, member.characterId, "idle");
        sprite.setFlipX(shouldFlipCharacterSprite(member.characterId, 1));
        sprite.setOrigin(0.5, 1);
        const label = this.add
          .text(slot.x, slot.labelY, `${character.name}\n${member.nickname}\n${member.ready ? "Ready" : "Waiting"}`, {
            align: "center",
            fontSize: "22px",
            color: member.ready ? "#90ffba" : "#d4e3f5",
          })
          .setOrigin(0.5, 0)
          .setDepth(11);
        const controls = [];
        if (member.id === appState.player?.id) {
          [
            { delta: -1, label: "<", x: slot.x - 104 },
            { delta: 1, label: ">", x: slot.x + 104 },
          ].forEach((control) => {
            const circle = this.add
              .circle(control.x, slot.footY - 112, 24, 0x13243a, 0.82)
              .setStrokeStyle(2, 0xffffff, 0.5)
              .setDepth(12)
              .setInteractive({ useHandCursor: true });
            const arrow = this.add
              .text(control.x, slot.footY - 112, control.label, {
                fontSize: "30px",
                color: "#ffffff",
                fontStyle: "bold",
              })
              .setOrigin(0.5)
              .setDepth(13);
            bindPhaserUiSfx(circle);
            circle.on("pointerdown", () => cycleLobbyCharacter(control.delta));
            controls.push(circle, arrow);
          });
        }
        this.partySprites.push({ sprite, label, controls });
      });
    }
  }

  function getUiSfxElement(kind) {
    const soundFile = UI_SFX_FILES[kind];
    if (!soundFile || uiSfxState.missingFiles.has(soundFile)) {
      return null;
    }
    if (uiSfxState.elements[kind]) {
      return uiSfxState.elements[kind];
    }
    const audio = new Audio(`${UI_SFX_BASE_PATH}/${encodeURIComponent(soundFile)}`);
    audio.preload = "auto";
    audio.addEventListener("error", () => {
      uiSfxState.missingFiles.add(soundFile);
    }, { once: true });
    uiSfxState.elements[kind] = audio;
    return audio;
  }

  function preloadUiSfx() {
    Object.keys(UI_SFX_FILES).forEach((kind) => {
      getUiSfxElement(kind);
    });
  }

  function playUiSfx(kind) {
    if (attackSfxState.volume <= 0) {
      return;
    }
    const source = getUiSfxElement(kind);
    if (!source) {
      return;
    }
    const audio = source.cloneNode();
    audio.volume = UI_SFX_BASE_VOLUME * attackSfxState.volume;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        if (err?.name === "NotAllowedError" && !uiSfxState.warnedAutoplay) {
          uiSfxState.warnedAutoplay = true;
          console.warn("[sfx] UI sound blocked until the next user gesture", err);
        } else if (err?.name === "NotSupportedError") {
          uiSfxState.missingFiles.add(UI_SFX_FILES[kind]);
        }
      });
    }
  }

  function suppressUiHoverSfxAfterClick() {
    uiSfxState.suppressHoverUntil = performance.now() + UI_SFX_POST_CLICK_HOVER_SUPPRESS_MS;
  }

  function canPlayUiHoverSfx() {
    return performance.now() >= uiSfxState.suppressHoverUntil;
  }

  function playUiHoverSfx() {
    if (!canPlayUiHoverSfx()) {
      return;
    }
    playUiSfx("hover");
  }

  function playUiClickSfx() {
    suppressUiHoverSfxAfterClick();
    playUiSfx("click");
  }

  function isUiSfxTargetEnabled(element) {
    if (!element) {
      return false;
    }
    const button = element.closest("button");
    if (button?.disabled) {
      return false;
    }
    if (element.getAttribute("aria-disabled") === "true" || element.closest("[aria-disabled='true']")) {
      return false;
    }
    return true;
  }

  function getUiSfxDomTarget(rawTarget) {
    if (!(rawTarget instanceof Element)) {
      return null;
    }
    const element = rawTarget.closest(UI_SFX_INTERACTIVE_SELECTOR);
    if (!element || !document.documentElement.contains(element) || !isUiSfxTargetEnabled(element)) {
      return null;
    }
    return element;
  }

  function initUiSfxInteractions() {
    if (uiSfxState.interactionsBound) {
      return;
    }
    uiSfxState.interactionsBound = true;

    document.addEventListener("pointerover", (event) => {
      const target = getUiSfxDomTarget(event.target);
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) {
        return;
      }
      playUiHoverSfx();
    });

    document.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      if (getUiSfxDomTarget(event.target)) {
        playUiClickSfx();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      if (getUiSfxDomTarget(document.activeElement)) {
        playUiClickSfx();
      }
    });
  }

  function bindPhaserUiSfx(target, isEnabled = () => true, hoverTarget = target) {
    if (!target || typeof target.on !== "function") {
      return;
    }
    target.on("pointerover", () => {
      if (uiSfxState.phaserHoverClearTimer) {
        clearTimeout(uiSfxState.phaserHoverClearTimer);
        uiSfxState.phaserHoverClearTimer = null;
      }
      if (isEnabled() && uiSfxState.phaserHoverTarget !== hoverTarget) {
        uiSfxState.phaserHoverTarget = hoverTarget;
        playUiHoverSfx();
      }
    });
    target.on("pointerout", () => {
      uiSfxState.phaserHoverClearTimer = setTimeout(() => {
        if (uiSfxState.phaserHoverTarget === hoverTarget) {
          uiSfxState.phaserHoverTarget = null;
        }
        uiSfxState.phaserHoverClearTimer = null;
      }, UI_SFX_PHASER_HOVER_CLEAR_DELAY_MS);
    });
    target.on("pointerdown", () => {
      if (isEnabled()) {
        playUiClickSfx();
      }
    });
  }

  class RunScene extends Phaser.Scene {
    constructor() {
      super("RunScene");
      this.renderedStageSignature = null;
      this.lastTurnPhase = null;
      this.processedFeedbackEventIds = new Set();
    }

    create() {
      playSceneFadeIn(this);
      const firstCombatAnimationBackground = CHAPTER1_MOB_COMBAT_BACKGROUNDS.find(
        (background) => background.type === "animation",
      );
      const firstCombatVideoBackground = CHAPTER1_MOB_COMBAT_BACKGROUNDS.find((background) => background.type === "video");
      this.combatBackgroundImage = this.add.image(640, 360, "shop-forest1-bg").setVisible(false).setDepth(-220);
      this.combatBackgroundAnimation = this.add
        .sprite(
          640,
          360,
          firstCombatAnimationBackground
            ? getCombatAnimationFrameKey(
                firstCombatAnimationBackground,
                getCombatAnimationStartFrame(firstCombatAnimationBackground),
              )
            : "shop-forest1-bg",
        )
        .setVisible(false)
        .setDepth(-220);
      this.combatBackgroundVideo = this.add
        .video(640, 360, firstCombatVideoBackground?.key || undefined)
        .setVisible(false)
        .setDepth(-220);
      // Native loop avoids the per-iteration "complete" handler + manual
      // setCurrentTime + play() roundtrip, which was causing measurable
      // GC/event churn over long combats.
      this.combatBackgroundVideo.setLoop(true);
      this.combatBackgroundVideo.setMute(true);

      // Dedicated video layers for the shrine and shop so they never share
      // a video element (and decoder) with the combat background. Each is
      // lazily loaded the first time its stage appears.
      this.shrineBackgroundAnimation = this.add
        .sprite(640, 360, getFrameAnimationKey(SHRINE_BACKGROUND, 1))
        .setVisible(false)
        .setDepth(-220);
      this.shrineBackgroundVideo = this.add.video(640, 360).setVisible(false).setDepth(-220);
      this.shrineBackgroundVideo.setLoop(true);
      this.shrineBackgroundVideo.setMute(true);
      this.shrineBackgroundVideoLoaded = false;

      this.shopBackgroundVideo = this.add.video(640, 360).setVisible(false).setDepth(-220);
      this.shopBackgroundVideo.setLoop(true);
      this.shopBackgroundVideo.setMute(true);
      this.shopBackgroundVideoLoaded = false;

      this.backdrop = this.add.rectangle(640, 360, 1280, 720, 0x18251f).setDepth(-200);
      this.floor = this.add.rectangle(640, 520, 1280, 200, 0x3d341f).setDepth(-180);
      this.combatForeground = this.add.image(640, 360, "shop-forest1-bg").setVisible(false).setDepth(200);
      this.partySprites = [];
      this.enemySprites = [];
      this.pendingFxTimers = [];

      // Pause the video decoder when the tab is hidden. The browser already
      // throttles rAF when hidden, but the video element keeps decoding
      // frames into a texture Phaser then re-uploads to the GPU on the next
      // visible frame, which adds a hitch on tab refocus and burns power
      // while hidden.
      this.handleRunVisibilityChange = () => {
        const videos = [this.combatBackgroundVideo, this.shrineBackgroundVideo, this.shopBackgroundVideo];
        videos.forEach((video) => {
          if (!video) {
            return;
          }
          if (document.visibilityState === "hidden") {
            if (video.visible && video.isPlaying?.()) {
              video.pause();
            }
          } else if (video.visible) {
            video.play(true);
          }
        });
      };
      document.addEventListener("visibilitychange", this.handleRunVisibilityChange);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        document.removeEventListener("visibilitychange", this.handleRunVisibilityChange);
      });

      this.refreshState();
      renderUi();
    }

    clearDynamic() {
      this.pendingFxTimers.forEach((timer) => clearTimeout(timer));
      this.pendingFxTimers = [];
      this.partySprites.forEach((entry) => {
        entry.sprite.destroy();
        this.destroyStatusFx(entry);
        if (entry.label) {
          entry.label.destroy();
        }
        if (entry.hp) {
          entry.hp.destroy();
        }
        if (entry.hpBarBg) {
          entry.hpBarBg.destroy();
        }
        if (entry.hpBarFill) {
          entry.hpBarFill.destroy();
        }
        if (entry.hpBarDrownedFill) {
          entry.hpBarDrownedFill.destroy();
        }
      });
      this.enemySprites.forEach((entry) => {
        entry.sprite.destroy();
        this.destroyStatusFx(entry);
        entry.label.destroy();
        entry.hp.destroy();
        if (entry.hpPillBg) {
          entry.hpPillBg.destroy();
        }
        if (entry.hpBarBg) {
          entry.hpBarBg.destroy();
        }
        if (entry.hpBarFill) {
          entry.hpBarFill.destroy();
        }
        if (entry.hpBarDrownedFill) {
          entry.hpBarDrownedFill.destroy();
        }
        if (entry.highlight) {
          entry.highlight.destroy();
        }
        if (entry.effectIndicator) {
          entry.effectIndicator.destroy();
        }
      });
      this.partySprites = [];
      this.enemySprites = [];
      if (this.stageTitle) {
        this.stageTitle.destroy();
        this.stageTitle = null;
      }
      if (this.stageBanner) {
        this.stageBanner.destroy();
        this.stageBanner = null;
      }
      if (this.shopkeeper) {
        this.shopkeeper.destroy();
        this.shopkeeper = null;
      }
      this.hideShopOverlay();
      if (this.phasePanelBg) {
        this.phasePanelBg.destroy();
        this.phasePanelBg = null;
      }
      if (this.phasePanelTitle) {
        this.phasePanelTitle.destroy();
        this.phasePanelTitle = null;
      }
      if (this.phasePanelSummary) {
        this.phasePanelSummary.destroy();
        this.phasePanelSummary = null;
      }
      (this.phaseActors || []).forEach((entry) => {
        entry.bg.destroy();
        entry.sprite.destroy();
        entry.name.destroy();
        entry.state.destroy();
      });
      this.phaseActors = [];
      this.renderedStageSignature = null;
      this.lastTurnPhase = null;
      this.processedFeedbackEventIds = new Set();
    }

    createHpBar(x, y, maxWidth, fillColor) {
      const bg = this.add.rectangle(x, y, maxWidth, 8, 0x0f1622, 0.95).setOrigin(0, 0.5);
      const fill = this.add.rectangle(x, y, maxWidth, 8, fillColor, 0.98).setOrigin(0, 0.5);
      const drownedFill = this.add.rectangle(x, y, maxWidth, 8, 0x0f61ff, 0.88).setOrigin(1, 0.5).setVisible(false);
      return { bg, fill, drownedFill, maxWidth, x, y };
    }

    getHpValueText(hp, maxHp) {
      return `${Math.round(hp)}/${Math.round(maxHp)}`;
    }

    createHpPill(centerX, centerY, text, depth = 2404) {
      const bg = this.add.graphics().setDepth(depth);
      const label = this.add
        .text(centerX, centerY, text, {
          fontSize: "15px",
          color: "#fff4f4",
          fontStyle: "bold",
          stroke: "#2a0808",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(depth + 1);
      this.updateHpPill({ bg, label });
      return { bg, label };
    }

    updateHpPill(pill, text) {
      if (!pill?.bg || !pill?.label) {
        return;
      }
      if (typeof text === "string") {
        pill.label.setText(text);
      }
      const width = Math.max(58, pill.label.displayWidth + 18);
      const height = 20;
      const x = pill.label.x - width / 2;
      const y = pill.label.y - height / 2;
      pill.bg.clear();
      pill.bg.fillStyle(0x18070a, 0.86);
      pill.bg.lineStyle(1, 0xffffff, 0.28);
      pill.bg.fillRoundedRect(x, y, width, height, height / 2);
      pill.bg.strokeRoundedRect(x, y, width, height, height / 2);
    }

    setDrownedHpBar(bar, drownedValue, maxHp, currentHp = maxHp) {
      if (!bar?.drownedFill) {
        return;
      }
      const hpWidth = Math.max(0, bar.maxWidth * getHealthRatio(currentHp || 0, maxHp));
      const targetWidth = Math.min(hpWidth, Math.max(0, bar.maxWidth * getHealthRatio(drownedValue || 0, maxHp)));
      if (typeof bar.x === "number") {
        bar.drownedFill.setPosition(bar.x + hpWidth, bar.y ?? bar.drownedFill.y);
      }
      bar.drownedFill.setDisplaySize(targetWidth, 8);
      bar.drownedFill.setVisible(targetWidth > 0);
    }

    setHpBar(bar, hp, maxHp, options = {}) {
      if (!bar?.fill) {
        return;
      }
      const { animate = false, duration = 480 } = options;
      const ratio = getHealthRatio(hp, maxHp);
      const targetWidth = Math.max(0, bar.maxWidth * ratio);
      const currentWidth = typeof bar.fill.displayWidth === "number" ? bar.fill.displayWidth : targetWidth;
      if (bar.fill.hpTween) {
        bar.fill.hpTween.remove();
        bar.fill.hpTween = null;
      }

      if (!animate || Math.abs(currentWidth - targetWidth) < 0.5) {
        bar.fill.setDisplaySize(targetWidth, 8);
        bar.fill.setVisible(ratio > 0);
        return;
      }

      bar.fill.setVisible(true);
      bar.fill.hpTween = this.tweens.addCounter({
        from: currentWidth,
        to: targetWidth,
        duration,
        ease: "Sine.easeOut",
        onUpdate: (tween) => {
          bar.fill.setDisplaySize(tween.getValue(), 8);
        },
        onComplete: () => {
          bar.fill.hpTween = null;
          bar.fill.setVisible(ratio > 0);
        },
      });
    }

    getEnemyCombatLayout(index, enemyCount, enemyProfile) {
      const baseY = enemyProfile.y + ENEMY_COMBAT_Y_OFFSET;
      const singleY = baseY;
      const crowdedSlots = [
        { x: 780, yOffset: 54 },
        { x: 1030, yOffset: -64 },
        { x: 1160, yOffset: 68 },
        { x: 910, yOffset: -33 },
      ];
      const twoEnemySlots = [
        { x: 840, y: baseY + 34 },
        { x: 1110, y: baseY - 34 },
      ];
      const slot =
        enemyCount <= 1
          ? { x: 980, y: singleY }
          : enemyCount === 2
            ? twoEnemySlots[index] || twoEnemySlots[twoEnemySlots.length - 1]
            : {
                x: crowdedSlots[Math.min(index, crowdedSlots.length - 1)].x,
                y: baseY + crowdedSlots[Math.min(index, crowdedSlots.length - 1)].yOffset,
              };
      const labelX = slot.x - 60;
      const labelY = Math.min(585, Math.max(320, slot.y + enemyProfile.frameHeight * enemyProfile.scale * 0.42));
      const spriteHeight = enemyProfile.frameHeight * enemyProfile.scale;
      const hpBarY = enemyProfile.hpBarPosition === "aboveSprite"
        ? Math.max(32, slot.y - spriteHeight / 2 - (enemyProfile.hpBarTopGap || 16))
        : labelY + 24 + (enemyProfile.hpBarYOffset || 0);
      return {
        spriteX: slot.x,
        spriteY: slot.y,
        labelX,
        labelY,
        hpY: labelY,
        hpBarY,
      };
    }

    spawnDamageNumber(x, y, amount, color = "#ff6b6b", sourceLabel = "") {
      if (!amount || amount <= 0) {
        return;
      }
      const suffix = sourceLabel ? ` (${sourceLabel})` : "";
      const damageText = this.add
        .text(x, y - 26, `-${Math.round(amount)}${suffix}`, {
          fontSize: "30px",
          color,
          fontStyle: "bold",
          stroke: "#190506",
          strokeThickness: 5,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(5000);

      this.tweens.add({
        targets: damageText,
        y: y - 98,
        alpha: 0,
        delay: 1000,
        duration: 1650,
        ease: "Sine.easeOut",
        onComplete: () => {
          damageText.destroy();
        },
      });
    }

    spawnFloatingText(x, y, text, color = "#f5fbff", delayMs = 0) {
      if (!text) {
        return;
      }
      const spawn = () => {
        const feedbackText = this.add
          .text(x, y - 28, text, {
            fontSize: "28px",
            color,
            fontStyle: "bold",
            stroke: "#06101a",
            strokeThickness: 5,
          })
          .setOrigin(0.5, 0.5)
          .setDepth(5001);

        this.tweens.add({
          targets: feedbackText,
          y: y - 100,
          alpha: 0,
          delay: 850,
          duration: 1450,
          ease: "Sine.easeOut",
          onComplete: () => feedbackText.destroy(),
        });
      };
      if (delayMs > 0) {
        const timer = setTimeout(spawn, delayMs);
        this.pendingFxTimers.push(timer);
        return;
      }
      spawn();
    }

    fitLayerToViewport(displayObject, sourceWidth, sourceHeight) {
      if (!displayObject || !sourceWidth || !sourceHeight) {
        return;
      }
      const scale = Math.min(1280 / sourceWidth, 720 / sourceHeight);
      displayObject.setScale(scale);
      displayObject.setPosition(640, 360);
    }

    fitImageLayerToViewport(displayObject, textureKey) {
      const sourceImage = this.textures.get(textureKey)?.getSourceImage();
      const sourceWidth = sourceImage?.width || sourceImage?.videoWidth || 0;
      const sourceHeight = sourceImage?.height || sourceImage?.videoHeight || 0;
      this.fitLayerToViewport(displayObject, sourceWidth, sourceHeight);
    }

    fitVideoLayerToViewport(video) {
      const target = video || this.combatBackgroundVideo;
      const videoElement = target?.video;
      const sourceWidth = videoElement?.videoWidth || videoElement?.width || 0;
      const sourceHeight = videoElement?.videoHeight || videoElement?.height || 0;
      this.fitLayerToViewport(target, sourceWidth, sourceHeight);
    }

    pauseLazyBackgroundVideo(video) {
      if (!video) {
        return;
      }
      try {
        if (video.video && video.isPlaying?.()) {
          video.pause();
        }
      } catch (err) {
        // ignore — element may not be ready yet
      }
      video.setVisible(false);
    }

    refreshBackgroundAnimationsAfterEnhancedLoad() {
      this.renderedStageSignature = null;
      this.refreshState();
    }

    showLazyBackgroundVideo(video, descriptor, loadedFlagKey) {
      if (!video || !descriptor) {
        return;
      }
      if (!this[loadedFlagKey]) {
        this[loadedFlagKey] = true;
        try {
          video.loadURL(descriptor.path, "loadeddata", true);
        } catch (err) {
          console.warn("Failed to load background video", descriptor.path, err);
          this[loadedFlagKey] = false;
          return;
        }
        video.once("created", () => {
          this.fitVideoLayerToViewport(video);
        });
      }
      video.setVisible(true);
      video.play(true);
      this.fitVideoLayerToViewport(video);
      this.time.delayedCall(120, () => this.fitVideoLayerToViewport(video));
    }

    fadeOutPartySpritesForRunEnd(onComplete) {
      const entries = this.partySprites || [];
      const targets = [];
      entries.forEach((entry) => {
        const sprite = entry?.sprite;
        if (sprite?.active) {
          if (typeof sprite.disableInteractive === "function") {
            sprite.disableInteractive();
          }
          targets.push(sprite);
        }
        Object.values(entry?.statusFx || {}).forEach((fx) => {
          if (fx?.alphaTween) {
            fx.alphaTween.remove();
            fx.alphaTween = null;
          }
          if (fx?.sprite?.active) {
            targets.push(fx.sprite);
          }
        });
      });
      const duration = 880;
      if (targets.length === 0) {
        this.time.delayedCall(0, () => {
          if (typeof onComplete === "function") {
            onComplete();
          }
        });
        return;
      }
      this.tweens.add({
        targets,
        alpha: 0,
        duration,
        ease: "Sine.easeIn",
        onComplete: () => {
          if (typeof onComplete === "function") {
            onComplete();
          }
        },
      });
    }

    refreshState() {
      const runState = appState.runState;
      if (!runState) {
        this.clearDynamic();
        this.combatBackgroundImage?.setVisible(false);
        this.combatBackgroundAnimation?.stop();
        this.combatBackgroundAnimation?.setVisible(false);
        if (this.combatBackgroundVideo) {
          this.combatBackgroundVideo.stop();
          this.combatBackgroundVideo.setVisible(false);
        }
        this.shrineBackgroundAnimation?.stop();
        this.shrineBackgroundAnimation?.setVisible(false);
        this.pauseLazyBackgroundVideo(this.shrineBackgroundVideo);
        this.pauseLazyBackgroundVideo(this.shopBackgroundVideo);
        this.combatForeground?.setVisible(false);
        this.backdrop.setVisible(true);
        this.floor.setVisible(true);
        this.cameras.main.setBackgroundColor("#142236");
        return;
      }

      const stageSignature = `${runState.stageIndex}:${runState.stageType}:${runState.stageName}`;
      const canSoftSyncCombat =
        runState.stageType === "combat" &&
        this.renderedStageSignature === stageSignature &&
        this.partySprites.length > 0 &&
        this.enemySprites.length > 0;

      if (canSoftSyncCombat) {
        this.syncCombatState(runState);
        return;
      }

      // Shop stage: when the stage hasn't changed, just update the existing
      // Rex UI shop overlay instead of tearing it down. This prevents the
      // speech bubble typewriter from replaying every time another player
      // buys something or marks themselves ready.
      const canSoftSyncShop =
        runState.stageType === "shop" &&
        this.renderedStageSignature === stageSignature &&
        !!this.shopOverlay;

      if (canSoftSyncShop) {
        const currentMemberForShop = getCurrentMember();
        if (currentMemberForShop) {
          this.updateShopOverlay(runState, currentMemberForShop);
        }
        return;
      }

      this.clearDynamic();
      this.renderedStageSignature = stageSignature;
      this.combatBackgroundImage?.setVisible(false);
      this.combatBackgroundAnimation?.stop();
      this.combatBackgroundAnimation?.setVisible(false);
      if (this.combatBackgroundVideo) {
        this.combatBackgroundVideo.stop();
        this.combatBackgroundVideo.setVisible(false);
      }
      this.shrineBackgroundAnimation?.stop();
      this.shrineBackgroundAnimation?.setVisible(false);
      this.pauseLazyBackgroundVideo(this.shrineBackgroundVideo);
      this.pauseLazyBackgroundVideo(this.shopBackgroundVideo);
      this.combatForeground?.setVisible(false);
      this.backdrop.setVisible(true);
      this.floor.setVisible(true);

      if (runState.stageType === "blessing") {
        this.cameras.main.setBackgroundColor("#26334b");
        this.backdrop.setFillStyle(0x26334b, 1);
        this.floor.setFillStyle(0x1d2737, 1);
        if (SHRINE_BACKGROUND.type === "animation") {
          const firstFrameKey = getFrameAnimationKey(SHRINE_BACKGROUND, 1);
          this.shrineBackgroundAnimation.setTexture(firstFrameKey);
          this.fitImageLayerToViewport(this.shrineBackgroundAnimation, firstFrameKey);
          this.shrineBackgroundAnimation.setVisible(true);
          if (this.anims.exists(SHRINE_BACKGROUND.animKey)) {
            this.shrineBackgroundAnimation.play(SHRINE_BACKGROUND.animKey);
          }
        } else {
          this.showLazyBackgroundVideo(this.shrineBackgroundVideo, SHRINE_BACKGROUND, "shrineBackgroundVideoLoaded");
        }
        this.backdrop.setVisible(false);
        this.floor.setVisible(false);
      } else if (runState.stageType === "shop") {
        this.cameras.main.setBackgroundColor("#2a1f17");
        this.showLazyBackgroundVideo(this.shopBackgroundVideo, SHOP_BACKGROUND, "shopBackgroundVideoLoaded");
        this.backdrop.setVisible(false);
        this.floor.setVisible(false);
        const shopkeeperBaseY = 295;
        this.shopkeeper = this.add.sprite(910, shopkeeperBaseY, "shopkeeper-forest1").setScale(1.2);
        this.shopkeeper.setFlipX(true);
        this.shopkeeper.play("shopkeeper-forest1-idle-anim");
        this.tweens.add({
          targets: this.shopkeeper,
          y: shopkeeperBaseY - 12,
          duration: 1800,
          ease: "Sine.easeInOut",
          yoyo: true,
          repeat: -1,
        });
      } else {
        this.cameras.main.setBackgroundColor("#18251f");
        this.backdrop.setFillStyle(0x18251f, 1);
        this.floor.setFillStyle(0x3d341f, 1);
        if (shouldUseChapter1CombatEnvironment(runState)) {
          const selectedEnvironment = getRandomChapter1MobCombatEnvironment();
          if (selectedEnvironment?.background && selectedEnvironment?.foreground) {
            if (selectedEnvironment.background.type === "video") {
              const videoKey = selectedEnvironment.background.key;
              if (this.combatBackgroundVideo.getVideoKey?.() !== videoKey) {
                this.combatBackgroundVideo.changeSource(videoKey, false, false, 0, 0);
              }
              this.combatBackgroundVideo.setVisible(true);
              this.combatBackgroundVideo.play(true);
              this.fitVideoLayerToViewport();
              this.time.delayedCall(120, () => this.fitVideoLayerToViewport());
            } else if (selectedEnvironment.background.type === "animation") {
              const firstFrameKey = getCombatAnimationFrameKey(
                selectedEnvironment.background,
                getCombatAnimationStartFrame(selectedEnvironment.background),
              );
              this.combatBackgroundAnimation.setTexture(firstFrameKey);
              this.fitImageLayerToViewport(this.combatBackgroundAnimation, firstFrameKey);
              this.combatBackgroundAnimation.setVisible(true);
              if (this.anims.exists(selectedEnvironment.background.animKey)) {
                this.combatBackgroundAnimation.play(selectedEnvironment.background.animKey);
              }
            } else {
              this.combatBackgroundImage.setTexture(selectedEnvironment.background.key);
              this.fitImageLayerToViewport(this.combatBackgroundImage, selectedEnvironment.background.key);
              this.combatBackgroundImage.setVisible(true);
            }
            this.combatForeground.setTexture(selectedEnvironment.foreground.key);
            this.fitImageLayerToViewport(this.combatForeground, selectedEnvironment.foreground.key);
            this.combatForeground.setVisible(true);
            this.backdrop.setVisible(false);
            this.floor.setVisible(false);
          }
        }
      }

      if (runState.stageType !== "combat" && runState.stageType !== "blessing" && runState.stageType !== "shop") {
        this.stageTitle = this.add.text(70, 50, runState.stageName, { fontSize: "42px", color: "#ffe28c" });
      }

      const inBlessing = runState.stageType === "blessing";
      const inShop = runState.stageType === "shop";
      const inCombat = runState.stageType === "combat";
      const partyYOffset = inShop ? 125 : 0;
      const partyScale = inShop ? 1.8135 : 0.9;
      const combatBaseX = 150;
      const combatSpacingX = 125;
      const shopSpacingX = inShop && runState.party.length >= 4 ? 185 : 180;
      const combatBaseY = 445;
      if (!inBlessing) {
        runState.party.forEach((member, index) => {
          const charRef = getRunMemberCharacterRef(member, runState);
          const charProfile = getCharacterVisualProfile(charRef);
          const shopPerMemberOffsets = [
            { x: 0, y: 40 },
            { x: -15, y: 25 },
            { x: -25, y: 25 },
            { x: -40, y: 35 },
          ];
          const shopOffset = inShop ? shopPerMemberOffsets[index] || { x: 0, y: 0 } : { x: 0, y: 0 };
          const combatStaggerY = inCombat ? (index % 2 === 0 ? -18 : 18) : 0;
          const spriteX = inCombat ? combatBaseX + index * combatSpacingX : 220 + index * shopSpacingX + shopOffset.x;
          const spriteY = (inCombat ? combatBaseY : 330) + partyYOffset + combatStaggerY + shopOffset.y;
          const sprite = this.add.sprite(spriteX, spriteY, charProfile.texture).setScale(partyScale);
          sprite.setDepth(inCombat ? 1200 + Math.round(spriteY) : 1200);
          playCharacterAnimation(sprite, charRef, "idle");
          sprite.setFlipX(shouldFlipCharacterSprite(charRef, 1));
          const labelX = inCombat ? spriteX - 70 : 150 + index * 180;
          const label = inShop
            ? null
            : this.add.text(labelX, 450 + partyYOffset, member.nickname, { fontSize: "22px", color: "#fff" }).setDepth(1201);
          const hp = inShop
            ? null
            : this.add
                .text(labelX, 480 + partyYOffset, `HP ${member.hp}/${member.maxHp}`, {
                  fontSize: "18px",
                  color: "#d3e5ff",
                })
                .setDepth(1201);
          const hpBar = inCombat ? this.createHpBar(labelX, 504 + partyYOffset, 140, 0x6ddf95) : null;
          if (hpBar) {
            hpBar.bg.setDepth(1201);
            hpBar.fill.setDepth(1202);
            hpBar.drownedFill.setDepth(1203);
            this.setHpBar(hpBar, member.hp, member.maxHp);
            this.setDrownedHpBar(hpBar, member.effects?.drownedValue || 0, member.maxHp, member.hp);
          }
          if (inCombat) {
            // Hide the in-world nickname/HP/HP-bar during combat; this info is shown in
            // the top-left party HUD panel so the battlefield stays readable.
            label?.setVisible(false);
            hp?.setVisible(false);
            hpBar?.bg.setVisible(false);
            hpBar?.fill.setVisible(false);
            hpBar?.drownedFill.setVisible(false);
            sprite.setInteractive({ useHandCursor: true });
            sprite.on("pointerover", () => {
              const currentMember = (appState.runState?.party || []).find((partyMember) => partyMember.id === member.id) || member;
              appState.combatInfoHover = { kind: "player", memberId: member.id };
              if (canTargetAlly() && currentMember.alive) {
                appState.combatHoverAllyId = member.id;
                if (isCombatantFrozen(currentMember)) {
                  const partyEntry = this.partySprites.find((entry) => entry.memberId === member.id);
                  this.applyCombatantFreezeVisual(partyEntry, currentMember);
                } else {
                  sprite.setTint(0x66ff99);
                }
                updateTargetingArrow();
                renderUi();
              } else {
                refreshCombatInfo();
              }
            });
            sprite.on("pointerout", () => {
              if (appState.combatInfoHover?.kind === "player" && appState.combatInfoHover.memberId === member.id) {
                appState.combatInfoHover = null;
                refreshCombatInfo();
              }
              if (appState.combatHoverAllyId === member.id) {
                appState.combatHoverAllyId = null;
                sprite.clearTint();
                const currentMember = (appState.runState?.party || []).find((partyMember) => partyMember.id === member.id) || member;
                const partyEntry = this.partySprites.find((entry) => entry.memberId === member.id);
                this.applyCombatantFreezeVisual(partyEntry, currentMember);
                updateTargetingArrow();
                renderUi();
              }
            });
            sprite.on("pointerdown", () => {
              const currentMember = (appState.runState?.party || []).find((partyMember) => partyMember.id === member.id) || member;
              if (!canTargetAlly() || !currentMember.alive) {
                return;
              }
              submitCombatAction(appState.pendingCombatAction, member.id);
              renderUi();
            });
          }
          this.partySprites.push({
            memberId: member.id,
            characterRef: charRef,
            lastHp: member.hp,
            sprite,
            label,
            hp,
            hpBarBg: hpBar?.bg || null,
            hpBarFill: hpBar?.fill || null,
            hpBarDrownedFill: hpBar?.drownedFill || null,
            hpBarMaxWidth: hpBar?.maxWidth || 0,
            hideInlineUi: inCombat,
            statusFx: {},
          });
          if (inCombat) {
            const partyEntry = this.partySprites[this.partySprites.length - 1];
            this.applyCombatantFreezeVisual(partyEntry, member);
            this.syncPartyStatusFx(partyEntry, member);
          }
        });
      }

      if (runState.stageType === "combat") {
        runState.enemies.forEach((enemy, index) => {
          const enemyProfile = getEnemyVisualProfile(enemy.artKey);
          const enemyLayout = this.getEnemyCombatLayout(index, runState.enemies.length, enemyProfile);
          const sprite = this.add
            .sprite(enemyLayout.spriteX, enemyLayout.spriteY, enemyProfile.texture)
            .setScale(enemyProfile.scale);
          sprite.setDepth(1200 + Math.round(enemyLayout.spriteY));
          sprite.play(enemyProfile.idleAnim);
          sprite.setFlipX(enemyProfile.flipX !== undefined ? enemyProfile.flipX : true);
          sprite.setInteractive({ useHandCursor: true });
          const label = this.add
            .text(enemyLayout.labelX, enemyLayout.labelY, enemy.name, { fontSize: "22px", color: "#fff" })
            .setDepth(2401)
            .setVisible(false);
          const hpBar = this.createHpBar(enemyLayout.labelX, enemyLayout.hpBarY, 140, 0xff8f8f);
          hpBar.bg.setDepth(2401);
          hpBar.fill.setDepth(2402);
          hpBar.drownedFill.setDepth(2403);
          this.setHpBar(hpBar, enemy.hp, enemy.maxHp);
          this.setDrownedHpBar(hpBar, enemy.effects?.drownedValue || 0, enemy.maxHp, enemy.hp);
          const hpPill = this.createHpPill(hpBar.x + hpBar.maxWidth / 2, hpBar.y, this.getHpValueText(enemy.hp, enemy.maxHp));
          const highlight = this.createEnemyCrosshair();
          highlight.setPosition(sprite.x, sprite.y);
          this.drawEnemyCrosshair(highlight, sprite.displayWidth, sprite.displayHeight);
          const effectIndicator = this.add
            .sprite(sprite.x, sprite.y - sprite.displayHeight / 2 - 32, "fx-super-effective")
            .setDepth(2600)
            .setVisible(false);
          effectIndicator.setScale(Math.min(1, 140 / Math.max(1, effectIndicator.width)));

          sprite.on("pointerover", () => {
            appState.combatInfoHover = { kind: "enemy", enemyId: enemy.id };
            if (canTargetEnemy()) {
              appState.combatHoverEnemyId = enemy.id;
              appState.combatHoverEnemyName = enemy.name;
              this.updateEnemyHighlights();
              renderUi();
            } else {
              refreshCombatInfo();
            }
          });

          sprite.on("pointerout", () => {
            if (appState.combatInfoHover?.kind === "enemy" && appState.combatInfoHover.enemyId === enemy.id) {
              appState.combatInfoHover = null;
              refreshCombatInfo();
            }
            if (appState.combatHoverEnemyId !== enemy.id) {
              return;
            }
            appState.combatHoverEnemyId = null;
            appState.combatHoverEnemyName = null;
            this.updateEnemyHighlights();
            renderUi();
          });

          sprite.on("pointerdown", () => {
            if (!canTargetEnemy()) {
              return;
            }
            const pending = appState.pendingCombatAction;
            const targetId = actionIsAoe(pending) ? null : enemy.id;
            submitCombatAction(pending, targetId);
            renderUi();
          });

          this.enemySprites.push({
            enemyId: enemy.id,
            enemyType: enemy.type,
            lastHp: enemy.hp,
            sprite,
            label,
            hp: hpPill.label,
            hpPillBg: hpPill.bg,
            hpBarBg: hpBar.bg,
            hpBarFill: hpBar.fill,
            hpBarDrownedFill: hpBar.drownedFill,
            hpBarMaxWidth: hpBar.maxWidth,
            highlight,
            effectIndicator,
            animation: enemyProfile.idleAnim,
            attackAnimation: enemyProfile.attackAnim,
            attackSfxUrl: enemyProfile.attackSfxUrl,
            hurtAnimation: enemyProfile.hurtAnim,
            impactTexture: enemyProfile.impactTexture,
            impactAnimation: enemyProfile.impactAnim,
            impactFrame: enemyProfile.impactFrame,
            useImpactForSwing: enemyProfile.useImpactForSwing,
            statusFx: {},
          });
          const enemyEntry = this.enemySprites[this.enemySprites.length - 1];
          this.applyCombatantFreezeVisual(enemyEntry, enemy, { idleAnimation: enemyProfile.idleAnim });
          this.syncEnemyStatusFx(enemyEntry, enemy);
        });
        this.updateEnemyHighlights();
        scheduleEnemyIntentOverlayUpdate();
        this.lastTurnPhase = runState.turn?.phase || null;
      }

      if (runState.stageType === "shop") {
        const currentMemberForShop = getCurrentMember();
        if (currentMemberForShop) {
          this.showShopOverlay(runState, currentMemberForShop);
        }
      }
    }

    hideShopOverlay() {
      this._destroyShopWindow();
      this._destroyShopSceneButtons();
      this._destroyShopTooltip();
      if (this.shopSpeechTail) {
        this.shopSpeechTail.destroy();
        this.shopSpeechTail = null;
      }
      if (this.shopSpeechBubble) {
        this.shopSpeechBubble.destroy();
        this.shopSpeechBubble = null;
      }
      this.shopOverlay = null;
      this.shopActiveTab = "spells";
      this.shopScrollIndex = 0;
    }

    _destroyShopWindow() {
      this._hideShopTooltip();
      if (this.shopWindow) {
        this.shopWindow.destroy();
        this.shopWindow = null;
      }
      this.shopBuyButtons = null;
      this.shopGoldText = null;
      this._updateShopSceneButtonStates(appState.runState, getCurrentMember());
    }

    _destroyShopSceneButtons() {
      (this.shopSceneButtons || []).forEach((handle) => handle.destroy());
      this.shopSceneButtons = null;
      this.shopOpenButton = null;
      this.shopReadyButton = null;
      this.shopReadyButtonLabel = null;
      this.shopReadyButtonBg = null;
      this.shopReadyButtonDisabled = false;
    }

    _destroyShopTooltip() {
      (this.shopTooltipElements || []).forEach((element) => element.destroy());
      this.shopTooltipElements = null;
      this.shopTooltipBg = null;
      this.shopTooltipTitle = null;
      this.shopTooltipDesc = null;
      this.shopTooltipMeta = null;
    }

    showShopOverlay(runState, currentMember) {
      if (!this.rexUI) {
        return;
      }
      this.hideShopOverlay();

      const SHOPKEEPER_X = 910;
      const SHOPKEEPER_TOP_Y = 230;
      const BUBBLE_W = 320;
      const BUBBLE_H = 70;
      // Position the bubble just to the left of the shopkeeper so the tail
      // points toward (and the bubble sits in front of) the fairy sprite.
      const BUBBLE_X = SHOPKEEPER_X - 200;
      const BUBBLE_Y = SHOPKEEPER_TOP_Y - 10;
      const BUBBLE_DEPTH = 2000;

      const bubbleBg = this.rexUI.add.roundRectangle(0, 0, BUBBLE_W, BUBBLE_H, 18, 0xfff5dd).setStrokeStyle(3, 0x6b3a1d);
      const bubbleText = this.add.text(0, 0, "", {
        fontSize: "20px",
        color: "#3a230f",
        fontFamily: "Georgia, serif",
        wordWrap: { width: BUBBLE_W - 40 },
        align: "center",
      });

      const speechBubble = this.rexUI.add.textBox({
        x: BUBBLE_X,
        y: BUBBLE_Y,
        background: bubbleBg,
        text: bubbleText,
        space: { left: 20, right: 20, top: 12, bottom: 12 },
      })
        .setDepth(BUBBLE_DEPTH)
        .layout();
      speechBubble.setAlpha(0);
      this.shopSpeechBubble = speechBubble;

      // Tail points from the bubble's right edge down and to the right toward
      // the fairy shopkeeper sprite.
      const tail = this.add.graphics().setDepth(BUBBLE_DEPTH - 1);
      const bubbleRightEdge = BUBBLE_X + BUBBLE_W / 2;
      const tailBaseTopY = BUBBLE_Y + BUBBLE_H / 2 - 18;
      const tailBaseBotY = BUBBLE_Y + BUBBLE_H / 2 - 2;
      const tailBaseX = bubbleRightEdge - 24;
      const tailTipX = bubbleRightEdge + 30;
      const tailTipY = BUBBLE_Y + BUBBLE_H / 2 + 26;
      tail.fillStyle(0xfff5dd, 1);
      tail.lineStyle(3, 0x6b3a1d, 1);
      tail.beginPath();
      tail.moveTo(tailBaseX, tailBaseTopY);
      tail.lineTo(tailBaseX + 18, tailBaseBotY);
      tail.lineTo(tailTipX, tailTipY);
      tail.closePath();
      tail.fillPath();
      tail.strokePath();
      // Re-cover the seam between the bubble bottom and the tail base.
      tail.fillStyle(0xfff5dd, 1);
      tail.fillRect(tailBaseX + 1, tailBaseTopY, 18, 4);
      tail.setAlpha(0);
      this.shopSpeechTail = tail;

      this.tweens.add({
        targets: [speechBubble, tail],
        alpha: 1,
        duration: 280,
        ease: "Sine.easeOut",
      });

      this._buildShopSceneControls(runState, currentMember);

      const greeting = this._getShopkeeperGreeting(currentMember);
      const onTypingComplete = () => {
        // Use freshest run state so any purchases/ready flips that happened
        // while the bubble was typing are reflected immediately.
        const latestRunState = appState.runState;
        const latestMember = getCurrentMember();
        if (latestRunState && latestMember && latestRunState.stageType === "shop") {
          this._buildShopSceneControls(latestRunState, latestMember);
        }
      };

      // Slight delay so the bubble fade-in finishes before the typewriter begins.
      this.time.delayedCall(220, () => {
        if (!this.shopSpeechBubble) {
          return;
        }
        speechBubble.once("complete", onTypingComplete);
        speechBubble.start(greeting, 30);
      });
    }

    _getShopkeeperGreeting() {
      return "Welcome to my shop!";
    }

    _createShopTextButton({ x, y, width, height, label, fill, stroke, hoverFill, depth, onClick, disabled = false }) {
      const bg = this.rexUI.add.roundRectangle(0, 0, width, height, 10, disabled ? 0x4a4a4a : fill).setStrokeStyle(3, disabled ? 0x6e6e6e : stroke);
      const text = this.add.text(0, 0, label, {
        fontSize: "20px",
        color: disabled ? "#bdbdbd" : "#ffffff",
        fontStyle: "bold",
        fontFamily: "Georgia, serif",
      });
      const button = this.rexUI.add.label({
        x,
        y,
        background: bg,
        text,
        align: "center",
        space: { left: 22, right: 22, top: 10, bottom: 10 },
      })
        .setDepth(depth)
        .layout();
      const handle = {
        button,
        bg,
        text,
        fill,
        stroke,
        hoverFill,
        disabled,
        setDisabled: (isDisabled) => {
          handle.disabled = isDisabled;
          bg.setFillStyle(isDisabled ? 0x4a4a4a : fill);
          bg.setStrokeStyle(3, isDisabled ? 0x6e6e6e : stroke);
          text.setColor(isDisabled ? "#bdbdbd" : "#ffffff");
        },
        setLabel: (nextLabel) => {
          text.setText(nextLabel);
          button.layout();
        },
        destroy: () => button.destroy(),
      };
      button.setInteractive({ useHandCursor: true });
      bindPhaserUiSfx(button, () => !handle.disabled);
      button.on("pointerdown", () => {
        if (!handle.disabled) {
          onClick?.();
        }
      });
      button.on("pointerover", () => {
        if (!handle.disabled) {
          bg.setFillStyle(hoverFill);
        }
      });
      button.on("pointerout", () => {
        if (!handle.disabled) {
          bg.setFillStyle(fill);
        }
      });
      return handle;
    }

    _buildShopSceneControls(runState, currentMember) {
      if (!this.rexUI) {
        return;
      }
      if (this.shopSceneButtons) {
        this._updateShopSceneButtonStates(runState, currentMember);
        return;
      }

      const BUTTON_X = 1080;
      const DEPTH = 2050;
      this.shopOpenButton = this._createShopTextButton({
        x: BUTTON_X,
        y: 555,
        width: 220,
        height: 52,
        label: "Open Shop",
        fill: 0x2f5f9f,
        stroke: 0x9dccff,
        hoverFill: 0x3f78c2,
        depth: DEPTH,
        onClick: () => {
          const latestRunState = appState.runState;
          const latestMember = getCurrentMember();
          if (latestRunState && latestMember && latestRunState.stageType === "shop") {
            this._buildShopWindow(latestRunState, latestMember);
          }
        },
      });

      this.shopReadyButton = this._createShopTextButton({
        x: BUTTON_X,
        y: 620,
        width: 220,
        height: 52,
        label: "Done Shopping",
        fill: 0xb8732a,
        stroke: 0xffd066,
        hoverFill: 0xd4853a,
        depth: DEPTH,
        onClick: () => emit("markShopReady"),
      });
      this.shopReadyButtonLabel = this.shopReadyButton.text;
      this.shopReadyButtonBg = this.shopReadyButton.bg;
      this.shopSceneButtons = [this.shopOpenButton, this.shopReadyButton];
      this.shopOverlay = this.shopSceneButtons;
      this._updateShopSceneButtonStates(runState, currentMember);
    }

    _updateShopSceneButtonStates(runState) {
      if (!this.shopSceneButtons) {
        return;
      }
      if (this.shopOpenButton) {
        const isOpen = !!this.shopWindow;
        this.shopOpenButton.setLabel(isOpen ? "Shop Open" : "Open Shop");
        this.shopOpenButton.setDisabled(isOpen);
      }
      if (this.shopReadyButton) {
        const isReady = !!runState?.stageReady?.[appState.player?.id];
        this.shopReadyButtonDisabled = isReady;
        this.shopReadyButton.setLabel(isReady ? "Waiting..." : "Done Shopping");
        this.shopReadyButton.setDisabled(isReady);
      }
    }

    _ensureShopTooltip() {
      if (this.shopTooltipElements) {
        return;
      }
      const DEPTH = 2140;
      const bg = this.add.rectangle(1072, 128, 360, 176, 0x0b1420, 0.94).setStrokeStyle(3, 0xffd066, 0.95).setDepth(DEPTH);
      const title = this.add.text(902, 54, "", {
        fontSize: "22px",
        color: "#ffe28c",
        fontStyle: "bold",
        fontFamily: "Georgia, serif",
        wordWrap: { width: 320 },
      }).setDepth(DEPTH + 1);
      const desc = this.add.text(902, 86, "", {
        fontSize: "15px",
        color: "#e3edf9",
        fontFamily: "Georgia, serif",
        wordWrap: { width: 320 },
      }).setDepth(DEPTH + 1);
      const meta = this.add.text(902, 146, "", {
        fontSize: "14px",
        color: "#ffd066",
        fontFamily: "Georgia, serif",
        wordWrap: { width: 320 },
      }).setDepth(DEPTH + 1);
      this.shopTooltipBg = bg;
      this.shopTooltipTitle = title;
      this.shopTooltipDesc = desc;
      this.shopTooltipMeta = meta;
      this.shopTooltipElements = [bg, title, desc, meta];
      this._hideShopTooltip();
    }

    _showShopTooltip(entry, metaText) {
      this._ensureShopTooltip();
      this.shopTooltipTitle.setText(entry.name || "Shop Item");
      this.shopTooltipDesc.setText(entry.description || "No details available.");
      this.shopTooltipMeta.setText(metaText || "");
      this.shopTooltipElements.forEach((element) => element.setVisible(true));
    }

    _hideShopTooltip() {
      (this.shopTooltipElements || []).forEach((element) => element.setVisible(false));
    }

    _buildShopWindow(runState, currentMember) {
      if (!this.rexUI || this.shopWindow) {
        return;
      }

      const WINDOW_X = 430;
      const WINDOW_Y = 382;
      const WINDOW_W = 680;
      const WINDOW_H = 540;
      const WINDOW_DEPTH = 2100;
      const PANEL_W = 604;
      const PANEL_H = 314;
      const PANEL_LEFT = WINDOW_X - PANEL_W / 2;
      const PANEL_TOP = WINDOW_Y - 102;
      const SHOP_TABS = ["spells", "swings", "items", "relics"];
      this.shopActiveTab = SHOP_TABS.includes(this.shopActiveTab) ? this.shopActiveTab : "spells";
      this.shopScrollIndex = Number.isInteger(this.shopScrollIndex) ? this.shopScrollIndex : 0;

      const memberCharacter = getCharacterDefinition(getRunMemberCharacterRef(currentMember, runState));
      const memberType = currentMember.type || memberCharacter?.type || "";

      const buyButtons = new Map();
      this.shopBuyButtons = buyButtons;

      const swingEntries = (runState.shop?.swings || COMBAT_ACTIONS.swings).map((swing) => {
        const ownedCount = countActionCopies(currentMember.knownSwings || COMBAT_ACTIONS.swings.map((entry) => entry.id), swing.id);
        return {
          kind: "swing",
          entry: swing,
          metaText: `Cost: ${swing.price || 0} gold | Owned ${ownedCount}`,
          buttonLabel: "Buy",
          canBuy: currentMember.gold >= (swing.price || 0),
        };
      });

      const spellEntries = (runState.shop?.spells || [])
        .filter((spell) => !memberType || spell.type === memberType)
        .map((spell) => {
          const ownedCount = countActionCopies(currentMember.knownSpells, spell.id);
          const locked = currentMember.level < spell.levelRequired;
          const canBuy = currentMember.gold >= spell.price && !locked;
          return {
            kind: "spell",
            entry: spell,
            metaText: `Cost: ${spell.price} gold | Lv ${spell.levelRequired} | Owned ${ownedCount}`,
            buttonLabel: locked ? "Locked" : "Buy",
            canBuy,
          };
        });

      const itemEntries = (runState.shop?.items || []).map((item) => {
        return {
          kind: "item",
          entry: item,
          metaText: `Cost: ${item.price} gold`,
          buttonLabel: "Buy",
          canBuy: currentMember.gold >= item.price,
        };
      });

      const relicEntries = (runState.shop?.relics || []).map((relic) => {
        const ownedCount = countActionCopies(getMemberBlessingIds(currentMember, memberCharacter), relic.id);
        const canBuy = currentMember.gold >= relic.price;
        const ownedText = ownedCount > 0 ? ` | Owned ${ownedCount}` : "";
        return {
          kind: "relic",
          entry: relic,
          metaText: `Cost: ${relic.price} gold${ownedText}`,
          buttonLabel: "Buy",
          canBuy,
        };
      });

      const shopTabPanels = {
        spells: {
          entries: spellEntries,
          emptyMessage: "No spells available for your type.",
        },
        swings: {
          entries: swingEntries,
          emptyMessage: "No swings available.",
        },
        items: {
          entries: itemEntries,
          emptyMessage: "No items available.",
        },
        relics: {
          entries: relicEntries,
          emptyMessage: "No relics available.",
        },
      };
      const activeShopPanel = shopTabPanels[this.shopActiveTab] || shopTabPanels.spells;
      this.shopScrollIndex = 0;

      const elements = [];
      const buttonHandles = [];
      const addElement = (element) => {
        elements.push(element);
        return element;
      };
      const addButton = (config) => {
        const handle = this._createShopTextButton(config);
        buttonHandles.push(handle);
        return handle;
      };
      const destroyWindowElements = () => {
        this._hideShopTooltip();
        buttonHandles.forEach((handle) => handle.destroy());
        elements.forEach((element) => element.destroy());
        buttonHandles.length = 0;
        elements.length = 0;
      };

      addElement(
        this.add
          .rectangle(WINDOW_X, WINDOW_Y, WINDOW_W, WINDOW_H, 0x14202f, 0.96)
          .setStrokeStyle(4, 0xffd066)
          .setDepth(WINDOW_DEPTH),
      );
      const shopListPanel = addElement(
        this.add
          .rectangle(WINDOW_X, PANEL_TOP + PANEL_H / 2, PANEL_W, PANEL_H, 0x1f2a3d, 0.96)
          .setStrokeStyle(2, 0x3a4d6e)
          .setInteractive({ useHandCursor: false })
          .setDepth(WINDOW_DEPTH + 1),
      );

      const titleText = addElement(this.add.text(WINDOW_X - 300, WINDOW_Y - 244, "Shopkeeper's Wares", {
        fontSize: "28px",
        color: "#ffe28c",
        fontStyle: "bold",
        fontFamily: "Georgia, serif",
      }).setDepth(WINDOW_DEPTH + 2));
      const goldText = addElement(this.add.text(WINDOW_X + 170, WINDOW_Y - 238, `Gold: ${currentMember.gold}`, {
        fontSize: "22px",
        color: "#ffd066",
        fontFamily: "Georgia, serif",
      }).setDepth(WINDOW_DEPTH + 2));
      this.shopGoldText = goldText;

      const tabIndexById = Object.fromEntries(SHOP_TABS.map((tabId, index) => [tabId, index]));
      const buildTab = (id, label) => this._createShopTextButton({
        x: WINDOW_X - 225 + (tabIndexById[id] || 0) * 150,
        y: WINDOW_Y - 178,
        width: 136,
        height: 42,
        label,
        fill: this.shopActiveTab === id ? 0x6b4b1e : 0x223247,
        stroke: this.shopActiveTab === id ? 0xffd066 : 0x4a6a8e,
        hoverFill: this.shopActiveTab === id ? 0x7c5925 : 0x2d4260,
        depth: WINDOW_DEPTH + 1,
        onClick: () => {
          if (this.shopActiveTab === id) {
            return;
          }
          this.shopActiveTab = id;
          this.shopScrollIndex = 0;
          this._destroyShopWindow();
          const latestRunState = appState.runState;
          const latestMember = getCurrentMember();
          if (latestRunState && latestMember && latestRunState.stageType === "shop") {
            this._buildShopWindow(latestRunState, latestMember);
          }
        },
      });
      buttonHandles.push(buildTab("spells", "Spells"));
      buttonHandles.push(buildTab("swings", "Swings"));
      buttonHandles.push(buildTab("items", "Items"));
      buttonHandles.push(buildTab("relics", "Relics"));

      const cardEntries = activeShopPanel.entries;
      if (cardEntries.length === 0) {
        addElement(this.add.text(PANEL_LEFT + 18, PANEL_TOP + 22, activeShopPanel.emptyMessage, {
          fontSize: "16px",
          color: "#9aa6bd",
          fontFamily: "Georgia, serif",
        }).setDepth(WINDOW_DEPTH + 2));
      }

      cardEntries.forEach(({ kind, entry, metaText, buttonLabel, canBuy }, index) => {
        const GRID_COLUMNS = 4;
        const CARD_SIZE = 132;
        const CARD_GAP = 16;
        const col = index % GRID_COLUMNS;
        const row = Math.floor(index / GRID_COLUMNS);
        const cardLeft = PANEL_LEFT + 18 + col * (CARD_SIZE + CARD_GAP);
        const cardTop = PANEL_TOP + 18 + row * (CARD_SIZE + CARD_GAP);
        const cardCenterX = cardLeft + CARD_SIZE / 2;
        const cardCenterY = cardTop + CARD_SIZE / 2;
        const CARD_FILL = 0x1b2a3d;
        const CARD_STROKE = 0x78a9d8;
        const CARD_HOVER_FILL = 0x263c59;
        const CARD_HOVER_STROKE = 0xffd066;
        const cardBg = addElement(
          this.add
            .rectangle(cardCenterX, cardCenterY, CARD_SIZE, CARD_SIZE, CARD_FILL, 1)
            .setStrokeStyle(3, CARD_STROKE, 0.9)
            .setDepth(WINDOW_DEPTH + 2),
        );
        const setCardHover = (isHovering) => {
          cardBg
            .setFillStyle(isHovering ? CARD_HOVER_FILL : CARD_FILL)
            .setStrokeStyle(isHovering ? 4 : 3, isHovering ? CARD_HOVER_STROKE : CARD_STROKE, 0.95);
        };
        addElement(this.add.text(cardLeft + 10, cardTop + 10, entry.name, {
          fontSize: "17px",
          color: "#ffffff",
          fontStyle: "bold",
          fontFamily: "Georgia, serif",
          wordWrap: { width: CARD_SIZE - 20 },
        }).setDepth(WINDOW_DEPTH + 3));
        const meta = addElement(this.add.text(cardLeft + 10, cardTop + 52, metaText, {
          fontSize: "12px",
          color: "#ffd066",
          fontFamily: "Georgia, serif",
          wordWrap: { width: CARD_SIZE - 20 },
        }).setDepth(WINDOW_DEPTH + 3));
        const buyButton = addButton({
          x: cardCenterX,
          y: cardTop + CARD_SIZE - 24,
          width: 106,
          height: 32,
          label: buttonLabel,
          fill: 0x2f7d3c,
          stroke: 0x9be29b,
          hoverFill: 0x3aa551,
          depth: WINDOW_DEPTH + 3,
          disabled: !canBuy,
          onClick: () => {
            const handle = buyButtons.get(`${kind}:${entry.id}`);
            if (!handle || handle.disabled) {
              return;
            }
            emit("buyShopItem", { kind, id: entry.id });
          },
        });
        buyButton.button.on("pointerover", () => {
          this._showShopTooltip(entry, metaText);
          setCardHover(true);
        });
        buyButton.button.on("pointerout", () => {
          setCardHover(false);
          this._hideShopTooltip();
        });
        cardBg.setInteractive({ useHandCursor: true });
        cardBg.on("pointerover", () => {
          setCardHover(true);
          this._showShopTooltip(entry, metaText);
        });
        cardBg.on("pointerout", () => {
          setCardHover(false);
          this._hideShopTooltip();
        });

        buyButtons.set(`${kind}:${entry.id}`, {
          background: cardBg,
          button: buyButton.button,
          buttonBackground: buyButton.bg,
          buttonText: buyButton.text,
          metaText: meta,
          buttonHandle: buyButton,
          disabled: !canBuy,
          kind,
          id: entry.id,
        });
      });

      addButton({
        x: WINDOW_X + 240,
        y: WINDOW_Y + 236,
        width: 140,
        height: 46,
        label: "Close",
        fill: 0x5c2f37,
        stroke: 0xff9aaa,
        hoverFill: 0x793c46,
        depth: WINDOW_DEPTH + 1,
        onClick: () => this._destroyShopWindow(),
      });

      this.shopWindow = {
        destroy: destroyWindowElements,
      };
      this._ensureShopTooltip();
      this._updateShopSceneButtonStates(runState, currentMember);

      this.updateShopOverlay(runState, currentMember);
    }

    updateShopOverlay(runState, currentMember) {
      if (this.shopGoldText && !this.shopGoldText.scene?.sys?.isDestroyed?.()) {
        this.shopGoldText.setText(`Gold: ${currentMember.gold}`);
      }

      if (this.shopBuyButtons) {
        const memberCharacter = getCharacterDefinition(getRunMemberCharacterRef(currentMember, runState));
        const memberType = currentMember.type || memberCharacter?.type || "";

        (runState.shop?.spells || [])
          .filter((spell) => !memberType || spell.type === memberType)
          .forEach((spell) => {
            const handle = this.shopBuyButtons.get(`spell:${spell.id}`);
            if (!handle) return;
            const ownedCount = countActionCopies(currentMember.knownSpells, spell.id);
            const locked = currentMember.level < spell.levelRequired;
            const canBuy = currentMember.gold >= spell.price && !locked;
            const label = locked ? "Locked" : "Buy";
            handle.buttonText.setText(label);
            handle.metaText.setText(`Cost: ${spell.price} gold | Lv ${spell.levelRequired} | Owned ${ownedCount}`);
            handle.button.layout();
            handle.disabled = !canBuy;
            handle.buttonHandle?.setDisabled(!canBuy);
          });

        (runState.shop?.swings || COMBAT_ACTIONS.swings).forEach((swing) => {
          const handle = this.shopBuyButtons.get(`swing:${swing.id}`);
          if (!handle) return;
          const price = Number(swing.price) || 0;
          const ownedCount = countActionCopies(currentMember.knownSwings || COMBAT_ACTIONS.swings.map((entry) => entry.id), swing.id);
          const canBuy = currentMember.gold >= price;
          handle.metaText.setText(`Cost: ${price} gold | Owned ${ownedCount}`);
          handle.disabled = !canBuy;
          handle.buttonHandle?.setDisabled(!canBuy);
        });

        (runState.shop?.items || []).forEach((item) => {
          const handle = this.shopBuyButtons.get(`item:${item.id}`);
          if (!handle) return;
          const canBuy = currentMember.gold >= item.price;
          handle.metaText.setText(`Cost: ${item.price} gold`);
          handle.disabled = !canBuy;
          handle.buttonHandle?.setDisabled(!canBuy);
        });

        (runState.shop?.relics || []).forEach((relic) => {
          const handle = this.shopBuyButtons.get(`relic:${relic.id}`);
          if (!handle) return;
          const ownedCount = countActionCopies(getMemberBlessingIds(currentMember, memberCharacter), relic.id);
          const canBuy = currentMember.gold >= relic.price;
          const ownedText = ownedCount > 0 ? ` | Owned ${ownedCount}` : "";
          handle.buttonText.setText("Buy");
          handle.metaText.setText(`Cost: ${relic.price} gold${ownedText}`);
          handle.button.layout();
          handle.disabled = !canBuy;
          handle.buttonHandle?.setDisabled(!canBuy);
        });
      }

      this._updateShopSceneButtonStates(runState, currentMember);
    }

    destroyStatusFx(entry) {
      Object.values(entry?.statusFx || {}).forEach((fxEntry) => {
        if (fxEntry?.alphaTween) {
          fxEntry.alphaTween.remove();
        }
        if (fxEntry?.sprite?.active) {
          fxEntry.sprite.destroy();
        }
      });
      if (entry) {
        entry.statusFx = {};
      }
    }

    applyCombatantFreezeVisual(entry, combatant, options = {}) {
      const sprite = entry?.sprite;
      if (!sprite?.active) {
        return;
      }
      if (isCombatantFrozen(combatant) && combatant?.alive !== false) {
        const idleAnimation = options.idleAnimation || entry.animation || getCharacterVisualProfile(entry.characterRef).idleAnim;
        if (idleAnimation && sprite.anims?.currentAnim?.key !== idleAnimation) {
          sprite.play(idleAnimation, true);
        }
        if (sprite.anims?.isPlaying) {
          sprite.anims.stop();
        }
        sprite.setFrame(0);
        sprite.setTint(FROZEN_SPRITE_TINT);
        entry.freezeVisualActive = true;
        return;
      }
      if (!entry.freezeVisualActive) {
        return;
      }
      entry.freezeVisualActive = false;
      if (entry.characterRef) {
        playCharacterAnimation(sprite, entry.characterRef, "idle");
      } else if (entry.animation) {
        sprite.play(entry.animation, true);
        sprite.clearTint();
      } else {
        sprite.clearTint();
      }
    }

    getEnemyStatusFxIds(effects) {
      // Status VFX are played from combat feedback events when the status actually
      // does something. Freeze is the exception: it should stay visible until the
      // target thaws, so keep only that persistent effect synced to state.
      return (effects?.freezeChecks || 0) > 0 ? ["frozen"] : [];
    }

    getStatusEffectScaleMultiplier(effectId) {
      if (effectId === "poison") return 0.5;
      if (effectId === "burn") return 1.05;
      return 1;
    }

    ensureStatusFx(entry, effectId, targetSprite, options = {}) {
      if (!entry || !targetSprite?.active) {
        return null;
      }
      entry.statusFx = entry.statusFx || {};
      const existing = entry.statusFx[effectId];
      if (existing?.sprite?.active) {
        return existing;
      }

      const isFrozen = effectId === "frozen";
      const def = isFrozen ? FROZEN_EFFECT_DEF : SPELL_EFFECT_ANIMATION_DEFS[effectId];
      const textureKey = isFrozen ? FROZEN_EFFECT_DEF.key : getSpellEffectTextureKey(effectId);
      if (!def || !this.textures.exists(textureKey)) {
        return null;
      }

      const sprite = this.add.sprite(targetSprite.x, targetSprite.y, textureKey).setDepth((targetSprite.depth || 1200) + (options.depthOffset || 70));
      const fxEntry = { sprite, alphaTween: null };
      entry.statusFx[effectId] = fxEntry;

      if (isFrozen) {
        sprite.setAlpha(0.45);
        fxEntry.alphaTween = this.tweens.add({
          targets: sprite,
          alpha: { from: 0.3, to: 0.6 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      } else {
        sprite.setAlpha(options.alpha ?? 0.82);
        const animKey = getSpellEffectAnimationKey(effectId);
        if (this.anims.exists(animKey)) {
          sprite.play({ key: animKey, repeat: -1 }, true);
        }
      }

      return fxEntry;
    }

    positionStatusFx(fxEntry, effectId, targetSprite, options = {}) {
      if (!fxEntry?.sprite?.active || !targetSprite?.active) {
        return;
      }
      const isFrozen = effectId === "frozen";
      const def = isFrozen ? FROZEN_EFFECT_DEF : SPELL_EFFECT_ANIMATION_DEFS[effectId];
      const offsetX = options.offsetX || 0;
      const offsetY = (options.offsetY || 0) + (isFrozen ? FROZEN_EFFECT_OFFSET_Y : 0);
      fxEntry.sprite.setPosition(targetSprite.x + offsetX, targetSprite.y + offsetY);
      fxEntry.sprite.setVisible(targetSprite.visible !== false);
      fxEntry.sprite.setDepth((targetSprite.depth || 1200) + (options.depthOffset || 70));
      const targetHeight = Math.max(options.minHeight || 120, targetSprite.displayHeight * (options.heightRatio || 0.95));
      const frameHeight = isFrozen ? def.frameHeight : def.frameHeight;
      fxEntry.sprite.setScale((targetHeight / Math.max(1, frameHeight)) * (options.scaleMultiplier || 1));
    }

    removeInactiveStatusFx(entry, activeIds) {
      const active = new Set(activeIds);
      Object.entries(entry?.statusFx || {}).forEach(([effectId, fxEntry]) => {
        if (active.has(effectId)) {
          return;
        }
        if (fxEntry?.alphaTween) {
          fxEntry.alphaTween.remove();
        }
        if (fxEntry?.sprite?.active) {
          fxEntry.sprite.destroy();
        }
        delete entry.statusFx[effectId];
      });
    }

    syncEnemyStatusFx(entry, enemy) {
      const activeIds = enemy?.alive ? this.getEnemyStatusFxIds(enemy.effects) : [];
      this.removeInactiveStatusFx(entry, activeIds);
      activeIds.forEach((effectId, index) => {
        const fxEntry = this.ensureStatusFx(entry, effectId, entry.sprite, {
          alpha: effectId === "drowned" ? 0.68 : 0.82,
          depthOffset: 68 + index,
        });
        this.positionStatusFx(fxEntry, effectId, entry.sprite, {
          depthOffset: 68 + index,
          heightRatio: effectId === "updraft" ? 1.1 : 0.95,
          scaleMultiplier: this.getStatusEffectScaleMultiplier(effectId),
        });
      });
    }

    syncPartyStatusFx(entry, member) {
      const activeIds = member?.alive ? this.getEnemyStatusFxIds(member.effects) : [];
      this.removeInactiveStatusFx(entry, activeIds);
      activeIds.forEach((effectId, index) => {
        const fxEntry = this.ensureStatusFx(entry, effectId, entry.sprite, {
          alpha: effectId === "drowned" ? 0.68 : 0.82,
          offsetX: effectId === "earthShield" ? entry.sprite.displayWidth * 0.18 : 0,
          depthOffset: 68 + index,
        });
        this.positionStatusFx(fxEntry, effectId, entry.sprite, {
          offsetX: effectId === "earthShield" ? entry.sprite.displayWidth * 0.18 : 0,
          depthOffset: 68 + index,
          heightRatio: effectId === "updraft" ? 1.1 : effectId === "earthShield" ? 0.78 : 0.95,
          scaleMultiplier: this.getStatusEffectScaleMultiplier(effectId),
        });
      });
    }

    spawnStatusEffectOnce(effectId, targetSprite, options = {}) {
      if (options.delayMs > 0) {
        const timer = setTimeout(() => {
          this.spawnStatusEffectOnce(effectId, targetSprite, { ...options, delayMs: 0 });
        }, options.delayMs);
        this.pendingFxTimers.push(timer);
        return;
      }
      if (!targetSprite?.active) {
        return;
      }
      const isFrozen = effectId === "frozen";
      const def = isFrozen ? FROZEN_EFFECT_DEF : SPELL_EFFECT_ANIMATION_DEFS[effectId];
      const textureKey = isFrozen ? FROZEN_EFFECT_DEF.key : getSpellEffectTextureKey(effectId);
      if (!def || !this.textures.exists(textureKey)) {
        return;
      }
      const frameHeight = isFrozen ? def.frameHeight : def.frameHeight;
      const targetHeight = Math.max(options.minHeight || 120, targetSprite.displayHeight * (options.heightRatio || 0.95));
      const fx = this.add
        .sprite(targetSprite.x + (options.offsetX || 0), targetSprite.y + (options.offsetY || 0) + (isFrozen ? FROZEN_EFFECT_OFFSET_Y : 0), textureKey)
        .setScale((targetHeight / Math.max(1, frameHeight)) * (options.scaleMultiplier || 1))
        .setAlpha(options.alpha ?? (isFrozen ? 0.5 : 0.88))
        .setDepth((targetSprite.depth || 1200) + (options.depthOffset || 95));
      const cleanup = () => {
        if (fx.active) {
          fx.destroy();
        }
      };
      if (isFrozen) {
        this.tweens.add({
          targets: fx,
          alpha: { from: 0.3, to: 0.6 },
          duration: 360,
          yoyo: true,
          repeat: 2,
          ease: "Sine.easeInOut",
          onComplete: cleanup,
        });
        return;
      }
      const animKey = getSpellEffectAnimationKey(effectId);
      if (this.anims.exists(animKey)) {
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, cleanup);
        const safety = setTimeout(cleanup, 1500);
        this.pendingFxTimers.push(safety);
        fx.play({ key: animKey, repeat: 0 });
      } else {
        const timer = setTimeout(cleanup, 900);
        this.pendingFxTimers.push(timer);
      }
    }

    getFeedbackTargetSprite(event) {
      if (event?.targetKind === "party") {
        return this.partySprites.find((entry) => entry.memberId === event.targetId)?.sprite || null;
      }
      return this.enemySprites.find((entry) => entry.enemyId === event?.targetId)?.sprite || null;
    }

    playCombatFeedbackEvent(event) {
      if (!event) {
        return;
      }
      if (event.type === "enemy_attack") {
        this.playEnemyAttackFeedback(event);
        return;
      }

      const targetSprite = this.getFeedbackTargetSprite(event);
      if (!targetSprite?.active) {
        return;
      }
      const effectByType = {
        poison_damage: "poison",
        bleed_damage: "bleed",
        burn_damage: "burn",
        burn_fizzle: "burn",
        drowned_apply: null,
        drowned_defeat: "drowned",
        freeze_thaw: null,
        freeze_remain: null,
        stun_skip: "stun",
        frozen_skip: null,
        updraft_miss: "updraft",
        earth_shield: "earthShield",
        debuff_removed: null,
        heal: null,
        potion_used: null,
      };
      const colorByStatus = {
        burn: "#ff9f43",
        poison: "#9dff8a",
        bleed: "#ff4a5f",
        freeze: "#bfefff",
        stun: "#ffe66d",
        updraft: "#b6f4ff",
        corruption: "#c084fc",
      };
      const colorByType = {
        poison_damage: "#9dff8a",
        bleed_damage: "#ff4a5f",
        burn_damage: "#ff9f43",
        burn_fizzle: "#ffcf76",
        drowned_apply: "#5ab0ff",
        drowned_defeat: "#2f6dff",
        freeze_thaw: "#bfefff",
        freeze_remain: "#bfefff",
        stun_skip: "#ffe66d",
        frozen_skip: "#bfefff",
        updraft_miss: "#b6f4ff",
        earth_shield: "#d7b46a",
        debuff_removed: "#d9e2ff",
        heal: "#8ff3b5",
        potion_used: "#ffcf76",
      };
      const effectId = event.type === "status_applied" ? event.effectId : effectByType[event.type];
      if (effectId) {
        this.spawnStatusEffectOnce(effectId, targetSprite, {
          alpha: event.type === "drowned_defeat" ? 0.95 : 0.86,
          offsetX: event.type === "earth_shield" ? targetSprite.displayWidth * 0.18 : 0,
          heightRatio: effectId === "updraft" ? 1.1 : effectId === "earthShield" ? 0.78 : 0.95,
          scaleMultiplier: this.getStatusEffectScaleMultiplier(effectId),
          depthOffset: event.type === "earth_shield" ? 100 : 95,
        });
      }
      if (event.type === "heal") {
        this.spawnAttackImpact("holy_spark", targetSprite, 0);
      }
      if (event.type === "potion_used") {
        playUiSfx("potion");
      }
      this.spawnFloatingText(
        targetSprite.x,
        targetSprite.y,
        event.text || this.getFallbackFeedbackText(event),
        event.type === "status_applied" ? colorByStatus[event.statusKey] || "#f5fbff" : colorByType[event.type] || "#f5fbff",
      );
    }

    getFallbackFeedbackText(event) {
      if (!event) return "";
      if (event.type === "drowned_apply" && typeof event.amount === "number" && event.amount > 0) {
        return `Drowning +${event.amount}`;
      }
      if (event.type === "drowned_defeat") {
        return "Drowned";
      }
      if (typeof event.amount === "number" && event.amount > 0) {
        return event.type === "heal" ? `+${event.amount} HP` : `-${event.amount} HP`;
      }
      return String(event.type || "").replaceAll("_", " ");
    }

    syncVisualPartyHp(runState) {
      const visualRunState = getVisualRunState(runState);
      (visualRunState?.party || []).forEach((member) => {
        const entry = this.partySprites.find((partyEntry) => partyEntry.memberId === member.id);
        if (!entry) {
          return;
        }
        entry.hp?.setText(`HP ${member.hp}/${member.maxHp}`);
        if (!entry.hideInlineUi) {
          this.setHpBar(
            { fill: entry.hpBarFill, maxWidth: entry.hpBarMaxWidth },
            member.hp,
            member.maxHp,
            { animate: true, duration: 260 },
          );
        }
        if (entry.hpBarFill) {
          entry.hpBarFill.setVisible(
            member.alive && !entry.hideInlineUi && getHealthRatio(member.hp, member.maxHp) > 0,
          );
        }
        entry.sprite?.setAlpha(member.alive ? 1 : 0.45);
        entry.lastHp = member.hp;
      });
    }

    playEnemyAttackFeedback(event) {
      const enemyEntry = this.enemySprites.find((entry) => entry.enemyId === event.actorId);
      if (!enemyEntry?.sprite?.active || !enemyEntry.sprite.visible) {
        return;
      }
      const visualHpChanged = applyVisualEnemyAttackDamage(event);
      if (visualHpChanged) {
        renderUi();
        this.syncVisualPartyHp(appState.runState);
      }
      if (enemyEntry.attackSfxUrl) {
        playAttackSfxUrl(enemyEntry.attackSfxUrl, enemyEntry.attackSfxUrl);
      }
      enemyEntry.sprite.play(enemyEntry.attackAnimation, true);
      this.tweens.add({
        targets: enemyEntry.sprite,
        x: enemyEntry.sprite.x - 24,
        duration: 140,
        yoyo: true,
        ease: "Quad.easeOut",
      });
      (event.targets || []).forEach((target, index) => {
        const targetEntry = this.partySprites.find((partyEntry) => partyEntry.memberId === target.targetId);
        if (!targetEntry?.sprite?.active) {
          return;
        }
        if (event.missedByUpdraft) {
          this.spawnStatusEffectOnce("updraft", targetEntry.sprite, {
            delayMs: 140,
            heightRatio: 1.1,
            scaleMultiplier: this.getStatusEffectScaleMultiplier("updraft"),
            depthOffset: 95,
          });
        } else if (event.actionKind === "swing" && enemyEntry.useImpactForSwing) {
          this.spawnEnemyImpact(enemyEntry, targetEntry.sprite, 140);
        } else if (event.actionId && ATTACK_ANIMATION_DEFS[event.actionId]) {
          this.spawnAttackImpact(event.actionId, targetEntry.sprite, 140);
        } else {
          this.spawnEnemyImpact(enemyEntry, targetEntry.sprite, 140);
        }
        this.spawnFloatingText(
          targetEntry.sprite.x,
          targetEntry.sprite.y,
          target.text || `-${target.amount} HP`,
          "#ffb3b3",
          index * MULTI_TARGET_FLOATING_TEXT_STAGGER_MS,
        );
        this.tweens.add({
          targets: targetEntry.sprite,
          x: targetEntry.sprite.x - 14,
          duration: 70,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
        });
        targetEntry.sprite.setTintFill(0xffffff);
        const hurtTimer = setTimeout(() => {
          if (targetEntry.sprite.active) {
            targetEntry.sprite.clearTint();
            const currentMember = (appState.runState?.party || []).find((member) => member.id === targetEntry.memberId);
            this.applyCombatantFreezeVisual(targetEntry, currentMember);
          }
        }, 180);
        this.pendingFxTimers.push(hurtTimer);
      });
      const idleTimer = setTimeout(() => {
        if (enemyEntry.sprite.active) {
          enemyEntry.sprite.play(enemyEntry.animation, true);
          const currentEnemy = (appState.runState?.enemies || []).find((enemy) => enemy.id === enemyEntry.enemyId);
          this.applyCombatantFreezeVisual(enemyEntry, currentEnemy);
        }
      }, 500);
      this.pendingFxTimers.push(idleTimer);
    }

    processCombatFeedbackEvents(runState) {
      const events = (runState?.combatFeedbackEvents || []).filter((event) => event?.id && !this.processedFeedbackEventIds.has(event.id));
      if (!events.length) {
        return;
      }
      events.forEach((event) => this.processedFeedbackEventIds.add(event.id));
      let delayMs = 0;
      events.forEach((event) => {
        const timer = setTimeout(() => this.playCombatFeedbackEvent(event), delayMs);
        this.pendingFxTimers.push(timer);
        delayMs += event.type === "enemy_attack" ? ENEMY_ATTACK_FEEDBACK_STAGGER_MS : COMBAT_FEEDBACK_EVENT_STAGGER_MS;
      });
      if (this.processedFeedbackEventIds.size > 240) {
        this.processedFeedbackEventIds = new Set(Array.from(this.processedFeedbackEventIds).slice(-160));
      }
    }

    syncCombatState(runState) {
      this.stageTitle?.setText(runState.stageName);
      const visualRunState = getVisualRunState(runState);
      const pendingFeedbackEvents = (runState?.combatFeedbackEvents || []).filter((event) => event?.id && !this.processedFeedbackEventIds.has(event.id));
      const partyFeedbackDamageTargets = new Set();
      const enemyFeedbackDamageTargets = new Set();
      pendingFeedbackEvents.forEach((event) => {
        if (event.type === "enemy_attack") {
          (event.targets || []).forEach((target) => {
            if (target?.targetId) partyFeedbackDamageTargets.add(target.targetId);
          });
        }
        if (STATUS_DAMAGE_FEEDBACK_TYPES.has(event.type) && event.targetId) {
          if (event.targetKind === "party") {
            partyFeedbackDamageTargets.add(event.targetId);
          } else {
            enemyFeedbackDamageTargets.add(event.targetId);
          }
        }
      });

      if (this.phasePanelBg) {
        this.phasePanelBg.destroy();
        this.phasePanelBg = null;
      }
      if (this.phasePanelTitle) {
        this.phasePanelTitle.destroy();
        this.phasePanelTitle = null;
      }
      if (this.phasePanelSummary) {
        this.phasePanelSummary.destroy();
        this.phasePanelSummary = null;
      }
      (this.phaseActors || []).forEach((entry) => {
        entry.bg.destroy();
        entry.sprite.destroy();
        entry.name.destroy();
        entry.state.destroy();
      });
      this.phaseActors = [];

      visualRunState.party.forEach((member) => {
        const entry = this.partySprites.find((partyEntry) => partyEntry.memberId === member.id);
        if (!entry) {
          return;
        }
        const previousHp = typeof entry.lastHp === "number" ? entry.lastHp : member.hp;
        if (member.hp < previousHp && entry.sprite?.visible && !partyFeedbackDamageTargets.has(member.id)) {
          this.spawnDamageNumber(entry.sprite.x, entry.sprite.y, previousHp - member.hp);
        }
        entry.label.setText(member.nickname);
        entry.hp.setText(`HP ${member.hp}/${member.maxHp}`);
        if (!entry.hideInlineUi) {
          this.setHpBar(
            { fill: entry.hpBarFill, maxWidth: entry.hpBarMaxWidth },
            member.hp,
            member.maxHp,
            { animate: true, duration: 540 },
          );
          this.setDrownedHpBar(
            {
              drownedFill: entry.hpBarDrownedFill,
              maxWidth: entry.hpBarMaxWidth,
              x: entry.hpBarBg?.x,
              y: entry.hpBarBg?.y,
            },
            member.effects?.drownedValue || 0,
            member.maxHp,
            member.hp,
          );
        }
        if (entry.hpBarBg) {
          entry.hpBarBg.setVisible(member.alive && !entry.hideInlineUi);
        }
        if (entry.hpBarFill) {
          entry.hpBarFill.setVisible(
            member.alive && !entry.hideInlineUi && getHealthRatio(member.hp, member.maxHp) > 0,
          );
        }
        if (entry.hpBarDrownedFill) {
          entry.hpBarDrownedFill.setVisible(
            member.alive &&
              !entry.hideInlineUi &&
              getHealthRatio(member.effects?.drownedValue || 0, member.maxHp) > 0,
          );
        }
        if (entry.hideInlineUi) {
          entry.label?.setVisible(false);
          entry.hp?.setVisible(false);
        }
        entry.characterRef = getRunMemberCharacterRef(member, runState);
        applyCharacterSpriteVisuals(entry.sprite, entry.characterRef);
        entry.sprite.setFlipX(shouldFlipCharacterSprite(entry.characterRef, 1));
        entry.sprite.setAlpha(member.alive ? 1 : 0.45);
        this.applyCombatantFreezeVisual(entry, member);
        this.syncPartyStatusFx(entry, member);
        entry.lastHp = member.hp;
      });

      runState.enemies.forEach((enemy) => {
        const entry = this.enemySprites.find((enemyEntry) => enemyEntry.enemyId === enemy.id);
        if (!entry) {
          return;
        }
        const previousHp = typeof entry.lastHp === "number" ? entry.lastHp : enemy.hp;
        if (enemy.hp < previousHp && entry.sprite?.visible && !enemyFeedbackDamageTargets.has(enemy.id)) {
          const damageAmount = Math.round(previousHp - enemy.hp);
          this.spawnDamageNumber(entry.sprite.x, entry.sprite.y, damageAmount);
        }
        entry.label.setText(enemy.name);
        this.updateHpPill({ bg: entry.hpPillBg, label: entry.hp }, this.getHpValueText(enemy.hp, enemy.maxHp));
        this.setHpBar(
          { fill: entry.hpBarFill, maxWidth: entry.hpBarMaxWidth },
          enemy.hp,
          enemy.maxHp,
          { animate: true, duration: 540 },
        );
        this.setDrownedHpBar(
          {
            drownedFill: entry.hpBarDrownedFill,
            maxWidth: entry.hpBarMaxWidth,
            x: entry.hpBarBg?.x,
            y: entry.hpBarBg?.y,
          },
          enemy.effects?.drownedValue || 0,
          enemy.maxHp,
          enemy.hp,
        );
        entry.sprite.setVisible(enemy.alive);
        entry.label.setVisible(false);
        entry.hp.setVisible(enemy.alive);
        entry.hpPillBg?.setVisible(enemy.alive);
        if (entry.hpBarBg) {
          entry.hpBarBg.setVisible(enemy.alive);
        }
        if (entry.hpBarFill) {
          entry.hpBarFill.setVisible(enemy.alive && getHealthRatio(enemy.hp, enemy.maxHp) > 0);
        }
        if (entry.hpBarDrownedFill) {
          entry.hpBarDrownedFill.setVisible(enemy.alive && getHealthRatio(enemy.effects?.drownedValue || 0, enemy.maxHp) > 0);
        }
        if (entry.highlight) {
          entry.highlight.setVisible(enemy.alive && canTargetEnemy() && appState.combatHoverEnemyId === enemy.id);
        }
        if (!enemy.alive) {
          entry.sprite.setAlpha(0.35);
        }
        this.applyCombatantFreezeVisual(entry, enemy);
        this.syncEnemyStatusFx(entry, enemy);
        entry.lastHp = enemy.hp;
      });

      this.lastTurnPhase = runState.turn?.phase || null;
      this.processCombatFeedbackEvents(runState);
      this.updateEnemyHighlights();
      scheduleEnemyIntentOverlayUpdate();
    }

    renderPhasePanel(runState) {
      const actedIds = new Set(runState.turn?.actedPlayerIds || []);
      const aliveParty = runState.party.filter((member) => member.alive);
      const actedCount = aliveParty.filter((member) => actedIds.has(member.id)).length;
      const pendingCount = aliveParty.length - actedCount;
      const panelX = 1040;
      const panelY = 102;

      this.phasePanelBg = this.add.rectangle(panelX, panelY, 360, 150, 0x08101a, 0.82).setStrokeStyle(2, 0xffffff, 0.12);
      this.phasePanelTitle = this.add.text(panelX - 158, panelY - 58, "Party Phase Tracker", {
        fontSize: "24px",
        color: "#f4f7ff",
      });
      this.phasePanelSummary = this.add.text(
        panelX - 158,
        panelY - 26,
        runState.turn?.phase === "enemy"
          ? "Enemy phase resolving"
          : `${actedCount}/${aliveParty.length} ready, ${pendingCount} acting`,
        {
          fontSize: "18px",
          color: "#c8d8ef",
        },
      );

      this.phaseActors = runState.party.map((member, index) => {
        const isActed = actedIds.has(member.id);
        const isDown = !member.alive;
        const cardX = panelX - 145 + index * 86;
        const cardY = panelY + 24;
        const bg = this.add
          .rectangle(cardX, cardY, 74, 60, isDown ? 0x3d2030 : isActed ? 0x1d4d36 : 0x2c3546, 0.95)
          .setStrokeStyle(2, isDown ? 0xff8fa3 : isActed ? 0x85f0b1 : 0xd8e5f8, 0.28);
        const phaseCharRef = getRunMemberCharacterRef(member, runState);
        const phaseProfile = getCharacterVisualProfile(phaseCharRef);
        const sprite = this.add.sprite(cardX - 18, cardY - 4, phaseProfile.texture).setScale(0.22);
        playCharacterAnimation(sprite, phaseCharRef, "idle");
        const name = this.add.text(cardX - 4, cardY - 18, member.nickname.slice(0, 7), {
          fontSize: "12px",
          color: "#ffffff",
        });
        const state = this.add.text(cardX - 4, cardY + 4, isDown ? "Down" : isActed ? "Ready" : "Acting", {
          fontSize: "12px",
          color: isDown ? "#ffb9c6" : isActed ? "#bff6cf" : "#dce7f7",
        });
        return { bg, sprite, name, state };
      });
    }

    updateEnemyHighlights() {
      const targetable = canTargetEnemy();
      const aoe = actionIsAoe(appState.pendingCombatAction);
      const enemiesById = new Map((appState.runState?.enemies || []).map((enemy) => [enemy.id, enemy]));
      this.enemySprites.forEach((entry) => {
        if (!entry.highlight) {
          return;
        }
        const enemyData = enemiesById.get(entry.enemyId);
        const isAlive = !!(enemyData && enemyData.alive);
        const effectiveness = getPendingTargetEffectiveness(entry.enemyId);
        entry.highlight.setPosition(entry.sprite.x, entry.sprite.y);
        this.drawEnemyCrosshair(entry.highlight, entry.sprite.displayWidth, entry.sprite.displayHeight, effectiveness);
        const showHighlight =
          isAlive && targetable && (aoe || appState.combatHoverEnemyId === entry.enemyId);
        entry.highlight.setVisible(showHighlight);
      });
      this.updateEnemyEffectivenessIndicators();
    }

    createEnemyCrosshair() {
      const container = this.add.container(0, 0).setVisible(false).setDepth(2403);
      const outer = this.add.graphics();
      const inner = this.add.graphics();
      container.add([outer, inner]);
      container.outerRing = outer;
      container.innerRing = inner;
      this.tweens.add({
        targets: outer,
        rotation: Math.PI * 2,
        duration: 4200,
        repeat: -1,
        ease: "Linear",
      });
      this.tweens.add({
        targets: inner,
        rotation: -Math.PI * 2,
        duration: 3000,
        repeat: -1,
        ease: "Linear",
      });
      return container;
    }

    drawEnemyCrosshair(target, width, height, effectiveness = "neutral") {
      if (!target) {
        return;
      }
      const outer = target.outerRing || target;
      const inner = target.innerRing || null;
      const isRainbow = effectiveness === "super";
      const color = effectiveness === "barely" ? 0xffd84d : 0xffffff;
      const rainbowColors = [0xff3b3b, 0xff9f1c, 0xffe66d, 0x33d17a, 0x2ec4ff, 0x8f5cff];
      const radius = Math.max(width, height) * 0.32 + 6;

      outer.clear();
      const tickGap = 2;
      const tickLen = 7;
      if (isRainbow) {
        const segmentSize = (Math.PI * 2) / rainbowColors.length;
        rainbowColors.forEach((segmentColor, index) => {
          outer.lineStyle(2, segmentColor, 0.95);
          outer.beginPath();
          outer.arc(0, 0, radius, index * segmentSize, (index + 1) * segmentSize);
          outer.strokePath();
        });
        [
          [0, -radius - tickGap, 0, -radius - tickGap - tickLen],
          [0, radius + tickGap, 0, radius + tickGap + tickLen],
          [-radius - tickGap, 0, -radius - tickGap - tickLen, 0],
          [radius + tickGap, 0, radius + tickGap + tickLen, 0],
        ].forEach(([x1, y1, x2, y2], index) => {
          outer.lineStyle(2, rainbowColors[index % rainbowColors.length], 0.95);
          outer.beginPath();
          outer.moveTo(x1, y1);
          outer.lineTo(x2, y2);
          outer.strokePath();
        });
      } else {
        outer.lineStyle(2, color, 0.95);
        outer.strokeCircle(0, 0, radius);
        outer.beginPath();
        outer.moveTo(0, -radius - tickGap);
        outer.lineTo(0, -radius - tickGap - tickLen);
        outer.moveTo(0, radius + tickGap);
        outer.lineTo(0, radius + tickGap + tickLen);
        outer.moveTo(-radius - tickGap, 0);
        outer.lineTo(-radius - tickGap - tickLen, 0);
        outer.moveTo(radius + tickGap, 0);
        outer.lineTo(radius + tickGap + tickLen, 0);
        outer.strokePath();
      }
      outer.fillStyle(color, 0.9);
      outer.fillCircle(0, 0, 2);

      if (inner) {
        inner.clear();
        const innerRadius = radius * 0.58;
        const innerTickGap = 2;
        const innerTickLen = 5;
        const diag = Math.SQRT1_2;
        const dNear = innerRadius + innerTickGap;
        const dFar = dNear + innerTickLen;
        if (isRainbow) {
          const segmentSize = (Math.PI * 2) / rainbowColors.length;
          rainbowColors.forEach((segmentColor, index) => {
            inner.lineStyle(2, segmentColor, 0.85);
            inner.beginPath();
            inner.arc(0, 0, innerRadius, index * segmentSize, (index + 1) * segmentSize);
            inner.strokePath();
          });
          [
            [dNear * diag, -dNear * diag, dFar * diag, -dFar * diag],
            [-dNear * diag, -dNear * diag, -dFar * diag, -dFar * diag],
            [-dNear * diag, dNear * diag, -dFar * diag, dFar * diag],
            [dNear * diag, dNear * diag, dFar * diag, dFar * diag],
          ].forEach(([x1, y1, x2, y2], index) => {
            inner.lineStyle(2, rainbowColors[(index + 2) % rainbowColors.length], 0.85);
            inner.beginPath();
            inner.moveTo(x1, y1);
            inner.lineTo(x2, y2);
            inner.strokePath();
          });
        } else {
          inner.lineStyle(2, color, 0.85);
          inner.strokeCircle(0, 0, innerRadius);
          inner.beginPath();
          inner.moveTo(dNear * diag, -dNear * diag);
          inner.lineTo(dFar * diag, -dFar * diag);
          inner.moveTo(-dNear * diag, -dNear * diag);
          inner.lineTo(-dFar * diag, -dFar * diag);
          inner.moveTo(-dNear * diag, dNear * diag);
          inner.lineTo(-dFar * diag, dFar * diag);
          inner.moveTo(dNear * diag, dNear * diag);
          inner.lineTo(dFar * diag, dFar * diag);
          inner.strokePath();
        }
      }
    }

    updateEnemyEffectivenessIndicators() {
      const pending = appState.pendingCombatAction;
      const attacker = getCurrentMember();
      const attackerType = attacker?.type || null;
      const showForAny = Boolean(
        pending &&
          attackerType &&
          actionUsesTypedDamage(pending) &&
          appState.runState?.stageType === "combat" &&
          canCurrentPlayerAct(),
      );
      const desiredWidth = 140;
      this.enemySprites.forEach((entry) => {
        const indicator = entry.effectIndicator;
        if (!indicator) {
          return;
        }
        const enemy = (appState.runState?.enemies || []).find((e) => e.id === entry.enemyId);
        const defenderType = enemy?.type || entry.enemyType;
        const enemyAlive = Boolean(enemy?.alive);
        const effectiveness = showForAny && enemyAlive
          ? getTypeEffectiveness(attackerType, defenderType)
          : "neutral";
        if (!showForAny || !enemyAlive || effectiveness === "neutral") {
          if (indicator.visible) {
            indicator.setVisible(false);
          }
          entry.effectLastKey = null;
          return;
        }
        const textureKey = effectiveness === "super" ? "fx-super-effective" : "fx-barely-effective";
        const animationKey = effectiveness === "super" ? "fx-super-effective-anim" : "fx-barely-effective-anim";
        const textureChanged = indicator.texture.key !== textureKey;
        if (textureChanged) {
          indicator.setTexture(textureKey);
          indicator.setScale(Math.min(1, desiredWidth / Math.max(1, indicator.width)));
        }
        indicator.setPosition(entry.sprite.x, entry.sprite.y - entry.sprite.displayHeight / 2 - 22);
        indicator.setDepth(2600);
        const key = `${entry.enemyId}:${textureKey}`;
        if (entry.effectLastKey !== key) {
          entry.effectLastKey = key;
          indicator.setVisible(true);
          indicator.setAlpha(0);
          const targetScaleX = indicator.scaleX;
          const targetScaleY = indicator.scaleY;
          indicator.setScale(targetScaleX * 0.7, targetScaleY * 0.7);
          this.tweens.add({
            targets: indicator,
            alpha: 1,
            scaleX: targetScaleX,
            scaleY: targetScaleY,
            duration: 180,
            ease: "Back.Out",
          });
          indicator.play(animationKey, true);
        } else if (!indicator.visible) {
          indicator.setVisible(true);
          indicator.setAlpha(1);
          indicator.play(animationKey, true);
        } else if (!indicator.anims?.isPlaying) {
          indicator.play(animationKey, true);
        }
      });
    }

    getEnemyScreenPositions() {
      const canvas = this.game?.canvas;
      if (!canvas || !Array.isArray(this.enemySprites)) {
        return [];
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width ? rect.width / canvas.width : 1;
      const scaleY = canvas.height ? rect.height / canvas.height : 1;
      const cam = this.cameras?.main;
      const scrollX = cam?.scrollX || 0;
      const scrollY = cam?.scrollY || 0;
      const zoom = cam?.zoom || 1;
      return this.enemySprites
        .filter((entry) => entry.sprite && entry.sprite.active !== false && entry.sprite.visible !== false)
        .map((entry) => {
          const sprite = entry.sprite;
          const centerWorldX = sprite.x;
          const centerWorldY = sprite.y;
          const clientX = (centerWorldX - scrollX) * zoom * scaleX + rect.left;
          const clientY = (centerWorldY - scrollY) * zoom * scaleY + rect.top;
          return { id: entry.enemyId, clientX, clientY };
        });
    }

    getPartyScreenPositions() {
      const canvas = this.game?.canvas;
      if (!canvas || !Array.isArray(this.partySprites)) {
        return [];
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width ? rect.width / canvas.width : 1;
      const scaleY = canvas.height ? rect.height / canvas.height : 1;
      const cam = this.cameras?.main;
      const scrollX = cam?.scrollX || 0;
      const scrollY = cam?.scrollY || 0;
      const zoom = cam?.zoom || 1;
      return this.partySprites
        .filter((entry) => entry.sprite && entry.sprite.active !== false && entry.sprite.visible !== false)
        .map((entry) => {
          const sprite = entry.sprite;
          const centerWorldX = sprite.x;
          const centerWorldY = sprite.y;
          const clientX = (centerWorldX - scrollX) * zoom * scaleX + rect.left;
          const clientY = (centerWorldY - scrollY) * zoom * scaleY + rect.top;
          return { id: entry.memberId, clientX, clientY };
        });
    }

    previewCombatAction(action) {
      const isAttackKind = action.kind === "swing" || action.kind === "spell";
      const attacker = this.partySprites.find((entry) => entry.memberId === action.actorId);
      const target = this.enemySprites.find((entry) => entry.enemyId === action.targetId);
      const allyTargets = action.targetKind === "ally"
        ? (Array.isArray(action.targetIds) && action.targetIds.length > 0 ? action.targetIds : [action.targetId])
            .map((targetId) => this.partySprites.find((entry) => entry.memberId === targetId))
            .filter(Boolean)
        : [];

      if (isAttackKind) {
        playAttackSfx(action);
      }

      if (attacker && isAttackKind) {
        playCharacterAnimation(attacker.sprite, attacker.characterRef, "attack");
        this.tweens.add({
          targets: attacker.sprite,
          x: attacker.sprite.x + 28,
          duration: 120,
          yoyo: true,
          ease: "Quad.easeOut",
        });
        const timer = setTimeout(() => {
          if (attacker.sprite.active) {
            playCharacterAnimation(attacker.sprite, attacker.characterRef, "idle");
            const currentMember = (appState.runState?.party || []).find((member) => member.id === attacker.memberId);
            this.applyCombatantFreezeVisual(attacker, currentMember);
          }
        }, 420);
        this.pendingFxTimers.push(timer);
      }

      if (target && isAttackKind) {
        this.tweens.add({
          targets: target.sprite,
          x: target.sprite.x - 16,
          duration: 70,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
        });
        target.sprite.setTintFill(0xffffff);
        const timer = setTimeout(() => {
          if (target.sprite.active) {
            target.sprite.clearTint();
            const currentEnemy = (appState.runState?.enemies || []).find((enemy) => enemy.id === target.enemyId);
            this.applyCombatantFreezeVisual(target, currentEnemy);
          }
        }, 180);
        this.pendingFxTimers.push(timer);
      }

      if (allyTargets.length > 0 && isAttackKind) {
        allyTargets.forEach((ally) => {
          ally.sprite.setTintFill(0x66ff99);
          const timer = setTimeout(() => {
            if (ally.sprite.active) {
              ally.sprite.clearTint();
              const currentMember = (appState.runState?.party || []).find((member) => member.id === ally.memberId);
              this.applyCombatantFreezeVisual(ally, currentMember);
            }
          }, 260);
          this.pendingFxTimers.push(timer);
        });
      }

      if (isAttackKind && action.targetKind !== "ally" && ATTACK_ANIMATION_DEFS[action.id]) {
        const impactTargets = actionIsAoe(action)
          ? this.enemySprites.filter((entry) => {
              const enemy = (appState.runState?.enemies || []).find((e) => e.id === entry.enemyId);
              return entry.sprite?.active && (enemy ? enemy.alive !== false : true);
            })
          : target
            ? [target]
            : [];
        impactTargets.forEach((entry) => {
          if (action.missedByUpdraft) {
            this.spawnStatusEffectOnce("updraft", entry.sprite, {
              delayMs: 120,
              heightRatio: 1.1,
              scaleMultiplier: this.getStatusEffectScaleMultiplier("updraft"),
              depthOffset: 95,
            });
            return;
          }
          this.spawnAttackImpact(action.id, entry.sprite, 120);
        });
      }
    }

    spawnAttackImpact(actionId, targetSprite, delayMs = 0) {
      const def = ATTACK_ANIMATION_DEFS[actionId];
      if (!def || !targetSprite?.active) {
        return;
      }
      const textureKey = getAttackAnimationTextureKey(actionId);
      const animKey = getAttackAnimationKey(actionId);
      if (!this.textures.exists(textureKey) || !this.anims.exists(animKey)) {
        return;
      }

      const spawn = () => {
        if (!targetSprite.active) {
          return;
        }
        const targetH = Math.max(140, targetSprite.displayHeight * 1.05);
        const scale = targetH / def.frame;
        const fx = this.add
          .sprite(targetSprite.x, targetSprite.y, textureKey)
          .setScale(scale)
          .setDepth((targetSprite.depth || 1200) + 50);
        const cleanup = () => {
          if (fx.active) {
            fx.destroy();
          }
        };
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, cleanup);
        // Safety fallback in case the animation event never fires (e.g. scene shutdown).
        const safety = setTimeout(cleanup, 1500);
        this.pendingFxTimers.push(safety);
        fx.play(animKey);
      };

      if (delayMs > 0) {
        const timer = setTimeout(spawn, delayMs);
        this.pendingFxTimers.push(timer);
      } else {
        spawn();
      }
    }

    spawnEnemyImpact(enemyEntry, targetSprite, delayMs = 0) {
      if (!enemyEntry?.impactTexture || !enemyEntry?.impactAnimation || !targetSprite?.active) {
        return;
      }
      if (!this.textures.exists(enemyEntry.impactTexture) || !this.anims.exists(enemyEntry.impactAnimation)) {
        return;
      }

      const spawn = () => {
        if (!targetSprite.active) {
          return;
        }
        const frameSize = enemyEntry.impactFrame || 160;
        const targetH = Math.max(120, targetSprite.displayHeight * 0.85);
        const fx = this.add
          .sprite(targetSprite.x, targetSprite.y - targetSprite.displayHeight * 0.08, enemyEntry.impactTexture)
          .setScale(targetH / frameSize)
          .setDepth((targetSprite.depth || 1200) + 55);
        const cleanup = () => {
          if (fx.active) {
            fx.destroy();
          }
        };
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, cleanup);
        const safety = setTimeout(cleanup, 1500);
        this.pendingFxTimers.push(safety);
        fx.play(enemyEntry.impactAnimation);
      };

      if (delayMs > 0) {
        const timer = setTimeout(spawn, delayMs);
        this.pendingFxTimers.push(timer);
      } else {
        spawn();
      }
    }

    previewEnemyPhase() {
      this.processCombatFeedbackEvents(appState.runState);
    }
  }

  function transitionTo(sceneKey) {
    const targetScene = SCENE_MAP[sceneKey];
    if (!targetScene || !appState.game) {
      renderUi();
      return;
    }

    if (sceneKey === appState.sceneKey) {
      refreshActiveScene();
      renderUi();
      return;
    }

    const previousSceneName = SCENE_MAP[appState.sceneKey];
    appState.sceneKey = sceneKey;
    appState.pendingCombatAction = null;
    if (sceneKey !== "run") {
      hideStageIntroOverlay({ resetSignature: true });
      hideRewardOverlay();
    }

    const finalizeTransition = () => {
      Object.values(SCENE_MAP).forEach((sceneName) => {
        const scene = appState.game.scene.getScene(sceneName);
        if (scene && scene.scene.isActive() && sceneName !== targetScene) {
          appState.game.scene.stop(sceneName);
        }
      });

      const assetGroups = getMissingAssetGroups(sceneKey);
      if (assetGroups.length) {
        appState.game.scene.start("LoadingScene", {
          targetScene,
          assetGroups,
          label: "Loading Area",
        });
        updateMusicForState();
        renderUi();
        return;
      }

      const scene = appState.game.scene.getScene(targetScene);
      if (!scene.scene.isActive()) {
        appState.game.scene.start(targetScene);
      } else if (typeof scene.refreshState === "function") {
        scene.refreshState();
        playSceneFadeIn(scene);
      }
      updateMusicForState();
      renderUi();
    };

    const previousScene = previousSceneName ? appState.game.scene.getScene(previousSceneName) : null;
    if (previousScene && previousScene.scene.isActive() && previousSceneName !== targetScene) {
      playSceneFadeOut(previousScene, SCENE_FADE_OUT_MS, finalizeTransition);
      renderUi();
      return;
    }

    finalizeTransition();
  }

  function refreshActiveScene() {
    if (!appState.game) {
      return;
    }
    const sceneName = SCENE_MAP[appState.sceneKey];
    if (!sceneName) {
      return;
    }
    const scene = appState.game.scene.getScene(sceneName);
    if (scene && scene.scene.isActive() && typeof scene.refreshState === "function") {
      scene.refreshState();
    }
  }

  function bindSocket() {
    appState.socket = io();

    appState.socket.on("connect", () => {
      tryVibeJamPortalBootstrap();
    });

    appState.socket.on("sessionState", ({ player }) => {
      appState.player = player;
      syncCharacterSetupStateFromPlayer();
      tryVibeJamPortalBootstrap();
      refreshActiveScene();
      renderUi();
    });

    appState.socket.on("sceneChange", ({ scene }) => {
      if (appState.runEndPartyFadeActive) {
        appState.deferredSceneChangeKey = scene;
        return;
      }
      transitionTo(scene);
    });

    appState.socket.on("hubState", (payload) => {
      appState.hubState = payload;
      if (appState.sceneKey === "hub") {
        refreshActiveScene();
        renderUi();
      }
    });

    appState.socket.on("lobbyState", (payload) => {
      appState.lobbyState = payload;
      if (appState.sceneKey === "lobby") {
        refreshActiveScene();
        renderUi();
      }
    });

    appState.socket.on("runState", (payload) => {
      const previousRunState = appState.runState;
      maybeFlashForLocalDamage(previousRunState, payload);
      prepareVisualEnemyAttackHp(previousRunState, payload);
      appState.runState = payload;
      if (appState.sceneKey === "run") {
        const loadingScene = appState.game?.scene.getScene("LoadingScene");
        if (loadingScene?.scene.isActive()) {
          updateMusicForState();
          renderUi();
          return;
        }
        const assetGroups = getMissingAssetGroups("run");
        if (assetGroups.length) {
          const runScene = appState.game?.scene.getScene("RunScene");
          if (runScene?.scene.isActive()) {
            appState.game.scene.stop("RunScene");
          }
          appState.game.scene.start("LoadingScene", {
            targetScene: "RunScene",
            assetGroups,
            label: "Loading Battle",
          });
          updateMusicForState();
          renderUi();
          return;
        }
        refreshActiveScene();
        updateMusicForState();
        renderUi();
      }
    });

    appState.socket.on("combatPreview", (payload) => {
      if (appState.sceneKey !== "run") {
        return;
      }
      const scene = getSceneInstance("run");
      if (scene && scene.scene.isActive() && typeof scene.previewCombatAction === "function") {
        scene.previewCombatAction(payload);
      }
    });

    appState.socket.on("runEndSummary", (payload) => {
      if (!modalRoot || !payload || payload.success) {
        return;
      }
      const signature = getRunEndSummarySignature(payload);
      if (signature && appState.runEndSummarySignature === signature) {
        return;
      }
      if (signature && appState.pendingRunEndSummarySignature === signature) {
        return;
      }
      if (signature) {
        appState.pendingRunEndSummarySignature = signature;
      }

      const runScene = appState.game?.scene?.getScene("RunScene");
      const needsPartyFade =
        runScene?.scene?.isActive() &&
        appState.runState?.stageType === "combat" &&
        Array.isArray(runScene.partySprites) &&
        runScene.partySprites.some((entry) => entry.sprite?.active);

      const finishRunEndFlow = () => {
        appState.pendingRunEndSummarySignature = null;
        appState.runEndPartyFadeActive = false;
        showRunEndSummaryModal(payload);
        const deferredScene = appState.deferredSceneChangeKey;
        appState.deferredSceneChangeKey = null;
        if (deferredScene) {
          transitionTo(deferredScene);
        }
      };

      if (needsPartyFade && typeof runScene.fadeOutPartySpritesForRunEnd === "function") {
        appState.runEndPartyFadeActive = true;
        runScene.fadeOutPartySpritesForRunEnd(finishRunEndFlow);
        return;
      }

      appState.pendingRunEndSummarySignature = null;
      showRunEndSummaryModal(payload);
    });

    appState.socket.on("toast", ({ message, type }) => {
      showToast(message, type);
    });
  }

  function startGame() {
    appState.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      width: 1280,
      height: 720,
      backgroundColor: "#0a1320",
      input: {
        mouse: {
          preventDefaultWheel: false,
        },
      },
      scene: [BootScene, LoadingScene, EntryScene, CharacterSelectScene, HubScene, LobbyScene, RunScene],
      plugins: {
        scene: [
          {
            key: "rexUI",
            plugin: window.rexuiplugin,
            mapping: "rexUI",
          },
        ],
      },
    });
    bindSocket();
    initTargetingArrow();
    initEnemyIntentOverlay();
    initSettingsAccessButton();
    updateMusicForState();
    renderUi();
  }

  startGame();
  setInterval(() => {
    if (appState.sceneKey === "run" && appState.runState?.turn?.turnEndsAt) {
      renderUi();
    }
  }, 1000);
})();
