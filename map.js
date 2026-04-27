// Map Registry - all available maps
const maps = {
  felishikasCastle: `
               MMMM      |▶      |▶      MMMMMMMMMMM       |▶      |▶     MMMM
                HH       |       |       ===========       |       |       HH            //=======\\\\
               HHMMMMMMMMMMMMMMMMMMMMMMMMM.ППППП.MMMMMMMMMMMMMMMMMMMMMMMMMHH           //^^^^^^^^^\\\\
               HH..........................П   П..........................HH            H  ППП    H
               HH..........................П   П..........................HH            H  П П    H
               HH........................G.П   П.G........................HH    1       HG П П    H 
######################################################################################################################
######################################################################################################################
######################################################################################################################
######################################################################################################################
######################################################################################################################
 
 
 
 
 
 
 
 
`,
  murallaTown: `
 
                              /////////^\\\\          /===\\\\\\\\\\\\\\\\                             /////////^\\\\                       /////////^\\\\                           =============
                             ///////// W \\\\        /= † =\\\\\\\\\\\\\\\\                           ///////// M \\\\                     ///////// $ \\\\                          =============                 ППППП 
                              @  ППП @   @         ==ППП==H=====H                            H..ППП.H...H                      @===ППП=@____@                           =..ППП.=..=                  П   П 
                              @  П П @   @         ==П П==H=====H                            H..П П.H...H                      @===П П=@____@                           =..П П.=..=                  П   П 
                              @  П П @   @         ==П П==H=====H                            H..П П.H...H                      @===П П=@____@                           =..П П.=..=                  П L П 
###############################################################################################################################################################################################################
###############################################################################################################################################################################################################
###############################################################################################################################################################################################################
###############################################################################################################################################################################################################
###############################################################################################################################################################################################################
 
 
 
 
 
 
 
 
`,
};

// Map metadata - spawn points, transition conditions, hidden items, moving platforms, etc.
const mapMetadata = {
  felishikasCastle: {
    name: `Felishika's Castle`,
    spawn: { x: 41, y: 7, direction: 1 },
    texts: [
      `If you are the brave warrior we have awaited, we have something to tell you: throughout the ages, many young men have entered the caverns, but few have returned.`,
      `According to legend, there may still be underground places that have not been destroyed by Jashiin. People may still be living there, and will surely lend you a hand.`,
      `I have been in the underground town. After I fled, they put a lock on the door. If the town is still there.`,
      `This is the chamber of poor Princess Felicia, who has been turned to stone. You may enter, Duke Garland.`,
      `Brave knight, you have awakened. When you fell at the hand of Jashiin, the Spirits brought you here. Now make haste to the aid of the Princess Felicia.`,
      `Quickly, go to the Princess!`,
      `Ah, the Nine Tears of Esmesanti. Jashiin exists no more and the light of peace shines once again on our land.`,
      `This will benefit the people living underground, as well. Hurry to the Princess Felicia.`,
      `The peace we dared not hope for has come. I'll get my things together and be on my way. I've a family to attend to.`,
      `Quickly, enter this chamber. The holy crystals will break the evil spell which has turned Princess Felicia to stone.`,
    ],
    decorations: '.=^|▶HПG1M/\\',
    transitions: [
      {
        condition: { type: 'building', x: 46, y: 7 },
        target: 'kingOfFelishika',
      },
      {
        condition: { type: 'building', x: 93, y: 7 },
        target: 'inTheHut',
      },
      {
        condition: { type: 'portal', x: 117, y: 7 },
        targetMap: 'murallaTown',
        targetSpawn: { x: 12, y: 7, direction: 1 }
      },
    ]
  },
  murallaTown: {
    name: `Muralla Town`,
    spawn: { x: 12, y: 7 },
    texts: [
      `Ah, you are the warrior I've heard about. My son Michael was a courageous warrior. He went into the caverns and was never seen again. Please be careful.`,
      `Sir, I dreamed that a demon created the underground caverns and filled them with monsters. Then the Spirits brought you to here to make things right again. Before you go, visit the magic shop -- you'll find many useful things there. Good luck on your quest.`,
      `You're on your way to the caverns, aren't you? I recently went in search of a powerful potion said to be hidden there. I didn't stay long enough to find it, but perhaps you will. Be sure to stop at the weapons shop -- you'll need some strong armor.`,
      `Duke Garland, they say that a potion is hidden in a wall near a platform that raises and lowers. I wish you luck.`,
      `You're going into the caverns? You are a brave man. They say there are many doors underground, but many are locked and the keys are scattered throughout the labyrinths. I hope you can find them.`,
      `Duke Garland, someone I know survived a journey to the underground town, Satono. According to him, the road back is short but the road out is long. It will be very dangerous.`,
      `According to the legends, the name of the underground town is Satono.`,
      `I'm afraid I don't know much else about it. Maybe the Sage can help you -- he lives in the unmarked hut at the edge of town.`,
      `A moment, Duke Garland. If you listen closely in front of the underground door, you will hear a terrifying sound. That's the entrance to the inferno that is home to the demons. Beware that place, young man.`,
      `Alas, I fear there is no hope. You and I and all who inhabit this town will surely perish. Don't run off to some terrible place, stay and have a drink with me. Ah, I know you must go, and I salute you -- you're a braver man than I. God be with you.`,
      `When you kill a monster you get a thing called 'almas'. It's worth a lot of money. I'd like to get some myself but I don't want to go down there.`,
    ],
    decorations: '._^@$†=HПWPMBHL/\\',
    transitions: [
      {
        condition: { type: 'building', x: 34, y: 7 },
        target: 'weaponAndArmourShop',
      },
      {
        condition: { type: 'building', x: 54, y: 7 },
        target: 'theChurch',
      },
      {
        condition: { type: 'building', x: 97, y: 7 },
        target: 'witchcraftImplementShop',
      },
      {
        condition: { type: 'building', x: 132, y: 7 },
        target: 'theBank',
      },
      {
        condition: { type: 'building', x: 172, y: 7 },
        target: 'theSageMarid',
      },
      {
        condition: { type: 'portal', x: 11, y: 7 },
        targetMap: 'felishikasCastle',
        targetSpawn: { x: 116, y: 7, direction: -1 }
      },
      {
        condition: { type: 'openedDoor', x: 199, y: 7 },
        targetMap: 'cavernMalicia',
        targetSpawn: { x: 62, y: 11, direction: 1 }
      },
    ]
  },
  bosqueVillage: {
    name: `Bosque village`,
    spawn: { x: 0, y: 0 },
    texts: [
      `Welcome to Bosque Village, brave warrior. This once was a forest surrounding a temple, but the temple was destroyed by Jashiin. Now the village of Bosque is desolate. I hope you are here to help us.`,
      `Listen, stranger, a sentry is posted on the outskirts of the city. I'm telling you this for your own good; it's best to stay away from there.`,
      `The temple that once stood here had the crest of the Warrior God carved into it. Winners of the martial arts competitions held in front of the temple were awarded with such crests. Thus the crest, the symbol of a true hero, became known as the Hero's Crest.`,
      `When he destroyed the temple, Jashiin stole the Hero's Crest.  No one has any idea where to find it.`,
      `The crest must be hidden somewhere in the forest, but I couldn't say where.`,
      `When the temple was destroyed I heard Jashiin ordering his underlings to hide the crest in the trunk of the biggest tree. That must be where it is hidden. I hope you can find it.`,
      `A spirit appeared and told me to say this if I met a brave man: "If you go through the door to the right of the tree that forms a cross, you will be able to go up." - I hope it helps you.`,
      `I have some advice for you: Be careful if you come to a place where the leaves of the trees are thin. The ground there is not very strong.`,
      `The sentry at the edge of town says the Spirits came to him in a dream, and told him not to allow anyone to pass unless they bear the Hero's Crest. I wonder if the Spirits really ordered such a thing? Perhaps he's mad.`,
      `A few have slipped by the sentry undetected, but none have returned. There must be some terrible monster out there.`,
      `That sentry must have sold his soul to Jashiin. Why else would he interfere with brave men such as yourself?`,
      `Hold on there! Do you have the Hero's Crest?`,
      `Don't lie, it won't do any good. Get out of here!`,
      `You cannot pass here without the Hero's Crest. My orders are from the Spirits themselves!`,
      `Hold on there! You have the Hero's Crest, I see. You may pass.`,
    ],
    transitions: [
      {
        condition: { type: 'portal', x: 0, y: 0 },
        targetMap: 'cavernMalicia',
        targetSpawn: { x: 160, y: 55 }
      }
    ]
  },
  doradoTown: {
    name: `Dorado Town`,
    spawn: { x: 0, y: 0 },
    texts: [
      `Welcome to Dorado. This was once a thriving merchant town where everyone lived a peaceful life. Jashiin has reduced it to a sad, desolate place.`,
      `The Spirits say that Jashiin returned because the people, made soft by peace and prosperity, sank into corruption.`,
      `Using the money and treasures of Dorado and other places, Jashiin built a place of his own. The Tesoro and Burata Caverns are his domain.`,
      `A word to the wise: The door bearing the green symbol cannot be opened. There's no use trying to force it, it absolutely cannot be opened.`,
      `Somewhere in the caverns are the Shirukaano shoes made by the shoemaker Percel. Try to find them; when you wear those shoes you can climb any slope.`,
      `Someone who went into the caverns told me the Shirukaano shoes are hidden in Tesoro. Of the four rooms in the center, they are in the far right room.`,
      `Of the four doors in Tesoro, three bear a blue symbol. What was the other one? For the life of me I can't remember.`,
      `This building wasn't here before, was it? You can't put up a building like this overnight -- how did it get here?`,
      `A peace statue called 'Taruso' stood here, but one night it disappeared. Where in the world can it have gone? The evil Jashiin must have taken a liking to it.`,
      `I have a message from the Spirits: wait for the moving edge of the platform made of shining blocks.`,
      `When you find green stone slabs that can be moved up and down, arrange them like a staircase so you can go up easily.`,
      `The middle of the caverns is made of pure gold! But there is one fake gold wall that can be destroyed.`,
      `Ah! You found the Shirukaano shoes! Now you can scale any slope.`,
      `Brave lad! A message from the Spirits: Take great care when you enter the next world.`,
    ],
    transitions: [
      {
        condition: { type: 'portal', x: 0, y: 0 },
        targetMap: 'cavernMalicia',
        targetSpawn: { x: 160, y: 55 }
      }
    ]
  },
  escoVillage: {
    name: `Esco village`,
    spawn: { x: 0, y: 0 },
    texts: [
      `Pay attention to the door with the blue symbol. It has turned three colors.`,
      `If you fall from a stone and are blocked by a wall, thrust through it with your sword. If the wall crumbles away you'll be on the road leading to the abode of Jashiin.`,
      `By jumping in front of the ivy rather than going down it, you can open a new road.`,
      `Look for another door with a blue symbol. If you see it, turn to the right.`,
      `Do you have doubts? Here there is only slaughter and destruction. What do you expect to accomplish?`,
      `Why have the Spirits sent you on this journey of slaughter? Why does Jashiin await you in silence?`,
      `Pay no heed to those two, they are in league with Jashiin. They are trying to weaken your will.`,
    ],
    transitions: [
      {
        condition: { type: 'portal', x: 0, y: 0 },
        targetMap: 'cavernMalicia',
        targetSpawn: { x: 160, y: 55 }
      }
    ]
  },
  heladaTown: {
    name: `Helada Town`,
    spawn: { x: 0, y: 0 },
    texts: [
      `Welcome. You must be cold. Helada used to be a warm, prosperous place, but Jashiin has turned it into a cold ruin.`,
      `You may have noticed that there are two roads leading here. There is also a shortcut.`,
      `Have you been in the ice caverns? The shoemaker in this town was trying to make special shoes out of Ruzeria bark, to help a hero walk on the ice. Just as he managed to do so, Jashiin's minions murdered him. I wonder what happened to those shoes.`,
      `Are you the brave one? My lover, Percel, was killed by Jashiin's underlings just after the Spirits asked him to make the Ruzeria shoes for a brave man. Return my Percel to me! Oh, if only you had not come!`,
      `I think you should know something: Percel the shoemaker said that without the Ruzeria shoes you could not go beyond the green door.`,
      `Ruzeria is the name of a tree that grows in the underground forest. The bark is very hard and is not slippery. Percel had good reason for choosing it.`,
      `Someone I know said he had seen a pair of unusual shoes in the caverns. I'm not sure whether those are the shoes that Percel made.`,
      `I'm sorry for what I said a short while ago. I don't know what came over me. Please defeat Jashiin and avenge the death of Percel.`,
      `Ah, the shoes of Percel...`,
      `I see you are a brave man. I hope you will find Jashiin and defeat him quickly.`,
      `This brave man with the Ruzeria shoes... With this the shoemaker's shop also floats up...`,
      `I'll bet the green slime creatures have caused you a lot of trouble. Let me tell you a secret: they can't withstand heat. Burn them and they will vanish in a single burst of steam`,
    ],
    transitions: [
      {
        condition: { type: 'portal', x: 0, y: 0 },
        targetMap: 'cavernMalicia',
        targetSpawn: { x: 160, y: 55 }
      }
    ]
  },
  llamaTown: {
    name: `Llama Town`,
    spawn: { x: 0, y: 0 },
    texts: [
      `Help! A terrible creature is in our hut! Please get rid of it for us.`,
      `Oh, thank you, sir. As a token of my gratitude I will give you the Elf Crest. I think you'll find it useful; without it, no one in town will help you...`,
      `Thanks again. Really.`,
      `The caverns in this region are burning hot; you won't be able to stand it long. I've got something that will help you. It's an Asbestos cape that will protect you from the heat.`,
      `It's not free though. It will cost you 2500 almas.`,
      `Oh, I see... well, maybe next time.`,
      `You say you don't have 2500 almas to give? Don't try to fool me.`,
      `Here you are. That will be 2500 almas. Take good care of it.`,
      `Are you taking good care of the Asbestos cape? It was my prized possession so I hope you'll treat it well.`,
      `My name is Michael. No one here listens to a word I say. I wonder why that is?`,
      `Oh! You've got the Elf Crest. Great!`,
      `Jashiin filled the caverns with a flaming inferno. Please help us, brave lad!`,
      `Beware of the great heat currents. There are many whirlpools in the caverns, and once you get caught in one you'll never get out.`,
      `There are countless one-way, invisible walls in Correr Cave. To find out more about them, ask Yozeras or Myuuza the elder.`,
      `I am Yozeras. When you go into Correr Cave, watch out for an opening with no ivy. You'll fall if you go through there.`,
      `I'm  Myuuza, the town elder. If you go into the Correr Cave be sure to remember the color of the entrance door. The exit door is the same color.`,
      `If you can't find your way, find an air current near the ceiling of the cave. You can transport yourself on those currents.`,
      `Sir, I can see that you don't have the Elf Crest. Recently some henchmen of Jashiin have been posing as heroes and wreaking havoc on this town. You're not one of them by any chance, are you? Without the Elf Crest, no one here will speak to you...`,
    ],
    transitions: [
      {
        condition: { type: 'portal', x: 0, y: 0 },
        targetMap: 'cavernMalicia',
        targetSpawn: { x: 160, y: 55 }
      }
    ]
  },
  purezaTown: {
    name: `Pureza Town`,
    spawn: { x: 0, y: 0 },
    texts: [
      `Fooled again! Meddlesome fool! Taste the past and never return here again. HA, HA, HA, HA...`,
      `Are you from the outside world? Welcome. You are certainly a courageous man guided by the Spirits.`,
      `A moment, sir. I have seen the fortress of Jashiin. It is at the edge of this world. The Spirits guided me back from there alive so I could tell you about it.`,
      `I think you should know that this town is very close to the fortress of Jashiin, and his henchmen are sure to be around. Be careful.`,
      `YOU! The princess you struggle to rescue will lead you to your doom! The Spirits are just demons in disguise. What does this mean? You do the devil's work, you must be the devil!  WA, HA, HA, HA, HA...`,
      `The Spirits gave me a lion's head key but it was stolen by one of Jashiin's underlings. I hope you will find it on your travels.`,
      `Ah, yes -- that's the key that was entrusted to me by the Spirits. Make good use of it.`,
      `I pray for your safe return.`,
      `The one weapon you'll need to defeat Jashiin is the Fairy Flame Sword. According to legend it gives off a peculiar light and can vanquish any foe with only one blow. However, where it is to be found is another matter...`,
      `Nearby is a village called Esko, but I don't know what has happened to it recently. I once knew many people there.`,
      `I've heard that the lion's head key fell between two towers under a stone slab. It is supposedly near this town.`,
      `Help!`,
      `Beware of Jashiin's last henchman, Algaien. It is said that Jashiin used his power to give him eternal life.`,
    ],
    transitions: [
      {
        condition: { type: 'portal', x: 0, y: 0 },
        targetMap: 'cavernMalicia',
        targetSpawn: { x: 160, y: 55 }
      }
    ]
  },
  satonoTown: {
    name: `Satono Town`,
    spawn: { x: 0, y: 0 },
    texts: [
      `Welcome, stranger. You must have come through the labyrinths from the outside world. We have not encountered such a brave person in a very long time. You should visit the great sage Yasmin -- she will be anxious to meet you.`,
      `So you're the brave one I've heard about. Well, if you're going to go on from here, I'll give you a tip.  When you come to a stopping place, dig a hole. The demons have hidden jewels in many places.`,
      `Are you Duke Garland? Thank the Spirits you've come. We escaped from Jashiin through the power of the Spirits. However, if his power should become so strong that the Spirits' can't protect us, this town is doomed.`,
      `Let me give you some advice, stranger. If you fall down the stone slab in front of the blue door, you will see a green door nearby. Don't go through that door under any circumstances -- it is a doorway to the past.`,
      `Beware! I went into the caverns and saw an awful creature -- a giant demon octopus. It was terrifying, but I escaped. I hope you will be as lucky.`,
      `Are you the brave one? I&hope you have brought almas for us. The almas are part of Jashiin's power. We use them to make medicine, and other useful things.`,
      `Duke Garland, when you go into the caverns again, please try to bring back more almas. To supplement the protective power of the Spirits we must build a wall of almas. Unless we get more, Satono Town is in peril.`,
    ],
    transitions: [
      {
        condition: { type: 'portal', x: 0, y: 0 },
        targetMap: 'cavernMalicia',
        targetSpawn: { x: 160, y: 55 }
      }
    ]
  },
  tumbaTown: {
    name: `Tumba Town`,
    spawn: { x: 0, y: 0 },
    texts: [
      `Brave sir, I hope you've come to help this pitiful town. It was the site of a quiet graveyard before it was decimated by Jashiin.`,
      `If you're going back into the caverns, beware the Gelroid. It's a blue gelatinous substance which will suck the life out of you.`,
      `Have you heard of Percel the shoemaker from Herada Town? He made Ruzeria shoes for walking on ice and Pirika shoes for getting by Gelroid, thorns and fire. Those are the only two I know of, but there may have been more.`,
      `May I confide in you? I was once a spy for Jashiin. I can tell you that the Pirika shoes were put into a box and thrown away somewhere in the Rotten land. You may never find them.`,
      `One third of this region is covered with deadly Gelroid. If you're going to continue through the labyrinths, ordinary shoes will not protect you.`,
      `There is a certain place in the caverns where you can pass through a wall, but only in one direction. My grandfather told me the place is near a green stone slab. There may be other places, but I couldn't say where.`,
      `Have you seen the strange, bluish-white people in the caverns? They were infected by the Gelroid and now they wander the land like the living dead. To kill them, aim for the head.`,
      `It seems that Jashiin has stolen many things. The weapon maker is searching for his family crest, the Crest of Glory. If you find it in the caverns, he'll be most happy to have it back.`,
      `Those are the Pirika shoes. Go quickly to the abode of Jashiin and finish him off. We will pray for your success and swift return.`,
      `Ah, the Pirika shoes! Forgive me, brave sir. I had no choice. I won't do that kind of thing again.`,
      `Isn't that the Crest of Glory? Please take it quickly to the owner of the weapons store...`,
    ],
    transitions: [
      {
        condition: { type: 'portal', x: 0, y: 0 },
        targetMap: 'cavernMalicia',
        targetSpawn: { x: 160, y: 55 }
      }
    ]
  },
};

// Load a map by name
function loadMap(mapName) {
  const mapData = maps[mapName];
  const metadata = mapMetadata[mapName];
  
  if (!mapData) {
    console.error(`Map "${mapName}" not found!`);
    return null;
  }
  
  return {
    name: mapName,
    data: mapData,
    metadata: metadata
  };
}

// Merge maps from m1.js (Cavern Malicia)
Object.assign(maps, 
  mapsM1, 
  mapsM2, 
  mapsM3,
  mapsM4,
  mapsM5,
  mapsM6,
  mapsM7,
  mapsM8,
  mapsM9,
);
Object.assign(mapMetadata, 
  mapMetadataM1,
  mapMetadataM2,
  mapMetadataM3,
  mapMetadataM4,
  mapMetadataM5,
  mapMetadataM6,
  mapMetadataM7,
  mapMetadataM8,
  mapMetadataM9,
);
