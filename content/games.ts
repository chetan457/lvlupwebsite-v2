/** PLACEHOLDER LIBRARY. Replace from the Games tab. PS5 only at launch. */

export type Game = {
  slug: string;
  title: string;
  players: string;
  /** Shown on the shelf so people can see what suits a group. */
  note: string;
  /** YouTube video ID of the official launch trailer, from the publisher's own channel. */
  trailer?: string;
};

/*
 * Trailers are embedded from official uploads only, each checked to exist and allow embedding.
 * Launch trailers where one exists. Exceptions: Gran Turismo 7 (a launch-window TV spot),
 * Rocket League (announce trailer) and F1 25 (reveal trailer) have no official launch trailer.
 * Mortal Kombat 1 and Elden Ring use the regional uploads that are not age-restricted.
 */
export const games: Game[] = [
  { slug: 'ea-sports-fc-26', title: 'EA Sports FC 26', players: '1–4', note: 'Everybody at the table already knows the buttons', trailer: 'F2Q4xrASt94' },
  { slug: 'tekken-8', title: 'Tekken 8', players: '1–2', note: 'Rounds end fast, so the pad keeps moving round', trailer: '_MM4clV2qjE' },
  { slug: 'mortal-kombat-1', title: 'Mortal Kombat 1', players: '1–2', note: 'The finishers are gory. Not one for a kids’ party', trailer: 'PL6ZdOXlj6g' },
  { slug: 'street-fighter-6', title: 'Street Fighter 6', players: '1–2', note: 'Modern controls let a beginner hang on for a bit', trailer: '4EnsDg6DCTE' },
  { slug: 'gran-turismo-7', title: 'Gran Turismo 7', players: '1–2', note: 'Split screen on request; handling takes a few laps', trailer: 'OyAbx6S_VCA' },
  { slug: 'spider-man-2', title: 'Marvel’s Spider-Man 2', players: '1', note: 'One pad, but good to watch, so nobody sits bored', trailer: '9fVYKsEmuRo' },
  { slug: 'god-of-war-ragnarok', title: 'God of War Ragnarök', players: '1', note: 'A story you cannot get anywhere near in an hour', trailer: 'g1wr0DfV73E' },
  { slug: 'elden-ring', title: 'Elden Ring', players: '1', note: 'Hard from the first fight. Not for a short booking', trailer: 'UhD0_MM4fnU' },
  { slug: 'wwe-2k25', title: 'WWE 2K25', players: '1–4', note: 'Silly and loud. Holds up when half the group is new', trailer: 'KbLboBQCDP0' },
  { slug: 'rocket-league', title: 'Rocket League', players: '1–4', note: '2 minutes to explain, and then it is a fair fight', trailer: 'NC82dWrFqCE' },
  { slug: 'it-takes-two', title: 'It Takes Two', players: '2', note: 'Needs both of you the whole way; no solo mode', trailer: '2AysHTv7X8k' },
  { slug: 'f1-25', title: 'F1 25', players: '1–2', note: 'Fine on a pad; the wheel comes with the racing rig', trailer: 'u5rWBgBjDsc' },
];

export const platform = 'PlayStation 5';
