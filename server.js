const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const BURN_EXTINGUISH_CHANCE = 0.35;
const MAX_POISON_STACKS = 5;
const BLEED_SWING_CHANCE = 0.25;
const BLEED_DAMAGE_PER_STACK = 3;
const FIRE_BURN_CHANCE = 0.5;
const ICE_FREEZE_CHANCE = 0.1;
const WIND_UPDRAFT_CHANCE = 0.15;
const LIGHTNING_STUN_CHANCE = 0.15;
const SUNKEN_KING_STUN_CHANCE = 0.2;
const UPDRAFT_MISS_CHANCE = 0.5;
const CORRUPTION_DAMAGE_MULTIPLIER = 0.8;
const EARTH_DEFENSE_BONUS = 0.1;
const WATER_DROWNED_DAMAGE_RATIO = 0.5;
const DEATH_MAX_HP_MULTIPLIER = 0.5;
const MOB_FLOORS_BETWEEN_SHOPS = 2;
const FREEZE_THAW_CHANCES = [0.1, 0.25, 0.5, 0.75, 1];
const ENEMY_ATTACK_DELAY_MS = 900;
const ENEMY_PHASE_COMPLETE_DELAY_MS = 900;
const COMBAT_VICTORY_REWARD_DELAY_MS = 1500;
const FLOOR_10_BOSS_NICKNAME = "bossman";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use("/Assets", express.static(path.join(__dirname, "Assets")));
app.use("/vendor", express.static(path.join(__dirname, "node_modules", "phaser", "dist")));
app.use("/vendor/rex-plugins", express.static(path.join(__dirname, "node_modules", "phaser3-rex-plugins", "dist")));

const players = new Map();
const lobbies = new Map();
const runs = new Map();

const LEVEL_THRESHOLDS = [0, 80, 200, 400, 720];
const LEVEL_UP_STAT_CHOICES = {
  max_hp: {
    id: "max_hp",
    name: "Heartier",
    description: "+12 Max HP and heal 12 HP.",
    apply(member) {
      member.maxHp += 12;
      member.hp = clamp(member.hp + 12, 0, member.maxHp);
    },
  },
  swing_damage: {
    id: "swing_damage",
    name: "Sharpen Swings",
    description: "+8% swing damage.",
    apply(member) {
      member.swingDamage = Number((member.swingDamage + 0.08).toFixed(2));
    },
  },
  spell_damage: {
    id: "spell_damage",
    name: "Deepen Magic",
    description: "+8% spell damage.",
    apply(member) {
      member.spellDamage = Number((member.spellDamage + 0.08).toFixed(2));
    },
  },
  defense: {
    id: "defense",
    name: "Brace",
    description: "+3% swing and spell defense.",
    apply(member) {
      member.swingDefense = Number(clampDefense(member.swingDefense + 0.03).toFixed(2));
      member.spellDefense = Number(clampDefense(member.spellDefense + 0.03).toFixed(2));
    },
  },
};

const TYPE_CHART = require("./type_chart.json");
const TYPES = TYPE_CHART.types;
const TYPE_EFFECTIVENESS = TYPE_CHART.effectiveness;

const PLAYABLE_CHARACTERS = {
  flamewitch: {
    id: "flamewitch",
    name: "FlameWitch",
    type: "Fire",
    artKey: "flamewitch",
    maxHp: 100,
    swingDamage: 1.0,
    spellDamage: 1.15,
    swingDefense: 0.0,
    spellDefense: 0.05,
    energyRegen: 2,
    manaRegen: 1,
    startingSpells: ["ember_shot", "flame_burst"],
  },
  fartwizard: {
    id: "fartwizard",
    name: "Fart Wizard",
    type: "Poison",
    artKey: "fartwizard",
    maxHp: 100,
    swingDamage: 0.9,
    spellDamage: 1.1,
    swingDefense: 0.05,
    spellDefense: 0.1,
    energyRegen: 2,
    manaRegen: 1,
    startingSpells: ["toxic_bolt", "noxious_cloud"],
  },
  waternymph: {
    id: "waternymph",
    name: "Water Nymph",
    type: "Water",
    artKey: "waternymph",
    maxHp: 105,
    swingDamage: 0.95,
    spellDamage: 1.2,
    swingDefense: 0.05,
    spellDefense: 0.1,
    energyRegen: 2,
    manaRegen: 1,
    startingSpells: ["water_jet", "tidal_surge"],
  },
  sandman: {
    id: "sandman",
    name: "Sand Man",
    type: "Earth",
    artKey: "sandman",
    maxHp: 125,
    swingDamage: 1.2,
    spellDamage: 0.9,
    swingDefense: 0.15,
    spellDefense: 0.05,
    energyRegen: 1,
    manaRegen: 1,
    startingSpells: ["stone_spike", "sand_blast"],
  },
  theowl: {
    id: "theowl",
    name: "The Owl",
    type: "Wind",
    artKey: "theowl",
    maxHp: 95,
    swingDamage: 1.05,
    spellDamage: 1.05,
    swingDefense: 0.0,
    spellDefense: 0.05,
    energyRegen: 3,
    manaRegen: 1,
    startingSpells: ["gust_slash", "feather_storm"],
  },
  thedark: {
    id: "thedark",
    name: "The Dark",
    type: "Shadow",
    artKey: "thedark",
    maxHp: 110,
    swingDamage: 1.1,
    spellDamage: 1.15,
    swingDefense: 0.05,
    spellDefense: 0.15,
    energyRegen: 2,
    manaRegen: 1,
    startingSpells: ["shadow_bolt", "nightfall"],
  },
  thecleric: {
    id: "thecleric",
    name: "The Cleric",
    type: "Light",
    artKey: "thecleric",
    maxHp: 108,
    swingDamage: 0.9,
    spellDamage: 1.1,
    swingDefense: 0.1,
    spellDefense: 0.15,
    energyRegen: 2,
    manaRegen: 1,
    startingSpells: ["holy_spark", "radiant_wave"],
  },
  icequeen: {
    id: "icequeen",
    name: "Ice Queen",
    type: "Ice",
    artKey: "icequeen",
    maxHp: 98,
    swingDamage: 0.85,
    spellDamage: 1.25,
    swingDefense: 0.0,
    spellDefense: 0.1,
    energyRegen: 2,
    manaRegen: 2,
    startingSpells: ["frost_bolt", "blizzard"],
  },
  thedrummer: {
    id: "thedrummer",
    name: "The Drummer",
    type: "Lightning",
    artKey: "thedrummer",
    maxHp: 90,
    swingDamage: 1.0,
    spellDamage: 1.2,
    swingDefense: 0.0,
    spellDefense: 0.05,
    energyRegen: 3,
    manaRegen: 1,
    startingSpells: ["electric_jolt", "chain_lightning"],
  },
};

function normalizeCharacterRef(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const PLAYABLE_CHARACTER_ALIASES = (() => {
  const aliases = {};
  for (const [key, character] of Object.entries(PLAYABLE_CHARACTERS)) {
    [key, character.id, character.name, character.artKey].forEach((ref) => {
      const normalized = normalizeCharacterRef(ref);
      if (normalized) {
        aliases[normalized] = key;
      }
    });
  }
  aliases.firewitch = "flamewitch";
  aliases.waternypmh = "waternymph";
  aliases.owl = "theowl";
  aliases.dark = "thedark";
  aliases.dar = "thedark";
  aliases.cleric = "thecleric";
  aliases.ice = "icequeen";
  aliases.icequeen = "icequeen";
  aliases.queen = "icequeen";
  aliases.drummer = "thedrummer";
  aliases.electric = "thedrummer";
  return aliases;
})();

const BLESSINGS = {
  iron_skin: {
    id: "iron_skin",
    name: "Iron Skin",
    description: "+20 max HP for the run.",
    price: 120,
    apply(member) {
      member.blessings.push("iron_skin");
      member.maxHp += 20;
      member.hp += 20;
    },
  },
  quick_hands: {
    id: "quick_hands",
    name: "Quick Hands",
    description: "Start each combat with +1 Energy.",
    price: 140,
    apply(member) {
      member.blessings.push("quick_hands");
    },
  },
  mana_spring: {
    id: "mana_spring",
    name: "Mana Spring",
    description: "Gain 2 mana per turn instead of 1.",
    price: 140,
    apply(member) {
      member.blessings.push("mana_spring");
    },
  },
  blessed_blade: {
    id: "blessed_blade",
    name: "Blessed Blade",
    description: "+5 base damage to all swings.",
    price: 130,
    apply(member) {
      member.blessings.push("blessed_blade");
    },
  },
};

const SWINGS = {
  basic: {
    id: "basic",
    name: "Basic Swing",
    energyCost: 1,
    manaCost: 0,
    target: "single",
    price: 50,
    description: "Standard physical attack on one enemy. Successful swings have a 25% chance to apply Bleed.",
  },
  charged: {
    id: "charged",
    name: "Charged Swing",
    energyCost: 2,
    manaCost: 1,
    target: "single",
    price: 80,
    description: "A charged strike that mixes physical force with the wielder's elemental type. Successful swings have a 25% chance to apply Bleed.",
  },
  power: {
    id: "power",
    name: "Power Swing",
    energyCost: 3,
    manaCost: 2,
    target: "single",
    price: 110,
    description: "A heavy elemental swing with strong type interactions. Successful swings have a 25% chance to apply Bleed.",
  },
};
const DEFAULT_KNOWN_SWINGS = ["basic", "basic", "charged"];
const STARTING_LOADOUT_VERSION = 2;

const SPELLS = {
  ember_shot: {
    id: "ember_shot",
    name: "Ember Shot",
    type: "Fire",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 1,
    target: "single",
    price: 50,
    description: "15 fire damage to one enemy. Fire spells have a 50% chance to Burn.",
  },
  flame_burst: {
    id: "flame_burst",
    name: "Flame Burst",
    type: "Fire",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 1,
    target: "all",
    price: 50,
    description: "20 fire damage to all enemies. Fire spells have a 50% chance to Burn.",
  },
  ignite: {
    id: "ignite",
    name: "Ignite",
    type: "Fire",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 2,
    target: "all",
    price: 50,
    description: "100% chance to apply Burn to all enemies for 5 turns.",
  },
  inferno: {
    id: "inferno",
    name: "Inferno",
    type: "Fire",
    energyCost: 0,
    manaCost: 3,
    levelRequired: 3,
    target: "all",
    price: 90,
    description: "40 fire damage to all enemies. Fire spells have a 50% chance to Burn.",
  },
  meteor: {
    id: "meteor",
    name: "Meteor",
    type: "Fire",
    energyCost: 0,
    manaCost: 3,
    levelRequired: 4,
    target: "single",
    price: 140,
    description: "60 fire damage to one enemy. Fire spells have a 50% chance to Burn.",
  },
  toxic_bolt: {
    id: "toxic_bolt",
    name: "Toxic Bolt",
    type: "Poison",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 1,
    target: "single",
    price: 50,
    description: "15 poison damage to one enemy and apply Poison.",
  },
  noxious_cloud: {
    id: "noxious_cloud",
    name: "Noxious Cloud",
    type: "Poison",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 1,
    target: "all",
    price: 50,
    description: "20 poison damage to all enemies and apply Poison.",
  },
  water_jet: {
    id: "water_jet",
    name: "Water Jet",
    type: "Water",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 1,
    target: "single",
    price: 50,
    description: "15 water damage to one enemy and raise Drowned by 50% of damage dealt.",
  },
  tidal_surge: {
    id: "tidal_surge",
    name: "Tidal Surge",
    type: "Water",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 1,
    target: "all",
    price: 55,
    description: "20 water damage to all enemies and raise Drowned by 50% of damage dealt.",
  },
  whirlpool: {
    id: "whirlpool",
    name: "Whirlpool",
    type: "Water",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 2,
    target: "single",
    price: 80,
    description: "30 water damage to one enemy and raise Drowned by 50% of damage dealt.",
  },
  tsunami: {
    id: "tsunami",
    name: "Tsunami",
    type: "Water",
    energyCost: 0,
    manaCost: 3,
    levelRequired: 3,
    target: "all",
    price: 110,
    description: "40 water damage to all enemies and raise Drowned by 50% of damage dealt.",
  },
  stone_spike: {
    id: "stone_spike",
    name: "Stone Spike",
    type: "Earth",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 1,
    target: "single",
    price: 50,
    description: "15 earth damage to one enemy and increase the caster's defense for the encounter.",
  },
  sand_blast: {
    id: "sand_blast",
    name: "Sand Blast",
    type: "Earth",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 1,
    target: "all",
    price: 55,
    description: "20 earth damage to all enemies and increase party defense for the encounter.",
  },
  quicksand: {
    id: "quicksand",
    name: "Quicksand",
    type: "Earth",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 2,
    target: "single",
    price: 80,
    description: "30 earth damage to one enemy and increase the caster's defense for the encounter.",
  },
  earthquake: {
    id: "earthquake",
    name: "Earthquake",
    type: "Earth",
    energyCost: 0,
    manaCost: 3,
    levelRequired: 3,
    target: "all",
    price: 110,
    description: "40 earth damage to all enemies and increase party defense for the encounter.",
  },
  gust_slash: {
    id: "gust_slash",
    name: "Gust Slash",
    type: "Wind",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 1,
    target: "single",
    price: 50,
    description: "15 wind damage to one enemy. Wind spells have a 15% chance to apply Updraft.",
  },
  feather_storm: {
    id: "feather_storm",
    name: "Feather Storm",
    type: "Wind",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 1,
    target: "all",
    price: 55,
    description: "20 wind damage to all enemies. Wind spells have a 15% chance to apply Updraft.",
  },
  updraft: {
    id: "updraft",
    name: "Updraft",
    type: "Wind",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 2,
    target: "single",
    price: 80,
    description: "30 wind damage to one enemy. Wind spells have a 15% chance to apply Updraft.",
  },
  tempest: {
    id: "tempest",
    name: "Tempest",
    type: "Wind",
    energyCost: 0,
    manaCost: 3,
    levelRequired: 3,
    target: "all",
    price: 110,
    description: "40 wind damage to all enemies. Wind spells have a 15% chance to apply Updraft.",
  },
  shadow_bolt: {
    id: "shadow_bolt",
    name: "Shadow Bolt",
    type: "Shadow",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 1,
    target: "single",
    price: 50,
    description: "15 shadow damage to one enemy and apply Corruption.",
  },
  nightfall: {
    id: "nightfall",
    name: "Nightfall",
    type: "Shadow",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 1,
    target: "all",
    price: 55,
    description: "20 shadow damage to all enemies and apply Corruption.",
  },
  void_bind: {
    id: "void_bind",
    name: "Void Bind",
    type: "Shadow",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 2,
    target: "single",
    price: 80,
    description: "30 shadow damage to one enemy and apply Corruption.",
  },
  abyssal_storm: {
    id: "abyssal_storm",
    name: "Abyssal Storm",
    type: "Shadow",
    energyCost: 0,
    manaCost: 3,
    levelRequired: 3,
    target: "all",
    price: 110,
    description: "40 shadow damage to all enemies and apply Corruption.",
  },
  holy_spark: {
    id: "holy_spark",
    name: "Holy Spark",
    type: "Light",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 1,
    target: "single",
    price: 50,
    description: "15 light damage to one enemy, or heal an ally for 2x damage as The Cleric.",
  },
  radiant_wave: {
    id: "radiant_wave",
    name: "Radiant Wave",
    type: "Light",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 1,
    target: "all",
    price: 55,
    description: "20 light damage to all enemies, or heal all allies for 2x damage as The Cleric.",
  },
  smite: {
    id: "smite",
    name: "Smite",
    type: "Light",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 2,
    target: "single",
    price: 80,
    description: "30 light damage to one enemy, or heal an ally for 2x damage as The Cleric.",
  },
  heavenly_wrath: {
    id: "heavenly_wrath",
    name: "Heavenly Wrath",
    type: "Light",
    energyCost: 0,
    manaCost: 3,
    levelRequired: 3,
    target: "all",
    price: 110,
    description: "40 light damage to all enemies, or heal all allies for 2x damage as The Cleric.",
  },
  frost_bolt: {
    id: "frost_bolt",
    name: "Frost Bolt",
    type: "Ice",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 1,
    target: "single",
    price: 50,
    description: "15 ice damage to one enemy. Ice spells have a 10% chance to Freeze.",
  },
  blizzard: {
    id: "blizzard",
    name: "Blizzard",
    type: "Ice",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 1,
    target: "all",
    price: 55,
    description: "20 ice damage to all enemies. Ice spells have a 10% chance to Freeze.",
  },
  ice_prison: {
    id: "ice_prison",
    name: "Ice Prison",
    type: "Ice",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 2,
    target: "single",
    price: 80,
    description: "30 ice damage to one enemy. Ice spells have a 10% chance to Freeze.",
  },
  absolute_zero: {
    id: "absolute_zero",
    name: "Absolute Zero",
    type: "Ice",
    energyCost: 0,
    manaCost: 3,
    levelRequired: 3,
    target: "all",
    price: 110,
    description: "40 ice damage to all enemies. Ice spells have a 10% chance to Freeze.",
  },
  electric_jolt: {
    id: "electric_jolt",
    name: "Electric Jolt",
    type: "Lightning",
    energyCost: 0,
    manaCost: 1,
    levelRequired: 1,
    target: "single",
    price: 50,
    description: "15 lightning damage to one enemy. Lightning spells have a 15% chance to Stun.",
  },
  chain_lightning: {
    id: "chain_lightning",
    name: "Chain Lightning",
    type: "Lightning",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 1,
    target: "all",
    price: 55,
    description: "20 lightning damage to all enemies. Lightning spells have a 15% chance to Stun.",
  },
  thunder_crash: {
    id: "thunder_crash",
    name: "Thunder Crash",
    type: "Lightning",
    energyCost: 0,
    manaCost: 2,
    levelRequired: 2,
    target: "single",
    price: 80,
    description: "30 lightning damage to one enemy. Lightning spells have a 15% chance to Stun.",
  },
  storm_symphony: {
    id: "storm_symphony",
    name: "Storm Symphony",
    type: "Lightning",
    energyCost: 0,
    manaCost: 3,
    levelRequired: 3,
    target: "all",
    price: 110,
    description: "40 lightning damage to all enemies. Lightning spells have a 15% chance to Stun.",
  },
};

const ITEMS = {
  health_potion: {
    id: "health_potion",
    name: "Health Potion",
    energyCost: 1,
    price: 30,
    description: "Restore 40 HP.",
  },
  defence_potion: {
    id: "defence_potion",
    name: "Defence Potion",
    energyCost: 1,
    price: 30,
    description: "Reduce incoming damage by half for 3 turns.",
  },
  ether: {
    id: "ether",
    name: "Ether",
    energyCost: 1,
    price: 30,
    description: "Restore 3 mana.",
  },
  energy_shard: {
    id: "energy_shard",
    name: "Energy Shard",
    energyCost: 0,
    price: 60,
    description: "Gain 2 energy this turn.",
  },
  smoke_bomb: {
    id: "smoke_bomb",
    name: "Smoke Bomb",
    energyCost: 1,
    price: 60,
    description: "Enemies skip their next attack phase.",
  },
};

const COMBAT_STAGES = {
  mob_fight: {
    key: "mob_fight",
    name: "Mob Fight",
    perEnemyRewards: { xp: 15, gold: 25 },
    enemyCount: { min: 2, max: 4 },
    enemyPool: [
      { template: "swordwitch", name: "Sword Witch" },
      { template: "cinder_forager", name: "Cinder Forager" },
      { template: "fungal_acolyte", name: "Fungal Acolyte" },
      { template: "mossbound_soldier", name: "Mossbound Soldier" },
      { template: "ravenwood_witch", name: "Ravenwood Witch" },
      { template: "skeleton_mage", name: "Skeleton Mage" },
      { template: "storm_touched_poacher", name: "Storm-Touched Poacher" },
      { template: "sunlit_exile", name: "Sunlit Exile" },
      { template: "hollow_cultist", name: "Hollow Cultist" },
      { template: "frostbark_revenant", name: "Frostbark Revenant" },
      { template: "drowned_woodsman", name: "Drowned Woodsman" },
      { template: "thornshield_guard", name: "Thornshield Guard" },
    ],
  },
  mini_boss: {
    key: "mini_boss",
    name: "Mini-Boss Fight",
    rewards: { xp: 90, gold: 70 },
    enemyCount: { min: 1, max: 1 },
    enemyPool: [
      { template: "swordwitch_elite", name: "Sword Witch Elite" },
      { template: "mossbound_soldier_elite", name: "Mossbound Captain" },
      { template: "ravenwood_witch_elite", name: "Ravenwood Crone" },
      { template: "skeleton_mage_elite", name: "Skeleton Archmage" },
    ],
  },
  boss: {
    key: "boss",
    name: "Boss Fight",
    rewards: { xp: 240, gold: 160 },
    enemies: [{ template: "the_sunken_king", name: "The Sunken King" }],
  },
};

const ENEMY_TEMPLATES = {
  swordwitch: {
    artKey: "swordwitch",
    type: "Ice",
    maxHp: 60,
    attackDamage: 13,
    enemyActions: [
      { kind: "swing", id: "basic", weight: 3 },
      { kind: "swing", id: "charged", weight: 1 },
      { kind: "spell", id: "frost_bolt", weight: 1 },
    ],
    swingDamage: 1.0,
    spellDamage: 1.0,
    swingDefense: 0.05,
    spellDefense: 0.1,
  },
  cinder_forager: {
    artKey: "cinder_forager",
    type: "Fire",
    maxHp: 58,
    attackDamage: 12,
    enemyActions: [
      { kind: "swing", id: "basic", weight: 2 },
      { kind: "spell", id: "ember_shot", weight: 2 },
    ],
    swingDamage: 0.95,
    spellDamage: 1.1,
    swingDefense: 0.0,
    spellDefense: 0.05,
  },
  fungal_acolyte: {
    artKey: "fungal_acolyte",
    type: "Poison",
    maxHp: 64,
    attackDamage: 12,
    enemyActions: [
      { kind: "spell", id: "toxic_bolt", weight: 3 },
      { kind: "swing", id: "basic", weight: 1 },
    ],
    swingDamage: 0.9,
    spellDamage: 1.2,
    swingDefense: 0.05,
    spellDefense: 0.1,
  },
  mossbound_soldier: {
    artKey: "mossbound_soldier",
    type: "Earth",
    maxHp: 78,
    attackDamage: 14,
    enemyActions: [
      { kind: "swing", id: "basic", weight: 3 },
      { kind: "swing", id: "charged", weight: 1 },
      { kind: "spell", id: "stone_spike", weight: 1 },
    ],
    swingDamage: 1.15,
    spellDamage: 0.9,
    swingDefense: 0.15,
    spellDefense: 0.05,
  },
  ravenwood_witch: {
    artKey: "ravenwood_witch",
    type: "Wind",
    maxHp: 62,
    attackDamage: 15,
    enemyActions: [
      { kind: "spell", id: "gust_slash", weight: 3 },
      { kind: "spell", id: "updraft", weight: 1 },
      { kind: "swing", id: "basic", weight: 1 },
    ],
    swingDamage: 0.9,
    spellDamage: 1.25,
    swingDefense: 0.0,
    spellDefense: 0.15,
  },
  skeleton_mage: {
    artKey: "skeleton_mage",
    type: "Shadow",
    maxHp: 68,
    attackDamage: 16,
    enemyActions: [
      { kind: "spell", id: "shadow_bolt", weight: 3 },
      { kind: "spell", id: "void_bind", weight: 1 },
      { kind: "swing", id: "basic", weight: 1 },
    ],
    swingDamage: 0.85,
    spellDamage: 1.3,
    swingDefense: 0.0,
    spellDefense: 0.15,
  },
  storm_touched_poacher: {
    artKey: "storm_touched_poacher",
    type: "Lightning",
    maxHp: 60,
    attackDamage: 15,
    enemyActions: [
      { kind: "swing", id: "basic", weight: 2 },
      { kind: "spell", id: "electric_jolt", weight: 2 },
      { kind: "spell", id: "thunder_crash", weight: 1 },
    ],
    swingDamage: 1.05,
    spellDamage: 1.1,
    swingDefense: 0.05,
    spellDefense: 0.05,
  },
  sunlit_exile: {
    artKey: "sunlit_exile",
    type: "Light",
    maxHp: 66,
    attackDamage: 15,
    enemyActions: [
      { kind: "spell", id: "holy_spark", weight: 3 },
      { kind: "swing", id: "basic", weight: 1 },
    ],
    swingDamage: 0.95,
    spellDamage: 1.2,
    swingDefense: 0.05,
    spellDefense: 0.15,
  },
  hollow_cultist: {
    artKey: "hollow_cultist",
    type: "Shadow",
    maxHp: 62,
    attackDamage: 16,
    enemyActions: [
      { kind: "spell", id: "shadow_bolt", weight: 2 },
      { kind: "spell", id: "nightfall", weight: 1 },
      { kind: "swing", id: "basic", weight: 1 },
    ],
    swingDamage: 0.9,
    spellDamage: 1.25,
    swingDefense: 0.0,
    spellDefense: 0.15,
  },
  frostbark_revenant: {
    artKey: "frostbark_revenant",
    type: "Ice",
    maxHp: 76,
    attackDamage: 14,
    enemyActions: [
      { kind: "swing", id: "basic", weight: 3 },
      { kind: "spell", id: "frost_bolt", weight: 1 },
    ],
    swingDamage: 1.1,
    spellDamage: 0.95,
    swingDefense: 0.15,
    spellDefense: 0.1,
  },
  drowned_woodsman: {
    artKey: "drowned_woodsman",
    type: "Water",
    maxHp: 68,
    attackDamage: 14,
    enemyActions: [
      { kind: "swing", id: "basic", weight: 2 },
      { kind: "spell", id: "water_jet", weight: 2 },
    ],
    swingDamage: 1.05,
    spellDamage: 1.0,
    swingDefense: 0.1,
    spellDefense: 0.05,
  },
  thornshield_guard: {
    artKey: "thornshield_guard",
    type: "Earth",
    maxHp: 82,
    attackDamage: 13,
    enemyActions: [
      { kind: "swing", id: "basic", weight: 4 },
      { kind: "spell", id: "stone_spike", weight: 1 },
    ],
    swingDamage: 1.1,
    spellDamage: 0.9,
    swingDefense: 0.2,
    spellDefense: 0.05,
  },
  swordwitch_elite: {
    artKey: "swordwitch",
    type: "Earth",
    maxHp: 140,
    attackDamage: 22,
    enemyActions: [
      { kind: "swing", id: "charged", weight: 3 },
      { kind: "swing", id: "power", weight: 1 },
      { kind: "spell", id: "quicksand", weight: 1 },
    ],
    swingDamage: 1.05,
    spellDamage: 1.1,
    swingDefense: 0.15,
    spellDefense: 0.2,
  },
  mossbound_soldier_elite: {
    artKey: "mossbound_soldier",
    type: "Earth",
    maxHp: 155,
    attackDamage: 23,
    enemyActions: [
      { kind: "swing", id: "charged", weight: 3 },
      { kind: "swing", id: "power", weight: 1 },
      { kind: "spell", id: "stone_spike", weight: 1 },
    ],
    swingDamage: 1.2,
    spellDamage: 0.95,
    swingDefense: 0.2,
    spellDefense: 0.1,
  },
  ravenwood_witch_elite: {
    artKey: "ravenwood_witch",
    type: "Wind",
    maxHp: 125,
    attackDamage: 25,
    enemyActions: [
      { kind: "spell", id: "gust_slash", weight: 2 },
      { kind: "spell", id: "tempest", weight: 1 },
      { kind: "swing", id: "charged", weight: 1 },
    ],
    swingDamage: 0.95,
    spellDamage: 1.3,
    swingDefense: 0.05,
    spellDefense: 0.25,
  },
  skeleton_mage_elite: {
    artKey: "skeleton_mage",
    type: "Shadow",
    maxHp: 130,
    attackDamage: 26,
    enemyActions: [
      { kind: "spell", id: "shadow_bolt", weight: 2 },
      { kind: "spell", id: "abyssal_storm", weight: 1 },
      { kind: "swing", id: "charged", weight: 1 },
    ],
    swingDamage: 0.9,
    spellDamage: 1.35,
    swingDefense: 0.05,
    spellDefense: 0.25,
  },
  the_sunken_king: {
    artKey: "the_sunken_king",
    type: "Water",
    maxHp: 420,
    attackDamage: 32,
    attackTarget: "all",
    stunChance: SUNKEN_KING_STUN_CHANCE,
    enemyActions: [
      { kind: "spell", id: "tidal_surge", weight: 2 },
      { kind: "spell", id: "tsunami", weight: 1 },
      { kind: "swing", id: "power", target: "single", weight: 1 },
    ],
    swingDamage: 1.1,
    spellDamage: 1.3,
    swingDefense: 0.15,
    spellDefense: 0.25,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const HUB_WORLD_WIDTH = 3600;
const HUB_WORLD_HEIGHT = 2200;
const HUB_MIN_X = 48;
const HUB_MAX_X = HUB_WORLD_WIDTH - 48;
const HUB_MIN_Y = 64;
const HUB_MAX_Y = HUB_WORLD_HEIGHT - 64;

function sample(array, count) {
  const copy = [...array];
  const output = [];
  while (copy.length > 0 && output.length < count) {
    const index = Math.floor(Math.random() * copy.length);
    output.push(copy.splice(index, 1)[0]);
  }
  return output;
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 7)}`;
}

function getLevelFromXp(xp) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    }
  }
  return clamp(level, 1, 5);
}

function getTypeMultiplier(attackerType, defenderType) {
  if (!attackerType || !defenderType || !TYPES[attackerType]) {
    return TYPE_EFFECTIVENESS.neutral;
  }
  if (TYPES[attackerType].beats === defenderType) {
    return TYPE_EFFECTIVENESS.superEffective;
  }
  if (TYPES[attackerType].losesTo === defenderType) {
    return TYPE_EFFECTIVENESS.notVeryEffective;
  }
  return TYPE_EFFECTIVENESS.neutral;
}

function createPlayer(socketId) {
  return {
    id: socketId,
    nickname: "",
    characterId: null,
    scene: "entry",
    x: 180 + Math.floor(Math.random() * 100),
    y: 560,
    facing: 1,
    lobbyId: null,
    ready: false,
  };
}

function getPlayableCharacter(characterId) {
  const normalized = normalizeCharacterRef(characterId);
  const resolvedKey = PLAYABLE_CHARACTER_ALIASES[normalized] || "flamewitch";
  return PLAYABLE_CHARACTERS[resolvedKey] || PLAYABLE_CHARACTERS.flamewitch;
}

function getStartingGoldForPlayer(player) {
  return String(player?.nickname || "").trim().toLowerCase() === "goldman" ? 1000 : 0;
}

function getPlayerSnapshot(player) {
  return {
    id: player.id,
    nickname: player.nickname,
    characterId: player.characterId,
    scene: player.scene,
    x: player.x,
    y: player.y,
    facing: player.facing,
    lobbyId: player.lobbyId,
    ready: player.ready,
  };
}

function getLobbySummary(lobby) {
  return {
    id: lobby.id,
    name: lobby.name,
    hostId: lobby.hostId,
    playerCount: lobby.playerIds.length,
    passwordProtected: Boolean(lobby.password),
    players: lobby.playerIds.map((playerId) => getPlayerSnapshot(players.get(playerId))).filter(Boolean),
    status: runs.has(lobby.id) ? "in_run" : "staging",
  };
}

function broadcastHubState() {
  const hubPlayers = [...players.values()]
    .filter((player) => player.scene === "hub")
    .map(getPlayerSnapshot);
  const lobbySummaries = [...lobbies.values()]
    .filter((lobby) => lobby.playerIds.length > 0 && !runs.has(lobby.id))
    .map(getLobbySummary);

  io.emit("hubState", {
    players: hubPlayers,
    lobbies: lobbySummaries,
  });
}

function emitSessionState(socketId) {
  const player = players.get(socketId);
  if (!player) {
    return;
  }
  io.to(socketId).emit("sessionState", { player: getPlayerSnapshot(player) });
}

function emitLobbyState(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    return;
  }

  const payload = {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      hostId: lobby.hostId,
      passwordProtected: Boolean(lobby.password),
      inviteUrl: `/?lobby=${lobby.id}`,
      players: lobby.playerIds.map((playerId) => {
        const player = players.get(playerId);
        return player
          ? {
              id: player.id,
              nickname: player.nickname,
              characterId: player.characterId,
              ready: player.ready,
            }
          : null;
      }).filter(Boolean),
    },
  };

  io.to(`lobby:${lobby.id}`).emit("lobbyState", payload);
}

function getPublicLevelUpState(run) {
  const pending = run.levelUpChoices || {};
  return {
    choices: Object.values(LEVEL_UP_STAT_CHOICES).map(({ id, name, description }) => ({ id, name, description })),
    pending: Object.fromEntries(
      Object.entries(pending).map(([playerId, choiceState]) => [
        playerId,
        {
          levelBefore: choiceState.levelBefore,
          levelAfter: choiceState.levelAfter,
          selectedStatId: choiceState.selectedStatId || null,
          completed: Boolean(choiceState.selectedStatId),
        },
      ]),
    ),
  };
}

function getRunPublicState(run, viewerId) {
  const stage = run.stages[run.stageIndex];
  return {
    lobbyId: run.lobbyId,
    stageIndex: run.stageIndex,
    stageType: stage.type,
    stageName: stage.label,
    stageCombatKey: stage.combatKey || null,
    battleLog: run.battleLog.slice(-8),
    combatFeedbackEvents: (run.combatFeedbackEvents || []).slice(-80),
    turn: run.turn
      ? {
          phase: run.turn.phase,
          turnEndsAt: run.turn.turnEndsAt,
          round: run.turn.round,
          actedPlayerIds: run.turn.actedPlayerIds || [],
          usedActionCountsByPlayerId: run.turn.usedActionCountsByPlayerId || {},
        }
      : null,
    viewerId,
    blessingChoices: run.blessingChoices?.[viewerId] || [],
    chosenBlessing: run.chosenBlessings?.[viewerId] || null,
    stageReady: run.stageReady || {},
    shop: run.shop || null,
    rewardSummary: run.rewardSummary || null,
    levelUpChoices: getPublicLevelUpState(run),
    party: Object.values(run.party).map((member) => {
      ensureMemberStartingLoadout(member);
      return {
        id: member.id,
        nickname: member.nickname,
        characterId: member.characterId,
        type: member.type,
        artKey: member.artKey,
        hp: member.hp,
        maxHp: member.maxHp,
        energy: member.energy,
        mana: member.mana,
        gold: member.gold,
        xp: member.xp,
        level: member.level,
        swingDamage: member.swingDamage,
        spellDamage: member.spellDamage,
        swingDefense: getEffectiveSwingDefense(member),
        spellDefense: getEffectiveSpellDefense(member),
        effects: member.effects || {},
        energyRegen: member.energyRegen,
        manaRegen: member.manaRegen,
        inventory: member.inventory,
        blessings: member.blessings,
        knownSpells: member.knownSpells,
        knownSwings: getMemberKnownSwings(member),
        isDefending: member.isDefending,
        alive: member.hp > 0,
      };
    }),
    enemies: (run.enemies || []).map((enemy) => ({
      id: enemy.id,
      name: enemy.name,
      artKey: enemy.artKey,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      type: enemy.type,
      attackDamage: enemy.attackDamage,
      swingDamage: enemy.swingDamage,
      spellDamage: enemy.spellDamage,
      swingDefense: enemy.swingDefense,
      spellDefense: enemy.spellDefense,
      alive: enemy.hp > 0,
      effects: enemy.effects,
      intendedTargetId: enemy.intendedTargetId || null,
      intendedTargetIds: enemy.intendedTargetIds || [],
      intendedAction: enemy.intendedAction || null,
      attackTarget: enemy.attackTarget || "single",
    })),
  };
}

function emitRunState(lobbyId) {
  const run = runs.get(lobbyId);
  const lobby = lobbies.get(lobbyId);
  if (!run || !lobby) {
    return;
  }

  for (const playerId of lobby.playerIds) {
    io.to(playerId).emit("runState", getRunPublicState(run, playerId));
  }
}

function addLog(run, message) {
  run.battleLog.push(message);
}

function addCombatFeedback(run, type, payload = {}) {
  if (!run) {
    return null;
  }
  run.combatFeedbackSeq = (run.combatFeedbackSeq || 0) + 1;
  const event = {
    id: `${run.stageIndex || 0}:${run.turn?.round || 0}:${run.combatFeedbackSeq}`,
    type,
    round: run.turn?.round || 0,
    phase: run.turn?.phase || null,
    ...payload,
  };
  run.combatFeedbackEvents = run.combatFeedbackEvents || [];
  run.combatFeedbackEvents.push(event);
  if (run.combatFeedbackEvents.length > 160) {
    run.combatFeedbackEvents = run.combatFeedbackEvents.slice(-120);
  }
  return event;
}

function addStatusAppliedFeedback(run, target, statusKey, statusName, effectId = statusKey) {
  if (!run || !target || !statusName) {
    return null;
  }
  return addCombatFeedback(run, "status_applied", {
    targetKind: getCombatantTargetKind(target),
    targetId: getCombatantId(target),
    targetName: getCombatantDisplayName(target),
    statusKey,
    statusName,
    effectId,
    text: statusName,
  });
}

function shouldShowItemUseFeedback(item) {
  return /potion/i.test(`${item?.id || ""} ${item?.name || ""}`);
}

function getCombatantDisplayName(combatant) {
  return combatant?.nickname || combatant?.name || "Combatant";
}

function getCombatantTargetKind(combatant) {
  return combatant?.nickname ? "party" : "enemy";
}

function getCombatantId(combatant) {
  return combatant?.id || null;
}

function addDebuffRemovedFeedback(run, combatant, debuffName) {
  if (!combatant || !debuffName) {
    return null;
  }
  return addCombatFeedback(run, "debuff_removed", {
    targetKind: getCombatantTargetKind(combatant),
    targetId: getCombatantId(combatant),
    targetName: getCombatantDisplayName(combatant),
    debuffName,
    text: `${debuffName} Removed`,
  });
}

function recalcLevel(member, run) {
  const oldLevel = member.level;
  member.level = getLevelFromXp(member.xp);
  if (member.level > oldLevel) {
    addLog(run, `${member.nickname} reached level ${member.level}.`);
  }
}

function getPendingLevelUpPlayerIds(run) {
  return Object.entries(run.levelUpChoices || {})
    .filter(([, choiceState]) => !choiceState.selectedStatId)
    .map(([playerId]) => playerId);
}

function scheduleLevelUpAdvance(lobbyId, delayMs = 700) {
  const run = runs.get(lobbyId);
  if (!run || run.levelUpAdvanceScheduled) {
    return;
  }
  run.levelUpAdvanceScheduled = true;
  setTimeout(() => {
    const latestRun = runs.get(lobbyId);
    if (!latestRun) {
      return;
    }
    latestRun.levelUpAdvanceScheduled = false;
    if (getPendingLevelUpPlayerIds(latestRun).length > 0) {
      return;
    }
    advanceStage(lobbyId);
  }, delayMs);
}

function applyLevelUpStatChoice(run, member, statId) {
  const statChoice = LEVEL_UP_STAT_CHOICES[statId];
  if (!statChoice) {
    return null;
  }
  statChoice.apply(member);
  addLog(run, `${member.nickname} chose ${statChoice.name}.`);
  return statChoice;
}

function applyDamageToEnemy(run, enemy, amount, note) {
  const finalDamage = Math.max(0, Math.round(amount));
  enemy.hp = clamp(enemy.hp - finalDamage, 0, enemy.maxHp);
  addLog(run, `${enemy.name} takes ${finalDamage} damage${note ? ` ${note}` : ""}.`);
  if (enemy.hp <= 0) {
    addLog(run, `${enemy.name} is defeated.`);
  } else {
    defeatCombatantFromDrowned(run, enemy);
  }
  return finalDamage;
}

function defeatCombatantFromDrowned(run, combatant) {
  if (!combatant || combatant.hp <= 0) {
    return;
  }
  const drownedValue = Math.max(0, Math.round(combatant.effects?.drownedValue || 0));
  if (drownedValue > 0 && combatant.hp <= drownedValue) {
    combatant.hp = 0;
    const name = getCombatantDisplayName(combatant);
    addLog(run, `${name} is swallowed by Drowned.`);
    addLog(run, getCombatantTargetKind(combatant) === "party" ? `${name} is down.` : `${name} is defeated.`);
    addCombatFeedback(run, "drowned_defeat", {
      targetKind: getCombatantTargetKind(combatant),
      targetId: getCombatantId(combatant),
      targetName: name,
      drownedValue,
      text: "Drowned",
    });
    return true;
  }
  return false;
}

function healPlayer(run, member, amount, note) {
  const finalHealing = Math.max(0, Math.round(amount));
  if (finalHealing <= 0 || !member || member.hp <= 0) {
    return;
  }
  const before = member.hp;
  member.hp = clamp(member.hp + finalHealing, 0, member.maxHp);
  const healed = member.hp - before;
  addLog(run, `${member.nickname} heals ${healed} HP${note ? ` ${note}` : ""}.`);
  if (healed > 0) {
    addCombatFeedback(run, "heal", {
      targetKind: "party",
      targetId: member.id,
      targetName: member.nickname,
      amount: healed,
      text: `+${healed} HP Heal`,
    });
  }
  return healed;
}

function applyDamageToPlayer(run, member, amount, note) {
  const finalDamage = Math.max(0, Math.round(amount));
  const potionReducedDamage = (member.effects?.defencePotionTurns || 0) > 0
    ? Math.round(finalDamage * 0.5)
    : finalDamage;
  const reducedDamage = member.isDefending ? Math.round(potionReducedDamage * 0.7) : potionReducedDamage;
  member.hp = clamp(member.hp - reducedDamage, 0, member.maxHp);
  addLog(run, `${member.nickname} takes ${reducedDamage} damage${note ? ` ${note}` : ""}.`);
  if (member.hp <= 0) {
    addLog(run, `${member.nickname} is down.`);
  } else {
    defeatCombatantFromDrowned(run, member);
  }
  return reducedDamage;
}

function clampDefense(value) {
  return clamp(typeof value === "number" ? value : 0, 0, 0.9);
}

function countMemberBlessings(member, blessingId) {
  return Array.isArray(member?.blessings) ? member.blessings.filter((id) => id === blessingId).length : 0;
}

function getSwingFlatBonus(member) {
  return countMemberBlessings(member, "blessed_blade") * 5;
}

function getSpellFlatBonus() {
  return 0;
}

function inflictBurn(run, target, minTurns = 2, maxTurns = 3) {
  target.effects ||= {};
  const duration = Math.floor(Math.random() * (maxTurns - minTurns + 1)) + minTurns + 2;
  const nextTurns = Math.max(target.effects.burnTurns || 0, duration);
  if (nextTurns > (target.effects.burnTurns || 0)) {
    target.effects.burnTurns = nextTurns;
    addLog(run, `${getCombatantDisplayName(target)} is afflicted with Burn (${nextTurns} turns max).`);
    addStatusAppliedFeedback(run, target, "burn", "Burn");
  }
}

function inflictPoison(run, target, stacks = 1) {
  target.effects ||= {};
  const previousStacks = target.effects.poisonStacks || 0;
  const nextStacks = Math.min(MAX_POISON_STACKS, previousStacks + stacks);
  target.effects.poisonStacks = nextStacks;
  if (nextStacks > previousStacks) {
    addLog(run, `${getCombatantDisplayName(target)} is poisoned (${nextStacks} stack${nextStacks === 1 ? "" : "s"}).`);
    addStatusAppliedFeedback(run, target, "poison", "Poison");
  }
}

function getBleedDamage(effects) {
  return Math.max(0, Math.round((effects?.bleedStacks || 0) * BLEED_DAMAGE_PER_STACK));
}

function inflictBleed(run, target, stacks = 1) {
  if (!target || target.hp <= 0) {
    return false;
  }
  target.effects ||= {};
  const previousStacks = target.effects.bleedStacks || 0;
  const nextStacks = previousStacks + stacks;
  target.effects.bleedStacks = nextStacks;
  if (nextStacks > previousStacks) {
    addLog(run, `${getCombatantDisplayName(target)} is bleeding (${getBleedDamage(target.effects)} damage per turn).`);
    addStatusAppliedFeedback(run, target, "bleed", "Bleed");
    return true;
  }
  return false;
}

function maybeInflictBleedFromSwing(run, attacker, target, damageDealt = 0) {
  if (!target || target.hp <= 0 || damageDealt <= 0 || Math.random() >= BLEED_SWING_CHANCE) {
    return false;
  }
  inflictBleed(run, target, 1);
  addLog(run, `${getCombatantDisplayName(attacker)} opens a bleeding wound on ${getCombatantDisplayName(target)}.`);
  return true;
}

function inflictFreeze(run, target) {
  target.effects ||= {};
  if ((target.effects.freezeChecks || 0) > 0) {
    return;
  }
  target.effects.freezeChecks = 1;
  addLog(run, `${getCombatantDisplayName(target)} is frozen.`);
  addStatusAppliedFeedback(run, target, "freeze", "Freeze", "frozen");
}

function inflictUpdraft(run, target) {
  target.effects ||= {};
  if (target.effects.updraft) {
    return;
  }
  target.effects.updraft = true;
  addLog(run, `${getCombatantDisplayName(target)} is caught in an Updraft.`);
  addStatusAppliedFeedback(run, target, "updraft", "Updraft");
}

function inflictCorruption(run, target) {
  target.effects ||= {};
  if (target.effects.corrupted) {
    return;
  }
  target.effects.corrupted = true;
  addLog(run, `${getCombatantDisplayName(target)} is corrupted and deals less damage.`);
  addStatusAppliedFeedback(run, target, "corruption", "Corruption", "corrupted");
}

function applyDrowned(run, target, damageAmount) {
  target.effects ||= {};
  const increase = Math.max(1, Math.round(Math.max(0, damageAmount) * WATER_DROWNED_DAMAGE_RATIO));
  target.effects.drownedValue = Math.min(target.maxHp, Math.round((target.effects.drownedValue || 0) + increase));
  const name = getCombatantDisplayName(target);
  addLog(run, `${name}'s Drowned value rises to ${target.effects.drownedValue}.`);
  addCombatFeedback(run, "drowned_apply", {
    targetKind: getCombatantTargetKind(target),
    targetId: getCombatantId(target),
    targetName: name,
    amount: increase,
    drownedValue: target.effects.drownedValue,
    text: `Drowning +${increase}`,
  });
  defeatCombatantFromDrowned(run, target);
}

function getEarthDefenseBonus(member) {
  return Math.max(0, member?.effects?.earthDefenseBonus || 0);
}

function getEffectiveSwingDefense(member) {
  return clampDefense((member?.swingDefense || 0) + getEarthDefenseBonus(member));
}

function getEffectiveSpellDefense(member) {
  return clampDefense((member?.spellDefense || 0) + getEarthDefenseBonus(member));
}

function applyEarthDefenseBuff(run, member) {
  if (!member || member.hp <= 0) {
    return;
  }
  member.effects = member.effects || {};
  const previousBonus = member.effects.earthDefenseBonus || 0;
  member.effects.earthDefenseBonus = Number(Math.min(0.5, previousBonus + EARTH_DEFENSE_BONUS).toFixed(2));
  const name = getCombatantDisplayName(member);
  addLog(run, `${name}'s defense rises for this encounter.`);
  addCombatFeedback(run, "earth_shield", {
    targetKind: getCombatantTargetKind(member),
    targetId: member.id,
    targetName: name,
    amount: EARTH_DEFENSE_BONUS,
    text: "Earth Shield",
  });
}

function resolveSpellBaseDamage(spell, member) {
  const level = member?.level || 1;
  const levelBonus = level - 1;
  if (spell.id === "meteor") {
    return 60 + levelBonus * 6 + getSpellFlatBonus(member);
  }
  if (["whirlpool", "quicksand", "updraft", "void_bind", "smite", "ice_prison", "thunder_crash"].includes(spell.id)) {
    return 30 + levelBonus * 5 + getSpellFlatBonus(member);
  }
  if (["inferno", "tsunami", "earthquake", "tempest", "abyssal_storm", "heavenly_wrath", "absolute_zero", "storm_symphony"].includes(spell.id)) {
    return 40 + levelBonus * 5 + getSpellFlatBonus(member);
  }
  if (spell.target === "all") {
    return 20 + levelBonus * 4 + getSpellFlatBonus(member);
  }
  return 15 + levelBonus * 4 + getSpellFlatBonus(member);
}

function applyElementalSpellEffects(run, member, target, spell, finalDamage, targetMode) {
  if (!target || target.hp <= 0 || !spell?.type) {
    return;
  }

  if (spell.type === "Poison") {
    inflictPoison(run, target, 1);
  }
  if (spell.id === "ignite") {
    inflictBurn(run, target, 3, 3);
    return;
  }
  if (spell.type === "Fire" && Math.random() < FIRE_BURN_CHANCE) {
    inflictBurn(run, target);
  }
  if (spell.type === "Ice" && Math.random() < ICE_FREEZE_CHANCE) {
    inflictFreeze(run, target);
  }
  if (spell.type === "Wind" && Math.random() < WIND_UPDRAFT_CHANCE) {
    inflictUpdraft(run, target);
  }
  if (spell.type === "Lightning" && Math.random() < LIGHTNING_STUN_CHANCE) {
    const previousStunTurns = target.effects.stunTurns || 0;
    target.effects.stunTurns = Math.max(previousStunTurns, 1);
    if (target.effects.stunTurns > previousStunTurns) {
      addLog(run, `${getCombatantDisplayName(target)} is stunned.`);
      addStatusAppliedFeedback(run, target, "stun", "Stun");
    }
  }
  if (spell.type === "Shadow") {
    inflictCorruption(run, target);
  }
  if (spell.type === "Water" && finalDamage > 0) {
    applyDrowned(run, target, finalDamage);
  }

}

function applyEarthSpellDefense(run, member, spell, targetMode) {
  if (spell?.type !== "Earth") {
    return;
  }
  if (targetMode === "all") {
    for (const ally of getLivingParty(run)) {
      applyEarthDefenseBuff(run, ally);
    }
    return;
  }
  applyEarthDefenseBuff(run, member);
}

function applySpellDamageToEnemy(run, member, enemy, spell, baseDamage, targetMode) {
  const typed = resolveTypedMagicDamage(baseDamage, member.type, enemy.type, enemy.spellDefense, member);
  applyDamageToEnemy(run, enemy, typed.damage, typed.multiplier !== 1 ? `(x${typed.multiplier})` : "");
  applyElementalSpellEffects(run, member, enemy, spell, typed.damage, targetMode);
  return typed;
}

function applySpellDamageToPlayer(run, enemy, member, spell, baseDamage, targetMode) {
  if (spell.id === "ignite") {
    applyElementalSpellEffects(run, enemy, member, spell, 0, targetMode);
    return { damage: 0, multiplier: 1 };
  }
  const typed = resolveTypedMagicDamage(baseDamage, enemy.type, member.type, getEffectiveSpellDefense(member), enemy);
  const note = typed.multiplier !== 1 ? `from ${enemy.name} (x${typed.multiplier})` : `from ${enemy.name}`;
  const finalDamage = applyDamageToPlayer(run, member, typed.damage, note);
  applyElementalSpellEffects(run, enemy, member, spell, typed.damage, targetMode);
  return { ...typed, finalDamage };
}

function maybeInflictEnemyAttackStun(run, enemy, member) {
  const stunChance = Number(enemy?.stunChance) || 0;
  if (!member || member.hp <= 0 || stunChance <= 0 || Math.random() >= stunChance) {
    return false;
  }

  member.effects ||= {};
  const previousStunTurns = member.effects.stunTurns || 0;
  member.effects.stunTurns = Math.max(previousStunTurns, 1);
  if (member.effects.stunTurns > previousStunTurns) {
    addLog(run, `${member.nickname} is stunned by ${enemy.name}.`);
    addStatusAppliedFeedback(run, member, "stun", "Stun");
    return true;
  }
  return false;
}

function resolveEnemySwingAgainstPlayer(run, enemy, member, actionId) {
  if (actionId === "charged") {
    const base = getChargedSwingDamage(enemy);
    const physical = resolvePhysicalDamage(base * 0.5, enemy, member);
    const typed = resolveTypedMagicDamage(base * 0.5, enemy.type, member.type, getEffectiveSpellDefense(member), enemy);
    const note = typed.multiplier !== 1 ? `from ${enemy.name} (x${typed.multiplier})` : `from ${enemy.name}`;
    const amount = applyDamageToPlayer(run, member, physical + typed.damage, note);
    maybeInflictBleedFromSwing(run, enemy, member, amount);
    return {
      amount,
      multiplier: typed.multiplier,
    };
  }
  if (actionId === "power") {
    const base = getPowerSwingDamage(enemy);
    const physical = resolvePhysicalDamage(base * 0.4, enemy, member);
    const typed = resolveTypedMagicDamage(base * 0.6, enemy.type, member.type, getEffectiveSpellDefense(member), enemy);
    const note = typed.multiplier !== 1 ? `from ${enemy.name} (x${typed.multiplier})` : `from ${enemy.name}`;
    const amount = applyDamageToPlayer(run, member, physical + typed.damage, note);
    maybeInflictBleedFromSwing(run, enemy, member, amount);
    return {
      amount,
      multiplier: typed.multiplier,
    };
  }
  const physical = resolvePhysicalDamage(getBasicSwingDamage(enemy), enemy, member);
  const amount = applyDamageToPlayer(run, member, physical, `from ${enemy.name}`);
  maybeInflictBleedFromSwing(run, enemy, member, amount);
  return {
    amount,
    multiplier: 1,
  };
}

function resolveEnemyActionAgainstPlayer(run, enemy, member, action, targetMode) {
  if (action?.kind === "spell") {
    const spell = SPELLS[action.id];
    const baseDamage = resolveSpellBaseDamage(spell, enemy);
    const typed = applySpellDamageToPlayer(run, enemy, member, spell, baseDamage, targetMode);
    maybeInflictEnemyAttackStun(run, enemy, member);
    return { amount: typed.finalDamage || 0, multiplier: typed.multiplier || 1 };
  }
  const result = resolveEnemySwingAgainstPlayer(run, enemy, member, action?.id || "basic");
  maybeInflictEnemyAttackStun(run, enemy, member);
  return result;
}

function resolveFreezeAtTurnStart(run, combatant) {
  const freezeChecks = combatant.effects?.freezeChecks || 0;
  if (freezeChecks <= 0) {
    return false;
  }
  const chance = FREEZE_THAW_CHANCES[Math.min(freezeChecks - 1, FREEZE_THAW_CHANCES.length - 1)];
  if (Math.random() < chance) {
    combatant.effects.freezeChecks = 0;
    addLog(run, `${getCombatantDisplayName(combatant)} thaws out.`);
    addCombatFeedback(run, "freeze_thaw", {
      targetKind: getCombatantTargetKind(combatant),
      targetId: combatant.id,
      targetName: getCombatantDisplayName(combatant),
      chance,
      text: "Freeze Removed",
    });
    return true;
  } else {
    combatant.effects.freezeChecks = freezeChecks + 1;
    addLog(run, `${getCombatantDisplayName(combatant)} remains frozen.`);
    addCombatFeedback(run, "freeze_remain", {
      targetKind: getCombatantTargetKind(combatant),
      targetId: combatant.id,
      targetName: getCombatantDisplayName(combatant),
      chance,
      text: "Frozen",
    });
    return false;
  }
}

function isFrozen(combatant) {
  return (combatant.effects?.freezeChecks || 0) > 0;
}

function isClericLightSpell(member, spell) {
  return member?.characterId === "thecleric" && spell?.type === "Light";
}

function getBasicSwingDamage(member) {
  const level = member?.level || 1;
  return 12 + (level - 1) * 4 + getSwingFlatBonus(member);
}

function getChargedSwingDamage(member) {
  const level = member?.level || 1;
  return 22 + (level - 1) * 6 + getSwingFlatBonus(member);
}

function getPowerSwingDamage(member) {
  const level = member?.level || 1;
  return 34 + (level - 1) * 7 + getSwingFlatBonus(member);
}

function resolvePhysicalDamage(baseDamage, attacker, defender) {
  const swingMultiplier = typeof attacker?.swingDamage === "number" ? attacker.swingDamage : 1;
  const corruptionMultiplier = attacker?.effects?.corrupted ? CORRUPTION_DAMAGE_MULTIPLIER : 1;
  const defense = clampDefense(defender?.swingDefense);
  return baseDamage * swingMultiplier * corruptionMultiplier * (1 - defense);
}

function resolveTypedMagicDamage(baseDamage, attackerType, defenderType, spellDefense = 0, attacker = null) {
  const multiplier = getTypeMultiplier(attackerType, defenderType);
  const spellDamageMultiplier = typeof attacker?.spellDamage === "number" ? attacker.spellDamage : 1;
  const corruptionMultiplier = attacker?.effects?.corrupted ? CORRUPTION_DAMAGE_MULTIPLIER : 1;
  const defense = clampDefense(spellDefense);
  return {
    damage: baseDamage * spellDamageMultiplier * corruptionMultiplier * multiplier * (1 - defense),
    multiplier,
  };
}

function getCombatActionInfo(action) {
  if (!action || !["swing", "spell"].includes(action.kind)) {
    return null;
  }
  const source = action.kind === "swing" ? SWINGS[action.id] : SPELLS[action.id];
  if (!source) {
    return null;
  }
  return {
    kind: action.kind,
    id: source.id,
    name: source.name,
    target: action.target || source.target || "single",
    type: source.type || null,
  };
}

function getWeightedEnemyActions(enemy) {
  const actions = Array.isArray(enemy?.enemyActions) && enemy.enemyActions.length > 0
    ? enemy.enemyActions
    : [{ kind: "swing", id: "basic", weight: 1 }];
  return actions
    .map((action) => ({ ...getCombatActionInfo(action), weight: Math.max(0, Number(action.weight) || 1) }))
    .filter((action) => action.kind && action.id && action.weight > 0);
}

function chooseEnemyAction(enemy) {
  const actions = getWeightedEnemyActions(enemy);
  if (actions.length === 0) {
    return getCombatActionInfo({ kind: "swing", id: "basic" });
  }
  const totalWeight = actions.reduce((total, action) => total + action.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const action of actions) {
    roll -= action.weight;
    if (roll <= 0) {
      const { weight, ...info } = action;
      return info;
    }
  }
  const { weight, ...fallback } = actions[actions.length - 1];
  return fallback;
}

function getLivingParty(run) {
  return Object.values(run.party).filter((member) => member.hp > 0);
}

function getLivingEnemies(run) {
  return run.enemies.filter((enemy) => enemy.hp > 0);
}

function allLivingPlayersActed(run) {
  if (!run?.turn) {
    return false;
  }
  return getLivingParty(run).every((member) => run.turn.actedPlayerIds.includes(member.id));
}

function countEntries(entries, id) {
  if (!Array.isArray(entries)) {
    return 0;
  }
  return entries.filter((entryId) => entryId === id).length;
}

function ensureMemberStartingLoadout(member) {
  if (!member || Number(member.startingLoadoutVersion || 0) >= STARTING_LOADOUT_VERSION) {
    return;
  }

  member.inventory ||= {};
  if (typeof member.inventory.health_potion !== "number") {
    member.inventory.health_potion = 1;
  }
  if (typeof member.inventory.defence_potion !== "number") {
    member.inventory.defence_potion = 1;
  }
  if (typeof member.inventory.ether !== "number") {
    member.inventory.ether = 1;
  }
  if (typeof member.inventory.energy_shard !== "number") {
    member.inventory.energy_shard = 0;
  }
  if (typeof member.inventory.smoke_bomb !== "number") {
    member.inventory.smoke_bomb = 0;
  }

  member.knownSwings = Array.isArray(member.knownSwings) ? member.knownSwings : [...DEFAULT_KNOWN_SWINGS];
  while (countEntries(member.knownSwings, "basic") < 2) {
    member.knownSwings.push("basic");
  }
  while (countEntries(member.knownSwings, "charged") < 1) {
    member.knownSwings.push("charged");
  }

  member.startingLoadoutVersion = STARTING_LOADOUT_VERSION;
}

function getMemberKnownSwings(member) {
  if (!member) {
    return [];
  }
  ensureMemberStartingLoadout(member);
  if (!Array.isArray(member.knownSwings)) {
    member.knownSwings = [...DEFAULT_KNOWN_SWINGS];
  }
  return member.knownSwings;
}

function getOwnedActionCount(member, kind, id) {
  if (kind === "spell") {
    return countEntries(member?.knownSpells, id);
  }
  if (kind === "swing") {
    return countEntries(getMemberKnownSwings(member), id);
  }
  return 0;
}

function getTurnUsedActionCount(run, playerId, kind, id) {
  return Number(run?.turn?.usedActionCountsByPlayerId?.[playerId]?.[kind]?.[id]) || 0;
}

function canUseOwnedAction(run, playerId, member, kind, id) {
  return getTurnUsedActionCount(run, playerId, kind, id) < getOwnedActionCount(member, kind, id);
}

function markOwnedActionUsed(run, playerId, kind, id) {
  if (!run?.turn || !["spell", "swing"].includes(kind)) {
    return;
  }
  run.turn.usedActionCountsByPlayerId ||= {};
  run.turn.usedActionCountsByPlayerId[playerId] ||= { spell: {}, swing: {} };
  run.turn.usedActionCountsByPlayerId[playerId][kind] ||= {};
  run.turn.usedActionCountsByPlayerId[playerId][kind][id] = getTurnUsedActionCount(run, playerId, kind, id) + 1;
}

function clearTurnTimer(run) {
  if (run.turnTimer) {
    clearTimeout(run.turnTimer);
    run.turnTimer = null;
  }
}

function clearEnemyIntents(run) {
  for (const enemy of run.enemies || []) {
    enemy.intendedTargetId = null;
    enemy.intendedTargetIds = [];
    enemy.intendedAction = null;
  }
}

function assignEnemyIntents(run) {
  const livingParty = getLivingParty(run);
  // If a Smoke Bomb will cause the next enemy phase to be skipped, no enemy
  // should telegraph an attack target.
  const enemiesWillSkip = (run.smokeBombTurns || 0) > 0;
  for (const enemy of run.enemies || []) {
    if (enemy.hp <= 0 || enemiesWillSkip) {
      enemy.intendedTargetId = null;
      enemy.intendedTargetIds = [];
      enemy.intendedAction = null;
      continue;
    }
    if ((enemy.effects?.stunTurns || 0) > 0 || isFrozen(enemy)) {
      enemy.intendedTargetId = null;
      enemy.intendedTargetIds = [];
      enemy.intendedAction = null;
      continue;
    }
    if (livingParty.length === 0) {
      enemy.intendedTargetId = null;
      enemy.intendedTargetIds = [];
      enemy.intendedAction = null;
      continue;
    }
    const intendedAction = chooseEnemyAction(enemy);
    enemy.intendedAction = intendedAction;
    if (intendedAction?.target === "all") {
      enemy.intendedTargetId = null;
      enemy.intendedTargetIds = livingParty.map((member) => member.id);
      continue;
    }
    const target = livingParty[Math.floor(Math.random() * livingParty.length)];
    enemy.intendedTargetId = target.id;
    enemy.intendedTargetIds = [target.id];
  }
}

function setupTurn(run, lobbyId) {
  clearTurnTimer(run);
  const livingParty = getLivingParty(run);

  if (livingParty.length === 0) {
    endRun(lobbyId, false, getPartyWipeMessage(run));
    return;
  }

  run.turn.phase = "player";
  run.turn.turnEndsAt = null;
  run.turn.actedPlayerIds = [];
  run.turn.usedActionCountsByPlayerId = {};
  assignEnemyIntents(run);
  emitRunState(lobbyId);
}

function getTurnStartEnergyGain(member) {
  return Number(member.energyRegen) || 0;
}

function getTurnStartManaGain(member) {
  const manaRegen = Number(member.manaRegen) || 0;
  const manaSpringCount = countMemberBlessings(member, "mana_spring");
  return manaSpringCount > 0 ? Math.max(2, manaRegen + manaSpringCount) : manaRegen;
}

function getCombatStartingEnergy(member) {
  return getTurnStartEnergyGain(member) + countMemberBlessings(member, "quick_hands");
}

function applyStartOfRoundStatusDamage(run, combatant) {
  if (!combatant || combatant.hp <= 0) {
    return;
  }

  if ((combatant.effects?.poisonStacks || 0) > 0) {
    const poisonDamage = 4 + (combatant.effects.poisonStacks - 1) * 2;
    const finalDamage = getCombatantTargetKind(combatant) === "party"
      ? applyDamageToPlayer(run, combatant, poisonDamage, "from Poison")
      : applyDamageToEnemy(run, combatant, poisonDamage, "from Poison");
    addCombatFeedback(run, "poison_damage", {
      targetKind: getCombatantTargetKind(combatant),
      targetId: combatant.id,
      targetName: getCombatantDisplayName(combatant),
      amount: finalDamage,
      text: `-${finalDamage} HP Poison`,
    });
    defeatCombatantFromDrowned(run, combatant);
  }
  if (combatant.hp <= 0) {
    return;
  }

  if ((combatant.effects?.bleedStacks || 0) > 0) {
    const bleedDamage = getBleedDamage(combatant.effects);
    const finalDamage = getCombatantTargetKind(combatant) === "party"
      ? applyDamageToPlayer(run, combatant, bleedDamage, "from Bleed")
      : applyDamageToEnemy(run, combatant, bleedDamage, "from Bleed");
    addCombatFeedback(run, "bleed_damage", {
      targetKind: getCombatantTargetKind(combatant),
      targetId: combatant.id,
      targetName: getCombatantDisplayName(combatant),
      amount: finalDamage,
      text: `-${finalDamage} HP Bleed`,
    });
    defeatCombatantFromDrowned(run, combatant);
  }
  if (combatant.hp <= 0) {
    return;
  }

  if ((combatant.effects?.burnTurns || 0) > 0) {
    const finalDamage = getCombatantTargetKind(combatant) === "party"
      ? applyDamageToPlayer(run, combatant, 5, "from Burn")
      : applyDamageToEnemy(run, combatant, 5, "from Burn");
    addCombatFeedback(run, "burn_damage", {
      targetKind: getCombatantTargetKind(combatant),
      targetId: combatant.id,
      targetName: getCombatantDisplayName(combatant),
      amount: finalDamage,
      text: `-${finalDamage} HP Burn`,
    });
    defeatCombatantFromDrowned(run, combatant);
    combatant.effects.burnTurns -= 1;
    if (combatant.hp > 0) {
      if (combatant.effects.burnTurns <= 0) {
        addLog(run, `${getCombatantDisplayName(combatant)}'s Burn is removed.`);
        addDebuffRemovedFeedback(run, combatant, "Burn");
      } else if (Math.random() < BURN_EXTINGUISH_CHANCE) {
        combatant.effects.burnTurns = 0;
        addLog(run, `${getCombatantDisplayName(combatant)}'s Burn fizzles out.`);
        addDebuffRemovedFeedback(run, combatant, "Burn");
      }
    }
  }
}

function tickDefencePotion(run, member) {
  if (!member || member.hp <= 0 || (member.effects?.defencePotionTurns || 0) <= 0) {
    return;
  }
  member.effects.defencePotionTurns -= 1;
  if (member.effects.defencePotionTurns <= 0) {
    member.effects.defencePotionTurns = 0;
    addLog(run, `${member.nickname}'s Defence Potion wears off.`);
  }
}

function nextRound(lobbyId) {
  const run = runs.get(lobbyId);
  if (!run) {
    return;
  }

  run.turn.round += 1;
  run.turn.phase = "player";
  run.turn.actedPlayerIds = [];

  for (const member of Object.values(run.party)) {
    if (member.hp <= 0) {
      continue;
    }
    member.energy += getTurnStartEnergyGain(member);
    member.mana += getTurnStartManaGain(member);
    member.isDefending = false;
    tickDefencePotion(run, member);
    applyStartOfRoundStatusDamage(run, member);
  }

  for (const enemy of getLivingEnemies(run)) {
    resolveFreezeAtTurnStart(run, enemy);
    applyStartOfRoundStatusDamage(run, enemy);
  }

  if (getLivingParty(run).length === 0) {
    endRun(lobbyId, false, getPartyWipeMessage(run));
    return;
  }

  if (getLivingEnemies(run).length === 0) {
    scheduleCombatVictory(lobbyId);
    return;
  }

  setupTurn(run, lobbyId);
}

function resolveEnemyPhase(lobbyId) {
  const run = runs.get(lobbyId);
  if (!run) {
    return;
  }

  clearTurnTimer(run);
  run.turn.phase = "enemy";
  run.turn.turnEndsAt = null;
  addLog(run, "Enemy phase begins.");

  if (run.smokeBombTurns > 0) {
    addLog(run, "Smoke Bomb causes the enemies to miss their turn.");
    run.smokeBombTurns -= 1;
    nextRound(lobbyId);
    return;
  }

  let enemyAttackCount = 0;
  for (const enemy of getLivingEnemies(run)) {
    if (enemy.effects.stunTurns > 0) {
      addLog(run, `${enemy.name} is stunned and misses its attack.`);
      addCombatFeedback(run, "stun_skip", {
        actorId: enemy.id,
        actorName: enemy.name,
        targetKind: "enemy",
        targetId: enemy.id,
        text: "Stunned",
      });
      enemy.effects.stunTurns -= 1;
      if (enemy.effects.stunTurns <= 0) {
        addLog(run, `${enemy.name}'s Stun is removed.`);
        addDebuffRemovedFeedback(run, enemy, "Stun");
      }
      continue;
    }
    if (isFrozen(enemy)) {
      addLog(run, `${enemy.name} is frozen and misses its attack.`);
      addCombatFeedback(run, "frozen_skip", {
        actorId: enemy.id,
        actorName: enemy.name,
        targetKind: "enemy",
        targetId: enemy.id,
        text: "Frozen",
      });
      continue;
    }
    const targets = getLivingParty(run);
    if (targets.length === 0) {
      endRun(lobbyId, false, getPartyWipeMessage(run));
      return;
    }
    const action = enemy.intendedAction || chooseEnemyAction(enemy);
    const attackTargets = action?.target === "all"
      ? targets
      : [enemy.intendedTargetId ? targets.find((member) => member.id === enemy.intendedTargetId) : null]
          .filter(Boolean);
    if (attackTargets.length === 0) {
      attackTargets.push(targets[Math.floor(Math.random() * targets.length)]);
    }
    if (shouldMissInUpdraft(run, enemy)) {
      addLog(run, `${enemy.name} uses ${action?.name || "Basic Swing"}, but misses.`);
      addCombatFeedback(run, "enemy_attack", {
        actorId: enemy.id,
        actorName: enemy.name,
        actionKind: action?.kind || "swing",
        actionId: action?.id || "basic",
        actionName: action?.name || "Basic Swing",
        actionType: action?.type || null,
        missedByUpdraft: true,
        targetKind: "party",
        targetIds: attackTargets.map((target) => target.id),
        targets: attackTargets.map((target) => ({
          targetId: target.id,
          targetName: target.nickname,
          amount: 0,
          multiplier: 1,
          text: "Miss",
        })),
      });
      enemyAttackCount += 1;
      continue;
    }
    const attackResults = [];
    for (const target of attackTargets) {
      const result = resolveEnemyActionAgainstPlayer(run, enemy, target, action, action?.target === "all" ? "all" : "single");
      attackResults.push({
        targetId: target.id,
        targetName: target.nickname,
        amount: result.amount,
        multiplier: result.multiplier,
        text: result.amount > 0 ? `-${result.amount} HP` : action?.name || "Spell",
      });
    }
    if (action?.kind === "spell" && SPELLS[action.id]?.type === "Earth") {
      applyEarthDefenseBuff(run, enemy);
    }
    addCombatFeedback(run, "enemy_attack", {
      actorId: enemy.id,
      actorName: enemy.name,
      actionKind: action?.kind || "swing",
      actionId: action?.id || "basic",
      actionName: action?.name || "Basic Swing",
      actionType: action?.type || null,
      targetKind: "party",
      targetIds: attackResults.map((result) => result.targetId),
      targets: attackResults,
    });
    enemyAttackCount += 1;
  }

  const enemyPhaseDelayMs = ENEMY_PHASE_COMPLETE_DELAY_MS + Math.max(0, enemyAttackCount - 1) * ENEMY_ATTACK_DELAY_MS;
  if (getLivingParty(run).length === 0) {
    emitRunState(lobbyId);
    setTimeout(() => {
      if (runs.has(lobbyId)) {
        endRun(lobbyId, false, getPartyWipeMessage(run));
      }
    }, enemyPhaseDelayMs);
    return;
  }

  emitRunState(lobbyId);
  setTimeout(() => nextRound(lobbyId), enemyPhaseDelayMs);
}

function advancePlayerTurn(lobbyId) {
  const run = runs.get(lobbyId);
  if (!run) {
    return;
  }

  if (getLivingEnemies(run).length === 0) {
    scheduleCombatVictory(lobbyId);
    return;
  }

  if (allLivingPlayersActed(run)) {
    resolveEnemyPhase(lobbyId);
    return;
  }

  emitRunState(lobbyId);
}

function applyBlessing(member, blessingId) {
  const blessing = BLESSINGS[blessingId];
  if (!blessing) {
    return false;
  }
  blessing.apply(member);
  return true;
}

function makePartyMember(player) {
  const character = getPlayableCharacter(player.characterId);
  const startingGold = getStartingGoldForPlayer(player);
  return {
    id: player.id,
    nickname: player.nickname,
    characterId: character.id,
    type: character.type,
    artKey: character.artKey,
    maxHp: character.maxHp,
    hp: character.maxHp,
    energy: character.energyRegen,
    mana: character.manaRegen,
    xp: 0,
    gold: startingGold,
    level: 1,
    swingDamage: character.swingDamage,
    spellDamage: character.spellDamage,
    swingDefense: character.swingDefense,
    spellDefense: character.spellDefense,
    energyRegen: character.energyRegen,
    manaRegen: character.manaRegen,
    blessings: [],
    inventory: {
      health_potion: 1,
      defence_potion: 1,
      ether: 1,
      energy_shard: 0,
      smoke_bomb: 0,
    },
    knownSpells: [...character.startingSpells],
    knownSwings: [...DEFAULT_KNOWN_SWINGS],
    startingLoadoutVersion: STARTING_LOADOUT_VERSION,
    isDefending: false,
    effects: getClearedPlayerEffects(),
  };
}

function rollCombatEntries(config, enemyCountOverride = null) {
  if (Array.isArray(config.enemies)) {
    return config.enemies;
  }

  const pool = Array.isArray(config.enemyPool) ? config.enemyPool : [];
  if (pool.length === 0) {
    return [];
  }

  const countConfig = enemyCountOverride || config.enemyCount || {};
  const minCount = Math.max(1, countConfig.min || 1);
  const maxCount = Math.max(minCount, countConfig.max || minCount);
  const desiredCount = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
  return sample(pool, Math.min(desiredCount, pool.length));
}

function getCombatEnemyCountOverride(combatKey, stage = {}, run = null) {
  if (combatKey !== "mob_fight") {
    return null;
  }

  const combatFloorNumber = getCombatFloorNumber(getLoopFloorFromStageIndex(stage.loopFloor));
  if (combatFloorNumber <= 2) {
    const partySize = run?.party ? Object.keys(run.party).length : 0;
    if (partySize === 1) {
      return { min: 1, max: 1 };
    }
    return { min: 1, max: 3 };
  }

  return null;
}

function getCombatRewards(config, enemyCount) {
  if (config.perEnemyRewards) {
    return {
      xp: (config.perEnemyRewards.xp || 0) * enemyCount,
      gold: (config.perEnemyRewards.gold || 0) * enemyCount,
    };
  }

  return config.rewards || { xp: 0, gold: 0 };
}

function createEnemyInstance(entry, scaling = {}) {
  const template = ENEMY_TEMPLATES[entry.template];
  const hpMultiplier = scaling.hpMultiplier || 1;
  const damageMultiplier = scaling.damageMultiplier || 1;
  const maxHp = Math.max(1, Math.round(template.maxHp * hpMultiplier));
  const attackDamage = Math.max(1, Math.round(template.attackDamage * damageMultiplier));
  return {
    id: makeId("enemy"),
    name: entry.name,
    artKey: template.artKey,
    type: template.type,
    maxHp,
    hp: maxHp,
    attackDamage,
    swingDamage: template.swingDamage,
    spellDamage: template.spellDamage,
    swingDefense: template.swingDefense,
    spellDefense: template.spellDefense,
    stunChance: template.stunChance || 0,
    attackTarget: template.attackTarget || "single",
    enemyActions: Array.isArray(template.enemyActions) && template.enemyActions.length > 0
      ? template.enemyActions.map((action) => ({ ...action }))
      : [{ kind: "swing", id: "basic", weight: 1 }],
    effects: {
      burnTurns: 0,
      poisonStacks: 0,
      bleedStacks: 0,
      stunTurns: 0,
      freezeChecks: 0,
      updraft: false,
      corrupted: false,
      drownedValue: 0,
    },
    intendedTargetId: null,
    intendedTargetIds: [],
    intendedAction: null,
  };
}

function createRun(lobby) {
  const party = {};
  for (const playerId of lobby.playerIds) {
    const player = players.get(playerId);
    if (!player) {
      continue;
    }
    party[playerId] = makePartyMember(player);
  }

  const startsAtFloor10Boss = Object.values(party).some((member) => isFloor10BossNickname(member.nickname));

  return {
    lobbyId: lobby.id,
    party,
    stageIndex: startsAtFloor10Boss ? 9 : -1,
    stages: startsAtFloor10Boss ? [] : [
      { type: "blessing", label: "Relic Shrine" },
    ],
    blessingChoices: {},
    chosenBlessings: {},
    shop: null,
    stageReady: {},
    rewardSummary: null,
    levelUpChoices: {},
    levelUpAdvanceScheduled: false,
    enemies: [],
    battleLog: [],
    combatFeedbackEvents: [],
    combatFeedbackSeq: 0,
    turn: null,
    turnTimer: null,
    smokeBombTurns: 0,
  };
}

function isFloor10BossNickname(nickname) {
  return String(nickname || "").trim().toLowerCase() === FLOOR_10_BOSS_NICKNAME;
}

function getLoopFloorFromStageIndex(stageIndex) {
  return Math.max(1, Number(stageIndex) || 1);
}

function getCombatFloorNumber(loopFloor) {
  const shopInterval = MOB_FLOORS_BETWEEN_SHOPS + 1;
  return loopFloor - Math.floor(loopFloor / shopInterval);
}

function getGeneratedStage(stageIndex) {
  const loopFloor = getLoopFloorFromStageIndex(stageIndex);
  if (loopFloor % 10 === 0) {
    return { type: "combat", label: "Boss Fight", combatKey: "boss", loopFloor };
  }

  if (loopFloor % (MOB_FLOORS_BETWEEN_SHOPS + 1) === 0) {
    return { type: "shop", label: "Shop", loopFloor };
  }

  const combatFloorNumber = getCombatFloorNumber(loopFloor);
  const isEliteFight = combatFloorNumber % 10 === 0;
  return {
    type: "combat",
    label: isEliteFight ? "Elite Mob Fight" : "Mob Fight",
    combatKey: isEliteFight ? "mini_boss" : "mob_fight",
    loopFloor,
  };
}

function ensureStage(run) {
  if (run.stageIndex < 0 || run.stages[run.stageIndex]) {
    return;
  }

  run.stages[run.stageIndex] = getGeneratedStage(run.stageIndex);
}

function getEnemyScaling(run) {
  const stage = run.stages[run.stageIndex] || {};
  const loopFloor = getLoopFloorFromStageIndex(stage.loopFloor || run.stageIndex);
  const partySize = Object.keys(run.party || {}).length;
  const partyHpMultiplier = 1 + Math.max(0, partySize - 1) * 0.2;
  const floorMultiplier = 1 + Math.floor(loopFloor / 10) * 0.1;

  return {
    hpMultiplier: partyHpMultiplier * floorMultiplier,
    damageMultiplier: floorMultiplier,
  };
}

function getClearedPlayerEffects() {
  return {
    earthDefenseBonus: 0,
    burnTurns: 0,
    poisonStacks: 0,
    bleedStacks: 0,
    stunTurns: 0,
    freezeChecks: 0,
    defencePotionTurns: 0,
    updraft: false,
    corrupted: false,
    drownedValue: 0,
  };
}

function resetCombatResources(run) {
  for (const member of Object.values(run.party)) {
    if (member.hp <= 0) {
      continue;
    }
    member.energy = getCombatStartingEnergy(member);
    member.mana = Math.max(member.mana, getTurnStartManaGain(member));
    member.isDefending = false;
    member.effects = getClearedPlayerEffects();
  }
}

function clearEncounterPlayerStatusEffects(run) {
  for (const member of Object.values(run?.party || {})) {
    member.isDefending = false;
    member.effects = getClearedPlayerEffects();
  }
}

function startCombat(lobbyId, combatKey) {
  const run = runs.get(lobbyId);
  if (!run) {
    return;
  }

  const config = COMBAT_STAGES[combatKey];
  const stage = run.stages[run.stageIndex] || {};
  const enemyScaling = getEnemyScaling(run);
  const enemyCountOverride = getCombatEnemyCountOverride(combatKey, stage, run);
  run.enemies = rollCombatEntries(config, enemyCountOverride).map((entry) => createEnemyInstance(entry, enemyScaling));
  run.battleLog = [`${stage.label || config.name} starts.`];
  run.combatFeedbackEvents = [];
  run.combatFeedbackSeq = 0;
  run.shop = null;
  run.stageReady = {};
  run.rewardSummary = null;
  run.levelUpChoices = {};
  run.levelUpAdvanceScheduled = false;
  run.smokeBombTurns = 0;
  resetCombatResources(run);
  run.turn = {
    phase: "player",
    round: 1,
    turnEndsAt: null,
    actedPlayerIds: [],
  };
  setupTurn(run, lobbyId);
}

function advanceStage(lobbyId) {
  const run = runs.get(lobbyId);
  const lobby = lobbies.get(lobbyId);
  if (!run || !lobby) {
    return;
  }

  clearTurnTimer(run);
  run.stageIndex += 1;
  ensureStage(run);

  const stage = run.stages[run.stageIndex];
  run.battleLog = [`Entering ${stage.label}.`];
  run.turn = null;
  run.stageReady = {};
  run.shop = null;
  run.rewardSummary = null;
  run.levelUpChoices = {};
  run.levelUpAdvanceScheduled = false;

  if (stage.type === "blessing") {
    run.blessingChoices = {};
    run.chosenBlessings = {};
    const allBlessings = Object.values(BLESSINGS);
    for (const playerId of lobby.playerIds) {
      run.blessingChoices[playerId] = sample(allBlessings, 3);
    }
    emitRunState(lobbyId);
    return;
  }

  if (stage.type === "shop") {
    run.shop = {
      swings: Object.values(SWINGS),
      spells: Object.values(SPELLS),
      items: ["health_potion", "defence_potion", "ether", "energy_shard", "smoke_bomb"].map((itemId) => ITEMS[itemId]),
      relics: Object.values(BLESSINGS).map(({ id, name, description, price }) => ({ id, name, description, price })),
    };
    emitRunState(lobbyId);
    return;
  }

  if (stage.type === "combat") {
    startCombat(lobbyId, stage.combatKey);
  }
}

function getRunFloorNumber(run) {
  const stageIndex = Number(run?.stageIndex) || 0;
  return Math.max(1, stageIndex);
}

function getPartyWipeMessage(run) {
  return `Your party died on Chapter 1, Floor ${getRunFloorNumber(run)}.`;
}

function getRunEndSummary(run, success, message) {
  const stage = run?.stages?.[run.stageIndex] || {};
  return {
    success,
    message,
    lobbyId: run?.lobbyId || "",
    chapter: 1,
    floor: getRunFloorNumber(run),
    stageName: stage.label || "",
    party: Object.values(run?.party || {}).map((member) => ({
      id: member.id,
      nickname: member.nickname,
      characterId: member.characterId,
      type: member.type,
      hp: member.hp,
      maxHp: member.maxHp,
      level: member.level,
      gold: member.gold,
      xp: member.xp,
    })),
  };
}

function applyDeathMaxHpPenalty(member) {
  const previousMaxHp = Math.max(1, Math.round(member.maxHp || 1));
  const nextMaxHp = Math.max(1, Math.floor(previousMaxHp * DEATH_MAX_HP_MULTIPLIER));
  member.maxHp = nextMaxHp;
  member.hp = nextMaxHp;
  return {
    previousMaxHp,
    nextMaxHp,
  };
}

function scheduleCombatVictory(lobbyId) {
  const run = runs.get(lobbyId);
  if (!run) {
    return;
  }

  if (!run.turn || run.turn.phase === "victory" || run.turn.phase === "victory_pending" || run.victoryRewardTimer) {
    return;
  }

  clearTurnTimer(run);
  run.turn.phase = "victory_pending";
  run.turn.turnEndsAt = null;
  emitRunState(lobbyId);
  run.victoryRewardTimer = setTimeout(() => {
    run.victoryRewardTimer = null;
    handleCombatVictory(lobbyId);
  }, COMBAT_VICTORY_REWARD_DELAY_MS);
}

function handleCombatVictory(lobbyId) {
  const run = runs.get(lobbyId);
  if (!run) {
    return;
  }

  // Guard against re-entry. After the first victory call we switch to the
  // victory phase so straggler combatAction events bail out instead of
  // re-triggering victory and double-scheduling advanceStage. Without this
  // the shop would open and then immediately get skipped past.
  if (!run.turn || run.turn.phase === "victory") {
    return;
  }
  run.turn.phase = "victory";

  clearTurnTimer(run);
  const stage = run.stages[run.stageIndex];
  const combatConfig = COMBAT_STAGES[stage.combatKey];
  const stageName = stage.label || combatConfig.name;
  const combatRewards = getCombatRewards(combatConfig, run.enemies.length);
  addLog(run, `${stageName} won. Rewards granted.`);
  clearEncounterPlayerStatusEffects(run);

  const rewardMembers = [];
  const levelUpChoices = {};
  for (const member of Object.values(run.party)) {
    const before = {
      hp: member.hp,
      maxHp: member.maxHp,
      gold: member.gold,
      xp: member.xp,
      level: member.level,
    };
    let deathPenalty = null;
    if (member.hp <= 0) {
      deathPenalty = applyDeathMaxHpPenalty(member);
      addLog(run, `${member.nickname} returns with ${member.hp} HP after being downed.`);
      if (deathPenalty.nextMaxHp < deathPenalty.previousMaxHp) {
        addLog(run, `${member.nickname}'s Max HP is cut from ${deathPenalty.previousMaxHp} to ${deathPenalty.nextMaxHp}.`);
      }
    }
    member.gold += combatRewards.gold;
    member.xp += combatRewards.xp;
    recalcLevel(member, run);
    rewardMembers.push({
      id: member.id,
      nickname: member.nickname,
      characterId: member.characterId,
      type: member.type,
      xpGained: combatRewards.xp,
      goldGained: combatRewards.gold,
      xpBefore: before.xp,
      xpAfter: member.xp,
      goldBefore: before.gold,
      goldAfter: member.gold,
      levelBefore: before.level,
      levelAfter: member.level,
      wasDowned: before.hp <= 0,
      maxHpBefore: before.maxHp,
      maxHpAfter: member.maxHp,
    });
    if (member.level > before.level) {
      levelUpChoices[member.id] = {
        levelBefore: before.level,
        levelAfter: member.level,
        selectedStatId: null,
      };
    }
  }

  run.rewardSummary = {
    stageName,
    stageIndex: run.stageIndex,
    xpGained: combatRewards.xp,
    goldGained: combatRewards.gold,
    members: rewardMembers,
  };
  run.levelUpChoices = levelUpChoices;
  run.levelUpAdvanceScheduled = false;

  emitRunState(lobbyId);
  if (Object.keys(levelUpChoices).length === 0) {
    setTimeout(() => advanceStage(lobbyId), 5200);
  }
}

function endRun(lobbyId, success, message) {
  const lobby = lobbies.get(lobbyId);
  const run = runs.get(lobbyId);
  if (!lobby) {
    return;
  }

  const endSummary = run ? getRunEndSummary(run, success, message) : null;

  if (run) {
    clearTurnTimer(run);
    runs.delete(lobbyId);
  }

  for (const playerId of lobby.playerIds) {
    const player = players.get(playerId);
    if (!player) {
      continue;
    }
    player.scene = "hub";
    player.lobbyId = null;
    player.ready = false;
    if (endSummary && !success) {
      io.to(playerId).emit("runEndSummary", endSummary);
    }
    io.to(playerId).emit("toast", {
      type: success ? "success" : "warning",
      message,
    });
    io.to(playerId).emit("sceneChange", { scene: "hub" });
    emitSessionState(playerId);
  }

  lobbies.delete(lobbyId);
  broadcastHubState();
}

function leaveLobby(socketId, sendSceneChange = true) {
  const player = players.get(socketId);
  if (!player || !player.lobbyId) {
    return;
  }

  const lobby = lobbies.get(player.lobbyId);
  const run = runs.get(player.lobbyId);
  const lobbyId = player.lobbyId;

  if (run) {
    delete run.party[socketId];
    delete run.blessingChoices[socketId];
    delete run.chosenBlessings[socketId];
    delete run.stageReady[socketId];
    const hadLevelUpChoices = Object.keys(run.levelUpChoices || {}).length > 0;
    delete run.levelUpChoices?.[socketId];
    if (run.turn?.actedPlayerIds) {
      run.turn.actedPlayerIds = run.turn.actedPlayerIds.filter((playerId) => playerId !== socketId);
    }
    if (hadLevelUpChoices && run.turn?.phase === "victory" && run.rewardSummary && getPendingLevelUpPlayerIds(run).length === 0) {
      scheduleLevelUpAdvance(lobbyId);
    }
    if (run.turn?.phase === "player") {
      setTimeout(() => advancePlayerTurn(lobbyId), 0);
    }
  }

  if (lobby) {
    lobby.playerIds = lobby.playerIds.filter((playerId) => playerId !== socketId);
    if (lobby.hostId === socketId) {
      lobby.hostId = lobby.playerIds[0] || null;
    }
  }

  player.lobbyId = null;
  player.ready = false;
  player.scene = "hub";
  socketLeaveRoom(socketId, `lobby:${lobbyId}`);

  if (lobby && lobby.playerIds.length === 0) {
    lobbies.delete(lobbyId);
    runs.delete(lobbyId);
  } else {
    emitLobbyState(lobbyId);
    if (runs.has(lobbyId)) {
      emitRunState(lobbyId);
    }
  }

  if (sendSceneChange) {
    io.to(socketId).emit("sceneChange", { scene: "hub" });
    emitSessionState(socketId);
  }

  broadcastHubState();
}

function socketLeaveRoom(socketId, room) {
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    socket.leave(room);
  }
}

function emitCombatPreview(lobbyId, payload) {
  io.to(`lobby:${lobbyId}`).emit("combatPreview", payload);
}

function resolvePlayerActionSkip(run, member) {
  if ((member.effects?.stunTurns || 0) > 0) {
    addLog(run, `${member.nickname} is stunned and misses their action.`);
    addCombatFeedback(run, "stun_skip", {
      actorId: member.id,
      actorName: member.nickname,
      targetKind: "party",
      targetId: member.id,
      text: "Stunned",
    });
    member.effects.stunTurns -= 1;
    if (member.effects.stunTurns <= 0) {
      addLog(run, `${member.nickname}'s Stun is removed.`);
      addDebuffRemovedFeedback(run, member, "Stun");
    }
    return true;
  }
  return false;
}

function shouldMissInUpdraft(run, combatant) {
  if (!combatant?.effects?.updraft || Math.random() >= UPDRAFT_MISS_CHANCE) {
    return false;
  }
  addLog(run, `${getCombatantDisplayName(combatant)} misses in the Updraft.`);
  addCombatFeedback(run, "updraft_miss", {
    actorId: combatant.id,
    actorName: getCombatantDisplayName(combatant),
    targetKind: getCombatantTargetKind(combatant),
    targetId: combatant.id,
    text: "Updraft Miss",
  });
  return true;
}

function handleCombatAction(socketId, payload) {
  const player = players.get(socketId);
  if (!player || !player.lobbyId) {
    return;
  }
  const run = runs.get(player.lobbyId);
  if (!run || !run.turn || run.turn.phase !== "player") {
    return;
  }

  // If combat already ended (victory queued) reject any in-flight actions
  // so they can't double-trigger handleCombatVictory and skip the next stage.
  if (getLivingEnemies(run).length === 0) {
    return;
  }

  const member = run.party[socketId];
  const action = payload || {};
  if (!member || member.hp <= 0) {
    return;
  }
  ensureMemberStartingLoadout(member);

  if (action.kind === "cancelEndTurn") {
    if (isFrozen(member)) {
      return;
    }
    if (!run.turn.actedPlayerIds.includes(socketId)) {
      return;
    }
    run.turn.actedPlayerIds = run.turn.actedPlayerIds.filter((playerId) => playerId !== socketId);
    addLog(run, `${member.nickname} cancels ending their turn.`);
    emitRunState(player.lobbyId);
    return;
  }

  if (run.turn.actedPlayerIds.includes(socketId)) {
    return;
  }

  if (resolvePlayerActionSkip(run, member)) {
    run.turn.actedPlayerIds.push(socketId);
    emitRunState(player.lobbyId);
    advancePlayerTurn(player.lobbyId);
    return;
  }

  if (isFrozen(member)) {
    if (action.kind !== "thaw") {
      return;
    }
    const thawed = resolveFreezeAtTurnStart(run, member);
    emitCombatPreview(player.lobbyId, {
      actorId: socketId,
      targetId: socketId,
      targetKind: "party",
      targetIds: [socketId],
      kind: action.kind,
      id: action.id,
    });
    if (!thawed) {
      run.turn.actedPlayerIds.push(socketId);
    }
    emitRunState(player.lobbyId);
    if (!thawed) {
      advancePlayerTurn(player.lobbyId);
    }
    return;
  }

  const livingEnemies = getLivingEnemies(run);
  const livingParty = getLivingParty(run);
  let previewTargetId = action.targetId || null;
  let previewTargetKind = "enemy";
  let previewTargetIds = [];

  const spendResources = (energyCost, manaCost = 0) => {
    if (member.energy < energyCost || member.mana < manaCost) {
      return false;
    }
    member.energy -= energyCost;
    member.mana -= manaCost;
    return true;
  };

  let didEndTurn = false;
  let missedByUpdraft = false;

  if (action.kind === "swing") {
    if (!SWINGS[action.id] || !canUseOwnedAction(run, socketId, member, "swing", action.id)) {
      return;
    }
    const target = livingEnemies.find((enemy) => enemy.id === action.targetId);
    if (!target) {
      return;
    }

    if (action.id === "basic") {
      if (!spendResources(1, 0)) {
        return;
      }
      missedByUpdraft = shouldMissInUpdraft(run, member);
      if (missedByUpdraft) {
        addLog(run, `${member.nickname} uses Basic Swing on ${target.name}, but misses.`);
      } else {
        const physical = resolvePhysicalDamage(getBasicSwingDamage(member), member, target);
        const finalDamage = applyDamageToEnemy(run, target, physical);
        maybeInflictBleedFromSwing(run, member, target, finalDamage);
        addLog(run, `${member.nickname} uses Basic Swing on ${target.name}.`);
      }
    } else if (action.id === "charged") {
      if (!spendResources(2, 1)) {
        return;
      }
      missedByUpdraft = shouldMissInUpdraft(run, member);
      if (missedByUpdraft) {
        addLog(run, `${member.nickname} uses Charged Swing on ${target.name}, but misses.`);
      } else {
        const base = getChargedSwingDamage(member);
        const physical = resolvePhysicalDamage(base * 0.5, member, target);
        const typed = resolveTypedMagicDamage(base * 0.5, member.type, target.type, target.spellDefense, member);
        const finalDamage = applyDamageToEnemy(run, target, physical + typed.damage, typed.multiplier !== 1 ? `(x${typed.multiplier})` : "");
        maybeInflictBleedFromSwing(run, member, target, finalDamage);
        addLog(run, `${member.nickname} uses Charged Swing on ${target.name}.`);
      }
    } else if (action.id === "power") {
      if (!spendResources(3, 2)) {
        return;
      }
      missedByUpdraft = shouldMissInUpdraft(run, member);
      if (missedByUpdraft) {
        addLog(run, `${member.nickname} uses Power Swing on ${target.name}, but misses.`);
      } else {
        const base = getPowerSwingDamage(member);
        const physical = resolvePhysicalDamage(base * 0.4, member, target);
        const typed = resolveTypedMagicDamage(base * 0.6, member.type, target.type, target.spellDefense, member);
        const finalDamage = applyDamageToEnemy(run, target, physical + typed.damage, typed.multiplier !== 1 ? `(x${typed.multiplier})` : "");
        maybeInflictBleedFromSwing(run, member, target, finalDamage);
        addLog(run, `${member.nickname} uses Power Swing on ${target.name}.`);
      }
    } else {
      return;
    }
    markOwnedActionUsed(run, socketId, "swing", action.id);
  } else if (action.kind === "spell") {
    const spell = SPELLS[action.id];
    if (!spell || member.level < spell.levelRequired || !canUseOwnedAction(run, socketId, member, "spell", spell.id)) {
      return;
    }

    const allyTarget = livingParty.find((ally) => ally.id === action.targetId);
    const canHealAllies = isClericLightSpell(member, spell);
    const baseDamage = resolveSpellBaseDamage(spell, member);

    if (canHealAllies && allyTarget) {
      if (!spendResources(0, spell.manaCost)) {
        return;
      }
      const healingTargets = spell.target === "all" ? livingParty : [allyTarget];
      const healingAmount = baseDamage * 2;
      healingTargets.forEach((ally) => healPlayer(run, ally, healingAmount, `from ${spell.name}`));
      previewTargetKind = "ally";
      previewTargetId = allyTarget.id;
      previewTargetIds = healingTargets.map((ally) => ally.id);
      addLog(run, `${member.nickname} casts ${spell.name} as a healing prayer.`);
    } else if (spell.target === "single") {
      const target = livingEnemies.find((enemy) => enemy.id === action.targetId);
      if (!target) {
        return;
      }
      if (!spendResources(0, spell.manaCost)) {
        return;
      }

      const missed = shouldMissInUpdraft(run, member);
      missedByUpdraft = missed;
      if (missed) {
        addLog(run, `${member.nickname} casts ${spell.name}, but misses.`);
      } else if (spell.id === "ignite") {
        applyElementalSpellEffects(run, member, target, spell, 0, "single");
      } else {
        applySpellDamageToEnemy(run, member, target, spell, baseDamage, "single");
      }
      if (!missed) {
        applyEarthSpellDefense(run, member, spell, "single");
      }
      addLog(run, `${member.nickname} casts ${spell.name}.`);
    } else {
      if (!spendResources(0, spell.manaCost)) {
        return;
      }
      previewTargetId = livingEnemies[0]?.id || null;
      previewTargetIds = livingEnemies.map((enemy) => enemy.id);
      const missed = shouldMissInUpdraft(run, member);
      missedByUpdraft = missed;
      if (missed) {
        addLog(run, `${member.nickname} casts ${spell.name}, but misses.`);
      } else if (spell.id === "ignite") {
        for (const enemy of livingEnemies) {
          applyElementalSpellEffects(run, member, enemy, spell, 0, "all");
        }
      } else {
        for (const enemy of livingEnemies) {
          applySpellDamageToEnemy(run, member, enemy, spell, baseDamage, "all");
        }
      }
      if (!missed) {
        applyEarthSpellDefense(run, member, spell, "all");
      }
      addLog(run, `${member.nickname} casts ${spell.name}.`);
    }
    markOwnedActionUsed(run, socketId, "spell", spell.id);
  } else if (action.kind === "item") {
    const item = ITEMS[action.id];
    if (!item || !member.inventory[action.id] || member.inventory[action.id] <= 0) {
      return;
    }
    if (!spendResources(item.energyCost, 0)) {
      return;
    }
    member.inventory[action.id] -= 1;

    if (item.id === "health_potion") {
      member.hp = clamp(member.hp + 40, 0, member.maxHp);
      addLog(run, `${member.nickname} drinks a Health Potion.`);
    } else if (item.id === "defence_potion") {
      member.effects ||= {};
      member.effects.defencePotionTurns = Math.max(member.effects.defencePotionTurns || 0, 3);
      addLog(run, `${member.nickname} drinks a Defence Potion.`);
    } else if (item.id === "ether") {
      member.mana += 3;
      addLog(run, `${member.nickname} restores mana with Ether.`);
    } else if (item.id === "energy_shard") {
      member.energy += 2;
      addLog(run, `${member.nickname} uses an Energy Shard.`);
    } else if (item.id === "smoke_bomb") {
      run.smokeBombTurns = 1;
      clearEnemyIntents(run);
      addLog(run, `${member.nickname} uses a Smoke Bomb.`);
    }
    if (shouldShowItemUseFeedback(item) || item.id === "ether") {
      addCombatFeedback(run, "potion_used", {
        targetKind: "party",
        targetId: member.id,
        targetName: member.nickname,
        itemId: item.id,
        itemName: item.name,
        text: item.name,
      });
    }
  } else if (action.kind === "defend") {
    if (!spendResources(1, 0)) {
      return;
    }
    member.isDefending = true;
    addLog(run, `${member.nickname} defends.`);
  } else if (action.kind === "pass") {
    addLog(run, `${member.nickname} ends their turn.`);
    didEndTurn = true;
  } else {
    return;
  }

  emitCombatPreview(player.lobbyId, {
    actorId: socketId,
    targetId: previewTargetId,
    targetKind: previewTargetKind,
    targetIds: previewTargetIds,
    kind: action.kind,
    id: action.id,
    missedByUpdraft,
  });

  if (didEndTurn) {
    run.turn.actedPlayerIds.push(socketId);
  }

  emitRunState(player.lobbyId);

  if (getLivingEnemies(run).length === 0) {
    scheduleCombatVictory(player.lobbyId);
    return;
  }

  if (didEndTurn) {
    advancePlayerTurn(player.lobbyId);
  }
}

io.on("connection", (socket) => {
  const player = createPlayer(socket.id);
  players.set(socket.id, player);
  emitSessionState(socket.id);
  broadcastHubState();

  socket.on("registerPlayer", (payload) => {
    const current = players.get(socket.id);
    if (!current) {
      return;
    }
    const nickname = String(payload?.nickname || "").trim().slice(0, 18);
    if (!nickname) {
      return;
    }

    current.nickname = nickname;

    if (payload?.characterId) {
      current.characterId = getPlayableCharacter(String(payload.characterId).trim()).id;
      current.scene = "hub";
      const spawnX = Number(payload?.hubSpawn?.x);
      const spawnY = Number(payload?.hubSpawn?.y);
      if (Number.isFinite(spawnX) && Number.isFinite(spawnY)) {
        current.x = clamp(spawnX, HUB_MIN_X, HUB_MAX_X);
        current.y = clamp(spawnY, HUB_MIN_Y, HUB_MAX_Y);
      } else {
        current.x = 180 + Math.floor(Math.random() * 100);
        current.y = 560;
      }
      current.facing = 1;
      emitSessionState(socket.id);
      socket.emit("sceneChange", { scene: "hub" });
      broadcastHubState();
      return;
    }

    current.scene = "characterSelect";
    emitSessionState(socket.id);
    socket.emit("sceneChange", { scene: "characterSelect" });
  });

  socket.on("selectCharacter", (payload) => {
    const current = players.get(socket.id);
    if (!current || !current.nickname) {
      return;
    }
    current.characterId = getPlayableCharacter(String(payload?.characterId || "")).id;
    current.scene = "hub";
    const spawnX = Number(payload?.hubSpawn?.x);
    const spawnY = Number(payload?.hubSpawn?.y);
    if (Number.isFinite(spawnX) && Number.isFinite(spawnY)) {
      current.x = clamp(spawnX, HUB_MIN_X, HUB_MAX_X);
      current.y = clamp(spawnY, HUB_MIN_Y, HUB_MAX_Y);
    } else {
      current.x = 180 + Math.floor(Math.random() * 100);
      current.y = 560;
    }
    current.facing = 1;
    emitSessionState(socket.id);
    socket.emit("sceneChange", { scene: "hub" });
    broadcastHubState();
  });

  socket.on("updateLobbyCharacter", (payload) => {
    const current = players.get(socket.id);
    if (!current || current.scene !== "lobby" || !current.lobbyId || runs.has(current.lobbyId)) {
      return;
    }
    current.characterId = getPlayableCharacter(String(payload?.characterId || "")).id;
    current.ready = false;
    emitSessionState(socket.id);
    emitLobbyState(current.lobbyId);
  });

  socket.on("updateHubMovement", (payload) => {
    const current = players.get(socket.id);
    if (!current || current.scene !== "hub") {
      return;
    }
    const incomingX = Number(payload?.x);
    const incomingY = Number(payload?.y);
    current.x = clamp(Number.isFinite(incomingX) ? incomingX : current.x, HUB_MIN_X, HUB_MAX_X);
    current.y = clamp(Number.isFinite(incomingY) ? incomingY : current.y, HUB_MIN_Y, HUB_MAX_Y);
    current.facing = payload?.facing === -1 ? -1 : 1;
    broadcastHubState();
  });

  socket.on("createLobby", (payload) => {
    const current = players.get(socket.id);
    if (!current || current.scene !== "hub") {
      return;
    }

    const lobbyId = makeId("lobby");
    const lobby = {
      id: lobbyId,
      name: String(payload?.name || `${current.nickname}'s Lobby`).slice(0, 24),
      password: String(payload?.password || "").trim(),
      hostId: socket.id,
      playerIds: [socket.id],
    };
    lobbies.set(lobbyId, lobby);
    current.scene = "lobby";
    current.lobbyId = lobbyId;
    current.ready = false;
    socket.join(`lobby:${lobbyId}`);
    emitSessionState(socket.id);
    socket.emit("sceneChange", { scene: "lobby" });
    emitLobbyState(lobbyId);
    broadcastHubState();
  });

  socket.on("joinLobby", (payload) => {
    const current = players.get(socket.id);
    if (!current || current.scene !== "hub") {
      return;
    }
    const lobby = lobbies.get(payload?.lobbyId);
    if (!lobby || runs.has(lobby.id)) {
      socket.emit("toast", { type: "warning", message: "That lobby is not available." });
      return;
    }
    if (lobby.playerIds.length >= 4) {
      socket.emit("toast", { type: "warning", message: "That lobby is already full." });
      return;
    }
    if (lobby.password && lobby.password !== String(payload?.password || "")) {
      socket.emit("toast", { type: "warning", message: "Incorrect lobby password." });
      return;
    }

    lobby.playerIds.push(socket.id);
    current.scene = "lobby";
    current.lobbyId = lobby.id;
    current.ready = false;
    socket.join(`lobby:${lobby.id}`);
    emitSessionState(socket.id);
    socket.emit("sceneChange", { scene: "lobby" });
    emitLobbyState(lobby.id);
    broadcastHubState();
  });

  socket.on("leaveLobby", () => {
    leaveLobby(socket.id, true);
  });

  socket.on("toggleReady", () => {
    const current = players.get(socket.id);
    if (!current || !current.lobbyId || runs.has(current.lobbyId)) {
      return;
    }
    current.ready = !current.ready;
    emitSessionState(socket.id);
    emitLobbyState(current.lobbyId);
  });

  socket.on("startRun", () => {
    const current = players.get(socket.id);
    if (!current || !current.lobbyId) {
      return;
    }
    const lobby = lobbies.get(current.lobbyId);
    if (!lobby || lobby.hostId !== socket.id) {
      return;
    }

    const everyoneReady = lobby.playerIds.every((playerId) => players.get(playerId)?.ready);
    if (!everyoneReady) {
      socket.emit("toast", { type: "warning", message: "All players must be ready." });
      return;
    }

    const run = createRun(lobby);
    runs.set(lobby.id, run);
    for (const playerId of lobby.playerIds) {
      const lobbyPlayer = players.get(playerId);
      if (!lobbyPlayer) {
        continue;
      }
      lobbyPlayer.scene = "run";
      lobbyPlayer.ready = false;
      io.to(playerId).emit("sceneChange", { scene: "run" });
      emitSessionState(playerId);
    }
    advanceStage(lobby.id);
    broadcastHubState();
  });

  socket.on("chooseBlessing", (payload) => {
    const current = players.get(socket.id);
    if (!current || !current.lobbyId) {
      return;
    }
    const run = runs.get(current.lobbyId);
    if (!run || run.stages[run.stageIndex].type !== "blessing" || run.chosenBlessings[socket.id]) {
      return;
    }
    const choice = run.blessingChoices[socket.id]?.find((entry) => entry.id === payload?.blessingId);
    if (!choice) {
      return;
    }
    run.chosenBlessings[socket.id] = choice.id;
    applyBlessing(run.party[socket.id], choice.id);
    addLog(run, `${run.party[socket.id].nickname} chose ${choice.name}.`);
    emitRunState(current.lobbyId);

    const everyonePicked = Object.keys(run.party).every((playerId) => Boolean(run.chosenBlessings[playerId]));
    if (everyonePicked) {
      setTimeout(() => advanceStage(current.lobbyId), 900);
    }
  });

  socket.on("chooseLevelUpStat", (payload) => {
    const current = players.get(socket.id);
    if (!current || !current.lobbyId) {
      return;
    }
    const run = runs.get(current.lobbyId);
    if (!run || run.turn?.phase !== "victory" || !run.rewardSummary) {
      return;
    }
    const member = run.party[socket.id];
    const choiceState = run.levelUpChoices?.[socket.id];
    if (!member || !choiceState || choiceState.selectedStatId) {
      return;
    }
    const statChoice = applyLevelUpStatChoice(run, member, payload?.statId);
    if (!statChoice) {
      return;
    }

    choiceState.selectedStatId = statChoice.id;
    emitRunState(current.lobbyId);
    if (getPendingLevelUpPlayerIds(run).length === 0) {
      scheduleLevelUpAdvance(current.lobbyId);
    }
  });

  socket.on("buyShopItem", (payload) => {
    const current = players.get(socket.id);
    if (!current || !current.lobbyId) {
      return;
    }
    const run = runs.get(current.lobbyId);
    if (!run || run.stages[run.stageIndex].type !== "shop") {
      return;
    }

    const member = run.party[socket.id];
    if (!member) {
      return;
    }

    if (payload?.kind === "spell") {
      const spell = SPELLS[payload.id];
      if (!spell || member.level < spell.levelRequired || member.gold < spell.price) {
        return;
      }
      member.gold -= spell.price;
      member.knownSpells ||= [];
      member.knownSpells.push(spell.id);
      addLog(run, `${member.nickname} bought another ${spell.name}.`);
    } else if (payload?.kind === "swing") {
      const swing = SWINGS[payload.id];
      if (!swing || member.gold < swing.price) {
        return;
      }
      member.gold -= swing.price;
      getMemberKnownSwings(member).push(swing.id);
      addLog(run, `${member.nickname} bought another ${swing.name}.`);
    } else if (payload?.kind === "item") {
      const item = ITEMS[payload.id];
      if (!item || member.gold < item.price) {
        return;
      }
      member.gold -= item.price;
      member.inventory[item.id] = (member.inventory[item.id] || 0) + 1;
      addLog(run, `${member.nickname} bought ${item.name}.`);
    } else if (payload?.kind === "relic") {
      const relic = BLESSINGS[payload.id];
      if (!relic || member.gold < relic.price) {
        return;
      }
      const alreadyOwned = countMemberBlessings(member, relic.id) > 0;
      member.gold -= relic.price;
      applyBlessing(member, relic.id);
      addLog(run, `${member.nickname} bought ${alreadyOwned ? "another " : ""}${relic.name}.`);
    } else {
      return;
    }

    emitRunState(current.lobbyId);
  });

  socket.on("markShopReady", () => {
    const current = players.get(socket.id);
    if (!current || !current.lobbyId) {
      return;
    }
    const run = runs.get(current.lobbyId);
    if (!run || run.stages[run.stageIndex].type !== "shop") {
      return;
    }

    run.stageReady[socket.id] = true;
    emitRunState(current.lobbyId);
    const everyoneReady = Object.keys(run.party).every((playerId) => run.stageReady[playerId]);
    if (everyoneReady) {
      setTimeout(() => advanceStage(current.lobbyId), 700);
    }
  });

  socket.on("combatAction", (payload) => {
    handleCombatAction(socket.id, payload);
  });

  socket.on("disconnect", () => {
    leaveLobby(socket.id, false);
    players.delete(socket.id);
    broadcastHubState();
  });
});

server.listen(PORT, () => {
  console.log(`SpellSwing MVP running on http://localhost:${PORT}`);
});
