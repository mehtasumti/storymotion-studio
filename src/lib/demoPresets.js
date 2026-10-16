export const DEMO_CHARACTERS =
  'Elena, 25, long dark-brown wavy hair, hazel eyes, charcoal trench coat, silver crescent pendant; Adrian, 35, swept-back dark hair, gray eyes, black waistcoat, white shirt.';

const BASE = {
  genre: 'mystery',
  style: 'cinematic',
  language: 'English',
  sceneCount: 10,
  duration: 60,
  aspectRatio: '9:16',
  includeAudio: true,
  characterDescription: DEMO_CHARACTERS,
};

/**
 * Demo inputs only. They fill the form; generation still runs through the same
 * general template engine. Nothing about this story is hardcoded in the engine.
 */
export const DEMO_PRESETS = [
  {
    id: 'acceptance',
    buttonLabel: 'Demo: one-line test',
    settings: {
      ...BASE,
      title: 'The Letter That Remembered',
      story:
        'A young woman discovers a mysterious letter and enters an abandoned mansion, where a stranger knows her past.',
    },
  },
  {
    id: 'detailed',
    buttonLabel: 'Demo: detailed beats',
    settings: {
      ...BASE,
      title: 'The Letter That Remembered (detailed beats)',
      story: [
        "On a rain-soaked night, a sealed envelope with no return address arrives at Elena's door.",
        'Inside, a faded letter reads: "Come to Ravenscourt before midnight. The truth about your mother is waiting."',
        'Elena reaches the iron gates of the abandoned mansion as thunder rolls over the hills.',
        'She grips the cold brass handle and pushes the heavy front door open.',
        'In the dusty foyer, her footsteps echo beneath a shrouded chandelier.',
        "A portrait on the stairs shows a woman wearing Elena's silver crescent pendant.",
        'A tall stranger steps out of the shadows behind her.',
        'Adrian calls her by name: "Elena, you look just like her."',
        'He hands her an old photograph of two girls and whispers that her family kept a secret.',
        'As the door slams behind her, he warns, "Leave now, or you\'ll never leave at all."',
      ].join('\n'),
    },
  },
];
